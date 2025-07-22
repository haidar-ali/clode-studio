import { ref, watch, onMounted, onUnmounted } from 'vue';
import { useCheckpointV2Store } from '~/stores/checkpoint-v2';
import { useSourceControlStore } from '~/stores/source-control';
import { useEditorStore } from '~/stores/editor';
import { useTasksStore } from '~/stores/tasks';

export interface AutoCheckpointOptions {
  onGitOperations?: boolean;
  onRiskyCommands?: boolean;
  onTimeInterval?: boolean;
  onErrors?: boolean;
  onMajorChanges?: boolean;
  timeInterval?: number; // milliseconds
  fileChangeThreshold?: number; // number of files
}

export function useAutoCheckpoint(options: AutoCheckpointOptions = {}) {
  const checkpointStore = useCheckpointV2Store();
  const gitStore = useSourceControlStore();
  const editorStore = useEditorStore();
  const tasksStore = useTasksStore();

  // Default options
  const config = {
    onGitOperations: true,
    onRiskyCommands: true,
    onTimeInterval: true,
    onErrors: true,
    onMajorChanges: true,
    timeInterval: 300000, // 5 minutes
    fileChangeThreshold: 10,
    ...options
  };

  // State
  const isActive = ref(false);
  const lastGitCommit = ref('');
  const lastBranch = ref('');
  const fileChangeCount = ref(0);
  const errorCount = ref(0);
  
  // Timers
  let timeIntervalTimer: NodeJS.Timeout | null = null;
  let debounceTimer: NodeJS.Timeout | null = null;

  // Risky command patterns
  const riskyCommands = [
    /^rm\s+-rf/,
    /^git\s+reset\s+--hard/,
    /^git\s+clean/,
    /^git\s+checkout\s+\./,
    /^npm\s+install/,
    /^npm\s+update/,
    /^yarn\s+upgrade/,
    /^pnpm\s+update/,
    /^docker\s+system\s+prune/,
    /^truncate/,
    /^dd\s+/,
    /^format/,
    /^mkfs/
  ];

  // Git operation patterns
  const gitOperations = [
    'commit',
    'merge',
    'rebase',
    'reset',
    'checkout',
    'cherry-pick',
    'revert'
  ];

  // Create checkpoint with debouncing
  async function createCheckpoint(trigger: string, description: string, tags: string[] = []) {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(async () => {
      try {
        await checkpointStore.createCheckpoint(
          `Auto: ${description}`,
          trigger as any,
          description,
          [...tags, 'auto']
        );
      } catch (error) {
        console.error('Failed to create auto-checkpoint:', error);
      }
    }, 1000); // 1 second debounce
  }

  // Watch for git changes
  function watchGitChanges() {
    if (!config.onGitOperations) return;

    // Watch for commit changes
    watch(() => gitStore.commits, (newCommits, oldCommits) => {
      if (newCommits.length > 0 && oldCommits.length > 0) {
        const latestCommit = newCommits[0];
        if (latestCommit.hash !== lastGitCommit.value) {
          lastGitCommit.value = latestCommit.hash;
          createCheckpoint(
            'auto-git',
            `After commit: ${latestCommit.message.split('\n')[0]}`,
            ['git', 'commit']
          );
        }
      }
    }, { deep: true });

    // Watch for branch changes
    watch(() => gitStore.currentBranch, (newBranch, oldBranch) => {
      if (newBranch && oldBranch && newBranch !== oldBranch) {
        lastBranch.value = newBranch;
        createCheckpoint(
          'auto-git',
          `Branch switch: ${oldBranch} → ${newBranch}`,
          ['git', 'branch']
        );
      }
    });

    // Watch for major file changes
    watch(() => gitStore.totalChanges, (newCount) => {
      if (newCount >= config.fileChangeThreshold && config.onMajorChanges) {
        createCheckpoint(
          'auto-git',
          `Major changes: ${newCount} files modified`,
          ['git', 'changes']
        );
      }
    });
  }

  // Monitor terminal commands
  function monitorTerminalCommands() {
    if (!config.onRiskyCommands) return;

    // Listen for terminal command events
    window.addEventListener('terminal-command', handleTerminalCommand);
  }

  function handleTerminalCommand(event: Event) {
    const customEvent = event as CustomEvent;
    const command = customEvent.detail?.command;
    
    if (!command) return;

    // Check if command is risky
    const isRisky = riskyCommands.some(pattern => pattern.test(command));
    if (isRisky) {
      createCheckpoint(
        'auto-risky',
        `Before risky command: ${command}`,
        ['risky', 'terminal']
      );
    }

    // Check if it's a git operation
    const isGitOp = gitOperations.some(op => command.includes(`git ${op}`));
    if (isGitOp && config.onGitOperations) {
      createCheckpoint(
        'auto-git',
        `Before git operation: ${command}`,
        ['git', 'terminal']
      );
    }
  }

  // Monitor errors
  function monitorErrors() {
    if (!config.onErrors) return;

    // Listen for error events
    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
  }

  function handleError(event: ErrorEvent) {
    errorCount.value++;
    
    // Create checkpoint after multiple errors
    if (errorCount.value % 5 === 0) {
      createCheckpoint(
        'auto-error',
        `After ${errorCount.value} errors: ${event.message}`,
        ['error', 'runtime']
      );
    }
  }

  function handleUnhandledRejection(event: PromiseRejectionEvent) {
    createCheckpoint(
      'auto-error',
      `Unhandled promise rejection: ${event.reason}`,
      ['error', 'promise']
    );
  }

  // Setup time-based checkpoints
  function setupTimeInterval() {
    if (!config.onTimeInterval) return;

    timeIntervalTimer = setInterval(() => {
      createCheckpoint(
        'auto-time',
        `Scheduled checkpoint every ${Math.floor(config.timeInterval / 60000)} minutes`,
        ['scheduled', 'time']
      );
    }, config.timeInterval);
  }

  // Monitor file changes
  function monitorFileChanges() {
    if (!config.onMajorChanges) return;

    let recentChanges = new Set<string>();
    
    // Watch for file saves
    watch(() => editorStore.tabs, (tabs) => {
      tabs.forEach(tab => {
        if (tab.isDirty === false && !recentChanges.has(tab.path)) {
          recentChanges.add(tab.path);
          fileChangeCount.value++;
          
          // Clear after some time
          setTimeout(() => {
            recentChanges.delete(tab.path);
            fileChangeCount.value = Math.max(0, fileChangeCount.value - 1);
          }, 60000); // 1 minute
          
          // Check if threshold reached
          if (fileChangeCount.value >= config.fileChangeThreshold) {
            createCheckpoint(
              'auto-git',
              `After editing ${fileChangeCount.value} files`,
              ['files', 'changes']
            );
            fileChangeCount.value = 0;
            recentChanges.clear();
          }
        }
      });
    }, { deep: true });
  }

  // Monitor task completions
  function monitorTaskCompletions() {
    let completedCount = 0;
    
    watch(() => tasksStore.completedTasks.length, (newCount, oldCount) => {
      if (newCount > oldCount) {
        completedCount++;
        
        // Checkpoint after completing multiple tasks
        if (completedCount >= 5) {
          createCheckpoint(
            'auto-git',
            `After completing ${completedCount} tasks`,
            ['tasks', 'productivity']
          );
          completedCount = 0;
        }
      }
    });
  }

  // Start auto-checkpoint monitoring
  function start() {
    if (isActive.value) return;
    
    isActive.value = true;
    
    // Initialize last values
    lastGitCommit.value = gitStore.commits[0]?.hash || '';
    lastBranch.value = gitStore.currentBranch;
    
    // Start all monitors
    watchGitChanges();
    monitorTerminalCommands();
    monitorErrors();
    setupTimeInterval();
    monitorFileChanges();
    monitorTaskCompletions();
  }

  // Stop auto-checkpoint monitoring
  function stop() {
    isActive.value = false;
    
    // Clear timers
    if (timeIntervalTimer) {
      clearInterval(timeIntervalTimer);
      timeIntervalTimer = null;
    }
    
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    
    // Remove event listeners
    window.removeEventListener('terminal-command', handleTerminalCommand);
    window.removeEventListener('error', handleError);
    window.removeEventListener('unhandledrejection', handleUnhandledRejection);
  }

  // Auto-start if checkpoint store has auto-checkpoint enabled
  onMounted(() => {
    if (checkpointStore.autoCheckpointEnabled) {
      start();
    }
  });

  // Cleanup on unmount
  onUnmounted(() => {
    stop();
  });

  return {
    isActive,
    start,
    stop,
    config,
    fileChangeCount,
    errorCount
  };
}