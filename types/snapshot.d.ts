// Enhanced snapshot types for Claude Code IDE with file content support
export interface ClaudeSnapshot {
  id: string;
  name: string;
  timestamp: string;
  projectPath: string;
  
  // Lightweight state (no file content)
  openFiles: string[];
  activeFile: string | null;
  cursorPositions: Record<string, { line: number; column: number }>;
  
  // Git reference (not full copy)
  gitCommit: string;
  gitBranch: string;
  dirtyFiles: string[]; // Just paths, not content
  
  // Claude state references
  claudeInstances: Array<{
    id: string;
    personality: string;
    lastMessageCount: number; // Reference, not full history
  }>;
  
  // Task references
  activeTaskIds: string[];
  taskCounts: {
    todo: number;
    inProgress: number;
    done: number;
  };
  
  // Enhanced: File content tracking (optional for backward compatibility)
  fileChanges?: {
    added: FileChange[];
    modified: FileChange[];
    removed: FileChange[];
    unchanged?: FileChange[]; // Files that haven't changed but need tracking
    summary: ChangeSummary;
  };
  
  // Enhanced: Storage references (optional)
  contentStorage?: {
    objectHashes: string[];        // Content-addressable storage hashes
    compressionRatio: number;      // Storage efficiency metric
    totalContentSize: number;     // Uncompressed size in bytes
  };
  
  // Metadata
  sizeKb: number;
  createdBy: 'manual' | 'auto-branch' | 'auto-timer' | 'auto-event' | 'auto-checkpoint';
  tags?: string[];
}

// File change tracking
export interface FileChange {
  path: string;
  status: 'added' | 'modified' | 'removed' | 'unchanged';
  contentHash?: string;           // SHA-256 hash for content addressing
  previousHash?: string;          // Previous content hash (for modified files)
  diffHash?: string;              // Hash of diff object (for modified files)
  size: number;                   // File size in bytes
  mimeType: string;              // Detected MIME type
  encoding: 'utf8' | 'binary';   // File encoding
  isTextFile: boolean;           // Whether file is text (supports diffing)
}

// Change summary statistics
export interface ChangeSummary {
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
  bytesChanged: number;
  textFiles: number;
  binaryFiles: number;
}

// Diff object stored in content-addressable storage
export interface DiffObject {
  id: string;                     // Unique diff identifier
  algorithm: 'myers' | 'words' | 'chars';
  fromHash: string;              // Source content hash
  toHash: string;                // Target content hash
  diffContent: string;           // Compressed unified diff
  stats: {
    linesAdded: number;
    linesRemoved: number;
    chunks: number;
  };
  createdAt: string;
  sizeBytes: number;
}

// Content object in storage
export interface ContentObject {
  hash: string;                  // SHA-256 content hash
  content: Buffer;               // Compressed content
  originalSize: number;          // Uncompressed size
  compressionAlgorithm: 'gzip' | 'deflate' | 'none';
  mimeType: string;
  encoding: 'utf8' | 'binary';
  createdAt: string;
}

export interface SnapshotDiff {
  filesChanged: string[];
  branchChanged: boolean;
  commitChanged: boolean;
  tasksChanged: boolean;
  claudeInstancesChanged: boolean;
}

export interface SnapshotConfig {
  maxSnapshots: number;
  maxSizeMb: number;
  autoCleanupDays: number;
  autoSnapshotInterval?: number; // milliseconds
  enableAutoSnapshots: boolean;
  enableClaudePromptSnapshots?: boolean; // Auto-snapshot on Claude prompts
}

export interface SnapshotQuickAction {
  id: string;
  name: string;
  icon: string;
  action: 'capture' | 'restore' | 'delete' | 'compare';
  hotkey?: string;
}

// Enhanced restoration options
export interface RestoreOptions {
  includeFiles?: string[];           // Specific files to restore (default: all)
  excludeFiles?: string[];           // Files to skip during restoration
  restoreMode: 'full' | 'ide-only' | 'files-only' | 'selective';
  confirmOverwrites: boolean;        // Ask before overwriting modified files
  createBackup: boolean;             // Create backup before restoration
  restoreFileContent: boolean;       // Whether to restore file content
  restoreIdeState: boolean;          // Whether to restore IDE state
}

// Change analysis for restoration planning
export interface ChangeAnalysis {
  riskLevel: 'low' | 'medium' | 'high';
  affectedFiles: string[];
  potentialConflicts: string[];      // Files that may conflict with current state
  estimatedRestoreTime: number;     // Estimated time in milliseconds
  storageRequirement: number;       // Required disk space in bytes
  warnings: string[];               // User warnings before restoration
}

// Enhanced diff comparison
export interface EnhancedSnapshotDiff extends SnapshotDiff {
  fileContentChanges?: {
    added: FileChange[];
    modified: FileChange[];
    removed: FileChange[];
    summary: ChangeSummary;
  };
  contentSizeChange: number;         // Change in content size (bytes)
  compressionEfficiency: number;    // Storage efficiency comparison
}

// Storage analytics
export interface StorageInfo {
  totalSnapshots: number;
  totalSizeKb: number;
  totalContentSizeKb: number;
  compressionRatio: number;          // Average compression across all content
  deduplicationSavings: number;     // Bytes saved through deduplication
  oldestSnapshot: string;           // ISO date string
  newestSnapshot: string;           // ISO date string
  storageDirectory: string;         // Full path to storage
}