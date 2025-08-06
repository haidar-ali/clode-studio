import { promises as fs } from 'fs';
import path from 'path';
import matter from 'gray-matter';

export default defineEventHandler(async (event) => {
  try {
    const workspacePath = global.__currentWorkspace;
    if (!workspacePath) {
      return { entries: [] };
    }

    const knowledgePath = path.join(workspacePath, '.claude', 'knowledge');
    const entries = [];

    try {
      // Check if knowledge directory exists
      await fs.access(knowledgePath);
      
      // Read all files in the knowledge directory
      const files = await fs.readdir(knowledgePath, { withFileTypes: true });
      const mdFiles = files.filter(f => f.isFile() && f.name.endsWith('.md'));

      for (const file of mdFiles) {
        const filePath = path.join(knowledgePath, file.name);
        const content = await fs.readFile(filePath, 'utf-8');
        
        // Parse markdown with frontmatter
        const { data, content: markdownContent } = matter(content);
        
        const entry = {
          id: data.id || file.name.replace('.md', ''),
          title: data.title || file.name.replace('.md', ''),
          content: markdownContent,
          markdown: content,
          metadata: {
            tags: data.tags || [],
            category: data.category || 'other',
            created: new Date(data.created || Date.now()),
            updated: new Date(data.updated || Date.now()),
            priority: data.priority,
            relatedFiles: data.relatedFiles || [],
            aliases: data.aliases || []
          },
          frontmatter: data
        };
        
        entries.push(entry);
      }
    } catch (error) {
      // Knowledge directory doesn't exist or error reading
      console.debug('Knowledge directory not found or empty:', error);
    }

    return {
      entries,
      workspacePath
    };
  } catch (error) {
    console.error('[API] /knowledge/list error:', error);
    return { entries: [] };
  }
});