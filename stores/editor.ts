import { defineStore } from 'pinia';
import type { EditorTab } from '~/shared/types';

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
    async openFile(path: string) {
      const existingTab = this.tabs.find(tab => tab.path === path);
      if (existingTab) {
        this.activeTabId = existingTab.id;
        return;
      }

      const result = await window.electronAPI.fs.readFile(path);
      if (!result.success) {
        throw new Error(result.error);
      }

      console.log('File read result:', { path, contentLength: result.content?.length, content: result.content?.substring(0, 100) + '...' });

      const name = path.split('/').pop() || 'untitled';
      const newTab: EditorTab = {
        id: `tab-${Date.now()}`,
        path,
        name,
        content: result.content || '',
        language: this.detectLanguage(name),
        isDirty: false
      };

      console.log('Created tab:', newTab);

      this.tabs.push(newTab);
      this.activeTabId = newTab.id;
      
      // Start watching this file for changes
      await window.electronAPI.fs.watchFile(path);
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

      const result = await window.electronAPI.fs.writeFile(tab.path, tab.content);
      if (result.success) {
        tab.isDirty = false;
      } else {
        throw new Error(result.error);
      }
    },

    closeTab(tabId: string) {
      const index = this.tabs.findIndex(t => t.id === tabId);
      if (index === -1) return;

      const tab = this.tabs[index];
      
      // Stop watching this file
      window.electronAPI.fs.unwatchFile(tab.path);
      
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
      
      console.log('Closed all editor tabs for workspace switch');
    },
    
    updateFileContent(path: string, content: string) {
      const tab = this.tabs.find(t => t.path === path);
      if (tab) {
        console.log('Updating file content from external change:', path);
        // Only update if content is different and tab is not dirty
        if (tab.content !== content && !tab.isDirty) {
          tab.content = content;
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
        sh: 'shell',
        bash: 'shell'
      };
      return languageMap[ext || ''] || 'plaintext';
    }
  }
});