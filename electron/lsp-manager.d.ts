export interface LSPManager {
  getServerForFile(filepath: string): Promise<any | null>;
  detectLanguage(filepath: string): string | null;
  startServer(language: string): Promise<any>;
  getCompletions(filepath: string, content: string, position: { line: number; character: number }, context?: { triggerKind?: number; triggerCharacter?: string } | null): Promise<any[]>;
  getHover(filepath: string, content: string, position: { line: number; character: number }): Promise<any | null>;
  getDefinition(filepath: string, content: string, position: { line: number; character: number }): Promise<any | null>;
  getDocumentSymbols(filepath: string, content: string): Promise<any[]>;
  shutdown(): Promise<void>;
  checkServerAvailable(language: string): Promise<boolean>;
  getAvailableServers(): Promise<Array<{ language: string; command: string; languages: string[] }>>;
  getConnectedServers(): string[];
}

export declare const lspManager: LSPManager;