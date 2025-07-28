import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import type { GitFileStatus } from '~/types/git';

export interface FileSnapshot {
  path: string;
  content: string;
  modified: number;
  hash: string;
}

export interface GitSnapshot {
  branch: string;
  commit: string;
  status: GitFileStatus[];
  uncommittedChanges: string[];
  ahead: number;
  behind: number;
}

export interface IDESnapshot {
  openFiles: string[];
  activeFile: string | null;
  cursorPositions: Record<string, { line: number; column: number }>;
  scrollPositions: Record<string, number>;
  selectedText: Record<string, string>;
  terminalState: {
    claudeInstances: Array<{
      id: string;
      personality: string;
      messages: any[];
    }>;
    activeInstanceId: string | null;
  };
  taskState: {
    columns: any[];
    taskOrder: Record<string, string[]>;
  };
}

export interface CheckpointMetadata {
  id: string;
  name: string;
  description?: string;
  timestamp: string;
  projectPath: string;
  trigger: 'manual' | 'auto-git' | 'auto-risky' | 'auto-time' | 'auto-error';
  tags: string[];
  stats: {
    fileCount: number;
    totalSize: number;
    duration?: number;
  };
}

export interface CheckpointV2 extends CheckpointMetadata {
  files: FileSnapshot[];
  git: GitSnapshot | null;
  ide: IDESnapshot;
  contextMessages: any[];
  knowledge: {
    entries: any[];
    insights: any[];
  };
}

export interface CheckpointDiff {
  filesAdded: string[];
  filesRemoved: string[];
  filesModified: string[];
  gitChanges: {
    branchChanged: boolean;
    commitChanged: boolean;
    uncommittedChanges: number;
  };
}

