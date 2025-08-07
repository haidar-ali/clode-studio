import { contextBridge, ipcRenderer } from 'electron';

const electronAPI = {
  // General IPC send for specific allowed channels
  send: (channel: string, data: any) => {
    const allowedChannels = [
      'forward-terminal-data', 
      'forward-claude-output', 
      'forward-claude-response-complete', 
      'claude-instances-updated',
      'snapshots-list-response',
      'snapshots-capture-response', 
      'snapshots-restore-response',
      'snapshots-delete-response',
      'snapshots-update-response',
      'snapshots-content-response',
      'snapshots-getDiff-response',
      'snapshots-scanProjectFiles-response',
      'worktree-list-response',
      'worktree-sessions-response',
      'worktree-switch-response',
      'worktree-remove-response',
      'worktree-lock-response',
      'worktree-compare-response',
      'worktree-createSession-response',
      'worktree-deleteSession-response'
    ];
    if (allowedChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },
  // Expose ipcRenderer for remote snapshot handlers
  ipcRenderer: {
    on: (channel: string, listener: (...args: any[]) => void) => {
      const allowedChannels = [
        'remote-snapshot-list',
        'remote-snapshot-capture', 
        'remote-snapshot-restore',
        'remote-snapshot-delete',
        'remote-snapshot-update',
        'remote-snapshot-content',
        'remote-snapshot-getDiff',
        'remote-snapshot-scanProjectFiles',
        'remote-worktree-list',
        'remote-worktree-sessions',
        'remote-worktree-switch',
        'remote-worktree-remove',
        'remote-worktree-lock',
        'remote-worktree-compare',
        'remote-worktree-createSession',
        'remote-worktree-deleteSession'
      ];
      if (allowedChannels.includes(channel)) {
        ipcRenderer.on(channel, listener);
      }
    },
    removeListener: (channel: string, listener: (...args: any[]) => void) => {
      ipcRenderer.removeListener(channel, listener);
    }
  },
  claude: {
    start: (instanceId: string, workingDirectory: string, instanceName?: string, runConfig?: { command?: string; args?: string[] }): Promise<{
      success: boolean;
      error?: string;
      pid?: number;
      claudeInfo?: {
        path: string;
        version: string;
        source: string;
      };
    }> => 
      ipcRenderer.invoke('claude:start', instanceId, workingDirectory, instanceName, runConfig),
    detectInstallation: (): Promise<{
      success: boolean;
      info?: {
        path: string;
        version: string;
        source: string;
      };
    }> => ipcRenderer.invoke('claude:detectInstallation'),
    send: (instanceId: string, command: string) => 
      ipcRenderer.invoke('claude:send', instanceId, command),
    stop: (instanceId: string) => 
      ipcRenderer.invoke('claude:stop', instanceId),
    resize: (instanceId: string, cols: number, rows: number) => 
      ipcRenderer.invoke('claude:resize', instanceId, cols, rows),
    onOutput: (instanceId: string, callback: (data: string) => void) => {
      const channel = `claude:output:${instanceId}`;
      const handler = (_: any, data: string) => callback(data);
      ipcRenderer.on(channel, handler);
      // Return cleanup function
      return () => ipcRenderer.removeListener(channel, handler);
    },
    onError: (instanceId: string, callback: (data: string) => void) => {
      const channel = `claude:error:${instanceId}`;
      const handler = (_: any, data: string) => callback(data);
      ipcRenderer.on(channel, handler);
      return () => ipcRenderer.removeListener(channel, handler);
    },
    onExit: (instanceId: string, callback: (code: number | null) => void) => {
      const channel = `claude:exit:${instanceId}`;
      const handler = (_: any, code: number | null) => callback(code);
      ipcRenderer.on(channel, handler);
      return () => ipcRenderer.removeListener(channel, handler);
    },
    removeAllListeners: (instanceId: string) => {
      ipcRenderer.removeAllListeners(`claude:output:${instanceId}`);
      ipcRenderer.removeAllListeners(`claude:error:${instanceId}`);
      ipcRenderer.removeAllListeners(`claude:exit:${instanceId}`);
    },
    sdk: {
      getTodos: (projectPath: string) => ipcRenderer.invoke('claude:sdk:getTodos', projectPath),
      createTodos: (taskDescription: string, projectPath: string) => ipcRenderer.invoke('claude:sdk:createTodos', taskDescription, projectPath),
      updateTodo: (todoId: string, newStatus: string, projectPath: string) => ipcRenderer.invoke('claude:sdk:updateTodo', todoId, newStatus, projectPath)
    },
    onTodosUpdated: (callback: (todos: any[]) => void) => {
      ipcRenderer.on('claude:todos:updated', (_, todos) => callback(todos));
    },
    onInstancesUpdated: (callback: () => void) => {
      ipcRenderer.on('claude:instances:updated', () => callback());
    },
    checkForwarding: (instanceId: string): Promise<boolean> =>
      ipcRenderer.invoke('check-claude-forwarding', instanceId),
    // Hook management
    getHooks: () => ipcRenderer.invoke('claude:getHooks'),
    addHook: (hook: {
      event: string;
      matcher: string;
      command: string;
      disabled?: boolean;
    }) => ipcRenderer.invoke('claude:addHook', hook),
    updateHook: (id: string, updates: any) => ipcRenderer.invoke('claude:updateHook', id, updates),
    removeHook: (id: string) => ipcRenderer.invoke('claude:removeHook', id),
    deleteHook: (id: string) => ipcRenderer.invoke('claude:deleteHook', id),
    testHook: (hook: any) => ipcRenderer.invoke('claude:testHook', hook),
    // Session management
    listSessions: () => ipcRenderer.invoke('claude:listSessions'),
    resumeSession: (instanceId: string, sessionId: string) => 
      ipcRenderer.invoke('claude:resumeSession', instanceId, sessionId)
  },
  fs: {
    readFile: (path: string) => ipcRenderer.invoke('fs:readFile', path),
    writeFile: (path: string, content: string) => ipcRenderer.invoke('fs:writeFile', path, content),
    readDir: (path: string) => ipcRenderer.invoke('fs:readDir', path),
    ensureDir: (path: string) => ipcRenderer.invoke('fs:ensureDir', path),
    rename: (oldPath: string, newPath: string) => ipcRenderer.invoke('fs:rename', oldPath, newPath),
    delete: (path: string) => ipcRenderer.invoke('fs:delete', path),
    exists: (path: string) => ipcRenderer.invoke('fs:exists', path),
    watchFile: (path: string) => ipcRenderer.invoke('fs:watchFile', path),
    unwatchFile: (path: string) => ipcRenderer.invoke('fs:unwatchFile', path),
    watchDirectory: (path: string) => ipcRenderer.invoke('fs:watchDirectory', path),
    unwatchDirectory: (path: string) => ipcRenderer.invoke('fs:unwatchDirectory', path),
    onFileChanged: (callback: (data: { path: string; content: string }) => void) => {
      ipcRenderer.on('file:changed', (_, data) => callback(data));
    },
    onDirectoryChanged: (callback: (data: { path: string; eventType: string; filename: string }) => void) => {
      ipcRenderer.on('directory:changed', (_, data) => callback(data));
    },
    removeFileChangeListener: () => {
      ipcRenderer.removeAllListeners('file:changed');
    },
    removeDirectoryChangeListener: () => {
      ipcRenderer.removeAllListeners('directory:changed');
    }
  },
  store: {
    get: (key: string) => ipcRenderer.invoke('store:get', key),
    set: (key: string, value: any) => ipcRenderer.invoke('store:set', key, value),
    delete: (key: string) => ipcRenderer.invoke('store:delete', key),
    getAll: () => ipcRenderer.invoke('store:getAll'),
    getHomePath: () => ipcRenderer.invoke('store:getHomePath')
  },
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url)
  },
  dialog: {
    selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
    selectFile: () => ipcRenderer.invoke('dialog:selectFile'),
    showOpenDialog: (options: any) => ipcRenderer.invoke('dialog:showOpenDialog', options),
    showSaveDialog: (options: any) => ipcRenderer.invoke('dialog:showSaveDialog', options),
    showInputBox: (options: any) => ipcRenderer.invoke('dialog:showInputBox', options),
    showMessageBox: (options: any) => ipcRenderer.invoke('dialog:showMessageBox', options)
  },
  showNotification: (options: { title: string; body: string }) => 
    ipcRenderer.invoke('showNotification', options),
  getHomeDir: () => ipcRenderer.invoke('getHomeDir'),
  
  // File Watcher operations
  fileWatcher: {
    start: (dirPath: string, options?: any) => ipcRenderer.invoke('fileWatcher:start', dirPath, options),
    stop: (dirPath: string) => ipcRenderer.invoke('fileWatcher:stop', dirPath),
    indexFile: (filePath: string) => ipcRenderer.invoke('fileWatcher:indexFile', filePath),
    getStats: () => ipcRenderer.invoke('fileWatcher:getStats')
  },
  
  // File change events
  onFileChange: (callback: (event: any) => void) => {
    ipcRenderer.on('file:change', (_, data) => callback(data));
  },
  onBatchChange: (callback: (event: any) => void) => {
    ipcRenderer.on('batch:change', (_, data) => callback(data));
  },
  
  // Knowledge Cache operations
  knowledgeCache: {
    recordQuery: (workspacePath: string, metrics: any) => 
      ipcRenderer.invoke('knowledgeCache:recordQuery', workspacePath, metrics),
    getStats: (workspacePath: string) => 
      ipcRenderer.invoke('knowledgeCache:getStats', workspacePath),
    predict: (workspacePath: string, context: any) => 
      ipcRenderer.invoke('knowledgeCache:predict', workspacePath, context),
    clear: (workspacePath: string) => 
      ipcRenderer.invoke('knowledgeCache:clear', workspacePath),
    invalidate: (workspacePath: string, pattern?: string, tags?: string[]) => 
      ipcRenderer.invoke('knowledgeCache:invalidate', workspacePath, pattern, tags)
  },
  
  search: {
    findInFiles: (options: {
      query: string;
      caseSensitive?: boolean;
      wholeWord?: boolean;
      useRegex?: boolean;
      includePattern?: string;
      excludePattern?: string;
      workspacePath?: string;
    }) => ipcRenderer.invoke('search:findInFiles', options),
    replaceInFile: (options: {
      filePath: string;
      searchQuery: string;
      replaceQuery: string;
      line: number;
      column: number;
      caseSensitive?: boolean;
      wholeWord?: boolean;
      useRegex?: boolean;
    }) => ipcRenderer.invoke('search:replaceInFile', options),
    replaceAllInFile: (options: {
      filePath: string;
      searchQuery: string;
      replaceQuery: string;
      caseSensitive?: boolean;
      wholeWord?: boolean;
      useRegex?: boolean;
    }) => ipcRenderer.invoke('search:replaceAllInFile', options)
  },
  terminal: {
    create: (options: { cols: number; rows: number; cwd?: string }) => 
      ipcRenderer.invoke('terminal:create', options),
    write: (id: string, data: string) => 
      ipcRenderer.invoke('terminal:write', id, data),
    resize: (id: string, cols: number, rows: number) => 
      ipcRenderer.invoke('terminal:resize', id, cols, rows),
    destroy: (id: string) => 
      ipcRenderer.invoke('terminal:destroy', id),
    onData: (id: string, callback: (data: string) => void) => {
      const channel = `terminal:data:${id}`;
      ipcRenderer.on(channel, (_, data) => callback(data));
      return () => ipcRenderer.removeAllListeners(channel);
    }
  },
  autocomplete: {
    getCompletion: (request: any) => 
      ipcRenderer.invoke('autocomplete:getCompletion', request),
    streamCompletion: (request: any) => 
      ipcRenderer.invoke('autocomplete:streamCompletion', request),
    clearCache: () => 
      ipcRenderer.invoke('autocomplete:clearCache'),
    preloadFileContext: (filepath: string) => 
      ipcRenderer.invoke('autocomplete:preloadFileContext', filepath),
    cancelRequest: (requestId: string) => 
      ipcRenderer.invoke('autocomplete:cancelRequest', requestId),
    checkHealth: () =>
      ipcRenderer.invoke('autocomplete:checkHealth'),
    getGhostText: (params: { prefix: string; suffix: string }) => 
      ipcRenderer.invoke('autocomplete:getGhostText', params),
    initializeProject: (projectPath: string) =>
      ipcRenderer.invoke('autocomplete:initializeProject', projectPath),
    checkLSPServers: () =>
      ipcRenderer.invoke('autocomplete:checkLSPServers'),
    getLSPStatus: () =>
      ipcRenderer.invoke('autocomplete:getLSPStatus'),
    onChunk: (requestId: string, callback: (chunk: any) => void) => {
      const channel = `autocomplete:chunk:${requestId}`;
      ipcRenderer.on(channel, (_, chunk) => callback(chunk));
      return () => ipcRenderer.removeAllListeners(channel);
    }
  },
  lsp: {
    getCompletions: (params: any) => 
      ipcRenderer.invoke('lsp:getCompletions', params),
    getHover: (params: any) => 
      ipcRenderer.invoke('lsp:getHover', params),
    getDiagnostics: (params: any) => 
      ipcRenderer.invoke('lsp:getDiagnostics', params),
    install: (params: { id: string; command: string; packageManager: string }) => 
      ipcRenderer.invoke('lsp:install', params),
    uninstall: (params: { id: string; packageManager: string }) => 
      ipcRenderer.invoke('lsp:uninstall', params),
    checkCommand: (command: string) => 
      ipcRenderer.invoke('lsp:checkCommand', command)
  },
  mcp: {
    list: (workspacePath?: string) => ipcRenderer.invoke('mcp:list', workspacePath),
    add: (config: {
      name: string;
      type: 'stdio' | 'sse' | 'http';
      command?: string;
      args?: string[];
      url?: string;
      env?: Record<string, string>;
      headers?: Record<string, string>;
    }) => ipcRenderer.invoke('mcp:add', config),
    remove: (name: string) => ipcRenderer.invoke('mcp:remove', name),
    get: (name: string) => ipcRenderer.invoke('mcp:get', name),
    test: (config: any) => ipcRenderer.invoke('mcp:test', config)
  },
  context: {
    initialize: (workspacePath: string) => ipcRenderer.invoke('context:initialize', workspacePath),
    searchFiles: (query: string, limit?: number) => ipcRenderer.invoke('context:searchFiles', query, limit),
    buildContext: (query: string, workingFiles: string[], maxTokens?: number) => ipcRenderer.invoke('context:buildContext', query, workingFiles, maxTokens),
    getStatistics: () => ipcRenderer.invoke('context:getStatistics'),
    getFileContent: (filePath: string) => ipcRenderer.invoke('context:getFileContent', filePath),
    getRecentFiles: (hours?: number) => ipcRenderer.invoke('context:getRecentFiles', hours),
    rescan: () => ipcRenderer.invoke('context:rescan'),
    startWatching: () => ipcRenderer.invoke('context:startWatching'),
    stopWatching: () => ipcRenderer.invoke('context:stopWatching'),
    onFileChange: (callback: (event: 'add' | 'change' | 'remove', filePath: string) => void) => {
      ipcRenderer.on('context:file-changed', (_, data) => callback(data.event, data.filePath));
      return () => ipcRenderer.removeAllListeners('context:file-changed');
    },
    analyzeUsage: (messages: any[], currentContext: string) => 
      ipcRenderer.invoke('context:analyzeUsage', messages, currentContext),
    buildOptimized: (query: string, workingFiles: string[], maxTokens: number) =>
      ipcRenderer.invoke('context:buildOptimized', query, workingFiles, maxTokens),
    optimize: (content: string, strategy: any) =>
      ipcRenderer.invoke('context:optimize', content, strategy),
    getRecommendations: (usage: any) =>
      ipcRenderer.invoke('context:getRecommendations', usage),
    shouldInject: (query: string, availableTokens: number, contextSize: number) =>
      ipcRenderer.invoke('context:shouldInject', query, availableTokens, contextSize)
  },
  workspace: {
    loadContext: (workspacePath: string) =>
      ipcRenderer.invoke('workspace:loadContext', workspacePath),
    saveContext: (data: any) =>
      ipcRenderer.invoke('workspace:saveContext', data),
    updateOptimizationTime: (workspacePath: string, lastOptimization: string) =>
      ipcRenderer.invoke('workspace:updateOptimizationTime', workspacePath, lastOptimization),
    updateWorkingFiles: (workspacePath: string, workingFiles: string[]) =>
      ipcRenderer.invoke('workspace:updateWorkingFiles', workspacePath, workingFiles),
    getRecentHistory: (workspacePath: string, limit: number) =>
      ipcRenderer.invoke('workspace:getRecentHistory', workspacePath, limit),
    exportContext: (workspacePath: string) =>
      ipcRenderer.invoke('workspace:exportContext', workspacePath),
    importContext: (workspacePath: string, jsonData: string) =>
      ipcRenderer.invoke('workspace:importContext', workspacePath, jsonData),
    setPath: (workspacePath: string) =>
      ipcRenderer.invoke('workspace:setPath', workspacePath),
    getCurrentPath: () => 
      ipcRenderer.invoke('workspace:getCurrentPath')
  },
  
  // App operations
  app: {
    getMode: () => ipcRenderer.invoke('app:getMode'),
    getStatus: () => ipcRenderer.invoke('app:status'),
    getPlatform: () => process.platform,
    getVersion: () => process.versions.electron
  },
  
  // Local database removed - SQLite not actively used
  snapshots: {
    save: (snapshot: any) =>
      ipcRenderer.invoke('snapshots:save', snapshot),
    list: (options?: { branch?: string; allBranches?: boolean }) =>
      ipcRenderer.invoke('snapshots:list', options),
    delete: (snapshotId: string, branch?: string) =>
      ipcRenderer.invoke('snapshots:delete', snapshotId, branch),
    update: (snapshot: any) =>
      ipcRenderer.invoke('snapshots:update', snapshot),
    getStorageInfo: () =>
      ipcRenderer.invoke('snapshots:getStorageInfo'),
    export: (exportPath: string) =>
      ipcRenderer.invoke('snapshots:export', exportPath),
    import: (importPath: string) =>
      ipcRenderer.invoke('snapshots:import', importPath),
    
    // Enhanced snapshot operations
    compressContent: (content: string) =>
      ipcRenderer.invoke('snapshots:compressContent', content),
    storeContent: (params: { hash: string; content: string; mimeType: string; encoding: string; projectPath: string }) =>
      ipcRenderer.invoke('snapshots:storeContent', params),
    getContent: (params: { hash: string; projectPath: string }) =>
      ipcRenderer.invoke('snapshots:getContent', params),
    storeDiff: (params: { hash: string; diffObject: any; projectPath: string }) =>
      ipcRenderer.invoke('snapshots:storeDiff', params),
    getDiff: (params: { hash: string; projectPath: string }) =>
      ipcRenderer.invoke('snapshots:getDiff', params),
    scanProjectFiles: (params: { projectPath: string }) =>
      ipcRenderer.invoke('snapshots:scanProjectFiles', params),
    restoreFiles: (params: { fileChanges: any; projectPath: string }) =>
      ipcRenderer.invoke('snapshots:restoreFiles', params),
    cleanup: (params: { projectPath: string; olderThanDays: number }) =>
      ipcRenderer.invoke('snapshots:cleanup', params),
    setCurrentBranch: (branch: string) =>
      ipcRenderer.invoke('snapshots:setCurrentBranch', branch)
  },
  git: {
    status: () => ipcRenderer.invoke('git:status'),
    add: (files: string[], customPath?: string) => ipcRenderer.invoke('git:add', files, customPath),
    reset: (files: string[]) => ipcRenderer.invoke('git:reset', files),
    resetHard: (commitHash: string) => ipcRenderer.invoke('git:resetHard', commitHash),
    commit: (message: string, customPath?: string) => ipcRenderer.invoke('git:commit', message, customPath),
    push: (remote?: string, branch?: string) => ipcRenderer.invoke('git:push', remote, branch),
    pull: (remote?: string, branch?: string) => ipcRenderer.invoke('git:pull', remote, branch),
    getCurrentBranch: () => ipcRenderer.invoke('git:getCurrentBranch'),
    getBranches: () => ipcRenderer.invoke('git:getBranches'),
    createBranch: (name: string) => ipcRenderer.invoke('git:createBranch', name),
    switchBranch: (name: string) => ipcRenderer.invoke('git:switchBranch', name),
    getLog: (limit?: number) => ipcRenderer.invoke('git:getLog', limit),
    diff: (file?: string) => ipcRenderer.invoke('git:diff', file),
    diffStaged: (file?: string) => ipcRenderer.invoke('git:diffStaged', file),
    discardChanges: (files: string[]) => ipcRenderer.invoke('git:discardChanges', files),
    stash: (message?: string) => ipcRenderer.invoke('git:stash', message),
    getFileAtHead: (filePath: string) => ipcRenderer.invoke('git:getFileAtHead', filePath),
    init: () => ipcRenderer.invoke('git:init'),
    clone: (url: string, localPath?: string) => ipcRenderer.invoke('git:clone', url, localPath),
    checkIsRepo: () => ipcRenderer.invoke('git:checkIsRepo'),
    checkIgnore: (workspacePath: string, paths: string[]) => ipcRenderer.invoke('git:checkIgnore', workspacePath, paths)
  },
  worktree: {
    list: () => ipcRenderer.invoke('worktree:list'),
    create: (branchName: string, sessionName?: string, sessionDescription?: string, metadata?: any) => 
      ipcRenderer.invoke('worktree:create', branchName, sessionName, sessionDescription, metadata),
    remove: (worktreePath: string, force?: boolean) => 
      ipcRenderer.invoke('worktree:remove', worktreePath, force),
    switch: (worktreePath: string) => 
      ipcRenderer.invoke('worktree:switch', worktreePath),
    compare: (path1: string, path2: string) => 
      ipcRenderer.invoke('worktree:compare', path1, path2),
    sessions: () => ipcRenderer.invoke('worktree:sessions'),
    createSession: (sessionData: any) => 
      ipcRenderer.invoke('worktree:createSession', sessionData),
    deleteSession: (sessionId: string) => 
      ipcRenderer.invoke('worktree:deleteSession', sessionId),
    lock: (worktreePath: string, lock: boolean) => 
      ipcRenderer.invoke('worktree:lock', worktreePath, lock),
    prune: () => ipcRenderer.invoke('worktree:prune')
  },
  gitHooks: {
    install: (options?: any) => ipcRenderer.invoke('git-hooks:install', options),
    uninstall: () => ipcRenderer.invoke('git-hooks:uninstall'),
    status: () => ipcRenderer.invoke('git-hooks:status'),
    update: (hookName: string, options: any) => 
      ipcRenderer.invoke('git-hooks:update', hookName, options),
    test: (hookName: string) => ipcRenderer.invoke('git-hooks:test', hookName)
  },
  gitTimeline: {
    getData: (workspacePath: string, filter?: any) =>
      ipcRenderer.invoke('git-timeline:getData', workspacePath, filter),
    getCommitDetails: (workspacePath: string, hash: string) =>
      ipcRenderer.invoke('git-timeline:getCommitDetails', workspacePath, hash),
    clearCache: (workspacePath: string) =>
      ipcRenderer.invoke('git-timeline:clearCache', workspacePath),
    checkoutBranch: (workspacePath: string, branchName: string) =>
      ipcRenderer.invoke('git-timeline:checkoutBranch', workspacePath, branchName),
    createBranch: (workspacePath: string, branchName: string, startPoint?: string) =>
      ipcRenderer.invoke('git-timeline:createBranch', workspacePath, branchName, startPoint)
  },
  
  // Time Machine events
  onTimeMachineFileOperation: (callback: (data: any) => void) => {
    const channel = 'time-machine:first-file-operation';
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
  removeTimeMachineListener: () => {
    ipcRenderer.removeAllListeners('time-machine:first-file-operation');
  },
  
  // Code Generation
  codeGeneration: {
    generate: (params: {
      prompt: string;
      fileContent: string;
      filePath: string;
      language?: string;
    }) => ipcRenderer.invoke('codeGeneration:generate', params)
  }
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

export type ElectronAPI = typeof electronAPI;