/**
 * Desktop file service implementation
 * Wraps existing Electron FS IPC APIs
 */
import type {
  IFileService,
  DirectoryEntry,
  FileStats,
  SearchOptions,
  SearchResult,
  FileWatchCallback,
  DirectoryWatchCallback
} from '../../interfaces';

export class DesktopFileService implements IFileService {
  // File operations
  async readFile(filePath: string): Promise<string> {
    return window.electronAPI.fs.readFile(filePath);
  }
  
  async writeFile(filePath: string, content: string): Promise<void> {
    return window.electronAPI.fs.writeFile(filePath, content);
  }
  
  async deleteFile(filePath: string): Promise<void> {
    return window.electronAPI.fs.delete(filePath);
  }
  
  async renameFile(oldPath: string, newPath: string): Promise<void> {
    return window.electronAPI.fs.rename(oldPath, newPath);
  }
  
  async fileExists(filePath: string): Promise<boolean> {
    return window.electronAPI.fs.exists(filePath);
  }
  
  // Directory operations
  async readDirectory(dirPath: string): Promise<DirectoryEntry[]> {
    const entries = await window.electronAPI.fs.readDir(dirPath);
    // Map to our interface format
    return entries.map((entry: any) => ({
      name: entry.name,
      path: entry.path,
      isDirectory: entry.isDirectory,
      size: entry.size,
      modified: entry.modified ? new Date(entry.modified) : undefined
    }));
  }
  
  async createDirectory(dirPath: string): Promise<void> {
    return window.electronAPI.fs.ensureDir(dirPath);
  }
  
  async deleteDirectory(dirPath: string): Promise<void> {
    return window.electronAPI.fs.delete(dirPath);
  }
  
  // File metadata
  async getFileStats(filePath: string): Promise<FileStats> {
    // The current API doesn't have a dedicated stats method
    // We'll need to check if it exists and get basic info
    const exists = await this.fileExists(filePath);
    if (!exists) {
      throw new Error(`File not found: ${filePath}`);
    }
    
    // For now, return basic stats
    // In phase 2, we might need to enhance the Electron API
    return {
      size: 0, // Would need enhancement
      created: new Date(),
      modified: new Date(),
      isDirectory: false, // Would need enhancement
      isFile: true
    };
  }
  
  // Search operations
  async searchFiles(pattern: string, options?: SearchOptions): Promise<SearchResult[]> {
    const searchOptions = {
      query: pattern,
      caseSensitive: options?.caseSensitive,
      includePattern: options?.include?.join(','),
      excludePattern: options?.exclude?.join(','),
      maxResults: options?.maxResults
    };
    
    const results = await window.electronAPI.search.findInFiles(searchOptions);
    
    // Map to our interface format
    return results.map((result: any) => ({
      path: result.filePath,
      line: result.line,
      column: result.column,
      match: result.match,
      preview: result.preview
    }));
  }
  
  // Watch operations
  async watchFile(filePath: string, callback: FileWatchCallback): Promise<() => void> {
    await window.electronAPI.fs.watchFile(filePath);
    
    // Set up the callback
    const handler = (data: { path: string; content: string }) => {
      if (data.path === filePath) {
        callback('change', filePath);
      }
    };
    
    window.electronAPI.fs.onFileChanged(handler);
    
    // Return cleanup function
    return async () => {
      await window.electronAPI.fs.unwatchFile(filePath);
      window.electronAPI.fs.removeFileChangeListener();
    };
  }
  
  async watchDirectory(dirPath: string, callback: DirectoryWatchCallback): Promise<() => void> {
    await window.electronAPI.fs.watchDirectory(dirPath);
    
    // Set up the callback
    const handler = (data: { path: string; eventType: string; filename: string }) => {
      if (data.path === dirPath) {
        const event = data.eventType === 'rename' ? 'add' : 
                      data.eventType === 'change' ? 'change' : 'delete';
        callback(event as any, data.filename);
      }
    };
    
    window.electronAPI.fs.onDirectoryChanged(handler);
    
    // Return cleanup function
    return async () => {
      await window.electronAPI.fs.unwatchDirectory(dirPath);
      window.electronAPI.fs.removeDirectoryChangeListener();
    };
  }
}