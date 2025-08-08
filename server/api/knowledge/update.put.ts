import { promises as fs } from 'fs';
import path from 'path';
import matter from 'gray-matter';

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const { id, title, content, tags, category, priority } = body;
    
    if (!id) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Entry ID is required'
      });
    }
    
    const workspacePath = global.__currentWorkspace;
    if (!workspacePath) {
      throw createError({
        statusCode: 400,
        statusMessage: 'No workspace selected'
      });
    }

    const filePath = path.join(workspacePath, '.claude', 'knowledge', `${id}.md`);
    
    // Check if file exists
    try {
      await fs.access(filePath);
    } catch {
      throw createError({
        statusCode: 404,
        statusMessage: 'Knowledge entry not found'
      });
    }
    
    // Read existing file
    const existingContent = await fs.readFile(filePath, 'utf-8');
    const { data: existingFrontmatter, content: existingMarkdown } = matter(existingContent);
    
    // Update frontmatter
    const now = new Date().toISOString();
    const updatedFrontmatter: any = {
      ...existingFrontmatter,
      title: title !== undefined ? title : existingFrontmatter.title,
      tags: tags !== undefined ? tags : existingFrontmatter.tags,
      category: category !== undefined ? category : existingFrontmatter.category,
      updated: now
    };
    
    if (priority !== undefined) {
      updatedFrontmatter.priority = priority;
    } else if (existingFrontmatter.priority) {
      updatedFrontmatter.priority = existingFrontmatter.priority;
    }
    
    // Use provided content or existing
    const updatedContent = content !== undefined ? content : existingMarkdown;
    
    // Create new markdown
    const markdown = matter.stringify(updatedContent, updatedFrontmatter);
    
    // Save to file
    await fs.writeFile(filePath, markdown, 'utf-8');
    
    // Return updated entry
    return {
      id,
      title: updatedFrontmatter.title,
      content: updatedContent,
      markdown,
      metadata: {
        tags: updatedFrontmatter.tags || [],
        category: updatedFrontmatter.category || 'other',
        created: new Date(updatedFrontmatter.created || Date.now()),
        updated: new Date(now),
        priority: updatedFrontmatter.priority,
        relatedFiles: updatedFrontmatter.relatedFiles || [],
        aliases: updatedFrontmatter.aliases || []
      },
      frontmatter: updatedFrontmatter
    };
  } catch (error) {
    console.error('[API] /knowledge/update error:', error);
    if (error.statusCode) throw error;
    throw createError({
      statusCode: 500,
      statusMessage: error.message || 'Failed to update knowledge entry'
    });
  }
});