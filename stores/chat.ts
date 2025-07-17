import { defineStore } from 'pinia';
import type { ChatMessage } from '~/shared/types';
import { useContextStore } from './context';
import { useTokenCounter } from '~/composables/useTokenCounter';

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
      const storedWorkspace = await window.electronAPI?.store?.get('workspacePath');
      if (storedWorkspace && typeof storedWorkspace === 'string') {
        console.log('Using stored workspace:', storedWorkspace);
        this.workingDirectory = storedWorkspace;
      } else {
        console.log('No stored workspace, using default directory');
        this.workingDirectory = process.env.DEFAULT_WORKSPACE_PATH || process.cwd();
      }
    },

    async startClaude() {
      if (this.claudeStatus !== 'disconnected') return;
      
      console.log('Starting Claude CLI...');
      
      // Initialize working directory if not set
      if (!this.workingDirectory) {
        await this.init();
      }
      
      console.log('Working directory:', this.workingDirectory);
      
      this.claudeStatus = 'connecting';
      const result = await window.electronAPI.claude.start(this.workingDirectory);
      
      console.log('Claude start result:', result);
      
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
      console.log('Setting up Claude listeners...');
      
      window.electronAPI.claude.onOutput((data: string) => {
        // Don't log every character from the terminal
        // console.log('Received Claude output:', data);
        this.appendToLastAssistantMessage(data);
      });

      window.electronAPI.claude.onError((data: string) => {
        console.log('Received Claude error:', data);
        this.addSystemMessage(data, true);
      });

      window.electronAPI.claude.onExit((code: number | null) => {
        console.log('Claude process exited with code:', code);
        this.claudeStatus = 'disconnected';
        this.addSystemMessage(`Claude process exited with code ${code}`);
      });
    },

    async sendMessage(content: string) {
      if (this.claudeStatus !== 'connected' || !content.trim()) return;
      
      // Only log actual messages, not every keystroke
      if (content.trim()) {
        console.log('Sending message to Claude');
      }
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
      const contextStore = useContextStore();
      const { countMessageTokens } = useTokenCounter();
      
      const tokens = countMessageTokens(content);
      const message: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'user',
        content,
        timestamp: new Date(),
        tokens
      };
      
      this.messages.push(message);
      contextStore.addTokens(tokens, 'chat');
    },

    addAssistantMessage(content: string) {
      const contextStore = useContextStore();
      const { countMessageTokens } = useTokenCounter();
      
      const tokens = countMessageTokens(content);
      const message: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content,
        timestamp: new Date(),
        tokens
      };
      
      this.messages.push(message);
      contextStore.addTokens(tokens, 'chat');
    },

    addSystemMessage(content: string, error = false) {
      const contextStore = useContextStore();
      const { countMessageTokens } = useTokenCounter();
      
      const tokens = countMessageTokens(content);
      const message: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'system',
        content,
        timestamp: new Date(),
        error,
        tokens
      };
      
      this.messages.push(message);
      contextStore.addTokens(tokens, 'system');
    },

    appendToLastAssistantMessage(content: string) {
      const lastMessage = this.messages[this.messages.length - 1];
      
      if (lastMessage && lastMessage.role === 'assistant') {
        const contextStore = useContextStore();
        const { countMessageTokens } = useTokenCounter();
        
        // Remove old token count
        if (lastMessage.tokens) {
          contextStore.removeTokens(lastMessage.tokens, 'chat');
        }
        
        // Update content and recalculate tokens
        lastMessage.content += content;
        lastMessage.tokens = countMessageTokens(lastMessage.content);
        
        // Add new token count
        contextStore.addTokens(lastMessage.tokens, 'chat');
      } else {
        this.addAssistantMessage(content);
      }
    },

    clearMessages() {
      const contextStore = useContextStore();
      
      // Calculate total tokens to remove
      const totalTokens = this.messages.reduce((sum, msg) => sum + (msg.tokens || 0), 0);
      
      // Remove tokens from context tracking
      if (totalTokens > 0) {
        contextStore.removeTokens(totalTokens, 'chat');
      }
      
      this.messages = [];
    },
    
    pruneOldMessages(keepCount: number = 20) {
      const contextStore = useContextStore();
      
      if (this.messages.length <= keepCount) return;
      
      // Calculate tokens to remove from pruned messages
      const messagesToRemove = this.messages.slice(0, -keepCount);
      const tokensToRemove = messagesToRemove.reduce((sum, msg) => sum + (msg.tokens || 0), 0);
      
      // Remove tokens from context
      if (tokensToRemove > 0) {
        contextStore.removeTokens(tokensToRemove, 'chat');
      }
      
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
      console.log('Updating working directory to:', path);
      this.workingDirectory = path;
      
      // Don't auto-restart Claude - let user manually restart when ready
      // This prevents race conditions and gives better control
      if (this.claudeStatus === 'connected') {
        console.log('Claude was running, stopped for workspace switch. Click Start to restart.');
        await this.stopClaude();
      }
    }
  }
});