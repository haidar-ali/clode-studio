import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import type { ClaudeSnapshot, SnapshotConfig, SnapshotDiff } from '~/types/snapshot';
import { useEditorStore } from './editor';
import { useSourceControlStore } from './source-control';
import { useClaudeInstancesStore } from './claude-instances';
import { useTasksStore } from './tasks';
import { useFileContentManager } from '~/composables/useFileContentManager';

export const useSnapshotsStore = defineStore('snapshots', () => {
  // State
  const snapshots = ref<ClaudeSnapshot[]>([]);
  const isCapturing = ref(false);
  const isRestoring = ref(false);
  const lastSnapshotTime = ref<Date | null>(null);
  const selectedSnapshotId = ref<string | null>(null);
  
  // Configuration with new defaults
  const config = ref<SnapshotConfig>({
    maxSnapshots: 50,
    maxSizeMb: 100,
    autoCleanupDays: 30,
    autoSnapshotInterval: 600000, // 10 minutes
    enableAutoSnapshots: true,
    enableClaudePromptSnapshots: false // New setting for Claude prompt snapshots
  });

  // Computed
  const sortedSnapshots = computed(() => 
    [...snapshots.value].sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )
  );

  const totalSizeMb = computed(() => 
    snapshots.value.reduce((sum, s) => sum + s.sizeKb, 0) / 1024
  );

  const selectedSnapshot = computed(() => 
    snapshots.value.find(s => s.id === selectedSnapshotId.value)
  );

  const recentSnapshots = computed(() => 
    sortedSnapshots.value.slice(0, 10)
  );

  const snapshotsByTag = computed(() => {
    const byTag = new Map<string, ClaudeSnapshot[]>();
    snapshots.value.forEach(snapshot => {
      (snapshot.tags || []).forEach(tag => {
        if (!byTag.has(tag)) {
          byTag.set(tag, []);
        }
        byTag.get(tag)!.push(snapshot);
      });
    });
    return byTag;
  });

  // Actions
  async function captureSnapshot(name?: string, trigger: ClaudeSnapshot['createdBy'] = 'manual') {
    if (isCapturing.value) return;
    
    isCapturing.value = true;
    try {
      const editorStore = useEditorStore();
      const gitStore = useSourceControlStore();
      const claudeStore = useClaudeInstancesStore();
      const tasksStore = useTasksStore();

      // Get current workspace path
      let currentPath = '';
      try {
        currentPath = await window.electronAPI.workspace.getCurrentPath();
      } catch (error) {
        console.warn('Failed to get current workspace path:', error);
      }

      if (!currentPath) {
        throw new Error('No workspace path available for snapshot');
      }

      // Initialize file content manager
      const fileContentManager = useFileContentManager(currentPath);
      
      // Get previous snapshot for comparison (most recent from same branch)
      const previousSnapshot = sortedSnapshots.value.find(s => 
        s.gitBranch === gitStore.currentBranch
      );
      
      // Scan for file changes
    
      const fileChanges = await fileContentManager.scanFileChanges(previousSnapshot);
    
      
      // Get storage info
      let storageInfo: any = null;
      try {
        storageInfo = await fileContentManager.getStorageInfo();
      } catch (error) {
        console.warn('Failed to get storage info:', error);
        // Continue with default values
      }

      // Calculate enhanced size
      const contentSizeKb = fileChanges.summary.bytesChanged / 1024;
      const totalSizeKb = contentSizeKb + 5; // Add base IDE state size

      // Create enhanced snapshot
      const snapshot: ClaudeSnapshot = {
        id: `snap_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: name || `${gitStore.currentBranch || 'main'} - ${new Date().toLocaleString()}`,
        timestamp: new Date().toISOString(),
        projectPath: currentPath,
        
        // Editor state
        openFiles: editorStore.tabs.map(t => t.path),
        activeFile: editorStore.activeTab?.path || null,
        cursorPositions: editorStore.getCursorPositions(),
        
        // Git state (lightweight)
        gitCommit: gitStore.currentCommit || '',
        gitBranch: gitStore.currentBranch || 'main',
        dirtyFiles: [
          ...(gitStore.stagedFiles || []),
          ...(gitStore.modifiedFiles || []),
          ...(gitStore.untrackedFiles || [])
        ].map(f => typeof f === 'string' ? f : f.path || String(f)),
        
        // Claude state (references only)
        claudeInstances: claudeStore.instancesList.map(instance => ({
          id: instance.id,
          personality: instance.personalityId || 'default',
          lastMessageCount: 0 // Claude instances don't have messages property
        })),
        
        // Task state (references only)
        activeTaskIds: tasksStore.allTasks?.filter?.(t => t.status === 'in_progress')
          ?.map(t => t.id) || [],
        taskCounts: {
          todo: tasksStore.todoTasks?.length || 0,
          inProgress: tasksStore.inProgressTasks?.length || 0,
          done: tasksStore.doneTasks?.length || 0
        },
        
        // Enhanced: File content tracking
        fileChanges: {
          added: fileChanges.added,
          modified: fileChanges.modified,
          removed: fileChanges.removed,
          summary: fileChanges.summary
        },
        
        // Enhanced: Storage information
        contentStorage: {
          objectHashes: [
            ...fileChanges.added.map(f => f.contentHash).filter(Boolean),
            ...fileChanges.modified.map(f => f.contentHash).filter(Boolean)
          ] as string[],
          compressionRatio: storageInfo?.compressionRatio || 1.0,
          totalContentSize: fileChanges.summary.bytesChanged
        },
        
        // Metadata
        sizeKb: totalSizeKb,
        createdBy: trigger,
        tags: []
      };

    

      // Save via electron API - convert to serializable format
      const serializableSnapshot = JSON.parse(JSON.stringify(snapshot));
      const result = await window.electronAPI.snapshots.save(serializableSnapshot);
      
      if (result.success) {
        snapshots.value.push(snapshot);
        lastSnapshotTime.value = new Date();
        
        // Cleanup if needed
        await cleanupSnapshots();
        
      
      } else {
        console.error('📸 Failed to save enhanced snapshot:', result.error);
      }
      
      return snapshot;
    } catch (error) {
      console.error('📸 Failed to capture enhanced snapshot:', error);
      throw error;
    } finally {
      isCapturing.value = false;
    }
  }

  async function restoreSnapshot(snapshotId: string, options?: {
    restoreFiles?: boolean;
    restoreIdeState?: boolean;
    confirmOverwrites?: boolean;
  }) {
    const snapshot = snapshots.value.find(s => s.id === snapshotId);
    if (!snapshot || isRestoring.value) return;
    
    const opts = {
      restoreFiles: true,
      restoreIdeState: true,
      confirmOverwrites: true,
      ...options
    };
    
    isRestoring.value = true;
    try {
    
      
      // Check if this is an enhanced snapshot with file content
      const isEnhancedSnapshot = !!snapshot.fileChanges;
      
      if (opts.restoreFiles && isEnhancedSnapshot && snapshot.fileChanges) {
      
        
        // Initialize file content manager
        const fileContentManager = useFileContentManager(snapshot.projectPath);
        
        // Warn user about file restoration
        if (opts.confirmOverwrites) {
          const totalFiles = snapshot.fileChanges.summary.filesChanged;
          if (totalFiles > 0) {
            const confirmed = confirm(
              `This will restore ${totalFiles} files from the snapshot, potentially overwriting current changes. Continue?`
            );
            if (!confirmed) {
            
              return false;
            }
          }
        }
        
        // Restore file content
        try {
          await fileContentManager.restoreFiles(snapshot.fileChanges);
        
          
          // Show success notification
          if (window.electronAPI?.showNotification) {
            await window.electronAPI.showNotification({
              title: 'Snapshot Restored',
              body: `Restored ${snapshot.fileChanges.summary.filesChanged} files from "${snapshot.name}"`
            });
          }
        } catch (error) {
          console.error('🔄 Failed to restore file content:', error);
          throw new Error(`Failed to restore file content: ${error.message}`);
        }
      }
      
      if (opts.restoreIdeState) {
      
        
        const editorStore = useEditorStore();
        
        // 1. Close all current tabs
        editorStore.closeAllTabs();
        
        // 2. Open files from snapshot
        for (const filePath of snapshot.openFiles) {
          try {
            await editorStore.openFile(filePath);
          } catch (error) {
            console.warn(`🔄 Failed to open file ${filePath}:`, error);
          }
        }
        
        // 3. Set active file
        if (snapshot.activeFile) {
          const tab = editorStore.tabs.find(t => t.path === snapshot.activeFile);
          if (tab) {
            editorStore.setActiveTab(tab.id);
          }
        }
        
        // 4. Restore cursor positions
        editorStore.restoreCursorPositions(snapshot.cursorPositions);
        
      
      }
      
      // 5. Show git status differences (informational only)
      const gitStore = useSourceControlStore();
      if (gitStore.currentBranch !== snapshot.gitBranch) {
      
        
        if (window.electronAPI?.showNotification) {
          await window.electronAPI.showNotification({
            title: 'Branch Difference',
            body: `Snapshot was on branch '${snapshot.gitBranch}', current branch is '${gitStore.currentBranch}'`
          });
        }
      }
      
    
      return true;
    } catch (error) {
      console.error('🔄 Failed to restore snapshot:', error);
      
      if (window.electronAPI?.showNotification) {
        await window.electronAPI.showNotification({
          title: 'Restore Failed',
          body: `Failed to restore snapshot: ${error.message}`
        });
      }
      
      throw error;
    } finally {
      isRestoring.value = false;
    }
  }

  async function deleteSnapshot(snapshotId: string) {
    const index = snapshots.value.findIndex(s => s.id === snapshotId);
    if (index === -1) return;
    
    const snapshot = snapshots.value[index];
    const result = await window.electronAPI.snapshots.delete(snapshotId, snapshot.gitBranch);
    if (result.success) {
      snapshots.value.splice(index, 1);
    }
  }

  async function loadSnapshots(allBranches: boolean = false) {
    const gitStore = useSourceControlStore();
    const currentBranch = gitStore.currentBranch || 'main';
    
    // Update the current branch in the snapshot service
    await window.electronAPI.snapshots.setCurrentBranch(currentBranch);
    
    const options = allBranches 
      ? { allBranches: true }
      : { branch: currentBranch };
    
    const result = await window.electronAPI.snapshots.list(options);
    if (result.success && result.data) {
      snapshots.value = result.data;
    }
  }

  async function cleanupSnapshots() {
    // Remove old snapshots
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - config.value.autoCleanupDays);
    
    const toDelete = snapshots.value.filter(s => 
      new Date(s.timestamp) < cutoffDate
    );
    
    for (const snapshot of toDelete) {
      await deleteSnapshot(snapshot.id);
    }
    
    // Remove excess snapshots
    if (snapshots.value.length > config.value.maxSnapshots) {
      const sorted = sortedSnapshots.value;
      const excess = sorted.slice(config.value.maxSnapshots);
      
      for (const snapshot of excess) {
        await deleteSnapshot(snapshot.id);
      }
    }
  }

  function compareSnapshots(id1: string, id2: string): SnapshotDiff | null {
    const snap1 = snapshots.value.find(s => s.id === id1);
    const snap2 = snapshots.value.find(s => s.id === id2);
    
    if (!snap1 || !snap2) return null;
    
    const filesSet1 = new Set(snap1.openFiles);
    const filesSet2 = new Set(snap2.openFiles);
    
    const filesChanged = [
      ...snap1.openFiles.filter(f => !filesSet2.has(f)),
      ...snap2.openFiles.filter(f => !filesSet1.has(f))
    ];
    
    return {
      filesChanged,
      branchChanged: snap1.gitBranch !== snap2.gitBranch,
      commitChanged: snap1.gitCommit !== snap2.gitCommit,
      tasksChanged: JSON.stringify(snap1.taskCounts) !== JSON.stringify(snap2.taskCounts),
      claudeInstancesChanged: snap1.claudeInstances.length !== snap2.claudeInstances.length
    };
  }

  function addTag(snapshotId: string, tag: string) {
    const snapshot = snapshots.value.find(s => s.id === snapshotId);
    if (snapshot && !snapshot.tags?.includes(tag)) {
      if (!snapshot.tags) snapshot.tags = [];
      snapshot.tags.push(tag);
      window.electronAPI.snapshots.update(snapshot);
    }
  }

  function removeTag(snapshotId: string, tag: string) {
    const snapshot = snapshots.value.find(s => s.id === snapshotId);
    if (snapshot && snapshot.tags) {
      snapshot.tags = snapshot.tags.filter(t => t !== tag);
      window.electronAPI.snapshots.update(snapshot);
    }
  }

  // Auto-snapshot timer
  let autoSnapshotTimer: NodeJS.Timeout | null = null;
  
  function startAutoSnapshots() {
    if (!config.value.enableAutoSnapshots || !config.value.autoSnapshotInterval) return;
    
    stopAutoSnapshots();
    autoSnapshotTimer = setInterval(() => {
      captureSnapshot('Auto-snapshot', 'auto-timer');
    }, config.value.autoSnapshotInterval);
  }
  
  function stopAutoSnapshots() {
    if (autoSnapshotTimer) {
      clearInterval(autoSnapshotTimer);
      autoSnapshotTimer = null;
    }
  }

  // Save config to workspace
  async function saveConfig() {
    if (typeof window !== 'undefined' && window.electronAPI?.store?.set) {
      try {
        const workspacePath = await window.electronAPI.workspace.getCurrentPath();
        if (workspacePath) {
          const key = `snapshots-config-${workspacePath.replace(/[^a-zA-Z0-9]/g, '_')}`;
          // Create a plain object with only serializable data
          const serializableConfig = {
            maxSnapshots: config.value.maxSnapshots,
            maxSizeMb: config.value.maxSizeMb,
            autoCleanupDays: config.value.autoCleanupDays,
            autoSnapshotInterval: config.value.autoSnapshotInterval,
            enableAutoSnapshots: config.value.enableAutoSnapshots,
            enableClaudePromptSnapshots: config.value.enableClaudePromptSnapshots
          };
          await window.electronAPI.store.set(key, serializableConfig);
        }
      } catch (error) {
        console.error('Failed to save snapshot config:', error);
      }
    }
  }

  // Load config from workspace
  async function loadConfig() {
    if (typeof window !== 'undefined' && window.electronAPI?.store?.get) {
      try {
        const workspacePath = await window.electronAPI.workspace.getCurrentPath();
        if (workspacePath) {
          const key = `snapshots-config-${workspacePath.replace(/[^a-zA-Z0-9]/g, '_')}`;
          const savedConfig = await window.electronAPI.store.get(key);
          if (savedConfig) {
            config.value = { ...config.value, ...savedConfig };
          }
        }
      } catch (error) {
        console.error('Failed to load snapshot config:', error);
      }
    }
  }

  // Listen for Claude prompts and create snapshots
  let claudePromptListeners = new Map<string, () => void>();
  let lastPromptTime = 0;
  const MIN_PROMPT_INTERVAL = 5000; // Minimum 5 seconds between prompt snapshots
  
  function startClaudePromptTracking() {
    if (!config.value.enableClaudePromptSnapshots) return;
    
    // Get all Claude instances
    const claudeStore = useClaudeInstancesStore();
    claudeStore.instancesList.forEach(instance => {
      trackClaudeInstance(instance);
    });
    
    // Watch for new instances
    const unwatch = watch(() => claudeStore.instancesList, (instances) => {
      instances.forEach(instance => {
        // Track if connected and not already tracking
        if (instance.status === 'connected' && !claudePromptListeners.has(instance.id)) {
          trackClaudeInstance(instance);
        }
        // Remove listener if disconnected
        else if (instance.status !== 'connected' && claudePromptListeners.has(instance.id)) {
          const cleanup = claudePromptListeners.get(instance.id);
          if (cleanup) {
            cleanup();
            claudePromptListeners.delete(instance.id);
          }
        }
      });
      
      // Clean up listeners for removed instances
      claudePromptListeners.forEach((cleanup, id) => {
        if (!instances.find(i => i.id === id)) {
          cleanup();
          claudePromptListeners.delete(id);
        }
      });
    }, { deep: true });
  }
  
  function trackClaudeInstance(instance: any) {
    if (!config.value.enableClaudePromptSnapshots) {
      return;
    }
    if (instance.status !== 'connected') {
      return;
    }
    if (claudePromptListeners.has(instance.id)) {
      return;
    }
    
    // Listen for user sending prompts to Claude
    const handleUserPrompt = async () => {
      // Throttle snapshots to prevent too many in quick succession
      const now = Date.now();
      if (now - lastPromptTime >= MIN_PROMPT_INTERVAL) {
        lastPromptTime = now;
        // Capture snapshot when user sends a prompt
        await captureSnapshot('User prompt sent', 'auto-checkpoint');
      }
    };
    
    // Listen for the custom event that's fired when user sends a prompt
    const eventName = `claude-prompt-sent-${instance.id}`;
    window.addEventListener(eventName, handleUserPrompt);
    
    // Store cleanup function
    const cleanup = () => {
      window.removeEventListener(eventName, handleUserPrompt);
    };
    
    claudePromptListeners.set(instance.id, cleanup);
  }
  
  function stopClaudePromptTracking() {
    claudePromptListeners.forEach(cleanup => cleanup());
    claudePromptListeners.clear();
  }

  // Watch config changes to save and handle Claude tracking
  watch(config, (newConfig, oldConfig) => {
    saveConfig();
    
    // Handle Claude prompt tracking toggle
    if (newConfig.enableClaudePromptSnapshots !== oldConfig.enableClaudePromptSnapshots) {
      if (newConfig.enableClaudePromptSnapshots) {
        startClaudePromptTracking();
      } else {
        stopClaudePromptTracking();
      }
    }
  }, { deep: true });

  return {
    // State
    snapshots,
    isCapturing,
    isRestoring,
    lastSnapshotTime,
    selectedSnapshotId,
    config,
    
    // Computed
    sortedSnapshots,
    totalSizeMb,
    selectedSnapshot,
    recentSnapshots,
    snapshotsByTag,
    
    // Actions
    captureSnapshot,
    restoreSnapshot,
    deleteSnapshot,
    loadSnapshots,
    cleanupSnapshots,
    compareSnapshots,
    addTag,
    removeTag,
    startAutoSnapshots,
    stopAutoSnapshots,
    saveConfig,
    loadConfig,
    startClaudePromptTracking,
    stopClaudePromptTracking
  };
});