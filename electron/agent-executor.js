import { ipcMain } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import { nanoid } from 'nanoid';
export class AgentExecutor {
    transactions = new Map();
    checkpointService;
    workspacePath;
    mainWindow = null;
    constructor(workspacePath, checkpointService) {
        this.workspacePath = workspacePath;
        this.checkpointService = checkpointService;
        this.setupIpcHandlers();
    }
    setMainWindow(window) {
        this.mainWindow = window;
    }
    setupIpcHandlers() {
        // Start a new transaction
        ipcMain.handle('agent-mode:startTransaction', async (_, instanceId, task, options) => {
            try {
                // Create checkpoint
                const checkpointResult = await this.checkpointService.createCheckpoint({
                    type: 'agent-mode',
                    description: `Agent Mode: ${task}`,
                    autoCheckpoint: true
                });
                if (!checkpointResult.success || !checkpointResult.checkpointId) {
                    throw new Error(checkpointResult.error || 'Failed to create checkpoint');
                }
                const transaction = {
                    id: nanoid(),
                    instanceId,
                    status: 'planning',
                    task,
                    operations: [],
                    checkpointId: checkpointResult.checkpointId,
                    startTime: new Date(),
                    filesAffected: 0,
                    linesAdded: 0,
                    linesRemoved: 0
                };
                this.transactions.set(transaction.id, transaction);
                this.emitEvent('transaction-started', transaction.id, { transaction });
                return transaction.id;
            }
            catch (error) {
                console.error('Failed to start transaction:', error);
                throw error;
            }
        });
        // Queue an operation
        ipcMain.handle('agent-mode:queueOperation', async (_, transactionId, operation) => {
            const transaction = this.transactions.get(transactionId);
            if (!transaction) {
                throw new Error(`Transaction ${transactionId} not found`);
            }
            const fullOperation = {
                ...operation,
                id: nanoid(),
                timestamp: new Date(),
                status: 'pending'
            };
            transaction.operations.push(fullOperation);
            if (transaction.status === 'planning') {
                transaction.status = 'awaiting-approval';
            }
            this.emitEvent('operation-queued', transactionId, {
                operationId: fullOperation.id,
                operation: fullOperation
            });
            return fullOperation.id;
        });
        // Get execution plan
        ipcMain.handle('agent-mode:getPlan', async (_, transactionId) => {
            const transaction = this.transactions.get(transactionId);
            if (!transaction) {
                throw new Error(`Transaction ${transactionId} not found`);
            }
            if (!transaction.plan) {
                transaction.plan = await this.generateExecutionPlan(transaction);
            }
            return transaction.plan;
        });
        // Approve transaction
        ipcMain.handle('agent-mode:approveTransaction', async (_, transactionId) => {
            const transaction = this.transactions.get(transactionId);
            if (!transaction) {
                throw new Error(`Transaction ${transactionId} not found`);
            }
            if (transaction.status !== 'awaiting-approval') {
                throw new Error(`Transaction is not awaiting approval`);
            }
            transaction.status = 'executing';
            await this.executeTransaction(transaction);
        });
        // Reject transaction
        ipcMain.handle('agent-mode:rejectTransaction', async (_, transactionId) => {
            const transaction = this.transactions.get(transactionId);
            if (!transaction) {
                throw new Error(`Transaction ${transactionId} not found`);
            }
            transaction.status = 'cancelled';
            transaction.endTime = new Date();
        });
        // Execute specific operations
        ipcMain.handle('agent-mode:executeOperations', async (_, transactionId, operationIds) => {
            const transaction = this.transactions.get(transactionId);
            if (!transaction) {
                throw new Error(`Transaction ${transactionId} not found`);
            }
            const operations = operationIds
                ? transaction.operations.filter(op => operationIds.includes(op.id))
                : transaction.operations.filter(op => op.status === 'pending');
            await this.executeOperations(transaction, operations);
        });
        // Rollback transaction
        ipcMain.handle('agent-mode:rollbackTransaction', async (_, transactionId, reason) => {
            const transaction = this.transactions.get(transactionId);
            if (!transaction || !transaction.checkpointId) {
                throw new Error(`Cannot rollback transaction ${transactionId}`);
            }
            try {
                await this.checkpointService.restoreCheckpoint(transaction.checkpointId);
                transaction.status = 'rolled-back';
                transaction.error = reason;
                transaction.endTime = new Date();
                this.emitEvent('rollback-completed', transactionId, { reason });
            }
            catch (error) {
                console.error('Rollback failed:', error);
                throw error;
            }
        });
        // Get transaction
        ipcMain.handle('agent-mode:getTransaction', async (_, transactionId) => {
            return this.transactions.get(transactionId) || null;
        });
        // Get all transactions
        ipcMain.handle('agent-mode:getTransactions', async (_, instanceId) => {
            const transactions = Array.from(this.transactions.values());
            if (instanceId) {
                return transactions.filter(t => t.instanceId === instanceId);
            }
            return transactions;
        });
        // Validate operation
        ipcMain.handle('agent-mode:validateOperation', async (_, operation) => {
            return this.validateOperation(operation);
        });
        // Cancel transaction
        ipcMain.handle('agent-mode:cancelTransaction', async (_, transactionId) => {
            const transaction = this.transactions.get(transactionId);
            if (!transaction) {
                throw new Error(`Transaction ${transactionId} not found`);
            }
            transaction.status = 'cancelled';
            transaction.endTime = new Date();
        });
    }
    async executeTransaction(transaction) {
        try {
            const pendingOps = transaction.operations.filter(op => op.status === 'pending');
            await this.executeOperations(transaction, pendingOps);
            transaction.status = 'completed';
            transaction.endTime = new Date();
            this.emitEvent('transaction-completed', transaction.id, { transaction });
        }
        catch (error) {
            transaction.status = 'failed';
            transaction.error = error.message;
            transaction.endTime = new Date();
            this.emitEvent('transaction-failed', transaction.id, { error: error.message });
            throw error;
        }
    }
    async executeOperations(transaction, operations) {
        const totalOperations = operations.length;
        // Emit execution start event
        this.emitEvent('execution-started', transaction.id, {
            totalOperations,
            operations: operations.map(op => ({ id: op.id, type: op.type, path: op.path }))
        });
        for (let i = 0; i < operations.length; i++) {
            const operation = operations[i];
            const operationIndex = i + 1;
            try {
                operation.status = 'executing';
                operation.timestamp = new Date();
                // Emit detailed progress
                this.emitEvent('operation-started', transaction.id, {
                    operationId: operation.id,
                    operationIndex,
                    totalOperations,
                    progress: Math.round((i / totalOperations) * 100),
                    operation: {
                        type: operation.type,
                        path: operation.path,
                        newPath: operation.newPath
                    }
                });
                // Execute with sub-progress for complex operations
                await this.executeOperationWithProgress(operation, transaction.id);
                operation.status = 'completed';
                // Calculate operation time
                const operationTime = operation.timestamp ? Date.now() - operation.timestamp.getTime() : 0;
                this.emitEvent('operation-completed', transaction.id, {
                    operationId: operation.id,
                    operationIndex,
                    totalOperations,
                    progress: Math.round(((i + 1) / totalOperations) * 100),
                    duration: operationTime,
                    operation: {
                        type: operation.type,
                        path: operation.path,
                        newPath: operation.newPath
                    }
                });
                // Update transaction metrics
                transaction.filesAffected++;
                if (operation.type === 'file-create' || operation.type === 'file-edit') {
                    // Rough estimate - could be improved with actual line counting
                    transaction.linesAdded += 10;
                }
                else if (operation.type === 'file-delete') {
                    transaction.linesRemoved += 10;
                }
                // Add small delay for UI responsiveness
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            catch (error) {
                operation.status = 'failed';
                operation.error = error.message;
                const operationTime = operation.timestamp ? Date.now() - operation.timestamp.getTime() : 0;
                this.emitEvent('operation-failed', transaction.id, {
                    operationId: operation.id,
                    operationIndex,
                    totalOperations,
                    progress: Math.round(((i + 1) / totalOperations) * 100),
                    duration: operationTime,
                    error: error.message,
                    operation: {
                        type: operation.type,
                        path: operation.path,
                        newPath: operation.newPath
                    }
                });
                throw error;
            }
        }
        // Emit execution complete event
        this.emitEvent('execution-completed', transaction.id, {
            totalOperations,
            completedOperations: operations.filter(op => op.status === 'completed').length,
            failedOperations: operations.filter(op => op.status === 'failed').length
        });
    }
    async executeOperationWithProgress(operation, transactionId) {
        // For complex operations, emit sub-progress events
        if (operation.type === 'multi-edit' && operation.edits && operation.edits.length > 1) {
            const totalEdits = operation.edits.length;
            for (let i = 0; i < totalEdits; i++) {
                this.emitEvent('operation-sub-progress', transactionId, {
                    operationId: operation.id,
                    step: i + 1,
                    totalSteps: totalEdits,
                    percentage: Math.round(((i + 1) / totalEdits) * 100),
                    description: `Applying edit ${i + 1} of ${totalEdits}`
                });
                // Simulate some processing time for each edit
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        else if (operation.type === 'directory-create' || operation.type === 'directory-delete') {
            // For directory operations, show progress steps
            this.emitEvent('operation-sub-progress', transactionId, {
                operationId: operation.id,
                step: 1,
                totalSteps: 2,
                percentage: 50,
                description: 'Scanning directory structure'
            });
            await new Promise(resolve => setTimeout(resolve, 200));
            this.emitEvent('operation-sub-progress', transactionId, {
                operationId: operation.id,
                step: 2,
                totalSteps: 2,
                percentage: 100,
                description: operation.type === 'directory-create' ? 'Creating directory' : 'Removing directory'
            });
        }
        await this.executeOperation(operation);
    }
    async executeOperation(operation) {
        const fullPath = path.join(this.workspacePath, operation.path);
        switch (operation.type) {
            case 'file-create':
                await fs.mkdir(path.dirname(fullPath), { recursive: true });
                await fs.writeFile(fullPath, operation.content || '', 'utf-8');
                break;
            case 'file-edit':
                if (operation.content !== undefined) {
                    // Store old content for potential rollback
                    try {
                        operation.oldContent = await fs.readFile(fullPath, 'utf-8');
                    }
                    catch (error) {
                        // File might not exist yet
                    }
                    await fs.writeFile(fullPath, operation.content, 'utf-8');
                }
                break;
            case 'file-delete':
                // Store content for potential rollback
                try {
                    operation.oldContent = await fs.readFile(fullPath, 'utf-8');
                }
                catch (error) {
                    // File might not exist
                }
                await fs.unlink(fullPath);
                break;
            case 'file-move':
            case 'file-rename':
                if (operation.newPath) {
                    const newFullPath = path.join(this.workspacePath, operation.newPath);
                    await fs.mkdir(path.dirname(newFullPath), { recursive: true });
                    await fs.rename(fullPath, newFullPath);
                }
                break;
            case 'multi-edit':
                if (operation.edits) {
                    let content = await fs.readFile(fullPath, 'utf-8');
                    operation.oldContent = content;
                    for (const edit of operation.edits) {
                        if (edit.replaceAll) {
                            content = content.replaceAll(edit.oldString, edit.newString);
                        }
                        else {
                            content = content.replace(edit.oldString, edit.newString);
                        }
                    }
                    await fs.writeFile(fullPath, content, 'utf-8');
                }
                break;
            case 'directory-create':
                await fs.mkdir(fullPath, { recursive: true });
                break;
            case 'directory-delete':
                await fs.rm(fullPath, { recursive: true, force: true });
                break;
            default:
                throw new Error(`Unknown operation type: ${operation.type}`);
        }
    }
    async generateExecutionPlan(transaction) {
        const operations = transaction.operations;
        const steps = this.groupOperationsByDependency(operations);
        const plan = {
            id: nanoid(),
            summary: `Execute ${operations.length} operations for: ${transaction.task}`,
            steps: steps.map((ops, index) => ({
                id: nanoid(),
                description: this.describeOperationGroup(ops),
                operations: ops.map(op => op.id),
                order: index + 1
            })),
            estimatedDuration: operations.length * 100, // 100ms per operation estimate
            riskLevel: this.calculateRiskLevel(operations),
            warnings: this.collectWarnings(operations)
        };
        return plan;
    }
    groupOperationsByDependency(operations) {
        const groups = [];
        const processed = new Set();
        function canProcess(op) {
            if (!op.dependsOn || op.dependsOn.length === 0)
                return true;
            return op.dependsOn.every(depId => processed.has(depId));
        }
        while (processed.size < operations.length) {
            const group = operations.filter(op => !processed.has(op.id) && canProcess(op));
            if (group.length === 0) {
                console.error('Circular dependency detected in operations');
                // Add remaining operations anyway
                const remaining = operations.filter(op => !processed.has(op.id));
                if (remaining.length > 0) {
                    groups.push(remaining);
                    remaining.forEach(op => processed.add(op.id));
                }
                break;
            }
            groups.push(group);
            group.forEach(op => processed.add(op.id));
        }
        return groups;
    }
    describeOperationGroup(operations) {
        const types = new Set(operations.map(op => op.type));
        const typeDescriptions = Array.from(types).map(type => {
            const count = operations.filter(op => op.type === type).length;
            return `${count} ${type.replace('-', ' ')}${count > 1 ? 's' : ''}`;
        });
        return typeDescriptions.join(', ');
    }
    calculateRiskLevel(operations) {
        const deleteCount = operations.filter(op => op.type === 'file-delete' || op.type === 'directory-delete').length;
        if (deleteCount > 5 || operations.length > 30)
            return 'high';
        if (deleteCount > 0 || operations.length > 10)
            return 'medium';
        return 'low';
    }
    collectWarnings(operations) {
        const warnings = [];
        const deleteOps = operations.filter(op => op.type === 'file-delete' || op.type === 'directory-delete');
        if (deleteOps.length > 0) {
            warnings.push(`${deleteOps.length} file(s) or directories will be deleted`);
        }
        const largeFiles = operations.filter(op => op.content && op.content.length > 100000 // 100KB
        );
        if (largeFiles.length > 0) {
            warnings.push(`${largeFiles.length} large file(s) will be created/modified`);
        }
        return warnings;
    }
    validateOperation(operation) {
        const errors = [];
        const warnings = [];
        // Path validation
        if (operation.path) {
            if (path.isAbsolute(operation.path)) {
                errors.push('Path must be relative to workspace');
            }
            // Check for dangerous paths
            const normalizedPath = path.normalize(operation.path);
            if (normalizedPath.includes('..')) {
                errors.push('Path cannot contain parent directory references (..)');
            }
            // Check excluded paths
            const excludedPaths = ['node_modules', '.git', '.claude-checkpoints', 'dist', 'build'];
            for (const excluded of excludedPaths) {
                if (normalizedPath.includes(excluded)) {
                    warnings.push(`Path contains excluded directory: ${excluded}`);
                }
            }
        }
        // Type-specific validation
        if (operation.type === 'file-delete' || operation.type === 'directory-delete') {
            warnings.push('This operation will permanently delete data');
        }
        if (operation.type === 'multi-edit' && operation.edits) {
            if (operation.edits.length > 100) {
                warnings.push('Large number of edits may take time to process');
            }
        }
        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }
    emitEvent(type, transactionId, data) {
        if (this.mainWindow) {
            this.mainWindow.webContents.send(`agent-mode:${type}`, {
                type,
                transactionId,
                ...data
            });
        }
    }
    updateWorkspacePath(newPath) {
        this.workspacePath = newPath;
    }
    cleanup() {
        // Clean up any pending transactions
        for (const transaction of this.transactions.values()) {
            if (transaction.status === 'executing' || transaction.status === 'planning') {
                transaction.status = 'cancelled';
                transaction.endTime = new Date();
                transaction.error = 'Agent executor shutting down';
            }
        }
    }
}
