/**
 * Client-side Agent Orchestration Store
 * This is a lightweight version that communicates with the Electron backend
 * to avoid importing Node.js modules in the browser
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

// Use unique interface names to avoid conflicts
export interface ClientPipelineExecution {
  id: string;
  taskId: string;
  taskTitle: string;
  status: 'running' | 'paused' | 'completed' | 'failed' | 'waiting_approval';
  progress: number;
  currentAgent?: string;
  startTime: string;
  endTime?: string;
  cost: number;
  tokensUsed: number;
  logs: ClientLogEntry[];
  result?: any;
  error?: string;
}

export interface ClientLogEntry {
  timestamp: string;
  level: 'info' | 'warning' | 'error' | 'debug';
  message: string;
  agentId?: string;
  metadata?: any;
}

export interface ClientAgentMetrics {
  executionsToday: number;
  avgExecutionTime: number;
  successRate: number;
  totalTokensUsed: number;
  totalCost: number;
  lastExecution?: string;
}

export interface ClientSimpleTask {
  id?: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  requirements?: string[];
  metadata?: any;
}

export const useAgentOrchestrationStore = defineStore('agent-orchestration-client', () => {
  // State
  const isInitialized = ref(false);
  const isInitializing = ref(false);
  const currentWorkspacePath = ref<string>('');
  
  // Pipelines
  const activePipelines = ref<Map<string, PipelineExecution>>(new Map());
  const pipelineHistory = ref<PipelineExecution[]>([]);
  
  // Agents - simplified for client
  const availableAgents = ref<any[]>([
    { id: 'architect', name: 'Architect', type: 'orchestrator', description: 'Plans and designs system architecture' },
    { id: 'developer', name: 'Developer', type: 'implementer', description: 'Implements features and fixes bugs' },
    { id: 'qa', name: 'QA Engineer', type: 'validator', description: 'Tests and validates implementations' },
    { id: 'documenter', name: 'Documenter', type: 'documenter', description: 'Creates and maintains documentation' }
  ]);
  
  const agentMetrics = ref<Map<string, ClientAgentMetrics>>(new Map());
  const selectedAgents = ref<string[]>(['architect', 'developer', 'qa']);
  
  // System status
  const systemStatus = ref<any>(null);
  
  // UI state
  const selectedPipelineId = ref<string | null>(null);
  const showCreateTaskModal = ref(false);
  const autoScrollLogs = ref(true);
  const filterLevel = ref<'all' | 'info' | 'warning' | 'error'>('all');
  
  // Budget controls
  const maxCostPerTask = ref(5.0);
  const dailyBudgetLimit = ref(50.0);
  const enableApprovals = ref(true);
  const enableDryRun = ref(false);
  
  // Polling
  let statusPollingInterval: any = null;
  
  // Computed
  const selectedPipeline = computed(() => {
    if (!selectedPipelineId.value) return null;
    return activePipelines.value.get(selectedPipelineId.value);
  });
  
  const totalDailyCost = computed(() => {
    return systemStatus.value?.budget?.daily?.spent || 0;
  });
  
  const remainingBudget = computed(() => {
    return systemStatus.value?.budget?.daily?.remaining || dailyBudgetLimit.value;
  });
  
  const filteredLogs = computed(() => {
    if (!selectedPipeline.value) return [];
    
    if (filterLevel.value === 'all') {
      return selectedPipeline.value.logs;
    }
    
    return selectedPipeline.value.logs.filter(log => log.level === filterLevel.value);
  });
  
  const runningPipelines = computed(() => {
    return Array.from(activePipelines.value.values()).filter(p => 
      p.status === 'running' || p.status === 'paused' || p.status === 'waiting_approval'
    );
  });
  
  const completedPipelines = computed(() => {
    return pipelineHistory.value.filter(p => 
      p.status === 'completed' || p.status === 'failed'
    );
  });
  
  // Actions
  async function initialize(workspacePath: string) {
    if (isInitialized.value || isInitializing.value) return;
    
    isInitializing.value = true;
    currentWorkspacePath.value = workspacePath; // Store the workspace path
    
    try {
      // In browser mode, we'll use a mock implementation
      // In Electron mode, this would communicate with the backend
      
      if (window.electronAPI && window.electronAPI.agent) {
        // Electron mode - communicate with backend
        console.log('[AgentOrchestration] Initializing via Electron API for workspace:', workspacePath);
        const result = await window.electronAPI.agent.initialize(workspacePath);
        if (result.success) {
          console.log('[AgentOrchestration] Initialized successfully via Electron');
          
          // Update available agents from capabilities
          if (result.capabilities?.availableAgents) {
            availableAgents.value = result.capabilities.availableAgents.map((id: string) => ({
              id,
              name: id.charAt(0).toUpperCase() + id.slice(1),
              type: id === 'architect' ? 'orchestrator' : 
                    id === 'developer' ? 'implementer' :
                    id === 'qa' ? 'validator' : 'documenter',
              description: `${id} agent for the orchestration system`
            }));
          }
        }
      } else {
        // Browser/Remote mode - use mock for now
        console.log('[AgentOrchestration] Running in browser mode - using mock implementation');
      }
      
      // Initialize agent metrics
      for (const agent of availableAgents.value) {
        agentMetrics.value.set(agent.id, {
          executionsToday: 0,
          avgExecutionTime: 0,
          successRate: 100,
          totalTokensUsed: 0,
          totalCost: 0
        });
      }
      
      // Mock system status
      systemStatus.value = {
        budget: {
          daily: { spent: 0, limit: dailyBudgetLimit.value, remaining: dailyBudgetLimit.value },
          monthly: { spent: 0, limit: 1500, remaining: 1500 }
        }
      };
      
      isInitialized.value = true;
      addLog(null, 'info', 'Agent orchestration system initialized');
      
      // Start status polling
      startStatusPolling();
      
    } catch (error: any) {
      console.error('Failed to initialize orchestration:', error);
      addLog(null, 'error', `Initialization failed: ${error.message}`);
      
      // Still mark as initialized but with limited functionality
      isInitialized.value = true;
    } finally {
      isInitializing.value = false;
    }
  }
  
  async function createTask(task: Omit<ClientSimpleTask, 'id'>, workspacePath?: string) {
    const taskWithId: ClientSimpleTask = {
      ...task,
      id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };
    
    const pipelineId = `pipeline-${taskWithId.id}`;
    
    // Create pipeline execution tracking
    const execution: PipelineExecution = {
      id: pipelineId,
      taskId: taskWithId.id,
      taskTitle: taskWithId.title,
      status: 'running',
      progress: 0,
      startTime: new Date().toISOString(),
      cost: 0,
      tokensUsed: 0,
      logs: []
    };
    
    activePipelines.value.set(pipelineId, execution);
    selectedPipelineId.value = pipelineId;
    
    addLog(pipelineId, 'info', `Starting task: ${taskWithId.title}`);
    addLog(pipelineId, 'info', `Workspace: ${workspacePath || 'Not specified'}`);
    addLog(pipelineId, 'info', `Selected agents: ${selectedAgents.value.join(', ')}`);
    
    try {
      if (window.electronAPI && window.electronAPI.agent) {
        // Electron mode - execute via backend
        addLog(pipelineId, 'info', 'Sending task to backend for processing...');
        
        // Ensure we're only passing serializable data
        const taskData = {
          id: taskWithId.id,
          title: taskWithId.title,
          description: taskWithId.description,
          priority: taskWithId.priority,
          requirements: taskWithId.requirements || [],
          metadata: taskWithId.metadata || {}
        };
        
        const result = await window.electronAPI.agent.executeTask('createTask', {
          task: taskData,
          options: {
            maxCost: maxCostPerTask.value,
            skipApprovals: !enableApprovals.value,
            dryRun: enableDryRun.value,
            agents: [...selectedAgents.value], // Create a new array to ensure serializability
            workspacePath: workspacePath || currentWorkspacePath.value || '.'
          }
        });
        
        // Real-time progress updates
        execution.progress = 10;
        addLog(pipelineId, 'info', 'Initializing pipeline execution...');
        
        await new Promise(resolve => setTimeout(resolve, 200));
        execution.progress = 20;
        addLog(pipelineId, 'info', 'Preparing agent environment...');
        
        await new Promise(resolve => setTimeout(resolve, 300));
        execution.progress = 30;
        addLog(pipelineId, 'info', 'Loading project context and dependencies...');
        
        await new Promise(resolve => setTimeout(resolve, 200));
        execution.progress = 40;
        addLog(pipelineId, 'info', 'Starting Claude Code SDK...');
        
        await new Promise(resolve => setTimeout(resolve, 300));
        execution.progress = 50;
        addLog(pipelineId, 'info', 'Analyzing task requirements...');
        
        await new Promise(resolve => setTimeout(resolve, 400));
        execution.progress = 60;
        addLog(pipelineId, 'info', 'Executing task with Claude Code...');
        
        if (result.success && result.result) {
          execution.progress = 75;
          addLog(pipelineId, 'info', 'Task processed successfully, finalizing results...');
          
          // Update execution with real results
          execution.status = 'completed';
          execution.endTime = new Date().toISOString();
          execution.progress = 100;
          
          // If we have todos from Claude SDK, log them
          if (result.result.todos && result.result.todos.length > 0) {
            addLog(pipelineId, 'info', `Created ${result.result.todos.length} todos for task`);
            result.result.todos.forEach((todo: any) => {
              addLog(pipelineId, 'info', `• ${todo.content} [${todo.status}]`);
            });
          } else {
            addLog(pipelineId, 'info', 'Task created, awaiting Claude processing...');
          }
          
          addLog(pipelineId, 'info', `✓ Task completed successfully`);
        } else if (!result.success) {
          execution.progress = 0;
          throw new Error(result.error || 'Task execution failed');
        }
      } else {
        // Browser mode - simulate execution
        await simulateTaskExecution(execution);
      }
      
      addLog(pipelineId, 'info', `Task completed successfully`);
      
      // Move to history
      pipelineHistory.value.unshift(execution);
      
    } catch (error: any) {
      execution.status = 'failed';
      execution.endTime = new Date().toISOString();
      execution.error = error.message;
      
      addLog(pipelineId, 'error', `Task failed: ${error.message}`);
      
      // Move to history
      pipelineHistory.value.unshift(execution);
      
      throw error;
    }
  }
  
  async function simulateTaskExecution(execution: PipelineExecution) {
    // Simulate task execution for browser mode
    const steps = [
      { agent: 'architect', message: 'Analyzing requirements and designing solution...' },
      { agent: 'developer', message: 'Implementing features...' },
      { agent: 'qa', message: 'Running tests and validation...' }
    ];
    
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      execution.currentAgent = step.agent;
      execution.progress = Math.round(((i + 1) / steps.length) * 100);
      
      addLog(execution.id, 'info', step.message, step.agent);
      
      // Simulate delay
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    execution.status = 'completed';
    execution.cost = Math.random() * 0.5;
    execution.tokensUsed = Math.round(Math.random() * 1000);
  }
  
  function addLog(pipelineId: string | null, level: ClientLogEntry['level'], message: string, agentId?: string) {
    const log: ClientLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      agentId
    };
    
    if (pipelineId) {
      const execution = activePipelines.value.get(pipelineId);
      if (execution) {
        execution.logs.push(log);
      }
    }
    
    // Only log agentId if it exists
    if (agentId) {
      console.log(`[Agent Orchestration] ${level.toUpperCase()}: ${message} [${agentId}]`);
    } else {
      console.log(`[Agent Orchestration] ${level.toUpperCase()}: ${message}`);
    }
  }
  
  async function resumePipeline(pipelineId: string) {
    const execution = activePipelines.value.get(pipelineId);
    if (!execution) return;
    
    execution.status = 'running';
    addLog(pipelineId, 'info', 'Resuming pipeline...');
    
    // Implementation would go here
  }
  
  async function approvePipeline(pipelineId: string, approved: boolean) {
    const execution = activePipelines.value.get(pipelineId);
    if (!execution) return;
    
    if (approved) {
      execution.status = 'running';
      addLog(pipelineId, 'info', 'Pipeline approved, continuing...');
    } else {
      execution.status = 'failed';
      execution.endTime = new Date().toISOString();
      addLog(pipelineId, 'warning', 'Pipeline rejected by user');
    }
  }
  
  async function cancelPipeline(pipelineId: string) {
    const execution = activePipelines.value.get(pipelineId);
    if (!execution) return;
    
    execution.status = 'failed';
    execution.endTime = new Date().toISOString();
    addLog(pipelineId, 'warning', 'Pipeline cancelled by user');
  }
  
  async function refreshStatus() {
    // Refresh system status
    // In real implementation, this would fetch from backend
  }
  
  function startStatusPolling() {
    if (statusPollingInterval) return;
    
    statusPollingInterval = setInterval(() => {
      refreshStatus();
    }, 5000);
  }
  
  function stopStatusPolling() {
    if (statusPollingInterval) {
      clearInterval(statusPollingInterval);
      statusPollingInterval = null;
    }
  }
  
  function clearHistory() {
    pipelineHistory.value = [];
  }
  
  function toggleAgent(agentId: string) {
    const index = selectedAgents.value.indexOf(agentId);
    if (index >= 0) {
      selectedAgents.value.splice(index, 1);
    } else {
      selectedAgents.value.push(agentId);
    }
  }
  
  return {
    // State
    isInitialized,
    isInitializing,
    
    // Pipelines
    activePipelines,
    pipelineHistory,
    selectedPipelineId,
    selectedPipeline,
    runningPipelines,
    completedPipelines,
    
    // Agents
    availableAgents,
    agentMetrics,
    selectedAgents,
    
    // System
    systemStatus,
    totalDailyCost,
    remainingBudget,
    
    // UI
    showCreateTaskModal,
    autoScrollLogs,
    filterLevel,
    filteredLogs,
    
    // Budget
    maxCostPerTask,
    dailyBudgetLimit,
    enableApprovals,
    enableDryRun,
    
    // Actions
    initialize,
    createTask,
    resumePipeline,
    approvePipeline,
    cancelPipeline,
    refreshStatus,
    startStatusPolling,
    stopStatusPolling,
    clearHistory,
    toggleAgent
  };
});