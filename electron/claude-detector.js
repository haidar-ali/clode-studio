import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { app } from 'electron';
const execAsync = promisify(exec);
export class ClaudeDetector {
    static cachedInfo = null;
    /**
     * Detect Claude installation by running 'which claude' in the user's shell
     * This ensures we use the same Claude that the user would get in their terminal
     */
    static async detectClaude(workingDirectory) {
        // In production, always re-detect to find bundled version
        if (!app.isPackaged && this.cachedInfo) {
            return this.cachedInfo;
        }
        // In production, check for bundled Claude FIRST
        if (app && app.isPackaged) {
            console.log('App is packaged, looking for bundled Claude...');
            const appPath = app.getAppPath();
            console.log('App path:', appPath);
            const unpackedPath = appPath.replace('app.asar', 'app.asar.unpacked');
            console.log('Unpacked path:', unpackedPath);
            const bundledPaths = [
                join(unpackedPath, 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js'),
                join(unpackedPath, 'node_modules', '.bin', 'claude'),
                join(unpackedPath, 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude'),
                join(unpackedPath, 'node_modules', '@anthropic-ai', 'claude-code', 'dist', 'index.js'),
                join(unpackedPath, 'node_modules', '@anthropic-ai', 'claude-code', 'dist', 'cli.js')
            ];
            for (const bundledPath of bundledPaths) {
                console.log('Checking bundled path:', bundledPath, 'exists:', existsSync(bundledPath));
                if (existsSync(bundledPath)) {
                    console.log('Found bundled Claude at:', bundledPath);
                    let version = 'bundled';
                    try {
                        // Try to get version from package.json
                        const packagePath = join(unpackedPath, 'node_modules', '@anthropic-ai', 'claude-code', 'package.json');
                        if (existsSync(packagePath)) {
                            const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
                            version = `${pkg.version} (Claude Code bundled)`;
                        }
                    }
                    catch (e) {
                        console.error('Failed to read Claude package version:', e);
                    }
                    this.cachedInfo = {
                        path: bundledPath,
                        version,
                        source: 'bundled'
                    };
                    console.log('Returning bundled Claude info:', this.cachedInfo);
                    return this.cachedInfo;
                }
            }
            console.log('No bundled Claude found, falling back to system detection');
        }
        else {
            console.log('App is not packaged or app is undefined');
        }
        // Only try shell detection if not in production
        if (!app.isPackaged) {
            try {
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
        }
        // Fallback: Check common installation locations
        const fallbackPaths = [];
        // In production, only check bundled paths
        if (app && app.isPackaged) {
            console.log('Production mode: Only checking bundled paths in fallback');
            // In packaged app, the unpacked Claude will be in app.asar.unpacked
            const appPath = app.getAppPath();
            const unpackedPath = appPath.replace('app.asar', 'app.asar.unpacked');
            fallbackPaths.push(join(unpackedPath, 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js'), join(unpackedPath, 'node_modules', '.bin', 'claude'), join(unpackedPath, 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude'), join(unpackedPath, 'node_modules', '@anthropic-ai', 'claude-code', 'dist', 'index.js'), join(unpackedPath, 'node_modules', '@anthropic-ai', 'claude-code', 'dist', 'cli.js'));
        }
        else {
            // In development, check all locations
            fallbackPaths.push(
            // Local node_modules (highest priority for dev)
            join(process.cwd(), 'node_modules', '.bin', 'claude'), join(workingDirectory || process.cwd(), 'node_modules', '.bin', 'claude'), 
            // Common global locations
            '/usr/local/bin/claude', '/opt/homebrew/bin/claude', join(process.env.HOME || '', '.local', 'bin', 'claude'), join(process.env.HOME || '', '.npm-global', 'bin', 'claude'), join(process.env.HOME || '', '.bun', 'bin', 'claude'), 
            // NVM installations
            ...this.getNvmPaths());
        }
        for (const path of fallbackPaths) {
            if (existsSync(path)) {
                console.log('Found Claude at fallback path:', path);
                // Try to get version
                let version = 'unknown';
                // In production, mark as bundled
                let source = 'fallback';
                if (app && app.isPackaged) {
                    source = 'bundled';
                    // Try to get version from package.json for bundled
                    try {
                        const appPath = app.getAppPath();
                        const unpackedPath = appPath.replace('app.asar', 'app.asar.unpacked');
                        const packagePath = join(unpackedPath, 'node_modules', '@anthropic-ai', 'claude-code', 'package.json');
                        if (existsSync(packagePath)) {
                            const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
                            version = `${pkg.version} (Claude Code bundled)`;
                        }
                    }
                    catch (e) {
                        console.error('Failed to read package version:', e);
                    }
                }
                else {
                    // In development, try to get version
                    try {
                        const { stdout } = await execAsync(`"${path}" --version`, {
                            timeout: 5000
                        });
                        version = stdout.trim();
                    }
                    catch (error) {
                        console.warn('Failed to get Claude version:', error);
                    }
                    // Determine source based on path
                    if (path.includes('node_modules/.bin')) {
                        source = 'local';
                    }
                    else if (path.includes('.nvm')) {
                        source = 'nvm';
                    }
                    else if (path.includes('.bun')) {
                        source = 'bun-global';
                    }
                }
                this.cachedInfo = {
                    path,
                    version,
                    source
                };
                console.log('Returning Claude info from fallback:', this.cachedInfo);
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
        // For bundled installations, we need special handling
        if (claudeInfo.source === 'bundled') {
            // The bundled Claude is a Node.js CLI application, not an Electron app
            // We need to run it with Node.js, not spawn it as an Electron process
            if (claudeInfo.path.endsWith('cli.js')) {
                // Check if we're in development or production
                const isDev = !app || !app.isPackaged;
                if (isDev) {
                    // In development, use node from PATH
                    const userShell = process.env.SHELL || '/bin/bash';
                    const quotedPath = `"${claudeInfo.path}"`;
                    const quotedArgs = args.map(arg => `"${arg.replace(/"/g, '\\"')}"`).join(' ');
                    const fullCommand = quotedArgs
                        ? `node ${quotedPath} ${quotedArgs}`
                        : `node ${quotedPath}`;
                    return {
                        command: userShell,
                        args: ['-c', fullCommand],
                        useShell: true
                    };
                }
                else {
                    // In production, try to find a real Node.js binary first to avoid macOS dock icon bug
                    // This is a known issue in macOS Sequoia 15+ where Node processes show in dock
                    // Try to find Node.js in common locations
                    const nodePaths = [
                        '/usr/local/bin/node',
                        '/opt/homebrew/bin/node',
                        '/opt/homebrew/opt/node/bin/node',
                        '/opt/homebrew/opt/node@20/bin/node',
                        '/opt/homebrew/opt/node@22/bin/node',
                        // Check user's .nvm directory
                        `${process.env.HOME}/.nvm/versions/node/v22.14.0/bin/node`,
                        `${process.env.HOME}/.nvm/versions/node/v20.18.2/bin/node`
                    ];
                    let nodeCommand = null;
                    for (const nodePath of nodePaths) {
                        if (existsSync(nodePath)) {
                            console.log('Found system Node.js at:', nodePath);
                            nodeCommand = nodePath;
                            break;
                        }
                    }
                    if (nodeCommand) {
                        // Use the system Node.js to avoid dock icon issue
                        return {
                            command: nodeCommand,
                            args: [claudeInfo.path, ...args],
                            useShell: false
                        };
                    }
                    else {
                        // Fallback to Electron's built-in Node.js
                        console.log('No system Node.js found, using Electron built-in:', process.execPath);
                        console.log('Note: This may cause dock icons on macOS 15+ due to system bug');
                        // Spawn using Electron as Node.js (env will be set in pty.spawn)
                        return {
                            command: process.execPath,
                            args: [claudeInfo.path, ...args],
                            useShell: false
                        };
                    }
                }
            }
            // If the path ends with .js but not cli.js, still try with node
            if (claudeInfo.path.endsWith('.js')) {
                const userShell = process.env.SHELL || '/bin/bash';
                const quotedPath = `"${claudeInfo.path}"`;
                const quotedArgs = args.map(arg => `"${arg.replace(/"/g, '\\"')}"`).join(' ');
                const fullCommand = quotedArgs
                    ? `node ${quotedPath} ${quotedArgs}`
                    : `node ${quotedPath}`;
                return {
                    command: userShell,
                    args: ['-c', fullCommand],
                    useShell: true
                };
            }
            // Otherwise, try to run it directly (might be a shell script)
            // But use shell to ensure PATH and environment are set up
            const userShell = process.env.SHELL || '/bin/bash';
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
