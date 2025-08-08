import { promises as fs } from 'fs';
import path from 'path';

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event);
    const searchQuery = (query.q as string || '').toLowerCase();
    const limit = parseInt(query.limit as string) || 20;
    
    const workspacePath = global.__currentWorkspace;
    if (!workspacePath || !searchQuery) {
      return { results: [] };
    }

    const results: any[] = [];
    
    async function searchDirectory(dir: string): Promise<void> {
      if (results.length >= limit) return;
      
      try {
        const items = await fs.readdir(dir, { withFileTypes: true });
        
        for (const item of items) {
          if (results.length >= limit) break;
          
          // Skip node_modules and hidden directories
          if (item.name.startsWith('.') || item.name === 'node_modules') continue;
          
          const fullPath = path.join(dir, item.name);
          
          if (item.isDirectory()) {
            // Check directory name
            if (item.name.toLowerCase().includes(searchQuery)) {
              const relativePath = path.relative(workspacePath, fullPath);
              results.push({
                path: relativePath,
                name: item.name,
                size: 0,
                language: 'folder',
                lastModified: new Date(),
                isDirectory: true,
                relevanceScore: 0.8
              });
            }
            // Continue searching subdirectories
            await searchDirectory(fullPath);
          } else if (item.isFile()) {
            // Check file name
            const nameMatch = item.name.toLowerCase().includes(searchQuery);
            
            // Skip non-code files unless name matches
            const ext = path.extname(item.name).toLowerCase();
            if (!nameMatch && !isCodeFile(ext)) continue;
            
            // Check file content for code files (if name doesn't match)
            let contentMatch = false;
            let relevanceScore = 0;
            
            if (nameMatch) {
              relevanceScore = 1.0; // Highest score for name matches
            } else if (isTextFile(ext)) {
              try {
                const content = await fs.readFile(fullPath, 'utf-8');
                contentMatch = content.toLowerCase().includes(searchQuery);
                if (contentMatch) {
                  relevanceScore = 0.6; // Lower score for content matches
                }
              } catch (e) {
                // Ignore read errors
              }
            }
            
            if (nameMatch || contentMatch) {
              try {
                const stats = await fs.stat(fullPath);
                const relativePath = path.relative(workspacePath, fullPath);
                
                results.push({
                  path: relativePath,
                  name: item.name,
                  size: stats.size,
                  language: getLanguageFromExtension(ext),
                  lastModified: stats.mtime,
                  isDirectory: false,
                  relevanceScore
                });
              } catch (e) {
                // Ignore stat errors
              }
            }
          }
        }
      } catch (error) {
        // Ignore errors for individual directories
      }
    }

    await searchDirectory(workspacePath);
    
    // Sort by relevance score
    results.sort((a, b) => b.relevanceScore - a.relevanceScore);

    return { 
      results: results.slice(0, limit),
      query: searchQuery,
      total: results.length
    };
  } catch (error) {
    console.error('[API] /context/search error:', error);
    return { results: [] };
  }
});

function isCodeFile(ext: string): boolean {
  const codeExtensions = [
    '.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.c', '.cpp', '.cs',
    '.go', '.rs', '.php', '.rb', '.swift', '.kt', '.vue', '.html',
    '.css', '.scss', '.sass', '.less', '.json', '.xml', '.yaml', '.yml',
    '.md', '.sql', '.sh', '.bash'
  ];
  return codeExtensions.includes(ext);
}

function isTextFile(ext: string): boolean {
  // Files we can safely read and search content
  const textExtensions = [
    '.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.c', '.cpp', '.cs',
    '.go', '.rs', '.php', '.rb', '.swift', '.kt', '.vue', '.html',
    '.css', '.scss', '.sass', '.less', '.json', '.xml', '.yaml', '.yml',
    '.md', '.sql', '.sh', '.bash', '.txt', '.log', '.conf', '.ini',
    '.env', '.gitignore', '.dockerignore'
  ];
  return textExtensions.includes(ext);
}

function getLanguageFromExtension(ext: string): string {
  const languageMap: Record<string, string> = {
    '.js': 'JavaScript',
    '.jsx': 'JavaScript',
    '.ts': 'TypeScript',
    '.tsx': 'TypeScript',
    '.py': 'Python',
    '.java': 'Java',
    '.c': 'C',
    '.cpp': 'C++',
    '.cs': 'C#',
    '.go': 'Go',
    '.rs': 'Rust',
    '.php': 'PHP',
    '.rb': 'Ruby',
    '.swift': 'Swift',
    '.kt': 'Kotlin',
    '.vue': 'Vue',
    '.html': 'HTML',
    '.css': 'CSS',
    '.scss': 'SCSS',
    '.sass': 'Sass',
    '.less': 'Less',
    '.json': 'JSON',
    '.xml': 'XML',
    '.yaml': 'YAML',
    '.yml': 'YAML',
    '.md': 'Markdown',
    '.sql': 'SQL',
    '.sh': 'Shell',
    '.bash': 'Bash'
  };
  
  return languageMap[ext] || 'Unknown';
}