"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const electronAPI = {
    // General IPC send for specific allowed channels
    send: (channel, data) => {
        const allowedChannels = ['forward-terminal-data', 'forward-claude-output', 'claude-instances-updated'];
        if (allowedChannels.includes(channel)) {
            electron_1.ipcRenderer.send(channel, data);
        }
    },
    claude: {
        start: (instanceId, workingDirectory, instanceName, runConfig) => electron_1.ipcRenderer.invoke('claude:start', instanceId, workingDirectory, instanceName, runConfig),
        detectInstallation: () => electron_1.ipcRenderer.invoke('claude:detectInstallation'),
        send: (instanceId, command) => electron_1.ipcRenderer.invoke('claude:send', instanceId, command),
        stop: (instanceId) => electron_1.ipcRenderer.invoke('claude:stop', instanceId),
        resize: (instanceId, cols, rows) => electron_1.ipcRenderer.invoke('claude:resize', instanceId, cols, rows),
        onOutput: (instanceId, callback) => {
            const channel = `claude:output:${instanceId}`;
            const handler = (_, data) => callback(data);
            electron_1.ipcRenderer.on(channel, handler);
            // Return cleanup function
            return () => electron_1.ipcRenderer.removeListener(channel, handler);
        },
        onError: (instanceId, callback) => {
            const channel = `claude:error:${instanceId}`;
            const handler = (_, data) => callback(data);
            electron_1.ipcRenderer.on(channel, handler);
            return () => electron_1.ipcRenderer.removeListener(channel, handler);
        },
        onExit: (instanceId, callback) => {
            const channel = `claude:exit:${instanceId}`;
            const handler = (_, code) => callback(code);
            electron_1.ipcRenderer.on(channel, handler);
            return () => electron_1.ipcRenderer.removeListener(channel, handler);
        },
        removeAllListeners: (instanceId) => {
            electron_1.ipcRenderer.removeAllListeners(`claude:output:${instanceId}`);
            electron_1.ipcRenderer.removeAllListeners(`claude:error:${instanceId}`);
            electron_1.ipcRenderer.removeAllListeners(`claude:exit:${instanceId}`);
        },
        sdk: {
            getTodos: (projectPath) => electron_1.ipcRenderer.invoke('claude:sdk:getTodos', projectPath),
            createTodos: (taskDescription, projectPath) => electron_1.ipcRenderer.invoke('claude:sdk:createTodos', taskDescription, projectPath),
            updateTodo: (todoId, newStatus, projectPath) => electron_1.ipcRenderer.invoke('claude:sdk:updateTodo', todoId, newStatus, projectPath)
        },
        onTodosUpdated: (callback) => {
            electron_1.ipcRenderer.on('claude:todos:updated', (_, todos) => callback(todos));
        },
        onInstancesUpdated: (callback) => {
            electron_1.ipcRenderer.on('claude:instances:updated', () => callback());
        },
        checkForwarding: (instanceId) => electron_1.ipcRenderer.invoke('check-claude-forwarding', instanceId),
        // Hook management
        getHooks: () => electron_1.ipcRenderer.invoke('claude:getHooks'),
        addHook: (hook) => electron_1.ipcRenderer.invoke('claude:addHook', hook),
        updateHook: (id, updates) => electron_1.ipcRenderer.invoke('claude:updateHook', id, updates),
        removeHook: (id) => electron_1.ipcRenderer.invoke('claude:removeHook', id),
        deleteHook: (id) => electron_1.ipcRenderer.invoke('claude:deleteHook', id),
        testHook: (hook) => electron_1.ipcRenderer.invoke('claude:testHook', hook),
        // Session management
        listSessions: () => electron_1.ipcRenderer.invoke('claude:listSessions'),
        resumeSession: (instanceId, sessionId) => electron_1.ipcRenderer.invoke('claude:resumeSession', instanceId, sessionId)
    },
    fs: {
        readFile: (path) => electron_1.ipcRenderer.invoke('fs:readFile', path),
        writeFile: (path, content) => electron_1.ipcRenderer.invoke('fs:writeFile', path, content),
        readDir: (path) => electron_1.ipcRenderer.invoke('fs:readDir', path),
        ensureDir: (path) => electron_1.ipcRenderer.invoke('fs:ensureDir', path),
        rename: (oldPath, newPath) => electron_1.ipcRenderer.invoke('fs:rename', oldPath, newPath),
        delete: (path) => electron_1.ipcRenderer.invoke('fs:delete', path),
        exists: (path) => electron_1.ipcRenderer.invoke('fs:exists', path),
        watchFile: (path) => electron_1.ipcRenderer.invoke('fs:watchFile', path),
        unwatchFile: (path) => electron_1.ipcRenderer.invoke('fs:unwatchFile', path),
        watchDirectory: (path) => electron_1.ipcRenderer.invoke('fs:watchDirectory', path),
        unwatchDirectory: (path) => electron_1.ipcRenderer.invoke('fs:unwatchDirectory', path),
        onFileChanged: (callback) => {
            electron_1.ipcRenderer.on('file:changed', (_, data) => callback(data));
        },
        onDirectoryChanged: (callback) => {
            electron_1.ipcRenderer.on('directory:changed', (_, data) => callback(data));
        },
        removeFileChangeListener: () => {
            electron_1.ipcRenderer.removeAllListeners('file:changed');
        },
        removeDirectoryChangeListener: () => {
            electron_1.ipcRenderer.removeAllListeners('directory:changed');
        }
    },
    store: {
        get: (key) => electron_1.ipcRenderer.invoke('store:get', key),
        set: (key, value) => electron_1.ipcRenderer.invoke('store:set', key, value),
        delete: (key) => electron_1.ipcRenderer.invoke('store:delete', key),
        getAll: () => electron_1.ipcRenderer.invoke('store:getAll'),
        getHomePath: () => electron_1.ipcRenderer.invoke('store:getHomePath')
    },
    shell: {
        openExternal: (url) => electron_1.ipcRenderer.invoke('shell:openExternal', url)
    },
    dialog: {
        selectFolder: () => electron_1.ipcRenderer.invoke('dialog:selectFolder'),
        selectFile: () => electron_1.ipcRenderer.invoke('dialog:selectFile'),
        showOpenDialog: (options) => electron_1.ipcRenderer.invoke('dialog:showOpenDialog', options),
        showSaveDialog: (options) => electron_1.ipcRenderer.invoke('dialog:showSaveDialog', options),
        showInputBox: (options) => electron_1.ipcRenderer.invoke('dialog:showInputBox', options),
        showMessageBox: (options) => electron_1.ipcRenderer.invoke('dialog:showMessageBox', options)
    },
    showNotification: (options) => electron_1.ipcRenderer.invoke('showNotification', options),
    getHomeDir: () => electron_1.ipcRenderer.invoke('getHomeDir'),
    // File Watcher operations
    fileWatcher: {
        start: (dirPath, options) => electron_1.ipcRenderer.invoke('fileWatcher:start', dirPath, options),
        stop: (dirPath) => electron_1.ipcRenderer.invoke('fileWatcher:stop', dirPath),
        indexFile: (filePath) => electron_1.ipcRenderer.invoke('fileWatcher:indexFile', filePath),
        getStats: () => electron_1.ipcRenderer.invoke('fileWatcher:getStats')
    },
    // File change events
    onFileChange: (callback) => {
        electron_1.ipcRenderer.on('file:change', (_, data) => callback(data));
    },
    onBatchChange: (callback) => {
        electron_1.ipcRenderer.on('batch:change', (_, data) => callback(data));
    },
    // Knowledge Cache operations
    knowledgeCache: {
        recordQuery: (workspacePath, metrics) => electron_1.ipcRenderer.invoke('knowledgeCache:recordQuery', workspacePath, metrics),
        getStats: (workspacePath) => electron_1.ipcRenderer.invoke('knowledgeCache:getStats', workspacePath),
        predict: (workspacePath, context) => electron_1.ipcRenderer.invoke('knowledgeCache:predict', workspacePath, context),
        clear: (workspacePath) => electron_1.ipcRenderer.invoke('knowledgeCache:clear', workspacePath),
        invalidate: (workspacePath, pattern, tags) => electron_1.ipcRenderer.invoke('knowledgeCache:invalidate', workspacePath, pattern, tags)
    },
    search: {
        findInFiles: (options) => electron_1.ipcRenderer.invoke('search:findInFiles', options),
        replaceInFile: (options) => electron_1.ipcRenderer.invoke('search:replaceInFile', options),
        replaceAllInFile: (options) => electron_1.ipcRenderer.invoke('search:replaceAllInFile', options)
    },
    terminal: {
        create: (options) => electron_1.ipcRenderer.invoke('terminal:create', options),
        write: (id, data) => electron_1.ipcRenderer.invoke('terminal:write', id, data),
        resize: (id, cols, rows) => electron_1.ipcRenderer.invoke('terminal:resize', id, cols, rows),
        destroy: (id) => electron_1.ipcRenderer.invoke('terminal:destroy', id),
        onData: (id, callback) => {
            const channel = `terminal:data:${id}`;
            electron_1.ipcRenderer.on(channel, (_, data) => callback(data));
            return () => electron_1.ipcRenderer.removeAllListeners(channel);
        }
    },
    autocomplete: {
        getCompletion: (request) => electron_1.ipcRenderer.invoke('autocomplete:getCompletion', request),
        streamCompletion: (request) => electron_1.ipcRenderer.invoke('autocomplete:streamCompletion', request),
        clearCache: () => electron_1.ipcRenderer.invoke('autocomplete:clearCache'),
        preloadFileContext: (filepath) => electron_1.ipcRenderer.invoke('autocomplete:preloadFileContext', filepath),
        cancelRequest: (requestId) => electron_1.ipcRenderer.invoke('autocomplete:cancelRequest', requestId),
        checkHealth: () => electron_1.ipcRenderer.invoke('autocomplete:checkHealth'),
        getGhostText: (params) => electron_1.ipcRenderer.invoke('autocomplete:getGhostText', params),
        initializeProject: (projectPath) => electron_1.ipcRenderer.invoke('autocomplete:initializeProject', projectPath),
        checkLSPServers: () => electron_1.ipcRenderer.invoke('autocomplete:checkLSPServers'),
        getLSPStatus: () => electron_1.ipcRenderer.invoke('autocomplete:getLSPStatus'),
        onChunk: (requestId, callback) => {
            const channel = `autocomplete:chunk:${requestId}`;
            electron_1.ipcRenderer.on(channel, (_, chunk) => callback(chunk));
            return () => electron_1.ipcRenderer.removeAllListeners(channel);
        }
    },
    lsp: {
        getCompletions: (params) => electron_1.ipcRenderer.invoke('lsp:getCompletions', params),
        getHover: (params) => electron_1.ipcRenderer.invoke('lsp:getHover', params),
        getDiagnostics: (params) => electron_1.ipcRenderer.invoke('lsp:getDiagnostics', params),
        install: (params) => electron_1.ipcRenderer.invoke('lsp:install', params),
        uninstall: (params) => electron_1.ipcRenderer.invoke('lsp:uninstall', params),
        checkCommand: (command) => electron_1.ipcRenderer.invoke('lsp:checkCommand', command)
    },
    mcp: {
        list: (workspacePath) => electron_1.ipcRenderer.invoke('mcp:list', workspacePath),
        add: (config) => electron_1.ipcRenderer.invoke('mcp:add', config),
        remove: (name) => electron_1.ipcRenderer.invoke('mcp:remove', name),
        get: (name) => electron_1.ipcRenderer.invoke('mcp:get', name),
        test: (config) => electron_1.ipcRenderer.invoke('mcp:test', config)
    },
    context: {
        initialize: (workspacePath) => electron_1.ipcRenderer.invoke('context:initialize', workspacePath),
        searchFiles: (query, limit) => electron_1.ipcRenderer.invoke('context:searchFiles', query, limit),
        buildContext: (query, workingFiles, maxTokens) => electron_1.ipcRenderer.invoke('context:buildContext', query, workingFiles, maxTokens),
        getStatistics: () => electron_1.ipcRenderer.invoke('context:getStatistics'),
        getFileContent: (filePath) => electron_1.ipcRenderer.invoke('context:getFileContent', filePath),
        getRecentFiles: (hours) => electron_1.ipcRenderer.invoke('context:getRecentFiles', hours),
        rescan: () => electron_1.ipcRenderer.invoke('context:rescan'),
        startWatching: () => electron_1.ipcRenderer.invoke('context:startWatching'),
        stopWatching: () => electron_1.ipcRenderer.invoke('context:stopWatching'),
        onFileChange: (callback) => {
            electron_1.ipcRenderer.on('context:file-changed', (_, data) => callback(data.event, data.filePath));
            return () => electron_1.ipcRenderer.removeAllListeners('context:file-changed');
        },
        analyzeUsage: (messages, currentContext) => electron_1.ipcRenderer.invoke('context:analyzeUsage', messages, currentContext),
        buildOptimized: (query, workingFiles, maxTokens) => electron_1.ipcRenderer.invoke('context:buildOptimized', query, workingFiles, maxTokens),
        optimize: (content, strategy) => electron_1.ipcRenderer.invoke('context:optimize', content, strategy),
        getRecommendations: (usage) => electron_1.ipcRenderer.invoke('context:getRecommendations', usage),
        shouldInject: (query, availableTokens, contextSize) => electron_1.ipcRenderer.invoke('context:shouldInject', query, availableTokens, contextSize)
    },
    workspace: {
        loadContext: (workspacePath) => electron_1.ipcRenderer.invoke('workspace:loadContext', workspacePath),
        saveContext: (data) => electron_1.ipcRenderer.invoke('workspace:saveContext', data),
        updateOptimizationTime: (workspacePath, lastOptimization) => electron_1.ipcRenderer.invoke('workspace:updateOptimizationTime', workspacePath, lastOptimization),
        updateWorkingFiles: (workspacePath, workingFiles) => electron_1.ipcRenderer.invoke('workspace:updateWorkingFiles', workspacePath, workingFiles),
        getRecentHistory: (workspacePath, limit) => electron_1.ipcRenderer.invoke('workspace:getRecentHistory', workspacePath, limit),
        exportContext: (workspacePath) => electron_1.ipcRenderer.invoke('workspace:exportContext', workspacePath),
        importContext: (workspacePath, jsonData) => electron_1.ipcRenderer.invoke('workspace:importContext', workspacePath, jsonData),
        setPath: (workspacePath) => electron_1.ipcRenderer.invoke('workspace:setPath', workspacePath),
        getCurrentPath: () => electron_1.ipcRenderer.invoke('workspace:getCurrentPath')
    },
    // App operations
    app: {
        getMode: () => electron_1.ipcRenderer.invoke('app:getMode'),
        getStatus: () => electron_1.ipcRenderer.invoke('app:status'),
        getPlatform: () => process.platform,
        getVersion: () => process.versions.electron
    },
    // Local database operations
    database: {
        // Claude session methods
        saveClaudeSession: (sessionData) => electron_1.ipcRenderer.invoke('db:saveClaudeSession', sessionData),
        getClaudeSession: (sessionId) => electron_1.ipcRenderer.invoke('db:getClaudeSession', sessionId),
        getClaudeSessionsByUser: (userId) => electron_1.ipcRenderer.invoke('db:getClaudeSessionsByUser', userId),
        // Workspace state methods
        saveWorkspaceState: (workspacePath, stateType, stateData) => electron_1.ipcRenderer.invoke('db:saveWorkspaceState', workspacePath, stateType, stateData),
        getWorkspaceState: (workspacePath, stateType) => electron_1.ipcRenderer.invoke('db:getWorkspaceState', workspacePath, stateType),
        // Knowledge base methods
        saveKnowledgeEntry: (entry) => electron_1.ipcRenderer.invoke('db:saveKnowledgeEntry', entry),
        searchKnowledge: (query, userId) => electron_1.ipcRenderer.invoke('db:searchKnowledge', query, userId),
        // Sync queue methods
        addToSyncQueue: (actionType, actionData, priority) => electron_1.ipcRenderer.invoke('db:addToSyncQueue', actionType, actionData, priority),
        getNextSyncItem: () => electron_1.ipcRenderer.invoke('db:getNextSyncItem'),
        updateSyncItemStatus: (id, status) => electron_1.ipcRenderer.invoke('db:updateSyncItemStatus', id, status),
        getPendingSyncCount: () => electron_1.ipcRenderer.invoke('db:getPendingSyncCount'),
        // Settings methods
        setSetting: (key, value) => electron_1.ipcRenderer.invoke('db:setSetting', key, value),
        getSetting: (key) => electron_1.ipcRenderer.invoke('db:getSetting', key),
        getAllSettings: () => electron_1.ipcRenderer.invoke('db:getAllSettings'),
        // Utility methods
        getStats: () => electron_1.ipcRenderer.invoke('db:getStats')
    },
    snapshots: {
        save: (snapshot) => electron_1.ipcRenderer.invoke('snapshots:save', snapshot),
        list: (options) => electron_1.ipcRenderer.invoke('snapshots:list', options),
        delete: (snapshotId, branch) => electron_1.ipcRenderer.invoke('snapshots:delete', snapshotId, branch),
        update: (snapshot) => electron_1.ipcRenderer.invoke('snapshots:update', snapshot),
        getStorageInfo: () => electron_1.ipcRenderer.invoke('snapshots:getStorageInfo'),
        export: (exportPath) => electron_1.ipcRenderer.invoke('snapshots:export', exportPath),
        import: (importPath) => electron_1.ipcRenderer.invoke('snapshots:import', importPath),
        // Enhanced snapshot operations
        compressContent: (content) => electron_1.ipcRenderer.invoke('snapshots:compressContent', content),
        storeContent: (params) => electron_1.ipcRenderer.invoke('snapshots:storeContent', params),
        getContent: (params) => electron_1.ipcRenderer.invoke('snapshots:getContent', params),
        storeDiff: (params) => electron_1.ipcRenderer.invoke('snapshots:storeDiff', params),
        getDiff: (params) => electron_1.ipcRenderer.invoke('snapshots:getDiff', params),
        scanProjectFiles: (params) => electron_1.ipcRenderer.invoke('snapshots:scanProjectFiles', params),
        restoreFiles: (params) => electron_1.ipcRenderer.invoke('snapshots:restoreFiles', params),
        cleanup: (params) => electron_1.ipcRenderer.invoke('snapshots:cleanup', params),
        setCurrentBranch: (branch) => electron_1.ipcRenderer.invoke('snapshots:setCurrentBranch', branch)
    },
    git: {
        status: () => electron_1.ipcRenderer.invoke('git:status'),
        add: (files, customPath) => electron_1.ipcRenderer.invoke('git:add', files, customPath),
        reset: (files) => electron_1.ipcRenderer.invoke('git:reset', files),
        resetHard: (commitHash) => electron_1.ipcRenderer.invoke('git:resetHard', commitHash),
        commit: (message, customPath) => electron_1.ipcRenderer.invoke('git:commit', message, customPath),
        push: (remote, branch) => electron_1.ipcRenderer.invoke('git:push', remote, branch),
        pull: (remote, branch) => electron_1.ipcRenderer.invoke('git:pull', remote, branch),
        getCurrentBranch: () => electron_1.ipcRenderer.invoke('git:getCurrentBranch'),
        getBranches: () => electron_1.ipcRenderer.invoke('git:getBranches'),
        createBranch: (name) => electron_1.ipcRenderer.invoke('git:createBranch', name),
        switchBranch: (name) => electron_1.ipcRenderer.invoke('git:switchBranch', name),
        getLog: (limit) => electron_1.ipcRenderer.invoke('git:getLog', limit),
        diff: (file) => electron_1.ipcRenderer.invoke('git:diff', file),
        diffStaged: (file) => electron_1.ipcRenderer.invoke('git:diffStaged', file),
        discardChanges: (files) => electron_1.ipcRenderer.invoke('git:discardChanges', files),
        stash: (message) => electron_1.ipcRenderer.invoke('git:stash', message),
        getFileAtHead: (filePath) => electron_1.ipcRenderer.invoke('git:getFileAtHead', filePath),
        init: () => electron_1.ipcRenderer.invoke('git:init'),
        clone: (url, localPath) => electron_1.ipcRenderer.invoke('git:clone', url, localPath),
        checkIsRepo: () => electron_1.ipcRenderer.invoke('git:checkIsRepo'),
        checkIgnore: (workspacePath, paths) => electron_1.ipcRenderer.invoke('git:checkIgnore', workspacePath, paths)
    },
    worktree: {
        list: () => electron_1.ipcRenderer.invoke('worktree:list'),
        create: (branchName, sessionName, sessionDescription, metadata) => electron_1.ipcRenderer.invoke('worktree:create', branchName, sessionName, sessionDescription, metadata),
        remove: (worktreePath, force) => electron_1.ipcRenderer.invoke('worktree:remove', worktreePath, force),
        switch: (worktreePath) => electron_1.ipcRenderer.invoke('worktree:switch', worktreePath),
        compare: (path1, path2) => electron_1.ipcRenderer.invoke('worktree:compare', path1, path2),
        sessions: () => electron_1.ipcRenderer.invoke('worktree:sessions'),
        createSession: (sessionData) => electron_1.ipcRenderer.invoke('worktree:createSession', sessionData),
        deleteSession: (sessionId) => electron_1.ipcRenderer.invoke('worktree:deleteSession', sessionId),
        lock: (worktreePath, lock) => electron_1.ipcRenderer.invoke('worktree:lock', worktreePath, lock),
        prune: () => electron_1.ipcRenderer.invoke('worktree:prune')
    },
    gitHooks: {
        install: (options) => electron_1.ipcRenderer.invoke('git-hooks:install', options),
        uninstall: () => electron_1.ipcRenderer.invoke('git-hooks:uninstall'),
        status: () => electron_1.ipcRenderer.invoke('git-hooks:status'),
        update: (hookName, options) => electron_1.ipcRenderer.invoke('git-hooks:update', hookName, options),
        test: (hookName) => electron_1.ipcRenderer.invoke('git-hooks:test', hookName)
    },
    gitTimeline: {
        getData: (workspacePath, filter) => electron_1.ipcRenderer.invoke('git-timeline:getData', workspacePath, filter),
        getCommitDetails: (workspacePath, hash) => electron_1.ipcRenderer.invoke('git-timeline:getCommitDetails', workspacePath, hash),
        clearCache: (workspacePath) => electron_1.ipcRenderer.invoke('git-timeline:clearCache', workspacePath),
        checkoutBranch: (workspacePath, branchName) => electron_1.ipcRenderer.invoke('git-timeline:checkoutBranch', workspacePath, branchName),
        createBranch: (workspacePath, branchName, startPoint) => electron_1.ipcRenderer.invoke('git-timeline:createBranch', workspacePath, branchName, startPoint)
    },
    // Time Machine events
    onTimeMachineFileOperation: (callback) => {
        const channel = 'time-machine:first-file-operation';
        const handler = (_, data) => callback(data);
        electron_1.ipcRenderer.on(channel, handler);
        return () => electron_1.ipcRenderer.removeListener(channel, handler);
    },
    removeTimeMachineListener: () => {
        electron_1.ipcRenderer.removeAllListeners('time-machine:first-file-operation');
    },
    // Code Generation
    codeGeneration: {
        generate: (params) => electron_1.ipcRenderer.invoke('codeGeneration:generate', params)
    }
};
electron_1.contextBridge.exposeInMainWorld('electronAPI', electronAPI);
