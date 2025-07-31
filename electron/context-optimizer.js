import { lightweightContext } from './lightweight-context.js';
export class ContextOptimizer {
    CLAUDE_MAX_TOKENS = 200000;
    WARNING_THRESHOLD = 0.7; // 70% of max
    CRITICAL_THRESHOLD = 0.85; // 85% of max
    // Simple token estimation (roughly 4 chars per token)
    estimateTokens(text) {
        return Math.ceil(text.length / 4);
    }
    // Analyze current context usage
    analyzeContextUsage(messages, currentContext) {
        const messageTokens = messages.reduce((sum, msg) => {
            const content = typeof msg === 'string' ? msg : (msg.content || '');
            return sum + this.estimateTokens(content);
        }, 0);
        const contextTokens = this.estimateTokens(currentContext);
        const totalTokens = messageTokens + contextTokens;
        const percentage = totalTokens / this.CLAUDE_MAX_TOKENS;
        let status = 'normal';
        if (percentage >= 0.95)
            status = 'danger';
        else if (percentage >= this.CRITICAL_THRESHOLD)
            status = 'critical';
        else if (percentage >= this.WARNING_THRESHOLD)
            status = 'warning';
        return {
            totalTokens,
            messageTokens,
            contextTokens,
            percentage: percentage * 100,
            status
        };
    }
    // Smart context building with token budget
    async buildOptimizedContext(query, workingFiles, maxTokens = 2000) {
        const contextParts = [];
        const included = [];
        const excluded = [];
        let currentTokens = 0;
        // Priority 1: Project overview (minimal tokens)
        const projectInfo = lightweightContext.getStatistics();
        if (projectInfo) {
            const overview = `PROJECT: ${projectInfo.type} (${projectInfo.framework || 'vanilla'})
LANGUAGES: ${projectInfo.languages.slice(0, 3).join(', ')}
FILES: ${projectInfo.totalFiles}`;
            const overviewTokens = this.estimateTokens(overview);
            if (currentTokens + overviewTokens <= maxTokens) {
                contextParts.push(overview);
                currentTokens += overviewTokens;
            }
        }
        // Priority 2: Working files summary
        if (workingFiles.length > 0 && currentTokens < maxTokens) {
            const workingFilesSummary = `\nWORKING FILES (${workingFiles.length}):`;
            const summaryTokens = this.estimateTokens(workingFilesSummary);
            if (currentTokens + summaryTokens <= maxTokens) {
                contextParts.push(workingFilesSummary);
                currentTokens += summaryTokens;
                // Add working files until token limit
                for (const file of workingFiles.slice(0, 5)) {
                    const fileName = file.split('/').pop() || file;
                    const fileLine = `- ${fileName}`;
                    const fileTokens = this.estimateTokens(fileLine);
                    if (currentTokens + fileTokens <= maxTokens) {
                        contextParts.push(fileLine);
                        currentTokens += fileTokens;
                        included.push(file);
                    }
                    else {
                        excluded.push(file);
                        break;
                    }
                }
            }
        }
        // Priority 3: Relevant files based on query
        if (query && currentTokens < maxTokens * 0.8) {
            const relevantFiles = await lightweightContext.searchFiles(query, 10);
            if (relevantFiles.length > 0) {
                contextParts.push(`\nRELEVANT FILES:`);
                currentTokens += this.estimateTokens('\nRELEVANT FILES:');
                for (const file of relevantFiles) {
                    const relativePath = file.path.split('/').slice(-2).join('/');
                    const fileLine = `- ${relativePath} (${file.language}, score: ${file.relevanceScore})`;
                    const fileTokens = this.estimateTokens(fileLine);
                    if (currentTokens + fileTokens <= maxTokens * 0.9) {
                        contextParts.push(fileLine);
                        currentTokens += fileTokens;
                        included.push(file.path);
                    }
                    else {
                        excluded.push(file.path);
                        break;
                    }
                }
            }
        }
        // Priority 4: Recent files (if space allows)
        if (currentTokens < maxTokens * 0.7) {
            const recentFiles = lightweightContext.getRecentFiles(4);
            if (recentFiles.length > 0) {
                contextParts.push(`\nRECENT CHANGES:`);
                currentTokens += this.estimateTokens('\nRECENT CHANGES:');
                for (const file of recentFiles.slice(0, 3)) {
                    const fileName = file.name;
                    const timeDiff = Math.round((Date.now() - file.lastModified.getTime()) / (1000 * 60));
                    const fileLine = `- ${fileName} (${timeDiff}m ago)`;
                    const fileTokens = this.estimateTokens(fileLine);
                    if (currentTokens + fileTokens <= maxTokens) {
                        contextParts.push(fileLine);
                        currentTokens += fileTokens;
                        if (!included.includes(file.path)) {
                            included.push(file.path);
                        }
                    }
                    else {
                        break;
                    }
                }
            }
        }
        return {
            context: contextParts.join('\n'),
            tokens: currentTokens,
            included,
            excluded
        };
    }
    // Optimize existing context by summarizing or truncating
    optimizeContext(content, strategy) {
        const originalTokens = this.estimateTokens(content);
        let optimizedContent = content;
        switch (strategy.type) {
            case 'truncate':
                // Simple truncation from the beginning (preserve recent)
                if (strategy.preserveRecent) {
                    const targetLength = Math.floor(content.length * (1 - strategy.targetReduction));
                    optimizedContent = '... [earlier context truncated]\n' + content.slice(-targetLength);
                }
                else {
                    const targetLength = Math.floor(content.length * (1 - strategy.targetReduction));
                    optimizedContent = content.slice(0, targetLength) + '\n... [remaining context truncated]';
                }
                break;
            case 'summarize':
                // Extract key information
                const lines = content.split('\n');
                const summaryLines = [];
                // Keep headers and important markers
                for (const line of lines) {
                    if (line.startsWith('PROJECT:') ||
                        line.startsWith('WORKING FILES:') ||
                        line.startsWith('RELEVANT FILES:') ||
                        line.includes('error') ||
                        line.includes('Error') ||
                        line.includes('TODO') ||
                        line.includes('FIXME')) {
                        summaryLines.push(line);
                    }
                }
                optimizedContent = `[SUMMARIZED CONTEXT]\n${summaryLines.join('\n')}`;
                break;
            case 'remove':
                // Remove specific sections
                optimizedContent = content
                    .replace(/\/\*[\s\S]*?\*\//g, '') // Remove comments
                    .replace(/\/\/.*/g, '') // Remove single-line comments
                    .replace(/\n\s*\n\s*\n/g, '\n\n') // Remove excessive newlines
                    .trim();
                break;
            case 'prioritize':
                // Keep only high-priority content
                const sections = content.split(/\n(?=[A-Z]+:)/);
                const prioritySections = sections.filter(section => section.startsWith('ERROR') ||
                    section.startsWith('WORKING') ||
                    section.startsWith('PROJECT') ||
                    section.includes('current'));
                optimizedContent = prioritySections.join('\n');
                break;
        }
        const optimizedTokens = this.estimateTokens(optimizedContent);
        return {
            originalTokens,
            optimizedTokens,
            reduction: (originalTokens - optimizedTokens) / originalTokens,
            strategy,
            optimizedContent
        };
    }
    // Get optimization recommendations
    getOptimizationRecommendations(usage) {
        const recommendations = [];
        if (usage.status === 'danger') {
            recommendations.push({
                priority: 'high',
                action: 'Truncate old messages',
                impact: 'Free up to 40% tokens',
                strategy: {
                    type: 'truncate',
                    targetReduction: 0.4,
                    preserveRecent: true
                }
            });
        }
        if (usage.status === 'critical' || usage.status === 'danger') {
            recommendations.push({
                priority: 'high',
                action: 'Summarize context',
                impact: 'Reduce context by 60%',
                strategy: {
                    type: 'summarize',
                    targetReduction: 0.6,
                    preserveRecent: true
                }
            });
        }
        if (usage.messageTokens > usage.contextTokens * 2) {
            recommendations.push({
                priority: 'medium',
                action: 'Clear old chat history',
                impact: 'Free up message tokens',
                strategy: {
                    type: 'remove',
                    targetReduction: 0.5,
                    preserveRecent: true
                }
            });
        }
        if (usage.contextTokens > 10000) {
            recommendations.push({
                priority: 'medium',
                action: 'Prioritize context',
                impact: 'Keep only essential context',
                strategy: {
                    type: 'prioritize',
                    targetReduction: 0.3,
                    preserveRecent: false
                }
            });
        }
        return recommendations;
    }
    // Check if context injection is worth the tokens
    shouldInjectContext(query, availableTokens, contextSize) {
        // Keywords that indicate context would be helpful
        const contextKeywords = [
            'file', 'function', 'class', 'component', 'module',
            'where', 'which', 'what', 'how', 'implement', 'create',
            'error', 'bug', 'issue', 'problem', 'fix'
        ];
        const queryLower = query.toLowerCase();
        const hasContextKeyword = contextKeywords.some(keyword => queryLower.includes(keyword));
        // Short queries usually don't need much context
        const queryLength = query.length;
        const isComplexQuery = queryLength > 50 || query.includes('\n');
        // Calculate confidence score
        let confidence = 0.5; // Base confidence
        if (hasContextKeyword)
            confidence += 0.3;
        if (isComplexQuery)
            confidence += 0.2;
        if (queryLower.includes('?'))
            confidence += 0.1;
        // Determine token budget based on available space
        const tokenPercentage = (this.CLAUDE_MAX_TOKENS - availableTokens) / this.CLAUDE_MAX_TOKENS;
        let suggestedBudget = 2000; // Default
        if (tokenPercentage > 0.8) {
            suggestedBudget = 500; // Very limited
        }
        else if (tokenPercentage > 0.6) {
            suggestedBudget = 1000; // Limited
        }
        else if (tokenPercentage < 0.3) {
            suggestedBudget = 4000; // Generous
        }
        // Decision logic
        const shouldInject = confidence > 0.6 && contextSize < suggestedBudget;
        let reasoning = '';
        if (!shouldInject) {
            if (confidence <= 0.6) {
                reasoning = 'Query does not appear to need context';
            }
            else if (contextSize >= suggestedBudget) {
                reasoning = `Context too large (${contextSize} tokens) for available budget`;
            }
        }
        else {
            reasoning = `Context relevant (${Math.round(confidence * 100)}% confidence) and within budget`;
        }
        return {
            shouldInject,
            confidence,
            reasoning,
            suggestedBudget
        };
    }
}
// Export singleton instance
export const contextOptimizer = new ContextOptimizer();
