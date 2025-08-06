import { promises as fs } from 'fs';
import path from 'path';

export default defineEventHandler(async (event) => {
  try {
    const workspacePath = global.__currentWorkspace;
    if (!workspacePath) {
      return { 
        totalFiles: 0,
        languageDistribution: {},
        languages: [],
        type: null,
        framework: null
      };
    }

    // Simple statistics gathering
    const stats = {
      totalFiles: 0,
      languageDistribution: {} as Record<string, number>,
      languages: [] as string[],
      type: null as string | null,
      framework: null as string | null,
      entryPoints: [] as string[],
      configFiles: [] as string[]
    };

    async function scanDirectory(dir: string): Promise<void> {
      try {
        const items = await fs.readdir(dir, { withFileTypes: true });
        
        for (const item of items) {
          // Skip node_modules and hidden directories
          if (item.name.startsWith('.') || item.name === 'node_modules') continue;
          
          const fullPath = path.join(dir, item.name);
          
          if (item.isDirectory()) {
            await scanDirectory(fullPath);
          } else if (item.isFile()) {
            stats.totalFiles++;
            
            // Detect language by extension
            const ext = path.extname(item.name).toLowerCase();
            const language = getLanguageFromExtension(ext);
            
            if (language) {
              stats.languageDistribution[language] = (stats.languageDistribution[language] || 0) + 1;
            }
            
            // Detect project type and framework from config files
            if (item.name === 'package.json') {
              stats.type = 'Node.js';
              stats.configFiles.push(item.name);
              
              // Try to detect framework
              try {
                const content = await fs.readFile(fullPath, 'utf-8');
                const pkg = JSON.parse(content);
                
                if (pkg.dependencies?.['next']) stats.framework = 'Next.js';
                else if (pkg.dependencies?.['nuxt']) stats.framework = 'Nuxt';
                else if (pkg.dependencies?.['react']) stats.framework = 'React';
                else if (pkg.dependencies?.['vue']) stats.framework = 'Vue';
                else if (pkg.dependencies?.['@angular/core']) stats.framework = 'Angular';
                else if (pkg.dependencies?.['express']) stats.framework = 'Express';
                
                // Detect entry points
                if (pkg.main) stats.entryPoints.push(pkg.main);
                if (pkg.scripts?.start) stats.entryPoints.push('start script');
              } catch (e) {
                // Ignore parse errors
              }
            } else if (item.name === 'composer.json') {
              stats.type = 'PHP';
              stats.configFiles.push(item.name);
            } else if (item.name === 'Cargo.toml') {
              stats.type = 'Rust';
              stats.configFiles.push(item.name);
            } else if (item.name === 'go.mod') {
              stats.type = 'Go';
              stats.configFiles.push(item.name);
            } else if (item.name === 'requirements.txt' || item.name === 'setup.py') {
              stats.type = 'Python';
              stats.configFiles.push(item.name);
            }
          }
        }
      } catch (error) {
        // Ignore errors for individual directories
      }
    }

    await scanDirectory(workspacePath);
    
    // Get unique languages
    stats.languages = Object.keys(stats.languageDistribution);

    return stats;
  } catch (error) {
    console.error('[API] /context/statistics error:', error);
    return { 
      totalFiles: 0,
      languageDistribution: {},
      languages: [],
      type: null,
      framework: null
    };
  }
});

function getLanguageFromExtension(ext: string): string | null {
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
  
  return languageMap[ext] || null;
}