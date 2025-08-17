<template>
  <div class="agent-orchestration-panel">
    <!-- Header with controls -->
    <div class="panel-header">
      <div class="header-left">
        <h3>Agent Orchestration</h3>
        <span v-if="!isInitialized" class="status-badge initializing">
          <Icon name="mdi:loading" class="spin" /> Initializing...
        </span>
        <span v-else class="status-badge ready">
          <Icon name="mdi:check-circle" /> Ready
        </span>
      </div>
      
      <div class="header-right">
        <button @click="showCreateTask = true" class="btn-primary" :disabled="!isInitialized">
          <Icon name="mdi:plus" /> New Task
        </button>
        <button @click="refreshStatus" class="btn-icon" title="Refresh">
          <Icon name="mdi:refresh" />
        </button>
      </div>
    </div>

    <!-- Budget Status Bar -->
    <div class="budget-status">
      <div class="budget-item">
        <span class="label">Daily Budget:</span>
        <div class="budget-bar">
          <div 
            class="budget-used" 
            :style="{ width: `${(totalDailyCost / dailyBudgetLimit) * 100}%` }"
            :class="{ warning: totalDailyCost > dailyBudgetLimit * 0.8, danger: totalDailyCost >= dailyBudgetLimit }"
          ></div>
        </div>
        <span class="value">${{ totalDailyCost.toFixed(2) }} / ${{ dailyBudgetLimit.toFixed(2) }}</span>
      </div>
    </div>

    <!-- Main Content Area -->
    <div class="panel-content">
      <!-- Active Pipelines -->
      <div v-if="runningPipelines.length > 0" class="section">
        <h4>Active Pipelines</h4>
        <div class="pipeline-list">
          <div 
            v-for="pipeline in runningPipelines" 
            :key="pipeline.id"
            class="pipeline-card"
            :class="{ selected: selectedPipelineId === pipeline.id }"
            @click="selectedPipelineId = pipeline.id"
          >
            <div class="pipeline-header">
              <span class="pipeline-title">{{ pipeline.taskTitle }}</span>
              <span class="pipeline-status" :class="`status-${pipeline.status}`">
                {{ formatStatus(pipeline.status) }}
              </span>
            </div>
            
            <div class="pipeline-progress">
              <div class="progress-bar">
                <div class="progress-fill" :style="{ width: `${pipeline.progress}%` }"></div>
              </div>
              <span class="progress-text">{{ pipeline.progress }}%</span>
            </div>
            
            <div class="pipeline-info">
              <span v-if="pipeline.currentAgent" class="current-agent">
                <Icon :name="getAgentIcon(pipeline.currentAgent)" /> 
                {{ getAgentDisplayName(pipeline.currentAgent) }}
              </span>
              <span class="pipeline-cost">${{ pipeline.cost.toFixed(2) }}</span>
              <span class="pipeline-tokens">{{ pipeline.tokensUsed }} tokens</span>
              <span class="pipeline-time">{{ formatDuration(pipeline.startTime) }}</span>
            </div>
            
            <div v-if="pipeline.status === 'waiting_approval'" class="approval-actions">
              <button @click.stop="approvePipeline(pipeline.id, true)" class="btn-success">
                <Icon name="mdi:check" /> Approve
              </button>
              <button @click.stop="approvePipeline(pipeline.id, false)" class="btn-danger">
                <Icon name="mdi:close" /> Reject
              </button>
            </div>
            
            <div v-else-if="pipeline.status === 'paused'" class="pipeline-actions">
              <button @click.stop="resumePipeline(pipeline.id)" class="btn-primary">
                <Icon name="mdi:play" /> Resume
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Pipeline Details / Logs -->
      <div v-if="selectedPipeline" class="section logs-section">
        <div class="logs-header">
          <h4>Pipeline Logs: {{ selectedPipeline.taskTitle }}</h4>
          <div class="log-controls">
            <select v-model="filterLevel" class="log-filter">
              <option value="all">All Levels</option>
              <option value="info">Info</option>
              <option value="warning">Warnings</option>
              <option value="error">Errors</option>
            </select>
            <label class="auto-scroll">
              <input type="checkbox" v-model="autoScrollLogs" />
              Auto-scroll
            </label>
          </div>
        </div>
        
        <div class="logs-container" ref="logsContainer">
          <div v-for="(log, index) in filteredLogs" :key="index" class="log-entry" :class="`log-${log.level}`">
            <span class="log-time">{{ formatTime(log.timestamp) }}</span>
            <span class="log-level">{{ log.level.toUpperCase() }}</span>
            <span v-if="log.agentId" class="log-agent">[{{ log.agentId }}]</span>
            <span class="log-message">{{ log.message }}</span>
          </div>
        </div>
      </div>

      <!-- Agent Selection -->
      <div class="section agents-section">
        <h4>Available Agents</h4>
        <div class="agent-grid">
          <div 
            v-for="agent in availableAgents" 
            :key="agent.id"
            class="agent-card"
            :class="{ selected: selectedAgents.includes(agent.id) }"
            @click="toggleAgent(agent.id)"
          >
            <div class="agent-icon">
              <Icon :name="getAgentIcon(agent.type)" />
            </div>
            <div class="agent-info">
              <div class="agent-name">{{ agent.name }}</div>
              <div class="agent-description">{{ agent.description }}</div>
              <div class="agent-metrics" v-if="agentMetrics.get(agent.id)">
                <span class="metric">
                  <Icon name="mdi:chart-line" /> 
                  {{ agentMetrics.get(agent.id)?.successRate }}% success
                </span>
                <span class="metric">
                  <Icon name="mdi:currency-usd" />
                  ${{ agentMetrics.get(agent.id)?.totalCost.toFixed(2) }}
                </span>
              </div>
            </div>
            <div class="agent-checkbox">
              <input 
                type="checkbox" 
                :checked="selectedAgents.includes(agent.id)"
                @click.stop
                @change="toggleAgent(agent.id)"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- History -->
      <div v-if="completedPipelines.length > 0" class="section">
        <div class="section-header">
          <h4>History</h4>
          <button @click="clearHistory" class="btn-text">Clear</button>
        </div>
        <div class="history-list">
          <div 
            v-for="pipeline in completedPipelines.slice(0, 10)" 
            :key="pipeline.id"
            class="history-item"
            @click="selectedPipelineId = pipeline.id"
          >
            <Icon :name="pipeline.status === 'completed' ? 'mdi:check-circle' : 'mdi:close-circle'" 
                  :class="pipeline.status === 'completed' ? 'text-success' : 'text-danger'" />
            <span class="history-title">{{ pipeline.taskTitle }}</span>
            <span class="history-time">{{ formatRelativeTime(pipeline.endTime) }}</span>
            <span class="history-cost">${{ pipeline.cost.toFixed(2) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Create Task Modal -->
    <Teleport to="body">
      <div v-if="showCreateTask" class="modal-overlay" @click="showCreateTask = false">
        <div class="modal-content" @click.stop>
          <div class="modal-header">
            <h3>Create New Task</h3>
            <button @click="showCreateTask = false" class="btn-icon">
              <Icon name="mdi:close" />
            </button>
          </div>
          
          <div class="modal-body">
            <div class="form-group">
              <label>Task Title</label>
              <input 
                v-model="newTask.title" 
                type="text" 
                placeholder="e.g., Implement user authentication"
                class="form-input"
              />
            </div>
            
            <div class="form-group">
              <label>Description</label>
              <textarea 
                v-model="newTask.description" 
                placeholder="Detailed description of what needs to be done..."
                class="form-textarea"
                rows="4"
              ></textarea>
            </div>
            
            <div class="form-group">
              <label>Priority</label>
              <select v-model="newTask.priority" class="form-select">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            
            <div class="form-group">
              <label>Requirements</label>
              <textarea 
                v-model="newTask.requirements" 
                placeholder="Specific requirements or constraints (one per line)"
                class="form-textarea"
                rows="3"
              ></textarea>
            </div>
            
            <div class="form-group">
              <label>Max Cost ($)</label>
              <input 
                v-model.number="maxCostPerTask" 
                type="number" 
                min="0.1" 
                max="100"
                step="0.1"
                class="form-input"
              />
            </div>
            
            <div class="form-options">
              <label>
                <input type="checkbox" v-model="enableApprovals" />
                Require approvals for critical decisions
              </label>
              <label>
                <input type="checkbox" v-model="enableDryRun" />
                Dry run (simulate without making changes)
              </label>
            </div>
          </div>
          
          <div class="modal-footer">
            <button @click="showCreateTask = false" class="btn-secondary">
              Cancel
            </button>
            <button @click="executeTask" class="btn-primary" :disabled="!newTask.title">
              <Icon name="mdi:play" /> Start Task
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { storeToRefs } from 'pinia';
import { useAgentOrchestrationStore } from '~/stores/agent-orchestration-client';
import { useWorkspaceStore } from '~/stores/workspace';
import Icon from '~/components/Icon.vue';

const orchestrationStore = useAgentOrchestrationStore();
const workspaceStore = useWorkspaceStore();

const {
  isInitialized,
  isInitializing,
  activePipelines,
  pipelineHistory,
  selectedPipelineId,
  selectedPipeline,
  runningPipelines,
  completedPipelines,
  availableAgents,
  agentMetrics,
  selectedAgents,
  systemStatus,
  totalDailyCost,
  remainingBudget,
  showCreateTaskModal,
  autoScrollLogs,
  filterLevel,
  filteredLogs,
  maxCostPerTask,
  dailyBudgetLimit,
  enableApprovals,
  enableDryRun
} = storeToRefs(orchestrationStore);

const {
  initialize,
  createTask,
  resumePipeline,
  approvePipeline,
  cancelPipeline,
  refreshStatus,
  clearHistory,
  toggleAgent
} = orchestrationStore;

// Local state
const showCreateTask = ref(false);
const logsContainer = ref<HTMLElement>();

const newTask = ref({
  title: '',
  description: '',
  priority: 'medium' as 'low' | 'medium' | 'high' | 'critical',
  requirements: ''
});

// Initialize on mount
onMounted(async () => {
  // Use currentPath or currentWorkspacePath from the workspace store
  const workspacePath = workspaceStore.currentPath || workspaceStore.currentWorkspacePath;
  
  if (workspacePath && !isInitialized.value) {
    await initialize(workspacePath);
  } else if (!isInitialized.value) {
    // If no workspace is open, try to get a default path
    // In Electron/desktop mode, we could use process.cwd() 
    // In browser/remote mode, we'll need to wait for workspace selection
    if (window.electronAPI) {
      // Desktop mode - can use electron API to get current directory
      try {
        const defaultPath = await window.electronAPI.getCurrentDirectory?.() || '.';
        console.log('[AgentOrchestration] No workspace detected, using current directory:', defaultPath);
        await initialize(defaultPath);
      } catch (error) {
        console.log('[AgentOrchestration] Waiting for workspace selection...');
      }
    } else {
      // Remote mode - wait for workspace to be selected
      console.log('[AgentOrchestration] Remote mode - waiting for workspace selection...');
    }
  }
});

// Watch for workspace changes
watch(() => workspaceStore.currentPath || workspaceStore.currentWorkspacePath, async (newPath) => {
  if (newPath && !isInitialized.value && !isInitializing.value) {
    console.log('[AgentOrchestration] Workspace changed, initializing with:', newPath);
    await initialize(newPath);
  }
});

// Cleanup on unmount
onUnmounted(() => {
  orchestrationStore.stopStatusPolling();
});

// Auto-scroll logs
watch(filteredLogs, async () => {
  if (autoScrollLogs.value && logsContainer.value) {
    await nextTick();
    logsContainer.value.scrollTop = logsContainer.value.scrollHeight;
  }
});

// Execute task
async function executeTask() {
  if (!newTask.value.title) return;
  
  const requirements = newTask.value.requirements
    .split('\n')
    .filter(r => r.trim())
    .map(r => r.trim());
  
  try {
    // Get the current workspace path
    const workspacePath = workspaceStore.currentPath || workspaceStore.currentWorkspacePath;
    
    await createTask({
      title: newTask.value.title,
      description: newTask.value.description,
      priority: newTask.value.priority,
      requirements,
      metadata: {
        createdAt: new Date().toISOString(),
        createdBy: 'user'
      }
    }, workspacePath);
    
    // Reset form
    newTask.value = {
      title: '',
      description: '',
      priority: 'medium',
      requirements: ''
    };
    
    showCreateTask.value = false;
  } catch (error: any) {
    console.error('Failed to create task:', error);
    // Could show error notification here
  }
}

// Helper functions
function formatStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString();
}

function formatRelativeTime(timestamp?: string): string {
  if (!timestamp) return '';
  
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
}

function getAgentIcon(agentIdOrType?: string): string {
  // Map agent IDs to icons
  const agentIconMap: Record<string, string> = {
    architect: 'mdi:compass',
    developer: 'mdi:code-braces',
    qa: 'mdi:checkbox-marked',
    'kb-builder': 'mdi:book-open-variant',
    taskmaster: 'mdi:console'
  };
  
  // Map agent types to icons
  const typeIconMap: Record<string, string> = {
    orchestrator: 'mdi:console',
    designer: 'mdi:compass',
    implementer: 'mdi:code-braces',
    validator: 'mdi:checkbox-marked',
    documenter: 'mdi:book-open-variant'
  };
  
  return agentIconMap[agentIdOrType || ''] || typeIconMap[agentIdOrType || ''] || 'mdi:account';
}

function getAgentDisplayName(agentId: string): string {
  const nameMap: Record<string, string> = {
    architect: 'Architect',
    developer: 'Developer',
    qa: 'QA Engineer',
    'kb-builder': 'KB Builder',
    taskmaster: 'Task Master',
    documenter: 'Documenter'
  };
  return nameMap[agentId] || agentId;
}

function formatDuration(startTime: string): string {
  const start = new Date(startTime);
  const now = new Date();
  const diff = now.getTime() - start.getTime();
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}
</script>

<style scoped>
.agent-orchestration-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
  color: #cccccc;
  border-left: 1px solid #333;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #252526;
  border-bottom: 1px solid #181818;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-left h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #ffffff;
}

