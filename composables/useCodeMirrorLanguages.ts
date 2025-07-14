import { javascript } from '@codemirror/lang-javascript';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { python } from '@codemirror/lang-python';
import { cpp } from '@codemirror/lang-cpp';
import { java } from '@codemirror/lang-java';
import { php } from '@codemirror/lang-php';
import { rust } from '@codemirror/lang-rust';
import { sql } from '@codemirror/lang-sql';
import { xml } from '@codemirror/lang-xml';
import { markdown } from '@codemirror/lang-markdown';

export const useCodeMirrorLanguages = () => {
  // Map file extensions to language support
  const languageMap: Record<string, () => any> = {
    // JavaScript/TypeScript
    'js': javascript,
    'jsx': () => javascript({ jsx: true }),
    'ts': () => javascript({ typescript: true }),
    'tsx': () => javascript({ typescript: true, jsx: true }),
    'mjs': javascript,
    'cjs': javascript,
    
    // Web languages
    'html': html,
    'htm': html,
    'vue': html, // Vue files use HTML as base
    'css': css,
    'scss': css,
    'sass': css,
    'less': css,
    
    // Data formats
    'json': json,
    'jsonc': json,
    'json5': json,
    'yml': xml, // Use XML as fallback for YAML
    'yaml': xml, // Use XML as fallback for YAML
    'toml': xml, // Use XML as fallback for TOML
    'xml': xml,
    'svg': xml,
    
    // Programming languages
    'py': python,
    'pyw': python,
    'cpp': cpp,
    'cc': cpp,
    'cxx': cpp,
    'c': cpp,
    'h': cpp,
    'hpp': cpp,
    'java': java,
    'php': php,
    'rs': rust,
    'sql': sql,
    'go': () => javascript({ typescript: true }), // Use TypeScript mode as fallback for Go
    'rb': python, // Use Python mode as fallback for Ruby
    'swift': () => javascript({ typescript: true }), // Use TypeScript mode as fallback
    'kt': java, // Use Java mode for Kotlin
    'kts': java, // Use Java mode for Kotlin scripts
    
    // Markup languages
    'md': markdown,
    'markdown': markdown,
    'mdx': markdown,
    
    // Shell scripts
    'sh': () => javascript(), // Use JS as fallback for shell
    'bash': () => javascript(), // Use JS as fallback for shell
    'zsh': () => javascript(), // Use JS as fallback for shell
    'fish': () => javascript(), // Use JS as fallback for shell
    
    // Config files
    'dockerfile': () => javascript(), // Use JS as fallback
    'Dockerfile': () => javascript(), // Use JS as fallback
  };

  // Map MIME types to language support (for fallback)
  const mimeTypeMap: Record<string, () => any> = {
    'text/javascript': javascript,
    'application/javascript': javascript,
    'text/typescript': () => javascript({ typescript: true }),
    'application/typescript': () => javascript({ typescript: true }),
    'text/html': html,
    'text/css': css,
    'application/json': json,
    'text/x-python': python,
    'text/x-c': cpp,
    'text/x-c++': cpp,
    'text/x-java': java,
    'text/x-php': php,
    'text/x-rust': rust,
    'text/x-sql': sql,
    'text/xml': xml,
    'text/markdown': markdown,
    'text/x-yaml': xml,
    'text/x-sh': () => javascript(),
  };

  // Get language support for a file
  const getLanguageSupport = (filename: string, mimeType?: string) => {
    // Extract file extension
    const extension = filename.split('.').pop()?.toLowerCase();
    
    // Try to find language by extension
    if (extension && languageMap[extension]) {
      return languageMap[extension]();
    }
    
    // Try to find language by MIME type
    if (mimeType && mimeTypeMap[mimeType]) {
      return mimeTypeMap[mimeType]();
    }
    
    // Default to plain text (no specific language support)
    return null;
  };

  // Get a human-readable language name
  const getLanguageName = (filename: string): string => {
    const extension = filename.split('.').pop()?.toLowerCase();
    
    const languageNames: Record<string, string> = {
      'js': 'JavaScript',
      'jsx': 'JavaScript (JSX)',
      'ts': 'TypeScript',
      'tsx': 'TypeScript (TSX)',
      'html': 'HTML',
      'vue': 'Vue',
      'css': 'CSS',
      'scss': 'SCSS',
      'json': 'JSON',
      'yml': 'YAML',
      'yaml': 'YAML',
      'py': 'Python',
      'cpp': 'C++',
      'c': 'C',
      'java': 'Java',
      'php': 'PHP',
      'rs': 'Rust',
      'sql': 'SQL',
      'go': 'Go',
      'rb': 'Ruby',
      'swift': 'Swift',
      'kt': 'Kotlin',
      'md': 'Markdown',
      'sh': 'Shell',
      'dockerfile': 'Dockerfile',
      'xml': 'XML',
      'toml': 'TOML',
    };
    
    return languageNames[extension || ''] || 'Plain Text';
  };

  return {
    getLanguageSupport,
    getLanguageName,
  };
};