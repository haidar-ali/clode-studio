import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
const execAsync = promisify(exec);
export class ClaudeDetector {
    static cachedInfo = null;
    /**
     * Detect Claude installation by running 'which claude' in the user's shell
     * This ensures we use the same Claude that the user would get in their terminal
     */
    static async detectClaude(workingDirectory) {
        // Return cached info if available
        if (this.cachedInfo) {
            return this.cachedInfo;
        }
        try {
            // First, try to detect Claude using the shell's which command
            // This will respect the user's PATH and shell configuration
            const userShell = process.env.SHELL || '/bin/bash';
            const shellCommand = `${userShell} -l -c "which claude && claude --version"`;
            const { stdout, stderr } = await execAsync(shellCommand, {
                cwd: workingDirectory || process.cwd(),
                env: process.env,
                shell: userShell
            });
            if (stderr && !stderr.includes('warn')) {
                console.warn('Claude detection stderr:', stderr);
            }
            const lines = stdout.trim().split('\n');
            const claudePath = lines[0];
            const versionInfo = lines.slice(1).join(' ');
            if (claudePath && existsSync(claudePath)) {
                // Determine the source based on the path
                let source = 'shell';
                if (claudePath.includes('node_modules/.bin')) {
                    source = 'local';
                }
                else if (claudePath.includes('.nvm')) {
                    source = 'nvm';
                }
                else if (claudePath.includes('.bun')) {
                    source = 'bun-global';
                }
                else if (claudePath.includes('npm-global') || claudePath.includes('npm/bin')) {
                    source = 'npm-global';
                }
                this.cachedInfo = {
                    path: claudePath,
                    version: versionInfo || 'unknown',
                    source
                };
                return this.cachedInfo;
            }
        }
        catch (error) {
            console.error('Failed to detect Claude via shell:', error);
        }
        // Fallback: Check common installation locations
        const fallbackPaths = [
            // Local node_modules (highest priority)
            join(process.cwd(), 'node_modules', '.bin', 'claude'),
            join(workingDirectory || process.cwd(), 'node_modules', '.bin', 'claude'),
            // Common global locations
            '/usr/local/bin/claude',
            '/opt/homebrew/bin/claude',
            join(process.env.HOME || '', '.local', 'bin', 'claude'),
            join(process.env.HOME || '', '.npm-global', 'bin', 'claude'),
            join(process.env.HOME || '', '.bun', 'bin', 'claude'),
            // NVM installations
            ...this.getNvmPaths()
        ];
        for (const path of fallbackPaths) {
            if (existsSync(path)) {
                // Try to get version
                let version = 'unknown';
                try {
                    const { stdout } = await execAsync(`"${path}" --version`, {
                        timeout: 5000
                    });
                    version = stdout.trim();
                }
                catch (error) {
                    console.warn('Failed to get Claude version:', error);
                }
                let source = 'fallback';
                if (path.includes('node_modules/.bin')) {
                    source = 'local';
                }
                else if (path.includes('.nvm')) {
                    source = 'nvm';
                }
                else if (path.includes('.bun')) {
                    source = 'bun-global';
                }
                this.cachedInfo = {
                    path,
                    version,
                    source
                };
                return this.cachedInfo;
            }
        }
        // Last resort: just use 'claude' and hope it's in PATH
        console.warn('Could not find Claude installation, using PATH fallback');
        this.cachedInfo = {
            path: 'claude',
            version: 'unknown',
            source: 'fallback'
        };
        return this.cachedInfo;
    }
    /**
     * Get potential NVM installation paths
     */
    static getNvmPaths() {
        const nvmDir = process.env.NVM_DIR || join(process.env.HOME || '', '.nvm');
        const paths = [];
        if (existsSync(nvmDir)) {
            try {
                // Check for Claude in any Node version
                const nodeVersionsDir = join(nvmDir, 'versions', 'node');
                if (existsSync(nodeVersionsDir)) {
                    const versions = readdirSync(nodeVersionsDir);
                    for (const version of versions) {
                        const claudePath = join(nodeVersionsDir, version, 'bin', 'claude');
                        paths.push(claudePath);
                    }
                }
            }
            catch (error) {
                console.warn('Failed to scan NVM directories:', error);
            }
        }
        return paths;
    }
    /**
     * Clear the cached Claude info (useful when installation might have changed)
     */
    static clearCache() {
        this.cachedInfo = null;
    }
    /**
     * Get the shell command to run Claude with proper environment
     * This ensures hooks and other features work correctly
     */
    static getClaudeCommand(claudeInfo, args = []) {
        // For local or shell-detected installations, run through shell to ensure
        // proper environment setup (including PATH modifications)
        if (claudeInfo.source === 'local' || claudeInfo.source === 'shell') {
            const userShell = process.env.SHELL || '/bin/bash';
            // Build the full command with proper quoting
            // We need to escape the command for the shell
            const quotedPath = `'${claudeInfo.path}'`;
            const quotedArgs = args.map(arg => `'${arg}'`).join(' ');
            const fullCommand = args.length > 0
                ? `${quotedPath} ${quotedArgs}`
                : quotedPath;
            return {
                command: userShell,
                args: ['-l', '-c', fullCommand],
                useShell: true
            };
        }
        // For global installations, we can run directly
        return {
            command: claudeInfo.path,
            args: args,
            useShell: false
        };
    }
}
