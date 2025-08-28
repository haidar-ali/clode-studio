<template>
  <div class="context-budgeter-panel">
    <!-- Header -->
    <div class="panel-header">
      <div class="header-left">
        <h3>Context Budgeter</h3>
        <span class="badge" :class="getBudgeUtilizationClass()">{{ getBudgetUtilizationText() }}</span>
      </div>
      <div class="header-right">
        <button @click="refreshData" class="btn-icon" :disabled="isRefreshing">
          <Icon name="mdi:refresh" :class="{ spinning: isRefreshing }" />
        </button>
        <button @click="showSettings = true" class="btn-secondary">
          <Icon name="mdi:cog" /> Settings
        </button>
        <button @click="optimizeAll" class="btn-primary">
          <Icon name="mdi:auto-fix" /> Optimize All
        </button>
      </div>
    </div>

    <!-- Budget Overview -->
    <div class="budget-overview-section">
      <div class="section-title">
        <Icon name="mdi:chart-donut" />
        Budget Overview
      </div>
      
      <div class="budget-cards">
        <div class="budget-card">
          <div class="budget-header">
            <span class="budget-label">Total Allocated</span>
            <span class="budget-amount">{{ formatTokens(budgetStatus.totalAllocated) }}</span>
          </div>
          <div class="budget-progress">
            <div 
              class="progress-fill"
              :style="{ width: `${budgetStatus.utilizationPercent}%` }"
              :class="getProgressClass(budgetStatus.utilizationPercent)"
            ></div>
          </div>
          <div class="budget-details">
            <span>Used: {{ formatTokens(budgetStatus.totalUsed) }}</span>
            <span>Remaining: {{ formatTokens(budgetStatus.totalRemaining) }}</span>
          </div>
        </div>
        
        <div class="budget-card">
          <div class="budget-header">
            <span class="budget-label">Daily Budget</span>
            <span class="budget-amount">${{ budgetStatus.dailyCost.toFixed(2) }}</span>
          </div>
          <div class="budget-progress">
            <div 
              class="progress-fill"
              :style="{ width: `${budgetStatus.dailyCostPercent}%` }"
              :class="getProgressClass(budgetStatus.dailyCostPercent)"
            ></div>
          </div>
          <div class="budget-details">
            <span>Max: ${{ budgetConstraints.maxDailyCost.toFixed(2) }}</span>
            <span>Remaining: ${{ (budgetConstraints.maxDailyCost - budgetStatus.dailyCost).toFixed(2) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Agent Allocations -->
    <div class="allocations-section">
      <div class="section-title">
        <Icon name="mdi:account-group" />
        Agent Allocations
      </div>
      
      <div class="allocations-list">
        <div 
          v-for="allocation in agentAllocations" 
          :key="allocation.agentId"
          class="allocation-item"
          :class="{ 'over-budget': allocation.isOverBudget }"
        >
          <div class="allocation-header">
            <div class="agent-info">
              <Icon :name="getAgentIcon(allocation.agentId)" />
              <span class="agent-name">{{ getAgentDisplayName(allocation.agentId) }}</span>
            </div>
            <div class="allocation-stats">
              <span class="allocation-percentage">{{ allocation.percentage.toFixed(1) }}%</span>
              <span class="allocation-tokens">{{ formatTokens(allocation.used) }}/{{ formatTokens(allocation.allocated) }}</span>
            </div>
          </div>
          
          <div class="allocation-progress">
            <div 
              class="progress-fill"
              :style="{ width: `${Math.min(100, (allocation.used / allocation.allocated) * 100)}%` }"
              :class="getProgressClass((allocation.used / allocation.allocated) * 100)"
            ></div>
          </div>
          
          <div class="allocation-actions">
            <button @click="reallocate(allocation.agentId)" class="btn-small">
              <Icon name="mdi:swap-horizontal" />
              Reallocate
            </button>
            <button @click="viewDetails(allocation.agentId)" class="btn-small">
              <Icon name="mdi:eye" />
              Details
            </button>
          </div>
        </div>
        
        <div v-if="agentAllocations.length === 0" class="no-allocations">
          <Icon name="mdi:account-off" />
          <p>No agent allocations</p>
          <button @click="createAllocation" class="btn-secondary">
            <Icon name="mdi:plus" />
            Create Allocation
          </button>
        </div>
      </div>
    </div>

    <!-- Context Windows -->
    <div class="windows-section">
      <div class="section-title">
        <Icon name="mdi:window-open" />
        Active Context Windows
        <div class="window-controls">
          <button @click="showCreateWindow = true" class="btn-small">
            <Icon name="mdi:plus" />
            New Window
          </button>
        </div>
      </div>
      
      <div class="windows-list">
        <div 
          v-for="window in contextWindows" 
          :key="window.id"
          class="window-item"
          :class="{ 'compressible': window.compressible, 'over-limit': window.utilizationPercent > 100 }"
        >
          <div class="window-header">
            <div class="window-info">
              <span class="window-title">{{ window.title || `Context ${window.id.slice(-8)}` }}</span>
              <span class="window-agent" v-if="window.agentId">{{ getAgentDisplayName(window.agentId) }}</span>
            </div>
            <div class="window-stats">
              <span class="window-tokens">{{ formatTokens(window.totalTokens) }}</span>
              <span class="window-utilization" :class="getUtilizationClass(window.utilizationPercent)">
                {{ window.utilizationPercent.toFixed(1) }}%
              </span>
            </div>
          </div>
          
          <div class="window-progress">
            <div 
              class="progress-fill"
              :style="{ width: `${Math.min(100, window.utilizationPercent)}%` }"
              :class="getProgressClass(window.utilizationPercent)"
            ></div>
          </div>
          
          <div class="window-details">
            <div class="detail-group">
              <span class="detail-label">Messages:</span>
              <span class="detail-value">{{ window.messages.length }}</span>
            </div>
            <div class="detail-group">
              <span class="detail-label">Max Tokens:</span>
              <span class="detail-value">{{ formatTokens(window.maxTokens) }}</span>
            </div>
            <div class="detail-group">
              <span class="detail-label">Created:</span>
              <span class="detail-value">{{ formatRelativeTime(window.createdAt) }}</span>
            </div>
          </div>
          
          <div class="window-actions">
            <button 
              v-if="window.compressible" 
              @click="compressWindow(window.id)" 
              class="btn-small btn-warning"
            >
              <Icon name="mdi:compress" />
              Compress
            </button>
            <button @click="optimizeWindow(window.id)" class="btn-small">
              <Icon name="mdi:tune" />
              Optimize
            </button>
            <button @click="viewWindowDetails(window.id)" class="btn-small">
              <Icon name="mdi:information" />
              Details
            </button>
            <button @click="deleteWindow(window.id)" class="btn-small btn-danger">
              <Icon name="mdi:delete" />
              Delete
            </button>
          </div>
        </div>
        
        <div v-if="contextWindows.length === 0" class="no-windows">
          <Icon name="mdi:window-closed" />
          <p>No active context windows</p>
          <small>Context windows will appear here when agents are running</small>
        </div>
      </div>
    </div>

    <!-- Token Estimates -->
    <div class="estimates-section">
      <div class="section-title">
        <Icon name="mdi:calculator" />
        Token Estimates
      </div>
      
      <div class="estimate-form">
        <div class="form-row">
          <div class="form-group">
            <label>Provider</label>
            <select v-model="estimateForm.provider" class="form-select">
              <option value="anthropic">Anthropic</option>
              <option value="openai">OpenAI</option>
            </select>
          </div>
          <div class="form-group">
            <label>Model</label>
            <select v-model="estimateForm.model" class="form-select">
              <option v-for="model in getModelsForProvider(estimateForm.provider)" :key="model" :value="model">
                {{ model }}
              </option>
            </select>
          </div>
        </div>
        
        <div class="form-group">
          <label>Input Text</label>
          <textarea 
            v-model="estimateForm.inputText"
            placeholder="Enter text to estimate tokens..."
            class="form-textarea"
            rows="4"
          ></textarea>
        </div>
        
        <div class="form-row">
          <div class="form-group">
            <label>Expected Output Length</label>
            <input 
              v-model.number="estimateForm.outputLength"
              type="number"
              min="100"
              max="8192"
              class="form-input"
            />
          </div>
          <div class="form-group">
            <label>Files</label>
            <input 
              v-model.number="estimateForm.fileCount"
              type="number"
              min="0"
              max="50"
              class="form-input"
            />
          </div>
        </div>
        
        <button @click="calculateEstimate" class="btn-primary" :disabled="!estimateForm.inputText">
          <Icon name="mdi:calculator" />
          Calculate Estimate
        </button>
      </div>
      
      <div v-if="tokenEstimate" class="estimate-result">
        <div class="estimate-header">
          <h4>Token Estimate</h4>
          <span class="estimate-cost">${{ tokenEstimate.cost.toFixed(4) }}</span>
        </div>
        
        <div class="estimate-breakdown">
          <div class="breakdown-item">
            <span class="breakdown-label">Input Tokens</span>
            <span class="breakdown-value">{{ formatTokens(tokenEstimate.inputTokens) }}</span>
          </div>
          <div class="breakdown-item">
            <span class="breakdown-label">Output Tokens</span>
            <span class="breakdown-value">{{ formatTokens(tokenEstimate.outputTokens) }}</span>
          </div>
          <div class="breakdown-item">
            <span class="breakdown-label">Total Tokens</span>
            <span class="breakdown-value total">{{ formatTokens(tokenEstimate.totalTokens) }}</span>
          </div>
        </div>
        
        <div v-if="tokenEstimate.willExceedBudget" class="estimate-warning">
          <Icon name="mdi:alert" />
          This request will exceed the current budget allocation
        </div>
        
        <div v-if="tokenEstimate.compressionSuggested" class="estimate-suggestion">
          <Icon name="mdi:lightbulb" />
          Consider compressing the context ({{ (tokenEstimate.compressionRatio! * 100).toFixed(1) }}% utilization)
        </div>
      </div>
    </div>

    <!-- Settings Modal -->
    <Teleport to="body">
      <div v-if="showSettings" class="modal-overlay" @click="showSettings = false">
        <div class="modal-content" @click.stop>
          <div class="modal-header">
            <h3>Budget Settings</h3>
            <button @click="showSettings = false" class="btn-icon">
              <Icon name="mdi:close" />
            </button>
          </div>
          
          <div class="modal-body">
            <div class="settings-form">
              <div class="form-group">
                <label>Max Tokens Per Request</label>
                <input 
                  v-model.number="settingsForm.maxTokensPerRequest" 
                  type="number"
                  min="1000"
                  max="200000"
                  class="form-input"
                />
              </div>
              
              <div class="form-group">
                <label>Max Cost Per Request ($)</label>
                <input 
                  v-model.number="settingsForm.maxCostPerRequest" 
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="50"
                  class="form-input"
                />
              </div>
              
              <div class="form-group">
                <label>Max Daily Cost ($)</label>
                <input 
                  v-model.number="settingsForm.maxDailyCost" 
                  type="number"
                  step="1"
                  min="1"
                  max="1000"
                  class="form-input"
                />
              </div>
              
              <div class="form-group">
                <label>Reserve Tokens for Output</label>
                <input 
                  v-model.number="settingsForm.reserveTokensForOutput" 
                  type="number"
                  min="500"
                  max="8192"
                  class="form-input"
                />
              </div>
              
              <div class="form-group">
                <label>Preferences</label>
                <div class="checkbox-group">
                  <label class="checkbox-label">
                    <input 
                      v-model="settingsForm.prioritizeRecent"
                      type="checkbox"
                      class="checkbox-input"
                    />
                    Prioritize recent messages
                  </label>
                  <label class="checkbox-label">
                    <input 
                      v-model="settingsForm.includeTests"
                      type="checkbox"
                      class="checkbox-input"
                    />
                    Include test files
                  </label>
                  <label class="checkbox-label">
                    <input 
                      v-model="settingsForm.includeDocumentation"
                      type="checkbox"
                      class="checkbox-input"
                    />
                    Include documentation
                  </label>
                </div>
              </div>
            </div>
          </div>
          
          <div class="modal-footer">
            <button @click="showSettings = false" class="btn-secondary">Cancel</button>
            <button @click="saveSettings" class="btn-primary">Save Settings</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Create Window Modal -->
    <Teleport to="body">
      <div v-if="showCreateWindow" class="modal-overlay" @click="showCreateWindow = false">
        <div class="modal-content" @click.stop>
          <div class="modal-header">
            <h3>Create Context Window</h3>
            <button @click="showCreateWindow = false" class="btn-icon">
              <Icon name="mdi:close" />
            </button>
          </div>
          
          <div class="modal-body">
            <div class="create-form">
              <div class="form-group">
                <label>Window Title</label>
                <input 
                  v-model="createForm.title"
                  type="text"
                  placeholder="Enter window title..."
                  class="form-input"
                />
              </div>
              
              <div class="form-group">
                <label>Agent</label>
                <select v-model="createForm.agentId" class="form-select">
                  <option value="">Select agent...</option>
                  <option value="developer">Developer</option>
                  <option value="architect">Architect</option>
                  <option value="qa">QA Engineer</option>
                  <option value="kb-builder">KB Builder</option>
                </select>
              </div>
              
              <div class="form-group">
                <label>Objective</label>
                <textarea 
                  v-model="createForm.objective"
                  placeholder="Describe the objective for this context window..."
                  class="form-textarea"
                  rows="3"
                ></textarea>
              </div>
              
              <div class="form-group">
                <label>Files</label>
                <textarea 
                  v-model="createForm.files"
                  placeholder="Enter file paths, one per line..."
                  class="form-textarea"
                  rows="4"
                ></textarea>
              </div>
            </div>
          </div>
          
          <div class="modal-footer">
            <button @click="showCreateWindow = false" class="btn-secondary">Cancel</button>
            <button @click="createContextWindow" class="btn-primary">Create Window</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';

// Types
interface TokenEstimate {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
  willExceedBudget: boolean;
  compressionSuggested: boolean;
  compressionRatio?: number;
}

interface ContextWindow {
  id: string;
  title?: string;
  messages: any[];
  totalTokens: number;
  maxTokens: number;
  utilizationPercent: number;
  compressible: boolean;
  agentId?: string;
  createdAt: string;
}

interface AgentAllocation {
  agentId: string;
  allocated: number;
  used: number;
  remaining: number;
  percentage: number;
  isOverBudget: boolean;
}

// State
const isRefreshing = ref(false);
const showSettings = ref(false);
const showCreateWindow = ref(false);

// Data
const budgetStatus = ref({
  totalAllocated: 100000,
  totalUsed: 45000,
  totalRemaining: 55000,
  utilizationPercent: 45,
  dailyCost: 12.50,
  dailyCostPercent: 25
});

const budgetConstraints = ref({
  maxTokensPerRequest: 100000,
  maxCostPerRequest: 2.0,
  maxDailyCost: 50.0,
  reserveTokensForOutput: 4000,
  prioritizeRecent: true,
  includeTests: false,
  includeDocumentation: true
});

const agentAllocations = ref<AgentAllocation[]>([
  {
    agentId: 'developer',
    allocated: 40000,
    used: 25000,
    remaining: 15000,
    percentage: 40,
    isOverBudget: false
  },
  {
    agentId: 'architect',
    allocated: 30000,
    used: 12000,
    remaining: 18000,
    percentage: 30,
    isOverBudget: false
  },
  {
    agentId: 'qa',
    allocated: 20000,
    used: 8000,
    remaining: 12000,
    percentage: 20,
    isOverBudget: false
  },
  {
    agentId: 'kb-builder',
    allocated: 10000,
    used: 15000,
    remaining: -5000,
    percentage: 10,
    isOverBudget: true
  }
]);

const contextWindows = ref<ContextWindow[]>([
  {
    id: 'window-1',
    title: 'Component Development',
    messages: [],
    totalTokens: 15000,
    maxTokens: 20000,
    utilizationPercent: 75,
    compressible: false,
    agentId: 'developer',
    createdAt: new Date(Date.now() - 3600000).toISOString()
  },
  {
    id: 'window-2',
    title: 'Architecture Planning',
    messages: [],
    totalTokens: 18000,
    maxTokens: 16000,
    utilizationPercent: 112.5,
    compressible: true,
    agentId: 'architect',
    createdAt: new Date(Date.now() - 7200000).toISOString()
  }
]);

// Forms
const estimateForm = ref({
  provider: 'anthropic',
  model: 'claude-3-5-sonnet-20241022',
  inputText: '',
  outputLength: 1000,
  fileCount: 0
});

const settingsForm = ref({ ...budgetConstraints.value });

const createForm = ref({
  title: '',
  agentId: '',
  objective: '',
  files: ''
});

const tokenEstimate = ref<TokenEstimate | null>(null);

// Auto-refresh interval
let refreshInterval: number | null = null;

// Methods
async function refreshData() {
  if (isRefreshing.value) return;
  
  isRefreshing.value = true;
  try {
    // Use electron API to get budget data
    if (window.electronAPI?.contextBudgeter) {
      const [statusResult, windowsResult] = await Promise.all([
        window.electronAPI.contextBudgeter.executeTask('getBudgetStatus', {}),
        window.electronAPI.contextBudgeter.executeTask('getContextWindows', {})
      ]);
      
      if (statusResult.success) {
        budgetStatus.value = statusResult.data;
        agentAllocations.value = statusResult.data.agents;
      }
      if (windowsResult.success) contextWindows.value = windowsResult.data;
    }
  } catch (error) {
    console.error('Failed to refresh context budget data:', error);
  } finally {
    isRefreshing.value = false;
  }
}

async function calculateEstimate() {
  try {
    if (window.electronAPI?.context) {
      const result = await window.electronAPI.contextBudgeter.executeTask('estimateTokens', {
        provider: estimateForm.value.provider,
        model: estimateForm.value.model,
        inputText: estimateForm.value.inputText,
        outputLength: estimateForm.value.outputLength,
        fileCount: estimateForm.value.fileCount
      });
      
      if (result.success) {
        tokenEstimate.value = result.estimate;
      }
    } else {
      // Mock estimate for development
      const inputTokens = Math.ceil(estimateForm.value.inputText.length * 0.25);
      const outputTokens = estimateForm.value.outputLength;
      const fileTokens = estimateForm.value.fileCount * 1000;
      const totalTokens = inputTokens + outputTokens + fileTokens;
      
      tokenEstimate.value = {
        inputTokens: inputTokens + fileTokens,
        outputTokens,
        totalTokens,
        cost: (totalTokens / 1000000) * 3,
        willExceedBudget: totalTokens > budgetConstraints.value.maxTokensPerRequest,
        compressionSuggested: totalTokens > budgetConstraints.value.maxTokensPerRequest * 0.7,
        compressionRatio: totalTokens / budgetConstraints.value.maxTokensPerRequest
      };
    }
  } catch (error) {
    console.error('Failed to calculate token estimate:', error);
  }
}

async function optimizeAll() {
  try {
    if (window.electronAPI?.context) {
      await window.electronAPI.contextBudgeter.executeTask('optimizeAllWindows', {});
      await refreshData();
    }
  } catch (error) {
    console.error('Failed to optimize all windows:', error);
  }
}

async function compressWindow(windowId: string) {
  try {
    if (window.electronAPI?.context) {
      await window.electronAPI.contextBudgeter.executeTask('compressWindow', { windowId });
      await refreshData();
    }
  } catch (error) {
    console.error('Failed to compress window:', error);
  }
}

async function optimizeWindow(windowId: string) {
  try {
    if (window.electronAPI?.context) {
      await window.electronAPI.contextBudgeter.executeTask('optimizeWindow', { windowId });
      await refreshData();
    }
  } catch (error) {
    console.error('Failed to optimize window:', error);
  }
}

async function deleteWindow(windowId: string) {
  try {
    if (window.electronAPI?.context) {
      await window.electronAPI.contextBudgeter.executeTask('deleteWindow', { windowId });
      await refreshData();
    }
  } catch (error) {
    console.error('Failed to delete window:', error);
  }
}

async function createContextWindow() {
  try {
    const files = createForm.value.files.split('\n').filter(f => f.trim());
    
    if (window.electronAPI?.context) {
      await window.electronAPI.contextBudgeter.executeTask('createWindow', {
        title: createForm.value.title,
        agentId: createForm.value.agentId,
        objective: createForm.value.objective,
        files
      });
      
      showCreateWindow.value = false;
      createForm.value = { title: '', agentId: '', objective: '', files: '' };
      await refreshData();
    }
  } catch (error) {
    console.error('Failed to create context window:', error);
  }
}

async function saveSettings() {
  try {
    if (window.electronAPI?.context) {
      await window.electronAPI.contextBudgeter.executeTask('updateSettings', {
        settings: settingsForm.value
      });
      
      budgetConstraints.value = { ...settingsForm.value };
      showSettings.value = false;
    }
  } catch (error) {
    console.error('Failed to save settings:', error);
  }
}

function reallocate(agentId: string) {
  // TODO: Implement reallocation dialog
  console.log('Reallocate budget for agent:', agentId);
}

function viewDetails(agentId: string) {
  // TODO: Implement agent details view
  console.log('View details for agent:', agentId);
}

function viewWindowDetails(windowId: string) {
  // TODO: Implement window details view
  console.log('View details for window:', windowId);
}

function createAllocation() {
  // TODO: Implement allocation creation dialog
  console.log('Create new allocation');
}

// Helper functions
function formatTokens(tokens: number | undefined | null): string {
  if (tokens == null || tokens === undefined) {
    return '0';
  }
  if (tokens >= 1000000) {
    return (tokens / 1000000).toFixed(1) + 'M';
  } else if (tokens >= 1000) {
    return (tokens / 1000).toFixed(1) + 'K';
  }
  return tokens.toString();
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString();
}

function getBudgeUtilizationClass() {
  const utilization = budgetStatus.value.utilizationPercent;
  if (utilization >= 90) return 'badge-error';
  if (utilization >= 70) return 'badge-warning';
  return 'badge-success';
}

function getBudgetUtilizationText() {
  const utilization = budgetStatus.value.utilizationPercent;
  if (utilization >= 90) return 'Critical';
  if (utilization >= 70) return 'High Usage';
  return 'Healthy';
}

function getProgressClass(percentage: number) {
  if (percentage >= 100) return 'progress-critical';
  if (percentage >= 90) return 'progress-danger';
  if (percentage >= 70) return 'progress-warning';
  return 'progress-success';
}

function getUtilizationClass(percentage: number) {
  if (percentage >= 100) return 'critical';
  if (percentage >= 90) return 'danger';
  if (percentage >= 70) return 'warning';
  return 'success';
}

function getAgentIcon(agentId: string) {
  switch (agentId) {
    case 'developer': return 'mdi:code-braces';
    case 'architect': return 'mdi:sitemap';
    case 'qa': return 'mdi:test-tube';
    case 'kb-builder': return 'mdi:book-plus';
    default: return 'mdi:robot';
  }
}

function getAgentDisplayName(agentId: string) {
  switch (agentId) {
    case 'developer': return 'Developer';
    case 'architect': return 'Architect';
    case 'qa': return 'QA Engineer';
    case 'kb-builder': return 'KB Builder';
    default: return agentId;
  }
}

function getModelsForProvider(provider: string) {
  switch (provider) {
    case 'anthropic':
      return ['claude-sonnet-4-20250514', 'claude-opus-4-1-20250805', 'claude-3-haiku-20240307'];
    case 'openai':
      return ['gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'];
    default:
      return [];
  }
}

// Lifecycle
onMounted(async () => {
  settingsForm.value = { ...budgetConstraints.value };
  await refreshData();
  
  // Set up auto-refresh every 30 seconds
  refreshInterval = window.setInterval(refreshData, 30000);
});

onUnmounted(() => {
  if (refreshInterval) {
    window.clearInterval(refreshInterval);
  }
});
</script>

<style scoped>
.context-budgeter-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
  color: #cccccc;
  overflow-y: auto;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #252526;
  border-bottom: 1px solid #181818;
  flex-shrink: 0;
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

.badge {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
}

.badge-success { background: rgba(78, 201, 176, 0.2); color: #4ec9b0; }
.badge-warning { background: rgba(255, 193, 7, 0.2); color: #ffc107; }
.badge-error { background: rgba(205, 49, 49, 0.2); color: #cd3131; }

.header-right {
  display: flex;
  gap: 8px;
}

.budget-overview-section,
.allocations-section,
.windows-section,
.estimates-section {
  padding: 16px;
  border-bottom: 1px solid #181818;
}

.section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-weight: 600;
  margin-bottom: 12px;
  color: #ffffff;
  font-size: 13px;
}

.window-controls {
  display: flex;
  gap: 8px;
}

.budget-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.budget-card {
  padding: 16px;
  background: #252526;
  border-radius: 6px;
  border: 1px solid #3c3c3c;
}

.budget-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.budget-label {
  font-size: 12px;
  color: #999;
  text-transform: uppercase;
  font-weight: 600;
}

.budget-amount {
  font-size: 16px;
  font-weight: 600;
  color: #ffffff;
}

.budget-progress {
  height: 6px;
  background: #3c3c3c;
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 8px;
}

.progress-fill {
  height: 100%;
  transition: width 0.3s ease;
}

.progress-success { background: #4ec9b0; }
.progress-warning { background: #ffc107; }
.progress-danger { background: #ff6b6b; }
.progress-critical { background: #cd3131; }

.budget-details {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #999;
}

.allocations-list,
.windows-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.allocation-item,
.window-item {
  padding: 12px;
  background: #252526;
  border-radius: 6px;
  border: 1px solid #3c3c3c;
  transition: all 0.2s;
}

.allocation-item.over-budget {
  border-color: #cd3131;
  background: rgba(205, 49, 49, 0.1);
}

.window-item.compressible {
  border-color: #ffc107;
}

.window-item.over-limit {
  border-color: #cd3131;
}

.allocation-header,
.window-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.agent-info,
.window-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.agent-name,
.window-title {
  font-weight: 600;
  color: #ffffff;
  font-size: 13px;
}

.window-agent {
  font-size: 11px;
  color: #007acc;
  background: rgba(0, 122, 204, 0.2);
  padding: 2px 6px;
  border-radius: 3px;
}

.allocation-stats,
.window-stats {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 11px;
}

.allocation-percentage {
  color: #007acc;
  font-weight: 600;
}

.allocation-tokens,
.window-tokens {
  color: #cccccc;
}

.window-utilization {
  font-weight: 600;
}

.window-utilization.success { color: #4ec9b0; }
.window-utilization.warning { color: #ffc107; }
.window-utilization.danger { color: #ff6b6b; }
.window-utilization.critical { color: #cd3131; }

.allocation-progress {
  margin-bottom: 8px;
}

.allocation-actions,
.window-actions {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}

.window-details {
  display: flex;
  gap: 16px;
  margin: 8px 0;
  font-size: 11px;
}

.detail-group {
  display: flex;
  gap: 4px;
}

.detail-label {
  color: #999;
}

.detail-value {
  color: #cccccc;
}

.estimate-form {
  background: #252526;
  padding: 16px;
  border-radius: 6px;
  border: 1px solid #3c3c3c;
  margin-bottom: 16px;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}

.form-group label {
  font-size: 12px;
  font-weight: 600;
  color: #cccccc;
}

.form-input,
.form-select,
.form-textarea {
  padding: 8px 12px;
  background: #3c3c3c;
  border: 1px solid #6c6c6c;
  border-radius: 4px;
  color: #d4d4d4;
  font-size: 13px;
}

.form-input:focus,
.form-select:focus,
.form-textarea:focus {
  outline: none;
  border-color: #007acc;
}

.form-textarea {
  resize: vertical;
  font-family: inherit;
}

.estimate-result {
  background: #252526;
  padding: 16px;
  border-radius: 6px;
  border: 1px solid #3c3c3c;
}

.estimate-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.estimate-header h4 {
  margin: 0;
  font-size: 13px;
  color: #ffffff;
}

.estimate-cost {
  font-size: 16px;
  font-weight: 600;
  color: #007acc;
}

.estimate-breakdown {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}

.breakdown-item {
  display: flex;
  justify-content: space-between;
  padding: 4px 8px;
  background: #1e1e1e;
  border-radius: 3px;
  font-size: 12px;
}

.breakdown-item.total {
  border-top: 1px solid #3c3c3c;
  margin-top: 4px;
  font-weight: 600;
}

.breakdown-label {
  color: #999;
}

.breakdown-value {
  color: #cccccc;
}

.breakdown-value.total {
  color: #007acc;
}

.estimate-warning,
.estimate-suggestion {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 12px;
  margin-top: 8px;
}

.estimate-warning {
  background: rgba(205, 49, 49, 0.1);
  color: #cd3131;
  border: 1px solid rgba(205, 49, 49, 0.3);
}

.estimate-suggestion {
  background: rgba(255, 193, 7, 0.1);
  color: #ffc107;
  border: 1px solid rgba(255, 193, 7, 0.3);
}

.checkbox-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  cursor: pointer;
}

.checkbox-input {
  width: 16px;
  height: 16px;
}

.no-allocations,
.no-windows {
  text-align: center;
  padding: 32px;
  color: #999;
}

.no-allocations p,
.no-windows p {
  margin: 8px 0 4px;
  font-size: 14px;
}

.no-windows small {
  font-size: 12px;
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Button styles */
.btn-primary,
.btn-secondary,
.btn-small,
.btn-icon {
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
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

.btn-secondary {
  background: #3c3c3c;
  color: #cccccc;
}

.btn-secondary:hover:not(:disabled) {
  background: #4c4c4c;
}

.btn-small {
  padding: 4px 8px;
  font-size: 11px;
  background: #3c3c3c;
  color: #cccccc;
}

.btn-small:hover {
  background: #4c4c4c;
}

.btn-small.btn-warning {
  background: #ffc107;
  color: #1e1e1e;
}

.btn-small.btn-warning:hover {
  background: #e0a800;
}

.btn-small.btn-danger {
  background: #cd3131;
  color: #ffffff;
}

.btn-small.btn-danger:hover {
  background: #a02828;
}

.btn-icon {
  padding: 6px;
  background: transparent;
  color: #cccccc;
}

.btn-icon:hover:not(:disabled) {
  background: #3c3c3c;
}

.btn-icon:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 20px;
  border-top: 1px solid #181818;
  background: #252526;
}

.settings-form,
.create-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
</style>