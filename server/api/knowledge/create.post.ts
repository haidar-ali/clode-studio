import { promises as fs } from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { v4 as uuidv4 } from 'uuid';

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const { title, content, tags, category, priority } = body;
    
    const workspacePath = global.__currentWorkspace;
    if (!workspacePath) {
      throw createError({
        statusCode: 400,
        statusMessage: 'No workspace selected'
      });
    }

    const knowledgePath = path.join(workspacePath, '.claude', 'knowledge');
    
    // Ensure directory exists
    await fs.mkdir(knowledgePath, { recursive: true });
    
    const id = uuidv4();
    const now = new Date().toISOString();
    
    const frontmatter: any = {
      id,
      title,
      tags: tags || [],
      category: category || 'other',
      created: now,
      updated: now
    };
    
    if (priority) {
      frontmatter.priority = priority;
    }
    
    // Create markdown with frontmatter
    const markdown = matter.stringify(content || '', frontmatter);
    
    // Save to file
    const filePath = path.join(knowledgePath, `${id}.md`);
    await fs.writeFile(filePath, markdown, 'utf-8');
    
    // Return the created entry
    return {
      id,
      filename: `${id}.md`,
      title,
      content: content || '',
      markdown,
      metadata: {
        tags: tags || [],
        category: category || 'other',
        created: new Date(now),
        updated: new Date(now),
        priority,
        relatedFiles: [],
        aliases: []
      },
      frontmatter
    };
  } catch (error) {
    console.error('[API] /knowledge/create error:', error);
    throw createError({
      statusCode: 500,
      statusMessage: error.message || 'Failed to create knowledge entry'
    });
  }
});