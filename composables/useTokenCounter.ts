export function useTokenCounter() {
  // Token counting constants
  const BASE_CHAR_PER_TOKEN = 4;
  const CODE_MULTIPLIER = 1.2;
  const STRUCTURED_DATA_MULTIPLIER = 1.5;
  const WHITESPACE_FACTOR = 0.9;
  
  // Language-specific multipliers
  const LANGUAGE_MULTIPLIERS: Record<string, number> = {
    javascript: 1.15,
    typescript: 1.2,
    python: 1.1,
    java: 1.25,
    cpp: 1.3,
    html: 1.35,
    css: 1.2,
    json: 1.5,
    yaml: 1.4,
    markdown: 1.1,
    plain: 1.0
  };

  /**
   * Count tokens in a text string
   * Uses Claude's approximation: 1 token ≈ 4 characters
   * Applies multipliers for code and structured data
   */
  const countTokens = (text: string, type: 'text' | 'code' | 'structured' = 'text'): number => {
    if (!text) return 0;
    
    // Base token count
    let baseCount = text.length / BASE_CHAR_PER_TOKEN;
    
    // Apply type multiplier
    switch (type) {
      case 'code':
        baseCount *= CODE_MULTIPLIER;
        break;
      case 'structured':
        baseCount *= STRUCTURED_DATA_MULTIPLIER;
        break;
    }
    
    // Account for whitespace density
    const whitespaceRatio = (text.match(/\s/g) || []).length / text.length;
    if (whitespaceRatio > 0.3) {
      baseCount *= WHITESPACE_FACTOR;
    }
    
    return Math.ceil(baseCount);
  };

  /**
   * Count tokens in code with language-specific adjustments
   */
  const countCodeTokens = (code: string, language?: string): number => {
    if (!code) return 0;
    
    const baseCount = code.length / BASE_CHAR_PER_TOKEN;
    const languageMultiplier = language && LANGUAGE_MULTIPLIERS[language.toLowerCase()] 
      ? LANGUAGE_MULTIPLIERS[language.toLowerCase()] 
      : CODE_MULTIPLIER;
    
    // Account for comments (they use fewer tokens)
    const commentLines = (code.match(/\/\/.*$/gm) || []).length;
    const blockComments = (code.match(/\/\*[\s\S]*?\*\//g) || []).length;
    const commentReduction = (commentLines + blockComments * 3) * 2; // Approximate token reduction
    
    // Account for imports (they're repetitive and compress well)
    const importLines = (code.match(/^import\s+.*$/gm) || []).length;
    const importReduction = importLines * 3;
    
    const adjustedCount = (baseCount * languageMultiplier) - commentReduction - importReduction;
    
    return Math.ceil(Math.max(adjustedCount, code.length / 6)); // Minimum bound
  };

  /**
   * Count tokens in a message with mixed content
   */
  const countMessageTokens = (message: string): number => {
    if (!message) return 0;
    
    let totalTokens = 0;
    
    // Extract and count code blocks separately
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    let match;
    let textWithoutCode = message;
    
    while ((match = codeBlockRegex.exec(message)) !== null) {
      const language = match[1] || 'plain';
      const codeContent = match[2];
      totalTokens += countCodeTokens(codeContent, language);
      textWithoutCode = textWithoutCode.replace(match[0], '');
    }
    
    // Extract and count inline code
    const inlineCodeRegex = /`([^`]+)`/g;
    const inlineMatches = textWithoutCode.match(inlineCodeRegex) || [];
    inlineMatches.forEach(inlineCode => {
      totalTokens += countTokens(inlineCode, 'code');
      textWithoutCode = textWithoutCode.replace(inlineCode, '');
    });
    
    // Count remaining text
    totalTokens += countTokens(textWithoutCode, 'text');
    
    return totalTokens;
  };

  /**
   * Count tokens in structured data (JSON, YAML, etc.)
   */
  const countStructuredTokens = (data: any): number => {
    try {
      const jsonString = JSON.stringify(data, null, 2);
      return countTokens(jsonString, 'structured');
    } catch {
      // If not serializable, estimate based on object structure
      return estimateObjectTokens(data);
    }
  };

  /**
   * Estimate tokens for complex objects
   */
  const estimateObjectTokens = (obj: any, depth = 0): number => {
    if (depth > 10) return 10; // Prevent infinite recursion
    
    let tokens = 0;
    
    if (obj === null || obj === undefined) {
      return 1;
    }
    
    if (typeof obj === 'string') {
      return countTokens(obj, 'text');
    }
    
    if (typeof obj === 'number' || typeof obj === 'boolean') {
      return 1;
    }
    
    if (Array.isArray(obj)) {
      tokens += 2; // Array brackets
      obj.forEach(item => {
        tokens += estimateObjectTokens(item, depth + 1) + 1; // +1 for comma
      });
      return tokens;
    }
    
    if (typeof obj === 'object') {
      tokens += 2; // Object brackets
      Object.entries(obj).forEach(([key, value]) => {
        tokens += countTokens(key, 'text') + 1; // +1 for colon
        tokens += estimateObjectTokens(value, depth + 1) + 1; // +1 for comma
      });
      return tokens;
    }
    
    return 5; // Default for unknown types
  };

  /**
   * Count tokens in file content based on file type
   */
  const countFileTokens = (content: string, filePath: string): number => {
    const extension = filePath.split('.').pop()?.toLowerCase() || '';
    
    // Map file extensions to languages
    const extensionToLanguage: Record<string, string> = {
      js: 'javascript',
      jsx: 'javascript',
      ts: 'typescript',
      tsx: 'typescript',
      py: 'python',
      java: 'java',
      cpp: 'cpp',
      c: 'cpp',
      h: 'cpp',
      hpp: 'cpp',
      cs: 'csharp',
      rb: 'ruby',
      go: 'go',
      rs: 'rust',
      php: 'php',
      swift: 'swift',
      kt: 'kotlin',
      scala: 'scala',
      r: 'r',
      m: 'matlab',
      html: 'html',
      htm: 'html',
      css: 'css',
      scss: 'css',
      sass: 'css',
      less: 'css',
      json: 'json',
      yaml: 'yaml',
      yml: 'yaml',
      xml: 'xml',
      md: 'markdown',
      txt: 'plain'
    };
    
    const language = extensionToLanguage[extension];
    
    if (language === 'json' || language === 'yaml' || language === 'xml') {
      return countTokens(content, 'structured');
    } else if (language) {
      return countCodeTokens(content, language);
    } else {
      // Unknown file type, use code multiplier as default
      return countTokens(content, 'code');
    }
  };

  /**
   * Estimate tokens for a context enhancement
   */
  const countContextTokens = (context: {
    projectOverview?: string;
    fileContext?: string;
    codeSnippets?: string[];
    dependencies?: string[];
  }): number => {
    let tokens = 0;
    
    if (context.projectOverview) {
      tokens += countTokens(context.projectOverview, 'text');
    }
    
    if (context.fileContext) {
      tokens += countMessageTokens(context.fileContext);
    }
    
    if (context.codeSnippets) {
      context.codeSnippets.forEach(snippet => {
        tokens += countCodeTokens(snippet);
      });
    }
    
    if (context.dependencies) {
      tokens += context.dependencies.length * 5; // Rough estimate for dependency names
    }
    
    return tokens;
  };

  /**
   * Get token count statistics for different content types
   */
  const getTokenStats = (content: string) => {
    const stats = {
      total: countMessageTokens(content),
      text: 0,
      code: 0,
      structured: 0,
      breakdown: [] as Array<{ type: string; tokens: number; percentage: number }>
    };
    
    // Extract different content types
    const codeBlocks = content.match(/```[\s\S]*?```/g) || [];
    const jsonBlocks = content.match(/\{[\s\S]*?\}/g) || [];
    
    // Count code blocks
    codeBlocks.forEach(block => {
      const tokens = countMessageTokens(block);
      stats.code += tokens;
    });
    
    // Count structured data (rough estimate)
    jsonBlocks.forEach(block => {
      try {
        JSON.parse(block);
        const tokens = countTokens(block, 'structured');
        stats.structured += tokens;
      } catch {
        // Not valid JSON, count as text
      }
    });
    
    // Rest is text
    stats.text = stats.total - stats.code - stats.structured;
    
    // Calculate breakdown
    if (stats.total > 0) {
      stats.breakdown = [
        { type: 'text', tokens: stats.text, percentage: (stats.text / stats.total) * 100 },
        { type: 'code', tokens: stats.code, percentage: (stats.code / stats.total) * 100 },
        { type: 'structured', tokens: stats.structured, percentage: (stats.structured / stats.total) * 100 }
      ];
    }
    
    return stats;
  };

  /**
   * Format token count for display
   */
  const formatTokenCount = (tokens: number): string => {
    if (tokens < 1000) {
      return `${tokens} tokens`;
    } else if (tokens < 1000000) {
      return `${(tokens / 1000).toFixed(1)}k tokens`;
    } else {
      return `${(tokens / 1000000).toFixed(2)}M tokens`;
    }
  };

  return {
    countTokens,
    countCodeTokens,
    countMessageTokens,
    countStructuredTokens,
    countFileTokens,
    countContextTokens,
    getTokenStats,
    formatTokenCount,
    // Export constants for external use
    BASE_CHAR_PER_TOKEN,
    CODE_MULTIPLIER,
    STRUCTURED_DATA_MULTIPLIER
  };
}