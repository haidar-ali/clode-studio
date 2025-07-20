import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useTasksStore } from '~/stores/tasks';
import { useKnowledgeStore } from '~/stores/knowledge';
import { useEditorStore } from '~/stores/editor';
import { useProjectContextStore } from '~/stores/project-context';

export interface FileWatchEvent {
  type: 'add' | 'change' | 'unlink';
  path: string;
  relativePath: string;
  indexData?: any;
}

export const useFileWatcherEnhanced = () => {
  const tasksStore = useTasksStore();
  const knowledgeStore = useKnowledgeStore();
  const editorStore = useEditorStore();
  const projectContextStore = useProjectContextStore();

  const isWatching = ref(false);
  const watchedFiles = ref<Set<string>>(new Set());
  const recentChanges = ref<FileWatchEvent[]>([]);
  const indexingQueue = ref<string[]>([]);
  const isIndexing = ref(false);

  // Statistics
  const stats = ref({
    totalWatched: 0,
    recentlyChanged: 0,
    pendingIndex: 0,
    lastIndexTime: null as Date | null
  });

  /**
   * Start watching the project directory
   */
  async function startWatching() {
    if (!tasksStore.projectPath || isWatching.value) return;

    try {
      const result = await window.electronAPI.fileWatcher.start(tasksStore.projectPath, {
        ignored: [
          '**/node_modules/**',
          '**/.git/**',
          '**/dist/**',
          '**/build/**',
          '**/.DS_Store',
          '**/*.log',
          '**/coverage/**',
          '**/.claudedocs/**',
          '**/.claude/**'
        ],
        depth: 10
      });

      if (result.success) {
        isWatching.value = true;
        console.log('File watcher started for:', tasksStore.projectPath);
      }
    } catch (error) {
      console.error('Failed to start file watcher:', error);
    }
  }

  /**
   * Stop watching
   */
  async function stopWatching() {
    if (!isWatching.value) return;

    try {
      await window.electronAPI.fileWatcher.stop(tasksStore.projectPath);
      isWatching.value = false;
      watchedFiles.value.clear();
      recentChanges.value = [];
    } catch (error) {
      console.error('Failed to stop file watcher:', error);
    }
  }

  /**
   * Handle file change events
   */
  function handleFileChange(event: FileWatchEvent) {
    // Add to recent changes (keep last 50)
    recentChanges.value.unshift(event);
    if (recentChanges.value.length > 50) {
      recentChanges.value = recentChanges.value.slice(0, 50);
    }

    // Update watched files set
    if (event.type === 'add') {
      watchedFiles.value.add(event.path);
    } else if (event.type === 'unlink') {
      watchedFiles.value.delete(event.path);
    }

    // Queue for indexing
    if (event.type !== 'unlink' && shouldIndexFile(event.path)) {
      queueForIndexing(event.path);
    }

    // Update relevant stores
    updateStores(event);

    // Update stats
    stats.value.totalWatched = watchedFiles.value.size;
    stats.value.recentlyChanged = recentChanges.value.filter(
      e => Date.now() - new Date(e.indexData?.metadata?.modified || 0).getTime() < 300000 // 5 minutes
    ).length;
  }

  /**
   * Check if file should be indexed
   */
  function shouldIndexFile(filePath: string): boolean {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const indexableExtensions = [
      'ts', 'tsx', 'js', 'jsx', 'vue', 'py', 'java', 
      'cs', 'go', 'rs', 'cpp', 'c', 'h', 'php', 'rb',
      'md', 'json', 'yaml', 'yml'
    ];
    return indexableExtensions.includes(ext || '');
  }

  /**
   * Queue file for indexing
   */
  function queueForIndexing(filePath: string) {
    if (!indexingQueue.value.includes(filePath)) {
      indexingQueue.value.push(filePath);
      stats.value.pendingIndex = indexingQueue.value.length;
      processIndexingQueue();
    }
  }

  /**
   * Process indexing queue
   */
  async function processIndexingQueue() {
    if (isIndexing.value || indexingQueue.value.length === 0) return;

    isIndexing.value = true;

    try {
      while (indexingQueue.value.length > 0) {
        const filePath = indexingQueue.value.shift()!;
        
        const result = await window.electronAPI.fileWatcher.indexFile(filePath);
        if (result.success && result.data) {
          // Update project context with indexed data
          projectContextStore.updateFileIndex(filePath, result.data);
        }

        stats.value.pendingIndex = indexingQueue.value.length;
      }

      stats.value.lastIndexTime = new Date();
    } finally {
      isIndexing.value = false;
    }
  }

  /**
   * Update stores based on file changes
   */
  function updateStores(event: FileWatchEvent) {
    const { path: filePath, type } = event;

    // Update editor store if file is open
    if (type === 'change') {
      const openTab = editorStore.tabs.find(tab => tab.path === filePath);
      if (openTab && !openTab.isDirty) {
        // Reload file content if not dirty
        editorStore.reloadFile(openTab);
      }
    }

    // Update knowledge store if it's a knowledge file
    if (filePath.includes('.claude/knowledge/')) {
      knowledgeStore.refreshEntries();
    }

    // Update tasks if TASKS.md changed
    if (filePath.endsWith('TASKS.md')) {
      tasksStore.loadTasksFromFile();
    }
  }

  /**
   * Get change history for a specific file
   */
  function getFileHistory(filePath: string): FileWatchEvent[] {
    return recentChanges.value.filter(event => event.path === filePath);
  }

  /**
   * Get recently changed files
   */
  const recentlyChangedFiles = computed(() => {
    const seen = new Set<string>();
    return recentChanges.value
      .filter(event => {
        if (seen.has(event.path)) return false;
        seen.add(event.path);
        return true;
      })
      .slice(0, 10);
  });

  /**
   * Get file change frequency
   */
  const changeFrequency = computed(() => {
    const frequency = new Map<string, number>();
    recentChanges.value.forEach(event => {
      frequency.set(event.path, (frequency.get(event.path) || 0) + 1);
    });
    return Array.from(frequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  });

  // Set up event listeners
  onMounted(() => {
    // Listen for file change events from main process
    window.electronAPI.onFileChange((event: any) => {
      handleFileChange(event);
    });

    // Auto-start watching if project is loaded
    if (tasksStore.projectPath) {
      startWatching();
    }
  });

  onUnmounted(() => {
    stopWatching();
  });

  return {
    // State
    isWatching,
    watchedFiles,
    recentChanges,
    indexingQueue,
    isIndexing,
    stats,

    // Computed
    recentlyChangedFiles,
    changeFrequency,

    // Methods
    startWatching,
    stopWatching,
    getFileHistory,
    queueForIndexing
  };
};