.status-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.status-badge.initializing {
  background: rgba(255, 193, 7, 0.1);
  color: #ffc107;
}

.status-badge.ready {
  background: rgba(78, 201, 176, 0.1);
  color: #4ec9b0;
}

.header-right {
  display: flex;
  gap: 8px;
}

.budget-status {
  padding: 12px 16px;
  background: #252526;
  border-bottom: 1px solid #181818;
}

.budget-item {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
}

.budget-item .label {
  color: #cccccc;
  font-weight: 500;
}

.budget-item .value {
  color: #007acc;
  font-weight: 600;
  font-size: 11px;
}

.budget-bar {
  flex: 1;
  height: 6px;
  background: #3c3c3c;
  border-radius: 3px;
  overflow: hidden;
  position: relative;
}

.budget-used {
  height: 100%;
  background: #007acc;
  transition: width 0.3s ease, background 0.3s ease;
}

.budget-used.warning {
  background: #ffc107;
}

.budget-used.danger {
  background: #cd3131;
}

.panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.section {
  margin-bottom: 20px;
}

.section h4 {
  margin: 0 0 12px 0;
  font-size: 13px;
  color: #ffffff;
  font-weight: 600;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.pipeline-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pipeline-card {
  padding: 12px;
  background: #252526;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.pipeline-card:hover {
  background: #2d2d30;
  border-color: #007acc;
}

.pipeline-card.selected {
  border-color: #007acc;
  background: #2d2d30;
}

.pipeline-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.pipeline-title {
  font-weight: 500;
  font-size: 13px;
  color: #cccccc;
}

.pipeline-status {
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 10px;
  text-transform: uppercase;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.status-running {
  background: rgba(0, 122, 204, 0.1);
  color: #007acc;
}

.status-paused {
  background: rgba(255, 193, 7, 0.1);
  color: #ffc107;
}

.status-waiting_approval {
  background: rgba(255, 193, 7, 0.1);
  color: #ffc107;
}

.status-completed {
  background: rgba(78, 201, 176, 0.1);
  color: #4ec9b0;
}

.status-failed {
  background: rgba(205, 49, 49, 0.1);
  color: #cd3131;
}

.pipeline-progress {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.progress-bar {
  flex: 1;
  height: 4px;
  background: #3c3c3c;
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: #007acc;
  transition: width 0.3s ease;
}

.progress-text {
  font-size: 11px;
  color: #999999;
  font-weight: 600;
}

.pipeline-info {
  display: flex;
  gap: 12px;
  font-size: 11px;
  color: #999999;
}

.current-agent {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #cccccc;
}

.pipeline-cost,
.pipeline-tokens,
.pipeline-time {
  color: #007acc;
  font-weight: 600;
  font-size: 11px;
}

.pipeline-time {
  color: #999999;
}

.approval-actions,
.pipeline-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.logs-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 200px;
  max-height: 400px;
}

.logs-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.log-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.log-filter {
  padding: 4px 8px;
  background: #3c3c3c;
  border: 1px solid #6c6c6c;
  border-radius: 4px;
  color: #d4d4d4;
  font-size: 12px;
}

.log-filter:focus {
  outline: none;
  border-color: #007acc;
}

.auto-scroll {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #cccccc;
}

.auto-scroll input[type="checkbox"] {
  cursor: pointer;
}

.logs-container {
  flex: 1;
  background: #252526;
  border: 1px solid #3c3c3c;
  border-radius: 4px;
  padding: 8px;
  overflow-y: auto;
  font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
  font-size: 11px;
}

.log-entry {
  display: flex;
  gap: 8px;
  padding: 2px 0;
  line-height: 1.4;
}

.log-time {
  color: #999999;
  white-space: nowrap;
}

.log-level {
  font-weight: 600;
  width: 45px;
  font-size: 10px;
}

.log-agent {
  color: #007acc;
  font-weight: 500;
}

.log-message {
  flex: 1;
  word-break: break-word;
  color: #cccccc;
}

.log-info .log-level {
  color: #007acc;
}

.log-warning .log-level {
  color: #ffc107;
}

.log-error .log-level {
  color: #cd3131;
}

.agents-section {
  margin-top: 16px;
}

.agent-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 8px;
}

.agent-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: #252526;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.agent-card:hover {
  background: #2d2d30;
  border-color: #007acc;
}

