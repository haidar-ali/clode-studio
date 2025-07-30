import * as path from 'path';
import * as fs from 'fs/promises';
import { EventEmitter } from 'events';
export class ClaudeAnalyzerService extends EventEmitter {
    claudeProcess = null;
    analysisQueue = [];
    activeAnalysis = null;
    workspacePath;
    analysisCache = new Map();
    cachePath;
    constructor(workspacePath) {
        super();
        this.workspacePath = workspacePath;
        this.cachePath = path.join(workspacePath, '.claude', 'analysis-cache');
        this.initialize();
    }
    /**
     * Initialize the analyzer service
     */
    async initialize() {
        try {
            await fs.mkdir(this.cachePath, { recursive: true });
            await this.loadCache();
        }
        catch (error) {
            console.error('Failed to initialize Claude analyzer:', error);
        }
    }
    /**
     * Analyze code using Claude
     */
    async analyzeCode(request) {
        const startTime = Date.now();
        // Check cache first
        const cacheKey = this.getCacheKey(request);
        const cached = this.analysisCache.get(cacheKey);
        if (cached && this.isCacheValid(cached)) {
            this.emit('analysis:cached', { request, result: cached });
            return cached;
        }
        // Add to queue
        this.analysisQueue.push(request);
        this.emit('analysis:queued', { request, queueLength: this.analysisQueue.length });
        // Process queue
        await this.processQueue();
        // Wait for analysis to complete
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Analysis timeout'));
            }, 300000); // 5 minute timeout
            const handleComplete = (result) => {
                if (result.id === request.id) {
                    clearTimeout(timeout);
                    this.removeListener('analysis:complete', handleComplete);
                    this.removeListener('analysis:error', handleError);
                    resolve(result);
                }
            };
            const handleError = (error) => {
                if (error.id === request.id) {
                    clearTimeout(timeout);
                    this.removeListener('analysis:complete', handleComplete);
                    this.removeListener('analysis:error', handleError);
                    reject(error.error);
                }
            };
            this.on('analysis:complete', handleComplete);
            this.on('analysis:error', handleError);
        });
    }
    /**
     * Process the analysis queue
     */
    async processQueue() {
        if (this.activeAnalysis || this.analysisQueue.length === 0) {
            return;
        }
        const request = this.analysisQueue.shift();
        this.activeAnalysis = request;
        try {
            this.emit('analysis:start', { request });
            // Prepare content for analysis
            const content = await this.prepareContent(request);
            // Create analysis prompt
            const prompt = this.createAnalysisPrompt(request, content);
            // Send to Claude
            const result = await this.sendToClaude(prompt);
            // Parse and structure result
            const analysisResult = this.parseAnalysisResult(request, result);
            // Cache result
            const cacheKey = this.getCacheKey(request);
            this.analysisCache.set(cacheKey, analysisResult);
            await this.saveCache();
            this.emit('analysis:complete', analysisResult);
        }
        catch (error) {
            this.emit('analysis:error', { id: request.id, error });
        }
        finally {
            this.activeAnalysis = null;
            // Process next in queue
            setImmediate(() => this.processQueue());
        }
    }
    /**
     * Prepare content for analysis
     */
    async prepareContent(request) {
        switch (request.type) {
            case 'file':
                return await this.prepareFileContent(request.target);
            case 'directory':
                return await this.prepareDirectoryContent(request.target, request.options?.depth || 2);
            case 'pattern':
                return await this.preparePatternContent(request.target);
            case 'architecture':
                return await this.prepareArchitectureContent();
            default:
                throw new Error(`Unknown analysis type: ${request.type}`);
        }
    }
    /**
     * Prepare file content for analysis
     */
    async prepareFileContent(filePath) {
        const content = await fs.readFile(filePath, 'utf-8');
        const stats = await fs.stat(filePath);
        return `File: ${path.basename(filePath)}
Path: ${filePath}
Size: ${stats.size} bytes
Last Modified: ${stats.mtime.toISOString()}

Content:
\`\`\`${this.getFileExtension(filePath)}
${content}
\`\`\``;
    }
    /**
     * Prepare directory content for analysis
     */
    async prepareDirectoryContent(dirPath, depth) {
        const files = await this.collectFiles(dirPath, depth);
        const contents = [];
        // Add directory structure
        contents.push('Directory Structure:');
        contents.push(await this.generateTreeStructure(dirPath, depth));
        contents.push('');
        // Add key files
        const keyFiles = files.filter(f => this.isKeyFile(f)).slice(0, 10);
        for (const file of keyFiles) {
            try {
                const content = await fs.readFile(file, 'utf-8');
                const relativePath = path.relative(dirPath, file);
                contents.push(`\n--- ${relativePath} ---`);
                contents.push(content.slice(0, 1000)); // First 1000 chars
                if (content.length > 1000) {
                    contents.push('... (truncated)');
                }
            }
            catch (error) {
                // Skip files that can't be read
            }
        }
        return contents.join('\n');
    }
    /**
     * Prepare pattern content for analysis
     */
    async preparePatternContent(pattern) {
        // Find files matching the pattern
        const files = await this.findFilesWithPattern(pattern);
        const contents = [];
        contents.push(`Pattern Analysis: "${pattern}"`);
        contents.push(`Found in ${files.length} files:`);
        contents.push('');
        for (const file of files.slice(0, 5)) {
            const content = await fs.readFile(file.path, 'utf-8');
            const lines = content.split('\n');
            const relevantLines = lines.filter(line => line.includes(pattern));
            contents.push(`\n--- ${path.relative(this.workspacePath, file.path)} ---`);
            relevantLines.slice(0, 5).forEach(line => {
                contents.push(line.trim());
            });
            if (relevantLines.length > 5) {
                contents.push(`... and ${relevantLines.length - 5} more occurrences`);
            }
        }
        return contents.join('\n');
    }
    /**
     * Prepare architecture content for analysis
     */
    async prepareArchitectureContent() {
        const contents = [];
        // Collect high-level information
        contents.push('Project Architecture Analysis');
        contents.push('');
        // Package.json
        try {
            const packageJson = await fs.readFile(path.join(this.workspacePath, 'package.json'), 'utf-8');
            contents.push('Package.json:');
            contents.push(packageJson);
            contents.push('');
        }
        catch (error) {
            // No package.json
        }
        // Entry points
        const entryPoints = await this.findEntryPoints();
        if (entryPoints.length > 0) {
            contents.push('Entry Points:');
            for (const entry of entryPoints) {
                const content = await fs.readFile(entry, 'utf-8');
                contents.push(`\n--- ${path.relative(this.workspacePath, entry)} ---`);
                contents.push(content.slice(0, 500));
                if (content.length > 500) {
                    contents.push('... (truncated)');
                }
            }
        }
        // Configuration files
        const configFiles = await this.findConfigFiles();
        if (configFiles.length > 0) {
            contents.push('\nConfiguration Files:');
            for (const config of configFiles) {
                try {
                    const content = await fs.readFile(config, 'utf-8');
                    contents.push(`\n--- ${path.basename(config)} ---`);
                    contents.push(content.slice(0, 300));
                    if (content.length > 300) {
                        contents.push('... (truncated)');
                    }
                }
                catch (error) {
                    // Skip
                }
            }
        }
        return contents.join('\n');
    }
    /**
     * Create analysis prompt for Claude
     */
    createAnalysisPrompt(request, content) {
        const basePrompt = `You are an expert code analyst. Analyze the following code and provide insights.

${content}

Please provide a comprehensive analysis including:`;
        switch (request.type) {
            case 'file':
                return `${basePrompt}
1. Code quality and patterns used
2. Potential issues or anti-patterns
3. Suggestions for improvement
4. Complexity assessment
5. Security considerations

Format your response as JSON with the following structure:
{
  "summary": "Brief overview",
  "patterns": [{"name": "Pattern name", "description": "Description", "category": "design|anti-pattern|optimization|security|style", "occurrences": 1, "examples": ["code example"]}],
  "suggestions": [{"title": "Suggestion", "description": "Details", "category": "refactoring|performance|security|maintainability|testing", "priority": "low|medium|high", "effort": "low|medium|high"}],
  "complexity": {"cyclomaticComplexity": 0, "cognitiveComplexity": 0, "linesOfCode": 0, "maintainabilityIndex": 0, "technicalDebt": 0}
}`;
            case 'directory':
                return `${basePrompt}
1. Overall structure and organization
2. Architectural patterns
3. Module dependencies
4. Code consistency
5. Areas for improvement

Format your response as JSON with architecture insights.`;
            case 'pattern':
                return `${basePrompt}
1. Pattern usage and consistency
2. Best practices vs actual implementation
3. Refactoring opportunities
4. Impact on maintainability

Format your response as JSON focusing on the pattern analysis.`;
            case 'architecture':
                return `${basePrompt}
1. Architecture style and patterns
2. Component responsibilities
3. Data flow and dependencies
4. Strengths and weaknesses
5. Recommendations for improvement

Format your response as JSON with detailed architecture analysis.`;
            default:
                return basePrompt;
        }
    }
    /**
     * Send prompt to Claude
     */
    async sendToClaude(prompt) {
        // This is a mock implementation
        // In a real implementation, this would communicate with Claude CLI
        return new Promise((resolve) => {
            // Simulate Claude analysis
            setTimeout(() => {
                resolve(JSON.stringify({
                    summary: "Mock analysis completed",
                    patterns: [{
                            name: "Repository Pattern",
                            description: "Well-implemented repository pattern for data access",
                            category: "design",
                            occurrences: 5,
                            examples: ["class UserRepository"]
                        }],
                    suggestions: [{
                            title: "Add error handling",
                            description: "Some async operations lack proper error handling",
                            category: "maintainability",
                            priority: "medium",
                            effort: "low"
                        }],
                    complexity: {
                        cyclomaticComplexity: 15,
                        cognitiveComplexity: 20,
                        linesOfCode: 500,
                        maintainabilityIndex: 75,
                        technicalDebt: 2
                    }
                }));
            }, 2000);
        });
    }
    /**
     * Parse analysis result from Claude
     */
    parseAnalysisResult(request, result) {
        try {
            const parsed = JSON.parse(result);
            return {
                id: request.id,
                type: request.type,
                target: request.target,
                timestamp: new Date(),
                analysis: {
                    summary: parsed.summary || "Analysis completed",
                    patterns: parsed.patterns || [],
                    architecture: parsed.architecture,
                    suggestions: parsed.suggestions || [],
                    complexity: parsed.complexity,
                    dependencies: parsed.dependencies
                },
                metadata: {
                    tokensUsed: result.length / 4, // Rough estimate
                    analysisTime: Date.now(),
                    confidence: 0.85
                }
            };
        }
        catch (error) {
            // Fallback for non-JSON responses
            return {
                id: request.id,
                type: request.type,
                target: request.target,
                timestamp: new Date(),
                analysis: {
                    summary: result,
                    patterns: [],
                    suggestions: []
                },
                metadata: {
                    tokensUsed: result.length / 4,
                    analysisTime: Date.now(),
                    confidence: 0.5
                }
            };
        }
    }
    /**
     * Helper methods
     */
    getCacheKey(request) {
        return `${request.type}:${request.target}:${JSON.stringify(request.options || {})}`;
    }
    isCacheValid(result) {
        const age = Date.now() - result.timestamp.getTime();
        return age < 24 * 60 * 60 * 1000; // 24 hours
    }
    getFileExtension(filePath) {
        const ext = path.extname(filePath).slice(1);
        const langMap = {
            ts: 'typescript',
            tsx: 'typescript',
            js: 'javascript',
            jsx: 'javascript',
            py: 'python',
            java: 'java',
            cpp: 'cpp',
            cs: 'csharp',
            go: 'go',
            rs: 'rust',
            rb: 'ruby',
            php: 'php'
        };
        return langMap[ext] || ext;
    }
    isKeyFile(filePath) {
        const keyPatterns = [
            /\.(ts|tsx|js|jsx)$/,
            /\.(py|java|cpp|cs|go|rs)$/,
            /^(index|main|app)\./,
            /\.(service|controller|component|model)\./
        ];
        return keyPatterns.some(pattern => pattern.test(path.basename(filePath)));
    }
    async collectFiles(dirPath, depth) {
        const files = [];
        const traverse = async (dir, currentDepth) => {
            if (currentDepth > depth)
                return;
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
                    await traverse(fullPath, currentDepth + 1);
                }
                else if (entry.isFile()) {
                    files.push(fullPath);
                }
            }
        };
        await traverse(dirPath, 0);
        return files;
    }
    async generateTreeStructure(dirPath, depth) {
        const tree = [];
        const traverse = async (dir, prefix, currentDepth) => {
            if (currentDepth > depth)
                return;
            const entries = await fs.readdir(dir, { withFileTypes: true });
            const dirs = entries.filter(e => e.isDirectory() && !e.name.startsWith('.'));
            const files = entries.filter(e => e.isFile());
            // Add directories
            for (let i = 0; i < dirs.length; i++) {
                const isLast = i === dirs.length - 1 && files.length === 0;
                tree.push(`${prefix}${isLast ? '└── ' : '├── '}${dirs[i].name}/`);
                await traverse(path.join(dir, dirs[i].name), `${prefix}${isLast ? '    ' : '│   '}`, currentDepth + 1);
            }
            // Add files (only key files)
            const keyFiles = files.filter(f => this.isKeyFile(f.name));
            for (let i = 0; i < keyFiles.length && i < 5; i++) {
                const isLast = i === keyFiles.length - 1;
                tree.push(`${prefix}${isLast ? '└── ' : '├── '}${keyFiles[i].name}`);
            }
            if (keyFiles.length > 5) {
                tree.push(`${prefix}└── ... and ${keyFiles.length - 5} more files`);
            }
        };
        tree.push(path.basename(dirPath) + '/');
        await traverse(dirPath, '', 0);
        return tree.join('\n');
    }
    async findFilesWithPattern(pattern) {
        const results = [];
        const searchDir = async (dir) => {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
                    await searchDir(fullPath);
                }
                else if (entry.isFile() && this.isKeyFile(fullPath)) {
                    try {
                        const content = await fs.readFile(fullPath, 'utf-8');
                        const count = (content.match(new RegExp(pattern, 'g')) || []).length;
                        if (count > 0) {
                            results.push({ path: fullPath, count });
                        }
                    }
                    catch (error) {
                        // Skip files that can't be read
                    }
                }
            }
        };
        await searchDir(this.workspacePath);
        return results.sort((a, b) => b.count - a.count);
    }
    async findEntryPoints() {
        const candidates = [
            'index.js', 'index.ts', 'main.js', 'main.ts',
            'app.js', 'app.ts', 'server.js', 'server.ts',
            'src/index.js', 'src/index.ts', 'src/main.js', 'src/main.ts'
        ];
        const entryPoints = [];
        for (const candidate of candidates) {
            const fullPath = path.join(this.workspacePath, candidate);
            try {
                await fs.access(fullPath);
                entryPoints.push(fullPath);
            }
            catch (error) {
                // File doesn't exist
            }
        }
        return entryPoints;
    }
    async findConfigFiles() {
        const patterns = [
            'package.json', 'tsconfig.json', 'webpack.config.js',
            '.eslintrc.js', '.prettierrc', 'babel.config.js',
            'jest.config.js', 'vite.config.js', 'nuxt.config.ts'
        ];
        const configs = [];
        for (const pattern of patterns) {
            const fullPath = path.join(this.workspacePath, pattern);
            try {
                await fs.access(fullPath);
                configs.push(fullPath);
            }
            catch (error) {
                // File doesn't exist
            }
        }
        return configs;
    }
    /**
     * Cache management
     */
    async saveCache() {
        try {
            const cacheData = Array.from(this.analysisCache.entries()).map(([key, value]) => ({
                key,
                value: {
                    ...value,
                    timestamp: value.timestamp.toISOString()
                }
            }));
            await fs.writeFile(path.join(this.cachePath, 'analysis.json'), JSON.stringify(cacheData, null, 2));
        }
        catch (error) {
            console.error('Failed to save analysis cache:', error);
        }
    }
    async loadCache() {
        try {
            const data = await fs.readFile(path.join(this.cachePath, 'analysis.json'), 'utf-8');
            const cacheData = JSON.parse(data);
            for (const { key, value } of cacheData) {
                this.analysisCache.set(key, {
                    ...value,
                    timestamp: new Date(value.timestamp)
                });
            }
        }
        catch (error) {
            // Cache doesn't exist yet
        }
    }
    /**
     * Get analysis statistics
     */
    getStatistics() {
        return {
            cacheSize: this.analysisCache.size,
            queueLength: this.analysisQueue.length,
            isAnalyzing: this.activeAnalysis !== null
        };
    }
    /**
     * Clear cache
     */
    async clearCache() {
        this.analysisCache.clear();
        await this.saveCache();
        this.emit('cache:cleared');
    }
}
/**
 * Factory function
 */
export function createClaudeAnalyzer(workspacePath) {
    return new ClaudeAnalyzerService(workspacePath);
}
