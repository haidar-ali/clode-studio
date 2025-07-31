declare global {
  interface Window {
    electronAPI: {
      claude: {
        start: (workingDirectory: string) => Promise<{ success: boolean; pid?: number; error?: string }>;
        send: (command: string) => Promise<{ success: boolean; error?: string }>;
        stop: () => Promise<{ success: boolean; error?: string }>;
        onOutput: (callback: (data: string) => void) => void;
        onError: (callback: (data: string) => void) => void;
        onExit: (callback: (code: number | null) => void) => void;
        removeAllListeners: () => void;
      };
      fs: {
        readFile: (path: string) => Promise<{ success: boolean; content?: string; error?: string }>;
        writeFile: (path: string, content: string) => Promise<{ success: boolean; error?: string }>;
        readDir: (path: string) => Promise<{ success: boolean; files?: Array<{name: string; path: string; isDirectory: boolean}>; error?: string }>;
      };
      store: {
        get: (key: string) => Promise<any>;
        set: (key: string, value: any) => Promise<{ success: boolean }>;
        delete: (key: string) => Promise<{ success: boolean }>;
      };
      shell: {
        openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
      };
      dialog: {
        selectFolder: () => Promise<{ success: boolean; path?: string; canceled?: boolean; error?: string }>;
      };
      lsp: {
        install: (params: { id: string; command: string; packageManager: string }) => Promise<{ success: boolean; output?: string; error?: string }>;
        uninstall: (params: { id: string; packageManager: string }) => Promise<{ success: boolean; output?: string; error?: string }>;
        checkCommand: (command: string) => Promise<{ available: boolean }>;
      };
    };
  }
}

export {};