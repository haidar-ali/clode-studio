import { ipcMain } from 'electron';
import * as path from 'path';
import fs from 'fs-extra';
import * as os from 'os';

export interface GitHook {
  name: string;
  enabled: boolean;
  script: string;
  description: string;
}

export interface HookOptions {
  preCommit?: {
    enabled: boolean;
    lintCheck?: boolean;
    typeCheck?: boolean;
    testCheck?: boolean;
    formatCheck?: boolean;
    preventFixup?: boolean;
    maxFileSize?: number; // in MB
  };
  postCommit?: {
    enabled: boolean;
    autoCheckpoint?: boolean;
    notifySuccess?: boolean;
  };
  prePush?: {
    enabled: boolean;
    runTests?: boolean;
    checkBranch?: boolean;
    preventForcePush?: boolean;
  };
  commitMsg?: {
    enabled: boolean;
    enforceConventional?: boolean;
    maxLength?: number;
    requireTicketNumber?: boolean;
  };
}

export class GitHooksManager {
  private repoPath: string;
  private hooksPath: string;
  private backupPath: string;
  private options: HookOptions;
  
  constructor(repoPath: string, setupHandlers: boolean = true) {
    this.repoPath = repoPath;
    this.hooksPath = path.join(repoPath, '.git', 'hooks');
    this.backupPath = path.join(repoPath, '.git', 'hooks-backup');
    this.options = this.loadOptions();
    if (setupHandlers) {
      this.setupIpcHandlers();
    }
  }
  
  private setupIpcHandlers() {
    ipcMain.handle('git-hooks:install', async (event, options?: HookOptions) => {
      return await this.installHooks(options);
    });
    
    ipcMain.handle('git-hooks:uninstall', async () => {
      return await this.uninstallHooks();
    });
    
    ipcMain.handle('git-hooks:status', async () => {
      return await this.getHooksStatus();
    });
    
    ipcMain.handle('git-hooks:update', async (event, hookName: string, options: any) => {
      return await this.updateHook(hookName, options);
    });
    
    ipcMain.handle('git-hooks:test', async (event, hookName: string) => {
      return await this.testHook(hookName);
    });
  }
  
  private loadOptions(): HookOptions {
    const optionsPath = path.join(this.repoPath, '.claude', 'hooks.json');
    if (fs.existsSync(optionsPath)) {
      try {
        return fs.readJSONSync(optionsPath);
      } catch (error) {
        console.error('Failed to load hook options:', error);
      }
    }
    
    // Default options
    return {
      preCommit: {
        enabled: true,
        lintCheck: true,
        typeCheck: true,
        testCheck: false,
        formatCheck: true,
        preventFixup: true,
        maxFileSize: 50
      },
      postCommit: {
        enabled: true,
        autoCheckpoint: true,
        notifySuccess: true
      },
      prePush: {
        enabled: true,
        runTests: false,
        checkBranch: true,
        preventForcePush: true
      },
      commitMsg: {
        enabled: true,
        enforceConventional: true,
        maxLength: 72,
        requireTicketNumber: false
      }
    };
  }
  
  private saveOptions(options: HookOptions) {
    const optionsPath = path.join(this.repoPath, '.claude', 'hooks.json');
    fs.ensureDirSync(path.dirname(optionsPath));
    fs.writeJSONSync(optionsPath, options, { spaces: 2 });
    this.options = options;
  }
  
