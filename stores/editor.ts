import { defineStore } from 'pinia';
import type { EditorTab } from '~/shared/types';

// File service abstraction for desktop/remote compatibility
const getFileService = () => {
  if (typeof window !== 'undefined' && window.electronAPI?.fs) {
    // Desktop mode - use Electron API
    return {
      readFile: (path: string) => window.electronAPI.fs.readFile(path),
      writeFile: (path: string, content: string) => window.electronAPI.fs.writeFile(path, content)
    };
  } else {
    // Remote mode - use server API
    return {
      readFile: async (path: string) => {
        try {
          const response = await $fetch('/api/files/read', { query: { path } });
          return { success: true, content: response.content || '' };
        } catch (error: any) {
          return { success: false, error: error.message || 'Failed to read file' };
        }
      },
      writeFile: async (path: string, content: string) => {
        try {
          await $fetch('/api/files/write', {
            method: 'POST',
            body: { path, content }
          });
          return { success: true };
        } catch (error: any) {
          return { success: false, error: error.message || 'Failed to write file' };
        }
      }
    };
  }
};

export const useEditorStore = defineStore('editor', {
  state: () => ({
    tabs: [] as EditorTab[],
    activeTabId: null as string | null,
    fontSize: 14,
    theme: 'vs-dark' as 'vs-dark' | 'vs-light'
  }),

  getters: {
    activeTab: (state) => state.tabs.find(tab => tab.id === state.activeTabId),
    openFiles: (state) => state.tabs.map(tab => tab.path)
  },

  actions: {
    async openFile(path: string, line?: number) {
      const existingTab = this.tabs.find(tab => tab.path === path);
      if (existingTab) {
        this.activeTabId = existingTab.id;
        // Emit event to jump to line if provided
        if (line) {
          window.dispatchEvent(new CustomEvent('editor:goto-line', { detail: { line } }));
        }
        return;
      }

      const fileService = getFileService();
      const result = await fileService.readFile(path);
      if (!result.success) {
        throw new Error(result.error);
      }

      

      const name = path.split('/').pop() || 'untitled';
      const newTab: EditorTab = {
        id: `tab-${Date.now()}`,
        path,
        name,
        content: result.content || '',
        language: this.detectLanguage(name),
        isDirty: false
      };

      

      this.tabs.push(newTab);
      this.activeTabId = newTab.id;

      // Start watching this file for changes
      await window.electronAPI.fs.watchFile(path);

      // Emit event to jump to line if provided
      if (line) {
        // Small delay to ensure editor is initialized
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('editor:goto-line', { detail: { line } }));
        }, 100);
      }
    },

    updateTabContent(tabId: string, content: string) {
      const tab = this.tabs.find(t => t.id === tabId);
      if (tab) {
        tab.content = content;
        tab.isDirty = true;
      }
    },

    async saveTab(tabId: string) {
      const tab = this.tabs.find(t => t.id === tabId);
      if (!tab || !tab.isDirty) return;

      const fileService = getFileService();
      const result = await fileService.writeFile(tab.path, tab.content);
      if (result.success) {
        tab.isDirty = false;

        // Add to working files for context
        try {
          const { useProjectContextStore } = await import('~/stores/project-context');
          const contextStore = useProjectContextStore();
          contextStore.addWorkingFile(tab.path);
        } catch (error) {
          console.warn('Failed to add working file to context:', error);
        }
      } else {
        throw new Error(result.error);
      }
    },

    closeTab(tabId: string) {
      const index = this.tabs.findIndex(t => t.id === tabId);
      if (index === -1) return;

      const tab = this.tabs[index];

      // Stop watching this file (only in desktop mode)
      if (window.electronAPI?.fs?.unwatchFile) {
        window.electronAPI.fs.unwatchFile(tab.path);
      }
      
      // Notify LSP that document is closed (only in desktop mode)
      if (tab.path && window.electronAPI?.lsp?.closeDocument) {
        window.electronAPI.lsp.closeDocument({
          uri: `file://${tab.path}`,
          filepath: tab.path
        }).catch((error: any) => {
          console.error('[LSP] Failed to close document:', error);
        });
      }

      this.tabs.splice(index, 1);

      if (this.activeTabId === tabId) {
        if (this.tabs.length > 0) {
          this.activeTabId = this.tabs[Math.max(0, index - 1)].id;
        } else {
          this.activeTabId = null;
        }
      }
    },

    closeAllTabs() {
      // Stop watching all files
      this.tabs.forEach(tab => {
        window.electronAPI.fs.unwatchFile(tab.path);
      });

      // Clear all tabs and reset active tab
      this.tabs = [];
      this.activeTabId = null;
    },

    updateFileContent(path: string, content: string) {
      const tabIndex = this.tabs.findIndex(t => t.path === path);
      if (tabIndex !== -1) {
        const tab = this.tabs[tabIndex];
        // Only update if content is different and tab is not dirty
        if (tab.content !== content && !tab.isDirty) {
        
          
          // Use Vue's reactivity system to ensure the change is detected
          this.tabs[tabIndex] = {
            ...tab,
            content: content
          };
        }
      }
    },

    detectLanguage(filename: string): string {
      const ext = filename.split('.').pop()?.toLowerCase();
      const languageMap: Record<string, string> = {
        js: 'javascript',
        jsx: 'javascript',
        ts: 'typescript',
        tsx: 'typescript',
        json: 'json',
        html: 'html',
        css: 'css',
        scss: 'scss',
        vue: 'vue',
        py: 'python',
        rb: 'ruby',
        go: 'go',
        rs: 'rust',
        java: 'java',
        cpp: 'cpp',
        c: 'c',
        cs: 'csharp',
        php: 'php',
        swift: 'swift',
        kt: 'kotlin',
        yaml: 'yaml',
        yml: 'yaml',
        xml: 'xml',
        md: 'markdown',
        markdown: 'markdown',
        sh: 'shell',
        bash: 'shell'
      };
      return languageMap[ext || ''] || 'plaintext';
    },
    
    // Methods for checkpoint system
    getCursorPositions(): Record<string, { line: number; column: number }> {
      const positions: Record<string, { line: number; column: number }> = {};
      // This would need to be implemented based on your editor integration
      // For now, return empty object
      return positions;
    },
    
    getScrollPositions(): Record<string, number> {
      const positions: Record<string, number> = {};
      // This would need to be implemented based on your editor integration
      // For now, return empty object
      return positions;
    },
    
    restoreCursorPositions(positions: Record<string, { line: number; column: number }>) {
      // This would need to be implemented based on your editor integration
      
    },
    
    setActiveTab(tabId: string) {
      if (this.tabs.find(t => t.id === tabId)) {
        this.activeTabId = tabId;
      }
    }
  }
});