import { ref, computed } from 'vue';
import { useSourceControlStore } from '~/stores/source-control';
import { useClaudeInstancesStore } from '~/stores/claude-instances';

export interface CommitMessageOptions {
  style?: 'conventional' | 'descriptive' | 'concise';
  includeScope?: boolean;
  includeBreakingChanges?: boolean;
  maxLength?: number;
  language?: string;
}

export interface BranchNameOptions {
  style?: 'feature' | 'bugfix' | 'hotfix' | 'release' | 'chore';
  includeTicketNumber?: boolean;
  ticketPrefix?: string;
  maxLength?: number;
}

export function useAIGit() {
  const gitStore = useSourceControlStore();
  const claudeStore = useClaudeInstancesStore();
  
  // State
  const isGenerating = ref(false);
  const lastGeneratedMessage = ref('');
  const lastGeneratedBranch = ref('');
  
  // Conventional commit types
  const conventionalTypes = {
    feat: 'A new feature',
    fix: 'A bug fix',
    docs: 'Documentation only changes',
    style: 'Changes that do not affect the meaning of the code',
    refactor: 'A code change that neither fixes a bug nor adds a feature',
    perf: 'A code change that improves performance',
    test: 'Adding missing tests or correcting existing tests',
    build: 'Changes that affect the build system or external dependencies',
    ci: 'Changes to our CI configuration files and scripts',
    chore: 'Other changes that don\'t modify src or test files',
    revert: 'Reverts a previous commit'
  };
  
  // Generate commit message from staged changes
  async function generateCommitMessage(options: CommitMessageOptions = {}): Promise<string> {
    const defaultOptions: CommitMessageOptions = {
      style: 'conventional',
      includeScope: true,
      includeBreakingChanges: true,
      maxLength: 72,
      language: 'en',
      ...options
    };
    
    isGenerating.value = true;
    
    try {
      // Get staged files and their diffs
      const stagedFiles = gitStore.stagedFiles;
      if (stagedFiles.length === 0) {
        throw new Error('No staged files to generate commit message from');
      }
      
      // Get diffs for staged files
      const diffs = await Promise.all(
        stagedFiles.map(async (file) => {
          const diff = await window.electronAPI.git.diffStaged(file.path);
          return {
            path: file.path,
            status: file.status,
            diff: diff.success ? diff.data : ''
          };
        })
      );
      
      // Build context for AI
      const context = buildCommitContext(diffs);
      
      // Generate message using Claude
      const message = await callClaudeForCommitMessage(context, defaultOptions);
      
      lastGeneratedMessage.value = message;
      return message;
    } catch (error) {
      console.error('Failed to generate commit message:', error);
      throw error;
    } finally {
      isGenerating.value = false;
    }
  }
  
  // Generate branch name from task or description
  async function generateBranchName(
    description: string,
    options: BranchNameOptions = {}
  ): Promise<string> {
    const defaultOptions: BranchNameOptions = {
      style: 'feature',
      includeTicketNumber: false,
      ticketPrefix: 'TICKET',
      maxLength: 50,
      ...options
    };
    
    isGenerating.value = true;
    
    try {
      // Extract ticket number if present
      const ticketMatch = description.match(/([A-Z]+-\d+)/);
      const ticketNumber = ticketMatch ? ticketMatch[1] : null;
      
      // Generate branch name using Claude
      const branchName = await callClaudeForBranchName(description, defaultOptions, ticketNumber);
      
      lastGeneratedBranch.value = branchName;
      return branchName;
    } catch (error) {
      console.error('Failed to generate branch name:', error);
      throw error;
    } finally {
      isGenerating.value = false;
    }
  }
  
  // Build context from file diffs
  function buildCommitContext(diffs: Array<{ path: string; status: string; diff: string }>) {
    const context = {
      fileCount: diffs.length,
      files: diffs.map(d => ({
        path: d.path,
        status: d.status,
        extension: d.path.split('.').pop(),
        directory: d.path.split('/').slice(0, -1).join('/')
      })),
      changes: {
        additions: 0,
        deletions: 0,
        modifications: 0
      },
      scopes: new Set<string>(),
      diffSummary: ''
    };
    
    // Analyze diffs
    diffs.forEach(({ path, status, diff }) => {
      // Count change types
      if (status === 'added') context.changes.additions++;
      else if (status === 'deleted') context.changes.deletions++;
      else context.changes.modifications++;
      
      // Extract scope from path
      const parts = path.split('/');
      if (parts.length > 1) {
        context.scopes.add(parts[0]);
      }
      
      // Summarize diff (first few meaningful lines)
      if (diff) {
        const lines = diff.split('\n').filter(line => 
          line.startsWith('+') || line.startsWith('-')
        ).slice(0, 10);
        context.diffSummary += `\n${path}:\n${lines.join('\n')}`;
      }
    });
    
    return context;
  }
  
  // Call Claude for commit message generation
  async function callClaudeForCommitMessage(
    context: any,
    options: CommitMessageOptions
  ): Promise<string> {
    // Build prompt based on style
    let prompt = '';
    
    if (options.style === 'conventional') {
      prompt = `Generate a conventional commit message for the following changes:

File changes:
${context.files.map((f: any) => `- ${f.status}: ${f.path}`).join('\n')}

Diff summary:
${context.diffSummary}

Requirements:
- Use conventional commit format: <type>(<scope>): <subject>
- Types: ${Object.keys(conventionalTypes).join(', ')}
- Keep subject line under ${options.maxLength} characters
- ${options.includeScope ? 'Include scope when applicable' : 'No scope needed'}
- ${options.includeBreakingChanges ? 'Include BREAKING CHANGE footer if applicable' : ''}
- Be specific and descriptive
- Use present tense ("add" not "added")
- Don't end with a period

Respond with ONLY the commit message, no explanation.`;
    } else if (options.style === 'descriptive') {
      prompt = `Generate a descriptive commit message for the following changes:

File changes:
${context.files.map((f: any) => `- ${f.status}: ${f.path}`).join('\n')}

Diff summary:
${context.diffSummary}

Requirements:
- First line: Brief summary (under ${options.maxLength} characters)
- Blank line
- Detailed description of what changed and why
- Use bullet points for multiple changes
- Be clear and informative

Respond with ONLY the commit message, no explanation.`;
    } else {
      prompt = `Generate a concise commit message for the following changes:

File changes:
${context.files.map((f: any) => `- ${f.status}: ${f.path}`).join('\n')}

Requirements:
- Single line, under ${options.maxLength} characters
- Clear and to the point
- Mention the main change

Respond with ONLY the commit message, no explanation.`;
    }
    
    // Use active Claude instance or create temporary one
    const activeInstance = claudeStore.activeInstance;
    if (activeInstance) {
      // Send to active Claude instance
      const response = await sendToClaudeInstance(activeInstance.id, prompt);
      return response.trim();
    } else {
      // Use a simple heuristic-based approach as fallback
      return generateFallbackCommitMessage(context, options);
    }
  }
  
  // Call Claude for branch name generation
  async function callClaudeForBranchName(
    description: string,
    options: BranchNameOptions,
    ticketNumber: string | null
  ): Promise<string> {
    const prompt = `Generate a git branch name for the following task:

Description: ${description}
${ticketNumber ? `Ticket number: ${ticketNumber}` : ''}

Requirements:
- Style: ${options.style}
- Format: ${options.style}/<description>
- Use kebab-case (lowercase with hyphens)
- Keep under ${options.maxLength} characters
- ${options.includeTicketNumber && ticketNumber ? `Include ticket number: ${ticketNumber}` : ''}
- No special characters except hyphens
- Be descriptive but concise

Examples:
- feature/add-user-authentication
- bugfix/fix-login-validation
- hotfix/patch-security-vulnerability
- release/v2.0.0
- chore/update-dependencies

Respond with ONLY the branch name, no explanation.`;
    
    // Use active Claude instance or create temporary one
    const activeInstance = claudeStore.activeInstance;
    if (activeInstance) {
      // Send to active Claude instance
      const response = await sendToClaudeInstance(activeInstance.id, prompt);
      return response.trim();
    } else {
      // Use a simple heuristic-based approach as fallback
      return generateFallbackBranchName(description, options, ticketNumber);
    }
  }
  
  // Send prompt to Claude instance
  async function sendToClaudeInstance(instanceId: string, prompt: string): Promise<string> {
    // This would integrate with the Claude terminal
    // For now, return a placeholder
    console.log('Sending to Claude instance:', instanceId, prompt);
    
    // TODO: Implement actual Claude integration
    // This would send the prompt to the Claude terminal and wait for response
    
    // Temporary: use fallback
    return '';
  }
  
  // Fallback commit message generation (heuristic-based)
  function generateFallbackCommitMessage(
    context: any,
    options: CommitMessageOptions
  ): string {
    // Determine type based on changes
    let type = 'chore';
    let scope = '';
    let subject = '';
    
    // Analyze file paths to determine type
    const filePaths = context.files.map((f: any) => f.path.toLowerCase());
    
    if (filePaths.some((p: string) => p.includes('test') || p.includes('spec'))) {
      type = 'test';
    } else if (filePaths.some((p: string) => p.includes('doc') || p.includes('readme'))) {
      type = 'docs';
    } else if (context.changes.additions > context.changes.deletions * 2) {
      type = 'feat';
    } else if (context.changes.deletions > context.changes.additions) {
      type = 'refactor';
    } else if (filePaths.some((p: string) => p.includes('.css') || p.includes('.scss'))) {
      type = 'style';
    } else if (context.files.some((f: any) => f.status === 'modified')) {
      type = 'fix';
    }
    
    // Determine scope
    if (options.includeScope && context.scopes.size > 0) {
      scope = Array.from(context.scopes)[0] as string;
    }
    
    // Generate subject based on changes
    if (context.files.length === 1) {
      const file = context.files[0];
      const fileName = file.path.split('/').pop().split('.')[0];
      
      if (file.status === 'added') {
        subject = `add ${fileName}`;
      } else if (file.status === 'deleted') {
        subject = `remove ${fileName}`;
      } else {
        subject = `update ${fileName}`;
      }
    } else {
      subject = `update ${context.files.length} files`;
      
      // Try to be more specific
      const directories = new Set(context.files.map((f: any) => f.directory));
      if (directories.size === 1) {
        const dir = Array.from(directories)[0];
        if (dir) {
          subject = `update ${dir}`;
        }
      }
    }
    
    // Build commit message
    if (options.style === 'conventional') {
      return scope ? `${type}(${scope}): ${subject}` : `${type}: ${subject}`;
    } else if (options.style === 'descriptive') {
      const description = context.files
        .map((f: any) => `- ${f.status}: ${f.path}`)
        .join('\n');
      return `${subject}\n\n${description}`;
    } else {
      return subject;
    }
  }
  
  // Fallback branch name generation
  function generateFallbackBranchName(
    description: string,
    options: BranchNameOptions,
    ticketNumber: string | null
  ): string {
    // Clean and format description
    let branchName = description
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Remove multiple hyphens
      .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
    
    // Truncate if needed
    if (branchName.length > options.maxLength!) {
      branchName = branchName.substring(0, options.maxLength! - 10);
      branchName = branchName.replace(/-[^-]*$/, ''); // Remove partial word
    }
    
    // Add prefix
    const prefix = `${options.style}/${ticketNumber ? `${ticketNumber}-` : ''}`;
    branchName = `${prefix}${branchName}`;
    
    return branchName;
  }
  
  // Validate commit message
  function validateCommitMessage(message: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const lines = message.split('\n');
    const firstLine = lines[0];
    
    // Check length
    if (firstLine.length > 72) {
      errors.push('First line should be 72 characters or less');
    }
    
    // Check conventional format
    const conventionalRegex = /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.+\))?: .+/;
    if (!conventionalRegex.test(firstLine)) {
      errors.push('Message does not follow conventional commit format');
    }
    
    // Check for period at end
    if (firstLine.endsWith('.')) {
      errors.push('First line should not end with a period');
    }
    
    // Check blank line after first line if multi-line
    if (lines.length > 1 && lines[1] !== '') {
      errors.push('Second line should be blank');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  // Get commit message suggestions
  function getCommitSuggestions(): string[] {
    const suggestions: string[] = [];
    const files = gitStore.stagedFiles;
    
    if (files.length === 0) return suggestions;
    
    // Single file suggestions
    if (files.length === 1) {
      const file = files[0];
      const fileName = file.path.split('/').pop()!;
      const fileBase = fileName.split('.')[0];
      
      if (file.status === 'added') {
        suggestions.push(`feat: add ${fileBase}`);
        suggestions.push(`chore: add ${fileName}`);
      } else if (file.status === 'deleted') {
        suggestions.push(`chore: remove ${fileBase}`);
        suggestions.push(`refactor: delete unused ${fileName}`);
      } else if (file.status === 'modified') {
        suggestions.push(`fix: update ${fileBase}`);
        suggestions.push(`refactor: improve ${fileBase}`);
        suggestions.push(`style: format ${fileName}`);
      }
    } else {
      // Multiple files
      suggestions.push(`chore: update ${files.length} files`);
      suggestions.push(`refactor: reorganize project structure`);
      suggestions.push(`feat: implement new functionality`);
      suggestions.push(`fix: resolve multiple issues`);
    }
    
    return suggestions;
  }
  
  return {
    // State
    isGenerating,
    lastGeneratedMessage,
    lastGeneratedBranch,
    conventionalTypes,
    
    // Methods
    generateCommitMessage,
    generateBranchName,
    validateCommitMessage,
    getCommitSuggestions
  };
}