export const useCheckpointV2Store = defineStore('checkpoint-v2', () => {
  // State
  const checkpoints = ref<CheckpointV2[]>([]);
  const isCreating = ref(false);
  const isRestoring = ref(false);
  const lastCheckpointTime = ref<Date | null>(null);
  const autoCheckpointEnabled = ref(true);
  const autoCheckpointInterval = ref(300000); // 5 minutes
  const maxCheckpoints = ref(50);
  
  // Shadow repository path for storing checkpoints
  const shadowRepoPath = ref('');

  // Computed
  const sortedCheckpoints = computed(() => 
    [...checkpoints.value].sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )
  );

  const totalCheckpointSize = computed(() =>
    checkpoints.value.reduce((sum, cp) => sum + cp.stats.totalSize, 0)
  );

  const checkpointsByTrigger = computed(() => {
    const groups: Record<string, CheckpointV2[]> = {};
    checkpoints.value.forEach(cp => {
      if (!groups[cp.trigger]) groups[cp.trigger] = [];
      groups[cp.trigger].push(cp);
    });
    return groups;
  });

  // Methods
  async function captureFileSnapshots(): Promise<FileSnapshot[]> {
    const snapshots: FileSnapshot[] = [];
    
    try {
      // Get workspace path
      const workspacePath = shadowRepoPath.value.replace('/.claude-checkpoints', '');
      if (!workspacePath) {
        console.error('No workspace path available');
        return snapshots;
      }

      // Get all tracked files from git
      const gitStatus = await window.electronAPI.git.status();
      if (!gitStatus.success || !gitStatus.data) return snapshots;
      
      // Debug: log the git status structure
      console.log('Git status data:', gitStatus.data);
      
      // Safely extract file paths
      const files = gitStatus.data.files || [];
      const notAdded = gitStatus.data.not_added || gitStatus.data.untracked || [];
      
      // The files array contains objects, not the file objects themselves
      // We need to extract just the path strings
      const filePaths: string[] = [];
      
      // Process files array - these are file objects from simple-git
      if (Array.isArray(files)) {
        files.forEach(f => {
          if (typeof f === 'string') {
            filePaths.push(f);
          } else if (f && typeof f === 'object' && 'path' in f) {
            filePaths.push(f.path);
          }
        });
      }
      
      // Add untracked files (these should be strings)
      if (Array.isArray(notAdded)) {
        notAdded.forEach(f => {
          if (typeof f === 'string') {
            filePaths.push(f);
          }
        });
      }
      
      // Remove duplicates
      const allFiles = [...new Set(filePaths)];
      
      // Read each file
      for (const filePath of allFiles) {
        try {
          // Make absolute path if relative
          const absolutePath = filePath.startsWith('/') ? filePath : `${workspacePath}/${filePath}`;
          const content = await window.electronAPI.fs.readFile(absolutePath);
          if (content.success && content.content) {
            const hash = await createHash(content.content);
            snapshots.push({
              path: filePath, // Store relative path
              content: content.content,
              modified: Date.now(),
              hash
            });
          }
        } catch (err) {
          console.warn(`Failed to snapshot file ${filePath}:`, err);
        }
      }
    } catch (error) {
      console.error('Failed to capture file snapshots:', error);
    }
    
    return snapshots;
  }

  async function captureGitSnapshot(): Promise<GitSnapshot | null> {
    try {
      const status = await window.electronAPI.git.status();
      const branches = await window.electronAPI.git.getBranches();
      const log = await window.electronAPI.git.getLog(1);
      
      if (!status.success || !status.data) return null;
      
      // Extract file changes safely
      const files = status.data.files || [];
      const uncommittedChanges = Array.isArray(files) 
        ? files.map(f => `${f.index || f.status || '?'} ${f.path}`)
        : [];
      
      // Get current commit info
      const currentCommit = log?.success && log?.data?.[0]?.hash || 'unknown';
      
      return {
        branch: status.data.current || 'unknown',
        commit: currentCommit,
        status: files,
        uncommittedChanges,
        ahead: status.data.ahead || 0,
        behind: status.data.behind || 0
      };
    } catch (error) {
      console.error('Failed to capture git snapshot:', error);
      return null;
    }
  }

  async function captureIDESnapshot(): Promise<IDESnapshot> {
    const { useEditorStore } = await import('~/stores/editor');
    const { useClaudeInstancesStore } = await import('~/stores/claude-instances');
    const { useTasksStore } = await import('~/stores/tasks');
    
    const editorStore = useEditorStore();
    const claudeStore = useClaudeInstancesStore();
    const tasksStore = useTasksStore();
    
    // Safely get claude instances
    const instances = Array.isArray(claudeStore.instances) 
      ? claudeStore.instances 
      : (claudeStore.instances && typeof claudeStore.instances === 'object' 
        ? Object.values(claudeStore.instances) 
        : []);
    
    return {
      openFiles: Array.isArray(editorStore.tabs) ? editorStore.tabs.map(t => t.path) : [],
      activeFile: editorStore.activeTab?.path || null,
      cursorPositions: editorStore.getCursorPositions ? editorStore.getCursorPositions() : {},
      scrollPositions: editorStore.getScrollPositions ? editorStore.getScrollPositions() : {},
      selectedText: {},
      terminalState: {
        claudeInstances: instances.map(instance => ({
          id: instance.id,
          personality: instance.personality,
          messages: instance.messages || []
        })),
        activeInstanceId: claudeStore.activeInstanceId
      },
      taskState: {
        columns: tasksStore.columns || [],
        taskOrder: tasksStore.taskOrder || []
      }
    };
  }

  async function createCheckpoint(
    name: string,
    trigger: CheckpointV2['trigger'] = 'manual',
    description?: string,
    tags: string[] = []
  ): Promise<CheckpointV2 | null> {
    if (isCreating.value) return null;
    
    isCreating.value = true;
    const startTime = Date.now();
    
    try {
      // Capture all state
      const [files, git, ide] = await Promise.all([
        captureFileSnapshots(),
        captureGitSnapshot(),
        captureIDESnapshot()
      ]);
      
      // Ensure files is an array
      const fileSnapshots = files || [];
      
      // Get context messages
      const { useContextStore } = await import('~/stores/context');
      const contextStore = useContextStore();
      const contextMessages = contextStore.getContextMessages?.() || [];
      
      // Get knowledge entries
      const { useKnowledgeStore } = await import('~/stores/knowledge');
      const knowledgeStore = useKnowledgeStore();
      const knowledge = {
        entries: knowledgeStore.entries || [],
        insights: [] // insights not implemented yet
      };
      
      // Calculate stats
      const totalSize = fileSnapshots.reduce((sum, f) => sum + (f.content?.length || 0), 0);
      
      // Create checkpoint
      const checkpoint: CheckpointV2 = {
        id: `cp-v2-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: name || `Checkpoint ${new Date().toLocaleString()}`,
        description,
        timestamp: new Date().toISOString(),
        projectPath: shadowRepoPath.value.replace('/.claude-checkpoints', ''),
        trigger,
        tags,
        stats: {
          fileCount: fileSnapshots.length,
          totalSize,
          duration: Date.now() - startTime
        },
        files: fileSnapshots,
        git,
        ide,
        contextMessages,
        knowledge
      };
      
      // Add to store
      checkpoints.value.push(checkpoint);
      lastCheckpointTime.value = new Date();
      
      // Save to shadow repository
      await saveToShadowRepo(checkpoint);
      
      // Enforce max checkpoints limit
      await enforceCheckpointLimit();
      
      return checkpoint;
    } catch (error) {
      console.error('Failed to create checkpoint:', error);
      return null;
    } finally {
      isCreating.value = false;
    }
  }

  async function restoreCheckpoint(checkpointId: string): Promise<boolean> {
    if (isRestoring.value) return false;
    
    const checkpoint = checkpoints.value.find(cp => cp.id === checkpointId);
    if (!checkpoint) return false;
    
    isRestoring.value = true;
    
    try {
      // Create a backup checkpoint before restoring
     /* await createCheckpoint(
        `Pre-restore backup (${checkpoint.name})`,
        'manual',
        'Automatic backup before checkpoint restoration'
      );*/ 
      
      // Get workspace path
      const workspacePath = shadowRepoPath.value.replace('/.claude-checkpoints', '');
      
      // Restore files
      for (const file of checkpoint.files) {
        // Make absolute path if relative
        const absolutePath = file.path.startsWith('/') ? file.path : `${workspacePath}/${file.path}`;
        await window.electronAPI.fs.writeFile(absolutePath, file.content);
      }
      
      // Restore IDE state
      const { useEditorStore } = await import('~/stores/editor');
      const { useClaudeInstancesStore } = await import('~/stores/claude-instances');
      const { useTasksStore } = await import('~/stores/tasks');
      
      const editorStore = useEditorStore();
      const claudeStore = useClaudeInstancesStore();
      const tasksStore = useTasksStore();
      
      // Restore open files
      await editorStore.closeAllTabs();
      for (const filePath of checkpoint.ide.openFiles) {
        await editorStore.openFile(filePath);
      }
      
      // Restore active file
      if (checkpoint.ide.activeFile) {
        const tab = editorStore.tabs.find(t => t.path === checkpoint.ide.activeFile);
        if (tab) editorStore.setActiveTab(tab.id);
      }
      
      // Restore cursor positions
      editorStore.restoreCursorPositions(checkpoint.ide.cursorPositions);
      
      // Restore Claude instances
      claudeStore.restoreInstances(checkpoint.ide.terminalState.claudeInstances);
      if (checkpoint.ide.terminalState.activeInstanceId) {
        claudeStore.setActiveInstance(checkpoint.ide.terminalState.activeInstanceId);
      }
      
      // Restore tasks
      tasksStore.restoreState({
        columns: checkpoint.ide.taskState.columns,
        taskOrder: checkpoint.ide.taskState.taskOrder
      });
      
      // Restore context messages
      const { useContextStore } = await import('~/stores/context');
      const contextStore = useContextStore();
      contextStore.restoreMessages(checkpoint.contextMessages);
      
      return true;
    } catch (error) {
      console.error('Failed to restore checkpoint:', error);
      return false;
    } finally {
      isRestoring.value = false;
    }
  }

  async function deleteCheckpoint(checkpointId: string): Promise<boolean> {
    try {
      const index = checkpoints.value.findIndex(cp => cp.id === checkpointId);
      if (index === -1) return false;
      
      const checkpoint = checkpoints.value[index];
      
      // Remove from shadow repo
      await removeFromShadowRepo(checkpoint);
      
      // Remove from store
      checkpoints.value.splice(index, 1);
      
      return true;
    } catch (error) {
      console.error('Failed to delete checkpoint:', error);
      return false;
    }
  }

  async function compareCheckpoints(id1: string, id2: string): Promise<CheckpointDiff | null> {
    const cp1 = checkpoints.value.find(cp => cp.id === id1);
    const cp2 = checkpoints.value.find(cp => cp.id === id2);
    
    if (!cp1 || !cp2) return null;
    
    const files1 = new Set(cp1.files.map(f => f.path));
    const files2 = new Set(cp2.files.map(f => f.path));
    
    const filesAdded = [...files2].filter(f => !files1.has(f));
    const filesRemoved = [...files1].filter(f => !files2.has(f));
    
    const filesModified: string[] = [];
    for (const file1 of cp1.files) {
      const file2 = cp2.files.find(f => f.path === file1.path);
      if (file2 && file1.hash !== file2.hash) {
        filesModified.push(file1.path);
      }
    }
    
    return {
      filesAdded,
      filesRemoved,
      filesModified,
      gitChanges: {
        branchChanged: cp1.git?.branch !== cp2.git?.branch,
        commitChanged: cp1.git?.commit !== cp2.git?.commit,
        uncommittedChanges: (cp2.git?.uncommittedChanges.length || 0) - (cp1.git?.uncommittedChanges.length || 0)
      }
    };
  }

  // Shadow repository management
  async function initializeShadowRepo(): Promise<void> {
    if (!shadowRepoPath.value) {
      console.warn('No shadow repo path set, skipping initialization');
      return;
    }
    
    try {
      
      
      // Create .claude-checkpoints directory
      await window.electronAPI.fs.ensureDir(shadowRepoPath.value);
      
      // Update .gitignore in parent directory to ignore our directories (only if not already ignored)
      const workspacePath = shadowRepoPath.value.replace('/.claude-checkpoints', '');
      
      // Check which paths are already ignored by git
      const pathsToCheck = ['.claude-checkpoints', '.worktrees', '.claude'];
      let dirsToAdd = pathsToCheck;
      
      try {
        const ignoreResults = await window.electronAPI.git.checkIgnore(workspacePath, pathsToCheck);
        
        if (ignoreResults.success) {
          // If git is available and it's a git repo, only add directories that are not already ignored
          if (ignoreResults.isGitRepo !== false && ignoreResults.gitAvailable !== false) {
            dirsToAdd = pathsToCheck.filter(path => !ignoreResults.results[path]);
          }
          // Otherwise (not a git repo or git not available), add all directories to be safe
        }
      } catch (error) {
        // If check fails, add all directories to be safe
        console.log('Failed to check git ignore status, will add all directories');
      }
      
      if (dirsToAdd.length > 0) {
          const gitignorePath = `${workspacePath}/.gitignore`;
          const gitignoreContent = await window.electronAPI.fs.readFile(gitignorePath);
          
          // Entries we need to add
          const claudeEntries = [
            '# Claude Code IDE generated directories',
            ...dirsToAdd.map(dir => dir + '/')
          ];
          
          if (gitignoreContent.success && gitignoreContent.content) {
            // File exists, append our entries
            let contentToAppend = '';
            
            if (gitignoreContent.content.trim()) {
              contentToAppend += '\n'; // Add newline if file has content
            }
            contentToAppend += claudeEntries.join('\n') + '\n';
            
            await window.electronAPI.fs.writeFile(
              gitignorePath,
              gitignoreContent.content + contentToAppend
            );
          } else {
            // File doesn't exist, create it with common defaults + our entries
            const defaultGitignore = `# Dependencies
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Environment variables
.env
.env.local
.env.*.local

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# OS
.DS_Store
Thumbs.db

# Build outputs
dist/
build/
.next/
.nuxt/
.cache/
coverage/

${claudeEntries.join('\n')}
`;
            await window.electronAPI.fs.writeFile(
              gitignorePath,
              defaultGitignore
            );
          }
      }
      
      // Initialize shadow repo through checkpoint service
      await window.electronAPI.checkpoint.init();
      
      // Load existing checkpoints
      await loadCheckpointsFromShadowRepo();
    } catch (error) {
      console.error('Failed to initialize shadow repo:', error);
    }
  }

  async function saveToShadowRepo(checkpoint: CheckpointV2): Promise<void> {
    if (!shadowRepoPath.value) return;
    
    try {
      const checkpointDir = `${shadowRepoPath.value}/${checkpoint.id}`;
      await window.electronAPI.fs.ensureDir(checkpointDir);
      
      // Save metadata - explicitly include all required fields
      const metadata = {
        id: checkpoint.id,
        name: checkpoint.name,
        description: checkpoint.description,
        timestamp: checkpoint.timestamp,
        projectPath: checkpoint.projectPath,
        trigger: checkpoint.trigger,
        tags: checkpoint.tags,
        stats: checkpoint.stats,
        git: checkpoint.git  // Keep git in metadata for quick access
      };
      
      await window.electronAPI.fs.writeFile(
        `${checkpointDir}/metadata.json`,
        JSON.stringify(metadata, null, 2)
      );
      
      // Save file snapshots
      await window.electronAPI.fs.writeFile(
        `${checkpointDir}/files.json`,
        JSON.stringify(checkpoint.files || [], null, 2)
      );
      
      // Save IDE state
      await window.electronAPI.fs.writeFile(
        `${checkpointDir}/ide.json`,
        JSON.stringify(checkpoint.ide || {}, null, 2)
      );
      
      // Save context and knowledge
      await window.electronAPI.fs.writeFile(
        `${checkpointDir}/context.json`,
        JSON.stringify({
          messages: checkpoint.contextMessages || [],
          knowledge: checkpoint.knowledge || {}
        }, null, 2)
      );
      
      // Commit to shadow repo
      
      const addResult = await window.electronAPI.git.add(['*'], shadowRepoPath.value);
      if (!addResult.success) {
        console.error('Failed to add files to git:', addResult.error);
      }
      
      const commitResult = await window.electronAPI.git.commit(
        `Checkpoint: ${checkpoint.name} (${checkpoint.trigger})`,
        shadowRepoPath.value
      );
      if (!commitResult.success) {
        console.error('Failed to commit checkpoint:', commitResult.error);
      }
      
      // Verify files were saved
      const verifyMetadata = await window.electronAPI.fs.readFile(`${checkpointDir}/metadata.json`);
      if (!verifyMetadata.success) {
        console.error('Failed to verify metadata was saved:', verifyMetadata.error);
      } else if (!verifyMetadata.content || verifyMetadata.content.trim() === '') {
        console.error('Metadata file is empty!');
      } else {
        
      }
    } catch (error) {
      console.error('Failed to save checkpoint to shadow repo:', error);
    }
  }

  async function removeFromShadowRepo(checkpoint: CheckpointV2): Promise<void> {
    if (!shadowRepoPath.value) return;
    
    try {
      const checkpointDir = `${shadowRepoPath.value}/${checkpoint.id}`;
      await window.electronAPI.fs.delete(checkpointDir);
      
      // Commit deletion
      await window.electronAPI.git.add(['*'], shadowRepoPath.value);
      await window.electronAPI.git.commit(
        `Remove checkpoint: ${checkpoint.name}`,
        shadowRepoPath.value
      );
    } catch (error) {
      console.error('Failed to remove checkpoint from shadow repo:', error);
    }
  }

  async function loadCheckpointsFromShadowRepo(): Promise<void> {
    if (!shadowRepoPath.value) {
      console.warn('No shadow repo path, skipping checkpoint loading');
      return;
    }
    
    try {
      
      const dirs = await window.electronAPI.fs.readDir(shadowRepoPath.value);
      if (!dirs.success) {
        console.warn('Failed to read shadow repo directory:', dirs.error);
        return;
      }
      
      
      const loadedCheckpoints: CheckpointV2[] = [];
      
      // Filter for directories only
      const checkpointDirs = dirs.files.filter(f => f.isDirectory);
      
      for (const entry of checkpointDirs) {
        if (entry.name.startsWith('cp-v2-')) {
          try {
            const checkpointDir = `${shadowRepoPath.value}/${entry.name}`;
            
            
            // Load metadata
            const metadataContent = await window.electronAPI.fs.readFile(`${checkpointDir}/metadata.json`);
            if (!metadataContent.success) {
              console.warn(`Skipping checkpoint ${entry.name}: Failed to read metadata`, metadataContent.error);
              continue;
            }
            
            if (!metadataContent.content || metadataContent.content.trim() === '') {
              console.warn(`Skipping checkpoint ${entry.name}: Empty metadata file`);
              continue;
            }
            
            let metadata;
            try {
              // Check for "undefined" string which indicates corrupted data
              if (metadataContent.content === 'undefined' || metadataContent.content.trim() === 'undefined') {
                console.warn(`Skipping checkpoint ${entry.name}: Corrupted metadata (contains "undefined")`);
                continue;
              }
              metadata = JSON.parse(metadataContent.content);
            } catch (parseError) {
              console.warn(`Failed to parse metadata for checkpoint ${entry.name}:`, parseError);
              console.warn(`Metadata content:`, metadataContent.content?.substring(0, 100));
              continue;
            }
            
            // Load files
            const filesContent = await window.electronAPI.fs.readFile(`${checkpointDir}/files.json`);
            let files = [];
            if (filesContent.success && filesContent.content && filesContent.content !== 'undefined') {
              try {
                files = JSON.parse(filesContent.content);
              } catch (e) {
                console.warn(`Failed to parse files.json for ${entry.name}`);
              }
            }
            
            // Load IDE state
            const ideContent = await window.electronAPI.fs.readFile(`${checkpointDir}/ide.json`);
            let ide = {};
            if (ideContent.success && ideContent.content && ideContent.content !== 'undefined') {
              try {
                ide = JSON.parse(ideContent.content);
              } catch (e) {
                console.warn(`Failed to parse ide.json for ${entry.name}`);
              }
            }
            
            // Load context
            const contextContent = await window.electronAPI.fs.readFile(`${checkpointDir}/context.json`);
            let context = { messages: [], knowledge: {} };
            if (contextContent.success && contextContent.content && contextContent.content !== 'undefined') {
              try {
                context = JSON.parse(contextContent.content);
              } catch (e) {
                console.warn(`Failed to parse context.json for ${entry.name}`);
              }
            }
            
            loadedCheckpoints.push({
              ...metadata,
              files,
              ide,
              contextMessages: context.messages,
              knowledge: context.knowledge
            });
          } catch (err) {
            console.warn(`Failed to load checkpoint ${entry.name}:`, err);
          }
        }
      }
      
      checkpoints.value = loadedCheckpoints;
    } catch (error) {
      console.error('Failed to load checkpoints from shadow repo:', error);
    }
  }

  async function enforceCheckpointLimit(): Promise<void> {
    if (checkpoints.value.length <= maxCheckpoints.value) return;
    
    // Sort by timestamp and remove oldest
    const sorted = sortedCheckpoints.value;
    const toRemove = sorted.slice(maxCheckpoints.value);
    
    for (const checkpoint of toRemove) {
      await deleteCheckpoint(checkpoint.id);
    }
  }

  // Utility functions
  async function createHash(content: string): Promise<string> {
    const msgUint8 = new TextEncoder().encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Auto-checkpoint functionality
  let autoCheckpointTimer: NodeJS.Timeout | null = null;

  function startAutoCheckpoint(): void {
    if (!autoCheckpointEnabled.value) return;
    
    stopAutoCheckpoint();
    
    autoCheckpointTimer = setInterval(async () => {
      if (!isCreating.value && !isRestoring.value) {
        await createCheckpoint(
          'Auto-checkpoint (timer)',
          'auto-time',
          'Automatic checkpoint based on time interval'
        );
      }
    }, autoCheckpointInterval.value);
  }

  function stopAutoCheckpoint(): void {
    if (autoCheckpointTimer) {
      clearInterval(autoCheckpointTimer);
      autoCheckpointTimer = null;
    }
  }

  // Initialize shadow repo path when workspace changes
  async function updateShadowRepoPath(): Promise<void> {
    const { useWorkspaceStore } = await import('~/stores/workspace');
    const workspaceStore = useWorkspaceStore();
    const workspacePath = workspaceStore.currentPath || '';
    shadowRepoPath.value = workspacePath ? `${workspacePath}/.claude-checkpoints` : '';
    
    if (shadowRepoPath.value && workspacePath) {
      // Set workspace path in main process first
      await window.electronAPI.workspace.setPath(workspacePath);
      
      await initializeShadowRepo();
      if (autoCheckpointEnabled.value) {
        //startAutoCheckpoint();
      }
    }
  }
  
  // Initialize on store creation (delayed to ensure workspace is ready)
  setTimeout(() => {
    updateShadowRepoPath();
  }, 1000);
  
  // Watch for workspace changes
  (async () => {
    const { useWorkspaceStore } = await import('~/stores/workspace');
    const workspaceStore = useWorkspaceStore();
    let previousPath = '';
    
    // Set up a watcher for workspace path changes
    const unwatch = watch(
      () => workspaceStore.currentPath,
      async (newPath) => {
        if (newPath && newPath !== previousPath) {
          previousPath = newPath;
          
          // Stop auto checkpoint for old workspace
          stopAutoCheckpoint();
          // Update shadow repo path and initialize for new workspace
          await updateShadowRepoPath();
        }
      }
    );
  })();

  // Clean up corrupted checkpoints
  async function cleanupCorruptedCheckpoints(): Promise<number> {
    if (!shadowRepoPath.value) return 0;
    
    let cleanedCount = 0;
    const dirs = await window.electronAPI.fs.readDir(shadowRepoPath.value);
    if (!dirs.success) return 0;
    
    for (const entry of dirs.files) {
      if (entry.name.startsWith('cp-v2-')) {
        const checkpointDir = `${shadowRepoPath.value}/${entry.name}`;
        const metadataContent = await window.electronAPI.fs.readFile(`${checkpointDir}/metadata.json`);
        
        // Remove if metadata is corrupted
        if (!metadataContent.success || 
            !metadataContent.content || 
            metadataContent.content === 'undefined' ||
            metadataContent.content.trim() === 'undefined') {
          
          await window.electronAPI.fs.delete(checkpointDir);
          cleanedCount++;
        }
      }
    }
    
    if (cleanedCount > 0) {
      // Reload checkpoints after cleanup
      await loadCheckpointsFromShadowRepo();
    }
    
    return cleanedCount;
  }

  return {
    // State
    checkpoints,
    isCreating,
    isRestoring,
    lastCheckpointTime,
    autoCheckpointEnabled,
    autoCheckpointInterval,
    maxCheckpoints,
    shadowRepoPath,
    
    // Computed
    sortedCheckpoints,
    totalCheckpointSize,
    checkpointsByTrigger,
    
    // Methods
    createCheckpoint,
    restoreCheckpoint,
    deleteCheckpoint,
    compareCheckpoints,
    initializeShadowRepo,
    startAutoCheckpoint,
    stopAutoCheckpoint,
    cleanupCorruptedCheckpoints
  };
});