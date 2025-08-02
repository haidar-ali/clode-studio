/**
 * Terminal service interface
 * Abstracts terminal/PTY operations
 */
export interface ITerminalService {
  // Terminal lifecycle
  createTerminal(options: TerminalOptions): Promise<string>;
  destroyTerminal(terminalId: string): Promise<void>;
  
  // Terminal interaction
  writeToTerminal(terminalId: string, data: string): Promise<void>;
  resizeTerminal(terminalId: string, cols: number, rows: number): Promise<void>;
  
  // Terminal state
  getTerminalInfo(terminalId: string): Promise<TerminalInfo | null>;
  listActiveTerminals(): Promise<TerminalInfo[]>;
  
  // Event handlers
  onTerminalData(terminalId: string, callback: (data: string) => void): () => void;
  onTerminalExit(terminalId: string, callback: (code: number) => void): () => void;
  
  // Session management (for remote)
  saveTerminalState(terminalId: string): Promise<TerminalState>;
  restoreTerminalState(state: TerminalState): Promise<string>;
}

export interface TerminalOptions {
  cwd?: string;
  env?: Record<string, string>;
  shell?: string;
  cols?: number;
  rows?: number;
  userId?: string;
}

export interface TerminalInfo {
  id: string;
  pid: number;
  title?: string;
  cwd: string;
  cols: number;
  rows: number;
  createdAt: Date;
}

export interface TerminalState {
  id: string;
  buffer: string;
  cwd: string;
  env: Record<string, string>;
  size: {
    cols: number;
    rows: number;
  };
  scrollback?: string[];
}