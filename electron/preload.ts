import { contextBridge, ipcRenderer } from 'electron';

const electronAPI = {
  claude: {
    start: (workingDirectory: string) => ipcRenderer.invoke('claude:start', workingDirectory),
    send: (command: string) => ipcRenderer.invoke('claude:send', command),
    stop: () => ipcRenderer.invoke('claude:stop'),
    resize: (cols: number, rows: number) => ipcRenderer.invoke('claude:resize', cols, rows),
    onOutput: (callback: (data: string) => void) => {
      ipcRenderer.on('claude:output', (_, data) => callback(data));
    },
    onError: (callback: (data: string) => void) => {
      ipcRenderer.on('claude:error', (_, data) => callback(data));
    },
    onExit: (callback: (code: number | null) => void) => {
      ipcRenderer.on('claude:exit', (_, code) => callback(code));
    },
    removeAllListeners: () => {
      ipcRenderer.removeAllListeners('claude:output');
      ipcRenderer.removeAllListeners('claude:error');
      ipcRenderer.removeAllListeners('claude:exit');
    },
    sdk: {
      getTodos: (projectPath: string) => ipcRenderer.invoke('claude:sdk:getTodos', projectPath),
      createTodos: (taskDescription: string, projectPath: string) => ipcRenderer.invoke('claude:sdk:createTodos', taskDescription, projectPath),
      updateTodo: (todoId: string, newStatus: string, projectPath: string) => ipcRenderer.invoke('claude:sdk:updateTodo', todoId, newStatus, projectPath)
    },
    onTodosUpdated: (callback: (todos: any[]) => void) => {
      ipcRenderer.on('claude:todos:updated', (_, todos) => callback(todos));
    }
  },
  fs: {
    readFile: (path: string) => ipcRenderer.invoke('fs:readFile', path),
    writeFile: (path: string, content: string) => ipcRenderer.invoke('fs:writeFile', path, content),
    readDir: (path: string) => ipcRenderer.invoke('fs:readDir', path),
    ensureDir: (path: string) => ipcRenderer.invoke('fs:ensureDir', path),
    rename: (oldPath: string, newPath: string) => ipcRenderer.invoke('fs:rename', oldPath, newPath),
    delete: (path: string) => ipcRenderer.invoke('fs:delete', path),
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
    delete: (key: string) => ipcRenderer.invoke('store:delete', key)
  },
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url)
  },
  dialog: {
    selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
    selectFile: () => ipcRenderer.invoke('dialog:selectFile')
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
  mcp: {
    list: () => ipcRenderer.invoke('mcp:list'),
    add: (config: {
      name: string;
      type: 'stdio' | 'sse' | 'http';
      command?: string;
      args?: string[];
      url?: string;
      env?: Record<string, string>;
    }) => ipcRenderer.invoke('mcp:add', config),
    remove: (name: string) => ipcRenderer.invoke('mcp:remove', name),
    get: (name: string) => ipcRenderer.invoke('mcp:get', name),
    test: (config: any) => ipcRenderer.invoke('mcp:test', config)
  }
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

export type ElectronAPI = typeof electronAPI;