.agent-card.selected {
  border-color: #007acc;
  background: #2d2d30;
}

.agent-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: #3c3c3c;
  border-radius: 50%;
  color: #cccccc;
}

.agent-info {
  flex: 1;
}

.agent-name {
  font-weight: 500;
  font-size: 13px;
  margin-bottom: 4px;
  color: #cccccc;
}

.agent-description {
  font-size: 11px;
  color: #999999;
  margin-bottom: 4px;
}

.agent-metrics {
  display: flex;
  gap: 10px;
  font-size: 11px;
  color: #999999;
}

.metric {
  display: flex;
  align-items: center;
  gap: 4px;
}

.agent-checkbox {
  display: flex;
  align-items: center;
}

.agent-checkbox input[type="checkbox"] {
  cursor: pointer;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.history-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: #252526;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.2s ease;
  border: 1px solid transparent;
}

.history-item:hover {
  background: #2d2d30;
  border-color: #007acc;
}

.history-title {
  flex: 1;
  font-size: 12px;
  color: #cccccc;
  font-family: monospace;
}

.history-time {
  font-size: 11px;
  color: #999999;
}

.history-cost {
  font-size: 11px;
  color: #007acc;
  font-weight: 600;
}

/* Modal styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: #1e1e1e;
  border-radius: 6px;
  width: 90%;
  max-width: 600px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
  border: 1px solid #333;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #181818;
  background: #252526;
}

.modal-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #ffffff;
}

.modal-body {
  padding: 20px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-weight: 500;
  font-size: 12px;
  color: #cccccc;
}

.form-input,
.form-textarea,
.form-select {
  width: 100%;
  padding: 8px 12px;
  background: #3c3c3c;
  border: 1px solid #6c6c6c;
  border-radius: 4px;
  color: #d4d4d4;
  font-size: 13px;
}

.form-input:focus,
.form-textarea:focus,
.form-select:focus {
  outline: none;
  border-color: #007acc;
}

.form-textarea {
  resize: vertical;
  min-height: 80px;
  font-family: inherit;
}

.form-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-options label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #cccccc;
  cursor: pointer;
}

.form-options input[type="checkbox"] {
  cursor: pointer;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 20px;
  border-top: 1px solid #181818;
  background: #252526;
}

/* Button styles */
.btn-primary,
.btn-secondary,
.btn-success,
.btn-danger,
.btn-icon,
.btn-text {
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
}

.btn-primary {
  background: #007acc;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #005a9e;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background: #3c3c3c;
  color: #cccccc;
  border: 1px solid #6c6c6c;
}

.btn-secondary:hover {
  background: #4c4c4c;
  color: #ffffff;
}

.btn-success {
  background: #4ec9b0;
  color: white;
}

.btn-success:hover {
  background: #3ca89a;
}

.btn-danger {
  background: #cd3131;
  color: white;
}

.btn-danger:hover {
  background: #b02525;
}

.btn-icon {
  padding: 6px;
  background: none;
  border: none;
  color: #cccccc;
  cursor: pointer;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.btn-icon:hover:not(:disabled) {
  background: #3e3e42;
  color: #ffffff;
}

.btn-icon:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-text {
  background: transparent;
  color: #007acc;
  padding: 4px 8px;
  font-weight: 400;
}

.btn-text:hover {
  text-decoration: underline;
}

/* Utility classes */
.text-success {
  color: #4ec9b0;
}

.text-danger {
  color: #cd3131;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>