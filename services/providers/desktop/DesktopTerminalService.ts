/**
 * Desktop Terminal service implementation
 * Wraps existing Electron Terminal IPC APIs
 */
import type {
  ITerminalService,
  TerminalOptions,
  TerminalInfo,
  TerminalState
} from '../../interfaces';

export class DesktopTerminalService implements ITerminalService {
  // Track active terminals
  private activeTerminals: Map<string, TerminalInfo> = new Map();
  
  // Terminal lifecycle
  async createTerminal(options: TerminalOptions): Promise<string> {
    const terminalId = await window.electronAPI.terminal.create({
      cols: options.cols || 80,
      rows: options.rows || 24,
      cwd: options.cwd
    });
    
    // Track the terminal
    this.activeTerminals.set(terminalId, {
      id: terminalId,
      pid: 0, // Would need to get from backend
      cwd: options.cwd || process.cwd(),
      cols: options.cols || 80,
      rows: options.rows || 24,
      createdAt: new Date()
    });
    
    return terminalId;
  }
  
  async destroyTerminal(terminalId: string): Promise<void> {
    await window.electronAPI.terminal.destroy(terminalId);
    this.activeTerminals.delete(terminalId);
  }
  
  // Terminal interaction
  async writeToTerminal(terminalId: string, data: string): Promise<void> {
    return window.electronAPI.terminal.write(terminalId, data);
  }
  
  async resizeTerminal(terminalId: string, cols: number, rows: number): Promise<void> {
    await window.electronAPI.terminal.resize(terminalId, cols, rows);
    
    // Update tracked info
    const terminal = this.activeTerminals.get(terminalId);
    if (terminal) {
      terminal.cols = cols;
      terminal.rows = rows;
    }
  }
  
  // Terminal state
  async getTerminalInfo(terminalId: string): Promise<TerminalInfo | null> {
    return this.activeTerminals.get(terminalId) || null;
  }
  
  async listActiveTerminals(): Promise<TerminalInfo[]> {
    return Array.from(this.activeTerminals.values());
  }
  
  // Event handlers
  onTerminalData(terminalId: string, callback: (data: string) => void): () => void {
    return window.electronAPI.terminal.onData(terminalId, callback);
  }
  
  onTerminalExit(terminalId: string, callback: (code: number) => void): () => void {
    // Current API doesn't have onExit for terminals
    // Would need to be enhanced
    return () => {};
  }
  
  // Session management (for remote) - not used in desktop mode
  async saveTerminalState(terminalId: string): Promise<TerminalState> {
    const info = this.activeTerminals.get(terminalId);
    if (!info) {
      throw new Error(`Terminal ${terminalId} not found`);
    }
    
    return {
      id: terminalId,
      buffer: '', // Would need to get from backend
      cwd: info.cwd,
      env: {}, // Would need to get from backend
      size: {
        cols: info.cols,
        rows: info.rows
      }
    };
  }
  
  async restoreTerminalState(state: TerminalState): Promise<string> {
    // In desktop mode, just create a new terminal with saved settings
    return this.createTerminal({
      cwd: state.cwd,
      cols: state.size.cols,
      rows: state.size.rows,
      env: state.env
    });
  }
}