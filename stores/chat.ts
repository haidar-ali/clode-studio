import { defineStore } from 'pinia';
import type { ChatMessage } from '~/shared/types';

export const useChatStore = defineStore('chat', {
  state: () => ({
    messages: [] as ChatMessage[],
    isProcessing: false,
    claudeStatus: 'disconnected' as 'connected' | 'disconnected' | 'connecting',
    currentInput: '',
    workingDirectory: ''
  }),

  actions: {
    async init() {
      // Get the current working directory from stored workspace
      const storedWorkspace = await window.electronAPI?.store?.get('workspace.lastPath');
      if (storedWorkspace && typeof storedWorkspace === 'string') {
        this.workingDirectory = storedWorkspace;
      } else {
        // If no stored workspace, will be set by app initialization
        this.workingDirectory = '';
      }
    },

    async startClaude() {
      if (this.claudeStatus !== 'disconnected') return;
      
      // Initialize working directory if not set
      if (!this.workingDirectory) {
        await this.init();
      }
      
      this.claudeStatus = 'connecting';
      const result = await window.electronAPI.claude.start(this.workingDirectory);
      
      if (result.success) {
        this.claudeStatus = 'connected';
        this.addSystemMessage(`Claude Code CLI started successfully (PID: ${result.pid})`);
        this.setupClaudeListeners();
      } else {
        this.claudeStatus = 'disconnected';
        this.addSystemMessage(`Failed to start Claude: ${result.error}`, true);
      }
    },

    setupClaudeListeners() {
      window.electronAPI.claude.onOutput((data: string) => {
        // Don't log every character from the terminal
        // 
        this.appendToLastAssistantMessage(data);
      });

      window.electronAPI.claude.onError((data: string) => {
        this.addSystemMessage(data, true);
      });

      window.electronAPI.claude.onExit((code: number | null) => {
        this.claudeStatus = 'disconnected';
        this.addSystemMessage(`Claude process exited with code ${code}`);
      });
    },

    async sendMessage(content: string) {
      if (this.claudeStatus !== 'connected' || !content.trim()) return;
      
      this.addUserMessage(content);
      this.isProcessing = true;
      
      const result = await window.electronAPI.claude.send(content);
      
      if (!result.success) {
        console.error('Send failed:', result);
        this.addSystemMessage(`Failed to send message: ${result.error}`, true);
      }
      
      this.isProcessing = false;
    },

    addUserMessage(content: string) {
      const message: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'user',
        content,
        timestamp: new Date()
      };
      
      this.messages.push(message);
    },

    addAssistantMessage(content: string) {
      const message: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content,
        timestamp: new Date()
      };
      
      this.messages.push(message);
    },

    addSystemMessage(content: string, error = false) {
      const message: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'system',
        content,
        timestamp: new Date(),
        error
      };
      
      this.messages.push(message);
    },

    appendToLastAssistantMessage(content: string) {
      const lastMessage = this.messages[this.messages.length - 1];
      
      if (lastMessage && lastMessage.role === 'assistant') {
        lastMessage.content += content;
      } else {
        this.addAssistantMessage(content);
      }
    },

    clearMessages() {
      this.messages = [];
    },
    
    pruneOldMessages(keepCount: number = 20) {
      if (this.messages.length <= keepCount) return;
      
      const messagesToRemove = this.messages.slice(0, -keepCount);
      
      // Keep only the most recent messages
      this.messages = this.messages.slice(-keepCount);
      
      // Add a system message about pruning
      this.addSystemMessage(`Pruned ${messagesToRemove.length} old messages to optimize context`);
    },

    async stopClaude() {
      if (this.claudeStatus === 'disconnected') return;
      
      await window.electronAPI.claude.stop();
      window.electronAPI.claude.removeAllListeners();
      this.claudeStatus = 'disconnected';
      
      // Emit event for terminal component to clear display
      const event = new CustomEvent('claude-stopped');
      window.dispatchEvent(event);
    },

    async updateWorkingDirectory(path: string) {
      this.workingDirectory = path;
      
      // Don't auto-restart Claude - let user manually restart when ready
      // This prevents race conditions and gives better control
      if (this.claudeStatus === 'connected') {
        await this.stopClaude();
      }
    }
  }
});