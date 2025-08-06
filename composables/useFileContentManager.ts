import { diffLines, diffWords, diffChars, createPatch, applyPatch, parsePatch } from 'diff';
import type { 
  FileChange, 
  ContentObject, 
  DiffObject, 
  ChangeSummary,
  StorageInfo 
} from '~/types/snapshot';

/**
 * Enhanced file content manager with content-addressable storage and jsdiff integration
 * Uses Electron IPC for filesystem operations (renderer-safe)
 */
export class FileContentManager {
  private projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  /**
   * Generate SHA-256 hash for content (using Web Crypto API)
   */
  private async generateHash(content: string | Uint8Array): Promise<string> {
    const encoder = new TextEncoder();
    const data = typeof content === 'string' ? encoder.encode(content) : content;
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Simple fallback file detection (mainly for frontend use)
   * Note: Primary detection is done on backend using istextorbinary
   */
  private detectFileInfo(filePath: string): {
    mimeType: string;
    encoding: 'utf8' | 'binary';
    isTextFile: boolean;
  } {
    const fileName = filePath.split('/').pop() || '';
    const ext = filePath.split('.').pop()?.toLowerCase() || '';
    
    // Common text file patterns (simplified fallback)
    const textFiles = new Set([
      '.gitignore', '.babelrc', '.eslintrc', '.prettierrc', '.npmrc', '.nvmrc',
      '.editorconfig', '.firebaserc', 'Dockerfile', 'Makefile', 'LICENSE', 'README'
    ]);
    
    const textExtensions = new Set([
      'txt', 'md', 'js', 'ts', 'jsx', 'tsx', 'vue', 'html', 'css', 'scss',
      'json', 'xml', 'yaml', 'yml', 'py', 'java', 'cpp', 'c', 'h', 'php',
      'rb', 'go', 'rs', 'sh', 'sql', 'toml', 'ini', 'cfg', 'log', 'env'
    ]);

    const isTextFile = textFiles.has(fileName) || textExtensions.has(ext);
    
    return {
      mimeType: isTextFile ? 'text/plain' : 'application/octet-stream',
      encoding: isTextFile ? 'utf8' : 'binary',
      isTextFile
    };
  }

  /**
   * Compress content using gzip (via IPC)
   */
  private async compressContent(content: string): Promise<{ compressed: string; ratio: number }> {
    try {
      const result = await window.electronAPI.snapshots.compressContent(content);
      return result;
    } catch (error) {
      console.warn('Compression failed, storing uncompressed:', error);
      return { compressed: content, ratio: 1.0 };
    }
  }

  /**
   * Store content in content-addressable storage (via IPC)
   */
  async storeContent(content: string, mimeType: string, encoding: 'utf8' | 'binary'): Promise<string> {
    const hash = await this.generateHash(content);
    
    // Store via Electron IPC
    const result = await window.electronAPI.snapshots.storeContent({
      hash,
      content,
      mimeType,
      encoding,
      projectPath: this.projectPath
    });
    
    if (result.success) {
      return hash;
    } else {
      throw new Error(`Failed to store content: ${result.error}`);
    }
  }

  /**
   * Retrieve content from storage (via IPC or Socket.IO in remote mode)
   */
  async getContent(hash: string): Promise<string | null> {
    const isRemoteMode = !window.electronAPI;
    
    try {
      if (isRemoteMode) {
        // Remote mode - use Socket.IO
        const { remoteConnection } = await import('~/services/remote-client/RemoteConnectionSingleton');
        
        if (!remoteConnection.isConnected()) {
          throw new Error('Remote connection not available');
        }
        
        const socket = remoteConnection.getSocket();
        if (!socket) {
          throw new Error('Socket not available');
        }
        
        const result = await new Promise<any>((resolve, reject) => {
          const request = {
            id: `req-${Date.now()}`,
            payload: {
              hash,
              projectPath: this.projectPath
            }
          };
          
          socket.emit('snapshot:content', request, (response: any) => {
            if (response.success) {
              resolve(response.data);
            } else {
              reject(new Error(response.error || 'Request failed'));
            }
          });
        });
        
        return result?.content || null;
      } else {
        // Desktop mode - use Electron API
        const result = await window.electronAPI.snapshots.getContent({
          hash,
          projectPath: this.projectPath
        });
        
        if (result.success && result.content) {
          return result.content;
        }
        
        return null;
      }
    } catch (error) {
      console.error(`Failed to get content ${hash}:`, error);
      return null;
    }
  }

  /**
   * Get diff object from storage (via IPC or Socket.IO in remote mode)
   */
  async getDiff(hash: string): Promise<any> {
    const isRemoteMode = !window.electronAPI;
    
    try {
      if (isRemoteMode) {
        // Remote mode - use Socket.IO
        const { remoteConnection } = await import('~/services/remote-client/RemoteConnectionSingleton');
        
        if (!remoteConnection.isConnected()) {
          throw new Error('Remote connection not available');
        }
        
        const socket = remoteConnection.getSocket();
        if (!socket) {
          throw new Error('Socket not available');
        }
        
        const result = await new Promise<any>((resolve, reject) => {
          const request = {
            id: `req-${Date.now()}`,
            payload: {
              hash,
              projectPath: this.projectPath
            }
          };
          
          socket.emit('snapshot:getDiff', request, (response: any) => {
            if (response.success) {
              resolve(response.data);
            } else {
              reject(new Error(response.error || 'Request failed'));
            }
          });
        });
        
        return result;
      } else {
        // Desktop mode - use Electron API
        return await window.electronAPI.snapshots.getDiff({
          hash,
          projectPath: this.projectPath
        });
      }
    } catch (error) {
      console.error(`Failed to get diff ${hash}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Scan project files (via IPC or Socket.IO in remote mode)
   */
  async scanProjectFiles(): Promise<any> {
    const isRemoteMode = !window.electronAPI;
    
    try {
      if (isRemoteMode) {
        // Remote mode - use Socket.IO
        const { remoteConnection } = await import('~/services/remote-client/RemoteConnectionSingleton');
        
        if (!remoteConnection.isConnected()) {
          throw new Error('Remote connection not available');
        }
        
        const socket = remoteConnection.getSocket();
        if (!socket) {
          throw new Error('Socket not available');
        }
        
        const result = await new Promise<any>((resolve, reject) => {
          const request = {
            id: `req-${Date.now()}`,
            payload: {
              projectPath: this.projectPath
            }
          };
          
          socket.emit('snapshot:scanProjectFiles', request, (response: any) => {
            if (response.success) {
              resolve(response.data);
            } else {
              reject(new Error(response.error || 'Request failed'));
            }
          });
        });
        
        return result;
      } else {
        // Desktop mode - use Electron API
        return await window.electronAPI.snapshots.scanProjectFiles({
          projectPath: this.projectPath
        });
      }
    } catch (error) {
      console.error(`Failed to scan project files:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Create and store a diff between two content hashes
   */
  async createDiff(fromHash: string, toHash: string, algorithm: 'myers' | 'words' | 'chars' = 'myers'): Promise<string> {
    const fromContent = await this.getContent(fromHash);
    const toContent = await this.getContent(toHash);
    
    if (!fromContent || !toContent) {
      throw new Error(`Cannot create diff: missing content (from: ${!!fromContent}, to: ${!!toContent})`);
    }

    // Generate diff using jsdiff
    let diffResult;
    switch (algorithm) {
      case 'words':
        diffResult = diffWords(fromContent, toContent);
        break;
      case 'chars':
        diffResult = diffChars(fromContent, toContent);
        break;
      default:
        diffResult = diffLines(fromContent, toContent);
    }

    // Convert to unified diff format
    const unifiedDiff = createPatch('file', fromContent, toContent, 'before', 'after');
    
    // Calculate statistics
    let linesAdded = 0;
    let linesRemoved = 0;
    let chunks = 0;
    
    diffResult.forEach(part => {
      if (part.added) {
        linesAdded += part.value.split('\n').length - 1;
      } else if (part.removed) {
        linesRemoved += part.value.split('\n').length - 1;
      }
    });
    
    chunks = diffResult.filter(part => part.added || part.removed).length;

    // Create diff object
    const diffObject: DiffObject = {
      id: `diff_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      algorithm,
      fromHash,
      toHash,
      diffContent: unifiedDiff,
      stats: { linesAdded, linesRemoved, chunks },
      createdAt: new Date().toISOString(),
      sizeBytes: new TextEncoder().encode(unifiedDiff).length
    };

    // Store diff via IPC
    const diffHash = await this.generateHash(JSON.stringify(diffObject));
    const result = await window.electronAPI.snapshots.storeDiff({
      hash: diffHash,
      diffObject,
      projectPath: this.projectPath
    });
    
    if (result.success) {
      return diffHash;
    } else {
      throw new Error(`Failed to store diff: ${result.error}`);
    }
  }

  /**
   * Apply a diff to reconstruct content
   */
  async applyDiff(diffHash: string): Promise<string | null> {
    try {
      const result = await window.electronAPI.snapshots.getDiff({
        hash: diffHash,
        projectPath: this.projectPath
      });
      
      if (!result.success || !result.diffObject) {
        return null;
      }

      const diffObject: DiffObject = result.diffObject;
      const fromContent = await this.getContent(diffObject.fromHash);
      
      if (!fromContent) {
        return null;
      }

      // Apply the diff using jsdiff
      const patches = parsePatch(diffObject.diffContent);
      if (patches.length === 0) {
        return fromContent;
      }

      const applied = applyPatch(fromContent, patches[0]);
      return applied || fromContent;
    } catch (error) {
      console.error(`Failed to apply diff ${diffHash}:`, error);
      return null;
    }
  }

  /**
   * Scan project directory for file changes (via IPC)
   */
  async scanFileChanges(previousSnapshot?: { fileChanges?: { added: FileChange[]; modified: FileChange[]; removed: FileChange[] } }): Promise<{
    added: FileChange[];
    modified: FileChange[];
    removed: FileChange[];
    summary: ChangeSummary;
  }> {
    try {
      // Get current project files via IPC
      const currentFilesResult = await window.electronAPI.snapshots.scanProjectFiles({
        projectPath: this.projectPath
      });
      
      if (!currentFilesResult.success) {
        throw new Error(`Failed to scan files: ${currentFilesResult.error}`);
      }

      const currentFiles = currentFilesResult.files || [];
      const previousFiles = new Map<string, FileChange>();
      
      // Build map of previous files
      if (previousSnapshot?.fileChanges) {
        // Include ALL files from previous snapshot, not just added/modified
        [...previousSnapshot.fileChanges.added, ...previousSnapshot.fileChanges.modified]
          .forEach(file => previousFiles.set(file.path, file));
        
        // IMPORTANT: Also include files that were unchanged in the previous snapshot
        // These would have been in the snapshot before that
        // For now, we'll need to track these separately in future snapshots
      }

      const added: FileChange[] = [];
      const modified: FileChange[] = [];
      const removed: FileChange[] = [];
      const unchanged: FileChange[] = [];
      
      let totalLinesAdded = 0;
      let totalLinesRemoved = 0;
      let totalBytesChanged = 0;
      let textFileCount = 0;
      let binaryFileCount = 0;

      // Check current files
      for (const fileInfo of currentFiles) {
        const relativePath = fileInfo.relativePath;
        const previousFile = previousFiles.get(relativePath);
        
        try {
          // Use the backend's istextorbinary detection results (from scanProjectFiles)
          // Don't override with frontend fallback detection
          
          // For binary files, convert base64 back to binary for hashing
          let contentForHash: string | Uint8Array;
          if (fileInfo.isTextFile) {
            contentForHash = fileInfo.content;
          } else {
            // Convert base64 to Uint8Array for binary files
            const binaryString = atob(fileInfo.content);
            contentForHash = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              contentForHash[i] = binaryString.charCodeAt(i);
            }
          }
          
          const contentHash = await this.generateHash(contentForHash);

          if (!previousFile) {
            // New file - use backend detection results
            const fileChange: FileChange = {
              path: relativePath,
              status: 'added',
              contentHash,
              size: fileInfo.size,
              mimeType: 'text/plain', // Will be properly set by backend during storage
              encoding: fileInfo.encoding,
              isTextFile: fileInfo.isTextFile // Use backend's istextorbinary result
            };
            
            added.push(fileChange);
            await this.storeContent(fileInfo.content, 'text/plain', fileInfo.encoding);
            
            totalBytesChanged += fileInfo.size;
            if (fileInfo.isTextFile) {
              textFileCount++;
              totalLinesAdded += fileInfo.content.split('\n').length;
            } else {
              binaryFileCount++;
            }
          } else if (previousFile.contentHash !== contentHash) {
            // Modified file - use backend detection results
            const fileChange: FileChange = {
              path: relativePath,
              status: 'modified',
              contentHash,
              previousHash: previousFile.contentHash,
              size: fileInfo.size,
              mimeType: 'text/plain', // Will be properly set by backend during storage
              encoding: fileInfo.encoding,
              isTextFile: fileInfo.isTextFile // Use backend's istextorbinary result
            };

            // Store the new content first
            await this.storeContent(fileInfo.content, 'text/plain', fileInfo.encoding);
            
            // Create diff for text files
            if (fileInfo.isTextFile && previousFile.contentHash) {
              try {
                // First check if we can get the previous content
                const prevContent = await this.getContent(previousFile.contentHash);
                if (prevContent) {
                  const diffHash = await this.createDiff(previousFile.contentHash, contentHash);
                  fileChange.diffHash = diffHash;
                  
                  // Get diff stats
                  const lines = fileInfo.content.split('\n').length;
                  const prevLines = prevContent.split('\n').length;
                  totalLinesAdded += Math.max(0, lines - prevLines);
                  totalLinesRemoved += Math.max(0, prevLines - lines);
                } else {
                  // Previous content not available, just count as added lines
                  const lines = fileInfo.content.split('\n').length;
                  totalLinesAdded += lines;
                }
              } catch (error) {
                console.warn(`Failed to create diff for ${relativePath}:`, error);
              }
            }
            
            modified.push(fileChange);
            
            totalBytesChanged += Math.abs(fileInfo.size - (previousFile.size || 0));
            if (fileInfo.isTextFile) {
              textFileCount++;
            } else {
              binaryFileCount++;
            }
          } else {
            // Unchanged file - track it with 'unchanged' status
            const fileChange: FileChange = {
              path: relativePath,
              status: 'unchanged',
              contentHash: previousFile.contentHash, // Use the existing hash
              previousHash: previousFile.contentHash,
              size: fileInfo.size,
              mimeType: 'text/plain', // Use simple default since unchanged
              encoding: fileInfo.encoding,
              isTextFile: fileInfo.isTextFile // Use backend's istextorbinary result
            };
            
            unchanged.push(fileChange);
            // Note: We don't need to store content again since it hasn't changed
          }
          
          // Remove from previous files map
          previousFiles.delete(relativePath);
        } catch (error) {
          console.warn(`Failed to process file ${fileInfo.fullPath}:`, error);
        }
      }

      // Remaining files in previousFiles are removed
      for (const [relativePath, previousFile] of previousFiles) {
        removed.push({
          path: relativePath,
          status: 'removed',
          previousHash: previousFile.contentHash,
          size: previousFile.size || 0,
          mimeType: previousFile.mimeType,
          encoding: previousFile.encoding,
          isTextFile: previousFile.isTextFile
        });
        
        totalBytesChanged += previousFile.size || 0;
        if (previousFile.isTextFile) {
          textFileCount++;
          // For removed files, count all lines as removed (rough estimate)
          totalLinesRemoved += Math.ceil((previousFile.size || 0) / 50);
        } else {
          binaryFileCount++;
        }
      }

      const summary: ChangeSummary = {
        filesChanged: added.length + modified.length + removed.length, // Only count actual changes
        linesAdded: totalLinesAdded,
        linesRemoved: totalLinesRemoved,
        bytesChanged: totalBytesChanged,
        textFiles: textFileCount,
        binaryFiles: binaryFileCount
      };

      // Include unchanged files in modified array for complete snapshot data
      const allModified = [...modified, ...unchanged];

      return { added, modified: allModified, removed, summary };
    } catch (error) {
      console.error('Failed to scan file changes:', error);
      throw error;
    }
  }

  /**
   * Get storage statistics (via IPC)
   */
  async getStorageInfo(): Promise<StorageInfo> {
    try {
      const result = await window.electronAPI.snapshots.getStorageInfo({
        projectPath: this.projectPath
      });
      
      if (result.success) {
        return result.storageInfo;
      } else {
        throw new Error(`Failed to get storage info: ${result.error}`);
      }
    } catch (error) {
      console.error('Failed to get storage info:', error);
      return {
        totalSnapshots: 0,
        totalSizeKb: 0,
        totalContentSizeKb: 0,
        compressionRatio: 0,
        deduplicationSavings: 0,
        oldestSnapshot: new Date().toISOString(),
        newestSnapshot: new Date().toISOString(),
        storageDirectory: ''
      };
    }
  }

  /**
   * Restore files from a file changes object (via IPC)
   */
  async restoreFiles(fileChanges: { added: FileChange[]; modified: FileChange[]; removed: FileChange[] }): Promise<void> {
    try {
      // Create a clean serializable copy of fileChanges
      const serializedFileChanges = {
        added: fileChanges.added.map(f => ({
          path: f.path,
          status: f.status,
          contentHash: f.contentHash,
          previousHash: f.previousHash,
          diffHash: f.diffHash,
          size: f.size,
          mimeType: f.mimeType,
          encoding: f.encoding,
          isTextFile: f.isTextFile
        })),
        modified: fileChanges.modified.map(f => ({
          path: f.path,
          status: f.status,
          contentHash: f.contentHash,
          previousHash: f.previousHash,
          diffHash: f.diffHash,
          size: f.size,
          mimeType: f.mimeType,
          encoding: f.encoding,
          isTextFile: f.isTextFile
        })),
        removed: fileChanges.removed.map(f => ({
          path: f.path,
          status: f.status,
          contentHash: f.contentHash,
          previousHash: f.previousHash,
          diffHash: f.diffHash,
          size: f.size,
          mimeType: f.mimeType,
          encoding: f.encoding,
          isTextFile: f.isTextFile
        }))
      };
      
      const result = await window.electronAPI.snapshots.restoreFiles({
        fileChanges: serializedFileChanges,
        projectPath: this.projectPath
      });
      
      if (!result.success) {
        throw new Error(`Failed to restore files: ${result.error}`);
      }
    } catch (error) {
      console.error('Failed to restore files:', error);
      throw error;
    }
  }

  /**
   * Cleanup old content objects (via IPC)
   */
  async cleanup(olderThanDays: number = 30): Promise<{ removed: number; sizeFreed: number }> {
    try {
      const result = await window.electronAPI.snapshots.cleanup({
        projectPath: this.projectPath,
        olderThanDays
      });
      
      return result.success ? result.stats : { removed: 0, sizeFreed: 0 };
    } catch (error) {
      console.error('Failed to cleanup storage:', error);
      return { removed: 0, sizeFreed: 0 };
    }
  }

  // Public method for accessing getDiffPath (for UI components)
  getDiffPath(hash: string): string {
    // This is a helper method for UI components that need the path structure
    // In the IPC version, this is handled internally by the main process
    return `diff_${hash}`;
  }
}

/**
 * Composable for file content management
 */
export function useFileContentManager(projectPath?: string) {
  const workspace = useWorkspaceStore();
  const currentPath = projectPath || workspace.currentPath || '';
  
  if (!currentPath) {
    throw new Error('No project path available for file content manager');
  }
  
  const manager = new FileContentManager(currentPath);
  
  return {
    manager,
    scanFileChanges: manager.scanFileChanges.bind(manager),
    storeContent: manager.storeContent.bind(manager),
    getContent: manager.getContent.bind(manager),
    getDiff: manager.getDiff.bind(manager),
    scanProjectFiles: manager.scanProjectFiles.bind(manager),
    createDiff: manager.createDiff.bind(manager),
    applyDiff: manager.applyDiff.bind(manager),
    restoreFiles: manager.restoreFiles.bind(manager),
    getStorageInfo: manager.getStorageInfo.bind(manager),
    cleanup: manager.cleanup.bind(manager)
  };
}