  async installHooks(options?: HookOptions): Promise<{ success: boolean; installedHooks?: string[]; error?: string }> {
    try {
      if (options) {
        this.saveOptions(options);
      }
      
      // Ensure hooks directory exists
      await fs.ensureDir(this.hooksPath);
      
      // Backup existing hooks
      await this.backupExistingHooks();
      
      const installedHooks: string[] = [];
      
      // Install pre-commit hook
      if (this.options.preCommit?.enabled) {
        await this.installPreCommitHook();
        installedHooks.push('pre-commit');
      }
      
      // Install post-commit hook
      if (this.options.postCommit?.enabled) {
        await this.installPostCommitHook();
        installedHooks.push('post-commit');
      }
      
      // Install pre-push hook
      if (this.options.prePush?.enabled) {
        await this.installPrePushHook();
        installedHooks.push('pre-push');
      }
      
      // Install commit-msg hook
      if (this.options.commitMsg?.enabled) {
        await this.installCommitMsgHook();
        installedHooks.push('commit-msg');
      }
      
      return { success: true, installedHooks };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to install hooks' 
      };
    }
  }
  
  async uninstallHooks(): Promise<{ success: boolean; error?: string }> {
    try {
      // Remove our hooks
      const hooks = ['pre-commit', 'post-commit', 'pre-push', 'commit-msg'];
      for (const hook of hooks) {
        const hookPath = path.join(this.hooksPath, hook);
        if (await fs.pathExists(hookPath)) {
          const content = await fs.readFile(hookPath, 'utf-8');
          if (content.includes('# Claude Code IDE Hook')) {
            await fs.remove(hookPath);
          }
        }
      }
      
      // Restore backed up hooks
      await this.restoreBackupHooks();
      
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to uninstall hooks' 
      };
    }
  }
  
  async getHooksStatus(): Promise<{ success: boolean; hooks?: GitHook[]; error?: string }> {
    try {
      const hooks: GitHook[] = [];
      
      // Check pre-commit
      hooks.push({
        name: 'pre-commit',
        enabled: await this.isHookInstalled('pre-commit'),
        description: 'Runs before commit to validate code quality',
        script: this.options.preCommit?.enabled ? await this.getHookScript('pre-commit') : ''
      });
      
      // Check post-commit
      hooks.push({
        name: 'post-commit',
        enabled: await this.isHookInstalled('post-commit'),
        description: 'Runs after commit for auto-checkpointing',
        script: this.options.postCommit?.enabled ? await this.getHookScript('post-commit') : ''
      });
      
      // Check pre-push
      hooks.push({
        name: 'pre-push',
        enabled: await this.isHookInstalled('pre-push'),
        description: 'Runs before push to validate branch and tests',
        script: this.options.prePush?.enabled ? await this.getHookScript('pre-push') : ''
      });
      
      // Check commit-msg
      hooks.push({
        name: 'commit-msg',
        enabled: await this.isHookInstalled('commit-msg'),
        description: 'Validates commit message format',
        script: this.options.commitMsg?.enabled ? await this.getHookScript('commit-msg') : ''
      });
      
      return { success: true, hooks };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to get hooks status' 
      };
    }
  }
  
  async updateHook(hookName: string, options: any): Promise<{ success: boolean; error?: string }> {
    try {
      // Update specific hook options
      switch (hookName) {
        case 'pre-commit':
          this.options.preCommit = { ...this.options.preCommit, ...options };
          if (this.options.preCommit?.enabled) {
            await this.installPreCommitHook();
          }
          break;
        case 'post-commit':
          this.options.postCommit = { ...this.options.postCommit, ...options };
          if (this.options.postCommit?.enabled) {
            await this.installPostCommitHook();
          }
          break;
        case 'pre-push':
          this.options.prePush = { ...this.options.prePush, ...options };
          if (this.options.prePush?.enabled) {
            await this.installPrePushHook();
          }
          break;
        case 'commit-msg':
          this.options.commitMsg = { ...this.options.commitMsg, ...options };
          if (this.options.commitMsg?.enabled) {
            await this.installCommitMsgHook();
          }
          break;
      }
      
      this.saveOptions(this.options);
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to update hook' 
      };
    }
  }
  
  async testHook(hookName: string): Promise<{ success: boolean; output?: string; error?: string }> {
    try {
      const hookPath = path.join(this.hooksPath, hookName);
      if (!await fs.pathExists(hookPath)) {
        return { success: false, error: 'Hook not installed' };
      }
      
      // Test hook with dummy data
      const { exec } = require('child_process');
      const output = await new Promise<string>((resolve, reject) => {
        exec(`sh ${hookPath} test`, { cwd: this.repoPath }, (error: any, stdout: string, stderr: string) => {
          if (error && error.code !== 0) {
            resolve(`Hook test failed:\n${stdout}\n${stderr}`);
          } else {
            resolve(`Hook test passed:\n${stdout}`);
          }
        });
      });
      
      return { success: true, output };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to test hook' 
      };
    }
  }
  
  private async backupExistingHooks() {
    if (!await fs.pathExists(this.backupPath)) {
      await fs.ensureDir(this.backupPath);
    }
    
    const hooks = ['pre-commit', 'post-commit', 'pre-push', 'commit-msg'];
    for (const hook of hooks) {
      const hookPath = path.join(this.hooksPath, hook);
      if (await fs.pathExists(hookPath)) {
        const content = await fs.readFile(hookPath, 'utf-8');
        if (!content.includes('# Claude Code IDE Hook')) {
          // Backup non-Claude hooks
          await fs.copy(hookPath, path.join(this.backupPath, hook));
        }
      }
    }
  }
  
  private async restoreBackupHooks() {
    if (!await fs.pathExists(this.backupPath)) {
      return;
    }
    
    const hooks = await fs.readdir(this.backupPath);
    for (const hook of hooks) {
      const backupPath = path.join(this.backupPath, hook);
      const hookPath = path.join(this.hooksPath, hook);
      await fs.copy(backupPath, hookPath);
    }
    
    // Clean up backup
    await fs.remove(this.backupPath);
  }
  
  private async isHookInstalled(hookName: string): Promise<boolean> {
    const hookPath = path.join(this.hooksPath, hookName);
    if (await fs.pathExists(hookPath)) {
      const content = await fs.readFile(hookPath, 'utf-8');
      return content.includes('# Claude Code IDE Hook');
    }
    return false;
  }
  
  private async getHookScript(hookName: string): Promise<string> {
    const hookPath = path.join(this.hooksPath, hookName);
    if (await fs.pathExists(hookPath)) {
      return await fs.readFile(hookPath, 'utf-8');
    }
    return '';
  }
  
  private async installPreCommitHook() {
    const opts = this.options.preCommit!;
    
    let script = `#!/bin/sh
# Claude Code IDE Hook - Pre-commit
set -e

echo "🔍 Running pre-commit checks..."
`;

    // Prevent fixup commits
    if (opts.preventFixup) {
      script += `
# Check for fixup commits
if git diff --cached --name-only | grep -q "fixup!"; then
  echo "❌ Fixup commits are not allowed. Please squash them first."
  exit 1
fi
`;
    }

    // Check file size
    if (opts.maxFileSize) {
      script += `
# Check for large files
for file in $(git diff --cached --name-only); do
  if [ -f "$file" ]; then
    size=$(du -m "$file" | cut -f1)
    if [ $size -gt ${opts.maxFileSize} ]; then
      echo "❌ File $file is too large ($size MB > ${opts.maxFileSize}MB)"
      exit 1
    fi
  fi
done
`;
    }

    // Lint check
    if (opts.lintCheck) {
      script += `
# Run lint check
if [ -f "package.json" ] && grep -q '"lint"' package.json; then
  echo "📋 Running lint..."
  npm run lint || {
    echo "❌ Lint check failed"
    exit 1
  }
fi
`;
    }

    // Type check
    if (opts.typeCheck) {
      script += `
# Run type check
if [ -f "tsconfig.json" ]; then
  echo "🔤 Running type check..."
  npx tsc --noEmit || {
    echo "❌ Type check failed"
    exit 1
  }
fi
`;
    }

    // Format check
    if (opts.formatCheck) {
      script += `
# Check formatting
if [ -f "package.json" ] && grep -q '"format"' package.json; then
  echo "🎨 Checking formatting..."
  npm run format:check 2>/dev/null || {
    echo "⚠️  Format check not configured"
  }
fi
`;
    }

    // Test check
    if (opts.testCheck) {
      script += `
# Run tests
if [ -f "package.json" ] && grep -q '"test"' package.json; then
  echo "🧪 Running tests..."
  npm test || {
    echo "❌ Tests failed"
    exit 1
  }
fi
`;
    }

    script += `
echo "✅ All pre-commit checks passed!"
`;

    const hookPath = path.join(this.hooksPath, 'pre-commit');
    await fs.writeFile(hookPath, script, { mode: 0o755 });
  }
  
  private async installPostCommitHook() {
    const opts = this.options.postCommit!;
    
    let script = `#!/bin/sh
# Claude Code IDE Hook - Post-commit

`;

    // Auto checkpoint
    if (opts.autoCheckpoint) {
      script += `
# Create automatic checkpoint
echo "📸 Creating post-commit checkpoint..."
# Signal to Claude Code IDE to create a checkpoint
echo "POST_COMMIT_CHECKPOINT" > .git/claude-checkpoint-trigger
`;
    }

    // Notify success
    if (opts.notifySuccess) {
      script += `
# Notify commit success
commit_hash=$(git rev-parse HEAD)
commit_msg=$(git log -1 --pretty=%B)
echo "✅ Commit successful: $commit_hash"
echo "   $commit_msg"
`;
    }

    const hookPath = path.join(this.hooksPath, 'post-commit');
    await fs.writeFile(hookPath, script, { mode: 0o755 });
  }
  
  private async installPrePushHook() {
    const opts = this.options.prePush!;
    
    let script = `#!/bin/sh
# Claude Code IDE Hook - Pre-push
set -e

echo "🚀 Running pre-push checks..."

remote="$1"
url="$2"
`;

    // Check branch protection
    if (opts.checkBranch) {
      script += `
# Check protected branches
protected_branches="main master production"
current_branch=$(git symbolic-ref HEAD | sed -e 's,.*/\\(.*\\),\\1,')

for branch in $protected_branches; do
  if [ "$current_branch" = "$branch" ]; then
    echo "⚠️  You are pushing to protected branch: $branch"
    echo "   Are you sure? (y/n)"
    read -r response
    if [ "$response" != "y" ]; then
      echo "❌ Push cancelled"
      exit 1
    fi
  fi
done
`;
    }

    // Prevent force push
    if (opts.preventForcePush) {
      script += `
# Prevent force push
if echo "$*" | grep -q "\-\-force\|\-f"; then
  echo "❌ Force push is not allowed"
  exit 1
fi
`;
    }

    // Run tests
    if (opts.runTests) {
      script += `
# Run tests before push
if [ -f "package.json" ] && grep -q '"test"' package.json; then
  echo "🧪 Running tests before push..."
  npm test || {
    echo "❌ Tests failed - push aborted"
    exit 1
  }
fi
`;
    }

    script += `
echo "✅ All pre-push checks passed!"
`;

    const hookPath = path.join(this.hooksPath, 'pre-push');
    await fs.writeFile(hookPath, script, { mode: 0o755 });
  }
  
  private async installCommitMsgHook() {
    const opts = this.options.commitMsg!;
    
    let script = `#!/bin/sh
# Claude Code IDE Hook - Commit message validation

commit_regex='^(feat|fix|docs|style|refactor|perf|test|chore|build|ci|revert)(\(.+\))?: .{1,50}'
commit_msg_file=$1
commit_msg=$(cat $commit_msg_file)

echo "📝 Validating commit message..."
`;

    // Enforce conventional commits
    if (opts.enforceConventional) {
      script += `
# Check conventional commit format
if ! echo "$commit_msg" | grep -qE "$commit_regex"; then
  echo "❌ Invalid commit message format!"
  echo ""
  echo "Commit message must follow Conventional Commits format:"
  echo "  <type>(<scope>): <subject>"
  echo ""
  echo "Examples:"
  echo "  feat: add user authentication"
  echo "  fix(auth): resolve login timeout issue"
  echo "  docs: update API documentation"
  echo ""
  echo "Types: feat, fix, docs, style, refactor, perf, test, chore, build, ci, revert"
  exit 1
fi
`;
    }

    // Check message length
    if (opts.maxLength) {
      script += `
# Check message length
first_line=$(echo "$commit_msg" | head -n1)
if [ \${#first_line} -gt ${opts.maxLength} ]; then
  echo "❌ Commit message too long (${opts.maxLength} chars max)"
  echo "   Current length: \${#first_line}"
  exit 1
fi
`;
    }

    // Require ticket number
    if (opts.requireTicketNumber) {
      script += `
# Check for ticket number
if ! echo "$commit_msg" | grep -qE "(#[0-9]+|[A-Z]+-[0-9]+)"; then
  echo "⚠️  No ticket number found in commit message"
  echo "   Include ticket number like #123 or JIRA-456"
fi
`;
    }

    script += `
echo "✅ Commit message validated!"
`;

    const hookPath = path.join(this.hooksPath, 'commit-msg');
    await fs.writeFile(hookPath, script, { mode: 0o755 });
  }
}