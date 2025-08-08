/**
 * File system service interface
 * Abstracts file operations for different providers
 */
export interface IFileService {
  // File operations
  readFile(filePath: string): Promise<string>;
  writeFile(filePath: string, content: string): Promise<void>;
  deleteFile(filePath: string): Promise<void>;
  renameFile(oldPath: string, newPath: string): Promise<void>;
  fileExists(filePath: string): Promise<boolean>;
  
  // Directory operations
  readDirectory(dirPath: string): Promise<DirectoryEntry[]>;
  createDirectory(dirPath: string): Promise<void>;
  deleteDirectory(dirPath: string): Promise<void>;
  
  // File metadata
  getFileStats(filePath: string): Promise<FileStats>;
  
  // Search operations
  searchFiles(pattern: string, options?: SearchOptions): Promise<SearchResult[]>;
  
  // Watch operations
  watchFile(filePath: string, callback: FileWatchCallback): Promise<() => void>;
  watchDirectory(dirPath: string, callback: DirectoryWatchCallback): Promise<() => void>;
}

export interface DirectoryEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  modified?: Date;
}

export interface FileStats {
  size: number;
  created: Date;
  modified: Date;
  isDirectory: boolean;
  isFile: boolean;
}

export interface SearchOptions {
  include?: string[];
  exclude?: string[];
  maxResults?: number;
  caseSensitive?: boolean;
}

export interface SearchResult {
  path: string;
  line: number;
  column: number;
  match: string;
  preview: string;
}

export type FileWatchCallback = (event: 'change' | 'delete', filePath: string) => void;
export type DirectoryWatchCallback = (event: 'add' | 'change' | 'delete', filePath: string) => void;