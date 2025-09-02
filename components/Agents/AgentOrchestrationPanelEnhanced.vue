<template>
  <div class="agent-orchestration-enhanced">
    <!-- Top Control Bar -->
    <div class="control-bar">
      <div class="control-left">
        <h2 class="panel-title">
          <Icon name="mdi:robot-excited" class="title-icon" />
          Agent Orchestrator
        </h2>
        <div class="status-indicator" :class="statusClass">
          <span class="status-dot"></span>
          <span class="status-text">{{ statusText }}</span>
        </div>
      </div>
      
      <div class="control-center">
        <div class="view-switcher">
          <button 
            v-for="view in views" 
            :key="view.id"
            @click="currentView = view.id"
            class="view-btn"
            :class="{ active: currentView === view.id }"
          >
            <Icon :name="view.icon" />
            {{ view.label }}
          </button>
        </div>
      </div>
      
      <div class="control-right">
        <div class="budget-indicator">
          <Icon name="mdi:currency-usd" />
          <div class="budget-bar">
            <div class="budget-fill" :style="{ width: budgetPercentage + '%' }"></div>
          </div>
          <span>${{ totalDailyCost.toFixed(2) }}</span>
        </div>
        <button @click="showSettings = true" class="btn-icon">
          <Icon name="mdi:cog" />
        </button>
      </div>
    </div>

    <!-- Main Content Area -->
    <div class="content-area">
      <!-- Sidebar: Agent Library -->
      <div class="agent-library" :class="{ collapsed: libraryCollapsed }">
        <div class="library-header">
          <h3>Agent Library</h3>
          <button @click="libraryCollapsed = !libraryCollapsed" class="btn-collapse">
            <Icon :name="libraryCollapsed ? 'mdi:chevron-right' : 'mdi:chevron-left'" />
          </button>
        </div>
        
        <div v-if="!libraryCollapsed" class="library-content">
          <!-- Personality Selector -->
          <div class="personality-selector">
            <label>Personality Template</label>
            <select v-model="selectedPersonality" class="personality-dropdown">
              <option value="">Default</option>
              <option v-for="p in personalities" :key="p.id" :value="p.id">
                {{ p.name }}
              </option>
              <option value="custom">+ Custom Personality</option>
            </select>
          </div>
          
          <!-- Available Agents -->
          <div class="agent-cards">
            <div 
              v-for="agent in availableAgentTypes" 
              :key="agent.id"
              class="agent-card"
              :draggable="true"
              @dragstart="startDragAgent($event, agent)"
              @dragend="endDragAgent"
              :class="{ dragging: draggedAgent?.id === agent.id }"
            >
              <div class="agent-avatar" :style="{ background: agent.color }">
                <Icon :name="agent.icon" size="24" />
              </div>
              <div class="agent-info">
                <h4>{{ agent.name }}</h4>
                <p>{{ agent.description }}</p>
                <div class="agent-tags">
                  <span v-for="tag in agent.tags" :key="tag" class="tag">
                    {{ tag }}
                  </span>
                </div>
              </div>
              <div class="agent-actions">
                <button @click="quickSpawnAgent(agent)" class="btn-spawn" title="Quick Spawn">
                  <Icon name="mdi:plus" />
                </button>
              </div>
            </div>
          </div>
          
          <!-- Custom Agent Creator -->
          <div v-if="selectedPersonality === 'custom'" class="custom-creator">
            <input 
              v-model="customAgent.name" 
              placeholder="Agent Name"
              class="custom-input"
            />
            <textarea 
              v-model="customAgent.instructions" 
              placeholder="Custom instructions..."
              class="custom-textarea"
              rows="4"
            />
            <button @click="createCustomAgent" class="btn-create">
              Create Custom Agent
            </button>
          </div>
        </div>
      </div>

      <!-- Main Canvas Area -->
      <div class="canvas-container" :class="{ 'library-collapsed': libraryCollapsed }">
        <!-- Canvas View -->
        <div v-if="currentView === 'canvas'" class="workflow-canvas" 
             @dragover="handleCanvasDragOver"
             @drop="handleCanvasDrop">
          
          <!-- Grid Background -->
          <svg class="canvas-grid" width="100%" height="100%">
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#2a2a2a" stroke-width="1"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
          
          <!-- Connection Lines -->
          <svg class="connections-layer" width="100%" height="100%">
            <line 
              v-for="conn in connections" 
              :key="conn.id"
              :x1="conn.x1" 
              :y1="conn.y1" 
              :x2="conn.x2" 
              :y2="conn.y2"
              stroke="#4a9eff"
              stroke-width="2"
              stroke-dasharray="5,5"
              class="connection-line"
            />
          </svg>
          
          <!-- Deployed Agents -->
          <div 
            v-for="agent in deployedAgents" 
            :key="agent.instanceId"
            class="deployed-agent"
            :style="{ 
              left: agent.position.x + 'px', 
              top: agent.position.y + 'px',
              '--agent-color': agent.color
            }"
            :draggable="true"
            @dragstart="startDragDeployed($event, agent)"
            @dragend="endDragDeployed"
            @click="selectAgent(agent)"
            :class="{ 
              selected: selectedAgent?.instanceId === agent.instanceId,
              active: agent.status === 'running',
              error: agent.status === 'error'
            }"
          >
            <div class="agent-status-ring" :class="agent.status"></div>
            <div class="agent-icon">
              <Icon :name="agent.icon" />
            </div>
            <div class="agent-label">{{ agent.name }}</div>
            <div class="agent-instance">{{ agent.instanceId.slice(0, 8) }}</div>
            
            <!-- Connection Points -->
            <div 
              class="connection-point input"
              @mousedown="startConnection(agent, 'input')"
            ></div>
            <div 
              class="connection-point output"
              @mousedown="startConnection(agent, 'output')"
            ></div>
            
            <!-- Quick Actions -->
            <div class="agent-quick-actions">
              <button @click.stop="toggleAgentStatus(agent)" class="action-btn">
                <Icon :name="agent.status === 'running' ? 'mdi:pause' : 'mdi:play'" />
              </button>
              <button @click.stop="removeAgent(agent)" class="action-btn danger">
                <Icon name="mdi:close" />
              </button>
            </div>
          </div>
          
          <!-- Drop Zone Indicator -->
          <div 
            v-if="showDropZone" 
            class="drop-zone"
            :style="{ left: dropZone.x + 'px', top: dropZone.y + 'px' }"
          >
            <Icon name="mdi:plus-circle" size="48" />
          </div>
        </div>

        <!-- Pipeline View -->
        <div v-else-if="currentView === 'pipeline'" class="pipeline-view">
          <div class="pipeline-header">
            <h3>Active Pipelines</h3>
            <button @click="createNewPipeline" class="btn-primary">
              <Icon name="mdi:plus" /> New Pipeline
            </button>
          </div>
          
          <div class="pipelines-grid">
            <div 
              v-for="pipeline in activePipelines" 
              :key="pipeline.id"
              class="pipeline-card"
              :class="{ expanded: expandedPipeline === pipeline.id }"
            >
              <div class="pipeline-header" @click="togglePipeline(pipeline.id)">
                <div class="pipeline-info">
                  <h4>{{ pipeline.name }}</h4>
                  <span class="pipeline-status" :class="pipeline.status">
                    {{ pipeline.status }}
                  </span>
                </div>
                <div class="pipeline-metrics">
                  <span><Icon name="mdi:clock" /> {{ formatDuration(pipeline.duration) }}</span>
                  <span><Icon name="mdi:currency-usd" /> {{ pipeline.cost.toFixed(2) }}</span>
                </div>
              </div>
              
              <div v-if="expandedPipeline === pipeline.id" class="pipeline-details">
                <div class="pipeline-stages">
                  <div 
                    v-for="(stage, index) in pipeline.stages" 
                    :key="index"
                    class="stage"
                    :class="{ 
                      completed: stage.status === 'completed',
                      active: stage.status === 'active',
                      pending: stage.status === 'pending'
                    }"
                  >
                    <div class="stage-icon">
                      <Icon :name="getAgentIcon(stage.agentType)" />
                    </div>
                    <div class="stage-info">
                      <span class="stage-name">{{ stage.name }}</span>
                      <span class="stage-status">{{ stage.status }}</span>
                    </div>
                    <div v-if="index < pipeline.stages.length - 1" class="stage-connector"></div>
                  </div>
                </div>
                
                <div class="pipeline-logs">
                  <div v-for="log in pipeline.logs.slice(-5)" :key="log.id" class="log-entry">
                    <span class="log-time">{{ formatTime(log.timestamp) }}</span>
                    <span class="log-message">{{ log.message }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Monitor View -->
        <div v-else-if="currentView === 'monitor'" class="monitor-view">
          <div class="metrics-grid">
            <div class="metric-card">
              <div class="metric-icon">
                <Icon name="mdi:robot" />
              </div>
              <div class="metric-data">
                <h3>{{ activeAgentsCount }}</h3>
                <p>Active Agents</p>
              </div>
              <div class="metric-chart">
                <svg viewBox="0 0 100 40">
                  <polyline
                    points="0,30 20,25 40,27 60,20 80,22 100,18"
                    fill="none"
                    stroke="#4a9eff"
                    stroke-width="2"
                  />
                </svg>
              </div>
            </div>
            
            <div class="metric-card">
              <div class="metric-icon success">
                <Icon name="mdi:check-circle" />
              </div>
              <div class="metric-data">
                <h3>{{ successRate }}%</h3>
                <p>Success Rate</p>
              </div>
              <div class="metric-progress">
                <div class="progress-bar">
                  <div class="progress-fill success" :style="{ width: successRate + '%' }"></div>
                </div>
              </div>
            </div>
            
            <div class="metric-card">
              <div class="metric-icon warning">
                <Icon name="mdi:clock" />
              </div>
              <div class="metric-data">
                <h3>{{ avgResponseTime }}ms</h3>
                <p>Avg Response</p>
              </div>
            </div>
            
            <div class="metric-card">
              <div class="metric-icon info">
                <Icon name="mdi:message-processing" />
              </div>
              <div class="metric-data">
                <h3>{{ totalTokensUsed }}</h3>
                <p>Tokens Used</p>
              </div>
            </div>
          </div>
          
          <!-- Real-time Activity Feed -->
          <div class="activity-feed">
            <h3>Real-time Activity</h3>
            <div class="activity-stream">
              <div 
                v-for="activity in recentActivities" 
                :key="activity.id"
                class="activity-item"
                :class="activity.type"
              >
                <div class="activity-icon">
                  <Icon :name="getActivityIcon(activity.type)" />
                </div>
                <div class="activity-content">
                  <p>{{ activity.message }}</p>
                  <span class="activity-time">{{ formatRelativeTime(activity.timestamp) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Properties Panel -->
      <transition name="slide">
        <div v-if="selectedAgent" class="properties-panel">
          <div class="properties-header">
            <h3>Agent Properties</h3>
            <button @click="selectedAgent = null" class="btn-close">
              <Icon name="mdi:close" />
            </button>
          </div>
          
          <div class="properties-content">
            <div class="property-group">
              <label>Instance ID</label>
              <div class="property-value">{{ selectedAgent.instanceId }}</div>
            </div>
            
            <div class="property-group">
              <label>Type</label>
              <div class="property-value">{{ selectedAgent.type }}</div>
            </div>
            
            <div class="property-group">
              <label>Personality</label>
              <select v-model="selectedAgent.personalityId" class="property-select">
                <option value="">Default</option>
                <option v-for="p in personalities" :key="p.id" :value="p.id">
                  {{ p.name }}
                </option>
              </select>
            </div>
            
            <div class="property-group">
              <label>Status</label>
              <div class="property-value status" :class="selectedAgent.status">
                {{ selectedAgent.status }}
              </div>
            </div>
            
            <div class="property-group">
              <label>Custom Instructions</label>
              <textarea 
                v-model="selectedAgent.customInstructions" 
                class="property-textarea"
                rows="4"
                placeholder="Add custom instructions for this agent..."
              />
            </div>
            
            <div class="property-actions">
              <button @click="saveAgentProperties" class="btn-primary">
                Save Changes
              </button>
              <button @click="spawnClaudeInstance" class="btn-secondary">
                <Icon name="mdi:console" /> Spawn Claude
              </button>
            </div>
          </div>
        </div>
      </transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, onMounted, onUnmounted } from 'vue';
import { useAgentOrchestrationStore } from '~/stores/agent-orchestration-client';
import { useClaudeInstancesStore } from '~/stores/claude-instances';
import Icon from '~/components/Icon.vue';

interface AgentType {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  tags: string[];
  capabilities: string[];
}

interface DeployedAgent {
  instanceId: string;
  type: string;
  name: string;
  icon: string;
  color: string;
  position: { x: number; y: number };
  status: 'idle' | 'running' | 'paused' | 'error';
  personalityId?: string;
  customInstructions?: string;
  connections: { input?: string; output?: string };
}

interface Pipeline {
  id: string;
  name: string;
  status: 'running' | 'completed' | 'failed' | 'paused';
  stages: Array<{
    name: string;
    agentType: string;
    status: 'pending' | 'active' | 'completed';
  }>;
  duration: number;
  cost: number;
  logs: Array<{
    id: string;
    timestamp: Date;
    message: string;
  }>;
}

const orchestrationStore = useAgentOrchestrationStore();
const claudeStore = useClaudeInstancesStore();

// View Management
const currentView = ref<'canvas' | 'pipeline' | 'monitor'>('canvas');
const views = [
  { id: 'canvas', label: 'Canvas', icon: 'mdi:vector-arrange-below' },
  { id: 'pipeline', label: 'Pipelines', icon: 'mdi:pipe' },
  { id: 'monitor', label: 'Monitor', icon: 'mdi:monitor-dashboard' }
];

// UI State
const libraryCollapsed = ref(false);
const showSettings = ref(false);
const selectedPersonality = ref('');
const selectedAgent = ref<DeployedAgent | null>(null);
const expandedPipeline = ref<string | null>(null);
const showDropZone = ref(false);
const dropZone = reactive({ x: 0, y: 0 });

// Agent Types
const availableAgentTypes = ref<AgentType[]>([
  {
    id: 'architect',
    name: 'Architect',
    description: 'System design and planning',
    icon: 'mdi:floor-plan',
    color: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    tags: ['planner', 'designer'],
    capabilities: ['system-design', 'architecture', 'planning']
  },
  {
    id: 'developer',
    name: 'Developer',
    description: 'Code implementation and features',
    icon: 'mdi:code-braces',
    color: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    tags: ['coder', 'implementer'],
    capabilities: ['coding', 'debugging', 'refactoring']
  },
  {
    id: 'reviewer',
    name: 'Code Reviewer',
    description: 'Code quality and best practices',
    icon: 'mdi:magnify-scan',
    color: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    tags: ['quality', 'reviewer'],
    capabilities: ['code-review', 'quality-check', 'best-practices']
  },
  {
    id: 'tester',
    name: 'QA Tester',
    description: 'Testing and validation',
    icon: 'mdi:test-tube',
    color: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    tags: ['testing', 'qa'],
    capabilities: ['testing', 'validation', 'bug-finding']
  },
  {
    id: 'documenter',
    name: 'Documenter',
    description: 'Documentation and guides',
    icon: 'mdi:book-open-page-variant',
    color: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    tags: ['docs', 'writer'],
    capabilities: ['documentation', 'guides', 'api-docs']
  },
  {
    id: 'devops',
    name: 'DevOps',
    description: 'Deployment and infrastructure',
    icon: 'mdi:docker',
    color: 'linear-gradient(135deg, #30cfd0 0%, #330867 100%)',
    tags: ['deploy', 'infra'],
    capabilities: ['deployment', 'ci-cd', 'infrastructure']
  }
]);

// Personalities (can be loaded from store or API)
const personalities = ref([
  { id: 'focused', name: 'Focused & Efficient' },
  { id: 'creative', name: 'Creative & Explorative' },
  { id: 'thorough', name: 'Thorough & Detailed' },
  { id: 'pragmatic', name: 'Pragmatic & Practical' },
  { id: 'mentor', name: 'Teaching & Explanatory' }
]);

// Deployed Agents on Canvas
const deployedAgents = ref<DeployedAgent[]>([]);
const connections = ref<Array<{ id: string; x1: number; y1: number; x2: number; y2: number }>>([]);

// Pipelines
const activePipelines = ref<Pipeline[]>([]);

// Metrics
const activeAgentsCount = computed(() => deployedAgents.value.filter(a => a.status === 'running').length);
const successRate = ref(92);
const avgResponseTime = ref(245);
const totalTokensUsed = ref(152340);
const totalDailyCost = computed(() => orchestrationStore.totalDailyCost);
const budgetPercentage = computed(() => (totalDailyCost.value / orchestrationStore.dailyBudgetLimit) * 100);

// Recent Activities
const recentActivities = ref([
  { id: '1', type: 'success', message: 'Architect completed system design', timestamp: new Date() },
  { id: '2', type: 'info', message: 'Developer started implementation', timestamp: new Date(Date.now() - 60000) },
  { id: '3', type: 'warning', message: 'QA Tester found 3 issues', timestamp: new Date(Date.now() - 120000) }
]);

// Drag and Drop
const draggedAgent = ref<AgentType | null>(null);
const draggedDeployed = ref<DeployedAgent | null>(null);

// Custom Agent
const customAgent = reactive({
  name: '',
  instructions: ''
});

// Status Computed
const statusClass = computed(() => {
  if (!orchestrationStore.isInitialized) return 'initializing';
  if (activeAgentsCount.value === 0) return 'idle';
  return 'active';
});

const statusText = computed(() => {
  if (!orchestrationStore.isInitialized) return 'Initializing...';
  if (activeAgentsCount.value === 0) return 'Ready';
  return `${activeAgentsCount.value} Active`;
});

// Methods
function startDragAgent(event: DragEvent, agent: AgentType) {
  draggedAgent.value = agent;
  event.dataTransfer!.effectAllowed = 'copy';
  event.dataTransfer!.setData('text/plain', agent.id);
}

function endDragAgent() {
  draggedAgent.value = null;
}

function startDragDeployed(event: DragEvent, agent: DeployedAgent) {
  draggedDeployed.value = agent;
  event.dataTransfer!.effectAllowed = 'move';
}

function endDragDeployed() {
  draggedDeployed.value = null;
}

function handleCanvasDragOver(event: DragEvent) {
  event.preventDefault();
  event.dataTransfer!.dropEffect = draggedAgent.value ? 'copy' : 'move';
  
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  dropZone.x = event.clientX - rect.left - 50;
  dropZone.y = event.clientY - rect.top - 50;
  showDropZone.value = true;
}

function handleCanvasDrop(event: DragEvent) {
  event.preventDefault();
  showDropZone.value = false;
  
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const x = event.clientX - rect.left - 50;
  const y = event.clientY - rect.top - 50;
  
  if (draggedAgent.value) {
    // Deploy new agent
    const agent = draggedAgent.value;
    const instanceId = `${agent.id}-${Date.now().toString(36)}`;
    
    deployedAgents.value.push({
      instanceId,
      type: agent.id,
      name: agent.name,
      icon: agent.icon,
      color: agent.color,
      position: { x, y },
      status: 'idle',
      personalityId: selectedPersonality.value,
      connections: {}
    });
    
    draggedAgent.value = null;
  } else if (draggedDeployed.value) {
    // Move existing agent
    draggedDeployed.value.position = { x, y };
    draggedDeployed.value = null;
  }
}

function quickSpawnAgent(agent: AgentType) {
  const instanceId = `${agent.id}-${Date.now().toString(36)}`;
  
  // Find a good position (stagger them)
  const existingCount = deployedAgents.value.length;
  const x = 100 + (existingCount % 4) * 200;
  const y = 100 + Math.floor(existingCount / 4) * 150;
  
  deployedAgents.value.push({
    instanceId,
    type: agent.id,
    name: agent.name,
    icon: agent.icon,
    color: agent.color,
    position: { x, y },
    status: 'idle',
    personalityId: selectedPersonality.value,
    connections: {}
  });
}

function selectAgent(agent: DeployedAgent) {
  selectedAgent.value = agent;
}

function toggleAgentStatus(agent: DeployedAgent) {
  if (agent.status === 'running') {
    agent.status = 'paused';
  } else if (agent.status === 'paused' || agent.status === 'idle') {
    agent.status = 'running';
  }
}

function removeAgent(agent: DeployedAgent) {
  const index = deployedAgents.value.findIndex(a => a.instanceId === agent.instanceId);
  if (index !== -1) {
    deployedAgents.value.splice(index, 1);
  }
  if (selectedAgent.value?.instanceId === agent.instanceId) {
    selectedAgent.value = null;
  }
}

function startConnection(agent: DeployedAgent, type: 'input' | 'output') {
  // Implementation for creating connections between agents
  console.log('Starting connection from', agent.instanceId, type);
}

function createCustomAgent() {
  if (!customAgent.name) return;
  
  const customAgentType: AgentType = {
    id: `custom-${Date.now()}`,
    name: customAgent.name,
    description: 'Custom agent',
    icon: 'mdi:robot',
    color: 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
    tags: ['custom'],
    capabilities: []
  };
  
  availableAgentTypes.value.push(customAgentType);
  customAgent.name = '';
  customAgent.instructions = '';
  selectedPersonality.value = '';
}

function saveAgentProperties() {
  if (!selectedAgent.value) return;
  // Save agent properties
  console.log('Saving agent properties', selectedAgent.value);
}

async function spawnClaudeInstance() {
  if (!selectedAgent.value) return;
  
  // Create a Claude instance with the agent's personality
  const instanceId = selectedAgent.value.instanceId;
  const personality = selectedAgent.value.personalityId || 'default';
  const instructions = selectedAgent.value.customInstructions || '';
  
  // Call Claude store to create instance
  await claudeStore.createInstance(
    instanceId,
    `${selectedAgent.value.name} Agent`,
    localStorage.getItem('workspacePath') || '.',
    personality
  );
  
  console.log('Spawning Claude instance for', selectedAgent.value.name);
}

function createNewPipeline() {
  const pipeline: Pipeline = {
    id: `pipeline-${Date.now()}`,
    name: `Pipeline ${activePipelines.value.length + 1}`,
    status: 'running',
    stages: [
      { name: 'Planning', agentType: 'architect', status: 'completed' },
      { name: 'Implementation', agentType: 'developer', status: 'active' },
      { name: 'Testing', agentType: 'tester', status: 'pending' },
      { name: 'Documentation', agentType: 'documenter', status: 'pending' }
    ],
    duration: 0,
    cost: 0,
    logs: []
  };
  
  activePipelines.value.push(pipeline);
}

function togglePipeline(pipelineId: string) {
  expandedPipeline.value = expandedPipeline.value === pipelineId ? null : pipelineId;
}

function getAgentIcon(type: string): string {
  const agent = availableAgentTypes.value.find(a => a.id === type);
  return agent?.icon || 'mdi:robot';
}

function getActivityIcon(type: string): string {
  switch (type) {
    case 'success': return 'mdi:check-circle';
    case 'error': return 'mdi:alert-circle';
    case 'warning': return 'mdi:alert';
    case 'info': return 'mdi:information';
    default: return 'mdi:circle';
  }
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatRelativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  
  if (minutes === 0) return 'just now';
  if (minutes === 1) return '1 minute ago';
  if (minutes < 60) return `${minutes} minutes ago`;
  return date.toLocaleTimeString();
}

// Initialize
onMounted(() => {
  // Initialize orchestration store if needed
  const workspacePath = localStorage.getItem('workspacePath');
  if (workspacePath && !orchestrationStore.isInitialized) {
    orchestrationStore.initialize(workspacePath);
  }
});
</script>

<style scoped>
.agent-orchestration-enhanced {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #1a1a1a;
  color: #e0e0e0;
  font-family: 'Inter', system-ui, sans-serif;
}

/* Control Bar */
.control-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: #242424;
  border-bottom: 1px solid #333;
  min-height: 60px;
}

.control-left {
  display: flex;
  align-items: center;
  gap: 20px;
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #fff;
}

.title-icon {
  color: #4a9eff;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: #2a2a2a;
  border-radius: 20px;
  font-size: 13px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  animation: pulse 2s infinite;
}

.status-indicator.idle .status-dot {
  background: #666;
}

.status-indicator.active .status-dot {
  background: #4ade80;
}

.status-indicator.initializing .status-dot {
  background: #fbbf24;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.control-center {
  flex: 1;
  display: flex;
  justify-content: center;
}

.view-switcher {
  display: flex;
  gap: 4px;
  background: #2a2a2a;
  padding: 4px;
  border-radius: 8px;
}

.view-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: transparent;
  border: none;
  color: #999;
  cursor: pointer;
  border-radius: 6px;
  font-size: 14px;
  transition: all 0.2s;
}

.view-btn:hover {
  color: #fff;
  background: #333;
}

.view-btn.active {
  color: #fff;
  background: #4a9eff;
}

.control-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.budget-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #2a2a2a;
  border-radius: 8px;
}

.budget-bar {
  width: 100px;
  height: 6px;
  background: #333;
  border-radius: 3px;
  overflow: hidden;
}

.budget-fill {
  height: 100%;
  background: linear-gradient(90deg, #4ade80, #fbbf24);
  transition: width 0.3s;
}

.btn-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: #2a2a2a;
  border: none;
  border-radius: 8px;
  color: #999;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-icon:hover {
  background: #333;
  color: #fff;
}

/* Content Area */
.content-area {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* Agent Library */
.agent-library {
  width: 280px;
  background: #1e1e1e;
  border-right: 1px solid #333;
  display: flex;
  flex-direction: column;
  transition: width 0.3s;
}

.agent-library.collapsed {
  width: 50px;
}

.library-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid #333;
}

.library-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #999;
}

.btn-collapse {
  background: none;
  border: none;
  color: #666;
  cursor: pointer;
  padding: 4px;
}

.library-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.personality-selector {
  margin-bottom: 20px;
}

.personality-selector label {
  display: block;
  margin-bottom: 8px;
  font-size: 12px;
  color: #999;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.personality-dropdown {
  width: 100%;
  padding: 8px 12px;
  background: #2a2a2a;
  border: 1px solid #333;
  border-radius: 6px;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
}

.agent-cards {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.agent-card {
  display: flex;
  gap: 12px;
  padding: 12px;
  background: #2a2a2a;
  border: 1px solid #333;
  border-radius: 8px;
  cursor: move;
  transition: all 0.2s;
}

.agent-card:hover {
  background: #333;
  border-color: #4a9eff;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(74, 158, 255, 0.2);
}

.agent-card.dragging {
  opacity: 0.5;
}

.agent-avatar {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
}

.agent-info {
  flex: 1;
  min-width: 0;
}

.agent-info h4 {
  margin: 0 0 4px 0;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
}

.agent-info p {
  margin: 0 0 8px 0;
  font-size: 12px;
  color: #999;
  line-height: 1.4;
}

.agent-tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.tag {
  padding: 2px 6px;
  background: #333;
  border-radius: 4px;
  font-size: 10px;
  color: #999;
}

.agent-actions {
  display: flex;
  align-items: center;
}

.btn-spawn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #333;
  border: none;
  border-radius: 6px;
  color: #999;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-spawn:hover {
  background: #4a9eff;
  color: #fff;
}

.custom-creator {
  margin-top: 20px;
  padding: 16px;
  background: #242424;
  border-radius: 8px;
}

.custom-input,
.custom-textarea {
  width: 100%;
  padding: 8px 12px;
  margin-bottom: 12px;
  background: #2a2a2a;
  border: 1px solid #333;
  border-radius: 6px;
  color: #fff;
  font-size: 14px;
}

.custom-textarea {
  resize: vertical;
  font-family: inherit;
}

.btn-create {
  width: 100%;
  padding: 10px;
  background: #4a9eff;
  border: none;
  border-radius: 6px;
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-create:hover {
  background: #3a8eef;
}

/* Canvas Container */
.canvas-container {
  flex: 1;
  position: relative;
  overflow: hidden;
  background: #161616;
}

.canvas-container.library-collapsed {
  margin-left: 0;
}

/* Workflow Canvas */
.workflow-canvas {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: auto;
}

.canvas-grid {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
}

.connections-layer {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
}

.connection-line {
  animation: dash 20s linear infinite;
}

@keyframes dash {
  to {
    stroke-dashoffset: -1000;
  }
}

/* Deployed Agents */
.deployed-agent {
  position: absolute;
  width: 100px;
  padding: 12px;
  background: var(--agent-color, #2a2a2a);
  border: 2px solid #333;
  border-radius: 12px;
  cursor: move;
  transition: all 0.2s;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.deployed-agent:hover {
  transform: scale(1.05);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

.deployed-agent.selected {
  border-color: #4a9eff;
  box-shadow: 0 0 0 3px rgba(74, 158, 255, 0.2);
}

.deployed-agent.active .agent-status-ring {
  animation: spin 2s linear infinite;
}

.deployed-agent.error {
  border-color: #ef4444;
}

.agent-status-ring {
  position: absolute;
  top: -2px;
  left: -2px;
  right: -2px;
  bottom: -2px;
  border: 2px solid transparent;
  border-radius: 12px;
  pointer-events: none;
}

.agent-status-ring.running {
  border-color: #4ade80;
  border-top-color: transparent;
}

.agent-status-ring.error {
  border-color: #ef4444;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.agent-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: #fff;
  font-size: 20px;
}

.agent-label {
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  text-align: center;
}

.agent-instance {
  font-size: 10px;
  color: #999;
  font-family: 'Monaco', monospace;
}

.connection-point {
  position: absolute;
  width: 12px;
  height: 12px;
  background: #4a9eff;
  border: 2px solid #1a1a1a;
  border-radius: 50%;
  cursor: crosshair;
  opacity: 0;
  transition: opacity 0.2s;
}

.deployed-agent:hover .connection-point {
  opacity: 1;
}

.connection-point.input {
  left: -6px;
  top: 50%;
  transform: translateY(-50%);
}

.connection-point.output {
  right: -6px;
  top: 50%;
  transform: translateY(-50%);
}

.agent-quick-actions {
  position: absolute;
  top: -30px;
  right: 0;
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s;
}

.deployed-agent:hover .agent-quick-actions {
  opacity: 1;
}

.action-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #2a2a2a;
  border: 1px solid #333;
  border-radius: 4px;
  color: #999;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:hover {
  background: #333;
  color: #fff;
}

.action-btn.danger:hover {
  background: #ef4444;
  border-color: #ef4444;
}

.drop-zone {
  position: absolute;
  width: 100px;
  height: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(74, 158, 255, 0.1);
  border: 2px dashed #4a9eff;
  border-radius: 12px;
  color: #4a9eff;
  pointer-events: none;
}

/* Pipeline View */
.pipeline-view {
  padding: 24px;
  overflow-y: auto;
}

.pipeline-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}

.pipeline-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #fff;
}

.btn-primary {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  background: #4a9eff;
  border: none;
  border-radius: 8px;
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-primary:hover {
  background: #3a8eef;
}

.btn-secondary {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  background: #333;
  border: none;
  border-radius: 8px;
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-secondary:hover {
  background: #444;
}

.pipelines-grid {
  display: grid;
  gap: 16px;
}

.pipeline-card {
  background: #242424;
  border: 1px solid #333;
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.2s;
}

.pipeline-card:hover {
  border-color: #4a9eff;
}

.pipeline-card.expanded {
  border-color: #4a9eff;
}

.pipeline-card .pipeline-header {
  padding: 16px;
  cursor: pointer;
  margin-bottom: 0;
}

.pipeline-info h4 {
  margin: 0 0 8px 0;
  font-size: 16px;
  font-weight: 600;
  color: #fff;
}

.pipeline-status {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  text-transform: uppercase;
}

.pipeline-status.running {
  background: rgba(74, 158, 255, 0.2);
  color: #4a9eff;
}

.pipeline-status.completed {
  background: rgba(74, 222, 128, 0.2);
  color: #4ade80;
}

.pipeline-status.failed {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

.pipeline-metrics {
  display: flex;
  gap: 16px;
  font-size: 13px;
  color: #999;
}

.pipeline-metrics span {
  display: flex;
  align-items: center;
  gap: 4px;
}

.pipeline-details {
  padding: 0 16px 16px;
}

.pipeline-stages {
  display: flex;
  align-items: center;
  gap: 0;
  margin-bottom: 20px;
  overflow-x: auto;
  padding: 16px 0;
}

.stage {
  display: flex;
  align-items: center;
  position: relative;
}

.stage-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #2a2a2a;
  border: 2px solid #333;
  border-radius: 50%;
  color: #999;
  transition: all 0.2s;
}

.stage.completed .stage-icon {
  background: rgba(74, 222, 128, 0.2);
  border-color: #4ade80;
  color: #4ade80;
}

.stage.active .stage-icon {
  background: rgba(74, 158, 255, 0.2);
  border-color: #4a9eff;
  color: #4a9eff;
  animation: pulse 2s infinite;
}

.stage-info {
  margin-left: 12px;
}

.stage-name {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: #fff;
}

.stage-status {
  display: block;
  font-size: 11px;
  color: #999;
  text-transform: uppercase;
}

.stage-connector {
  position: absolute;
  left: 40px;
  width: 60px;
  height: 2px;
  background: #333;
  z-index: -1;
}

.stage.completed .stage-connector {
  background: #4ade80;
}

.pipeline-logs {
  background: #1a1a1a;
  border-radius: 8px;
  padding: 12px;
  max-height: 200px;
  overflow-y: auto;
}

.log-entry {
  display: flex;
  gap: 12px;
  padding: 4px 0;
  font-size: 12px;
  font-family: 'Monaco', monospace;
}

.log-time {
  color: #666;
  white-space: nowrap;
}

.log-message {
  color: #999;
  flex: 1;
}

/* Monitor View */
.monitor-view {
  padding: 24px;
  overflow-y: auto;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 16px;
  margin-bottom: 32px;
}

.metric-card {
  background: #242424;
  border: 1px solid #333;
  border-radius: 12px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
}

.metric-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(74, 158, 255, 0.1);
  border-radius: 12px;
  color: #4a9eff;
  font-size: 24px;
}

.metric-icon.success {
  background: rgba(74, 222, 128, 0.1);
  color: #4ade80;
}

.metric-icon.warning {
  background: rgba(251, 191, 36, 0.1);
  color: #fbbf24;
}

.metric-icon.info {
  background: rgba(148, 163, 184, 0.1);
  color: #94a3b8;
}

.metric-data {
  flex: 1;
}

.metric-data h3 {
  margin: 0 0 4px 0;
  font-size: 24px;
  font-weight: 700;
  color: #fff;
}

.metric-data p {
  margin: 0;
  font-size: 13px;
  color: #999;
}

.metric-chart {
  width: 80px;
  height: 40px;
}

.metric-progress {
  width: 100%;
}

.progress-bar {
  width: 100%;
  height: 8px;
  background: #333;
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: #4a9eff;
  transition: width 0.3s;
}

.progress-fill.success {
  background: #4ade80;
}

/* Activity Feed */
.activity-feed {
  background: #242424;
  border: 1px solid #333;
  border-radius: 12px;
  padding: 20px;
}

.activity-feed h3 {
  margin: 0 0 16px 0;
  font-size: 16px;
  font-weight: 600;
  color: #fff;
}

.activity-stream {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 400px;
  overflow-y: auto;
}

.activity-item {
  display: flex;
  gap: 12px;
  padding: 12px;
  background: #1a1a1a;
  border-radius: 8px;
  transition: all 0.2s;
}

.activity-item:hover {
  background: #2a2a2a;
}

.activity-icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  flex-shrink: 0;
}

.activity-item.success .activity-icon {
  background: rgba(74, 222, 128, 0.2);
  color: #4ade80;
}

.activity-item.error .activity-icon {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

.activity-item.warning .activity-icon {
  background: rgba(251, 191, 36, 0.2);
  color: #fbbf24;
}

.activity-item.info .activity-icon {
  background: rgba(74, 158, 255, 0.2);
  color: #4a9eff;
}

.activity-content {
  flex: 1;
}

.activity-content p {
  margin: 0 0 4px 0;
  font-size: 13px;
  color: #fff;
}

.activity-time {
  font-size: 11px;
  color: #666;
}

/* Properties Panel */
.properties-panel {
  width: 320px;
  background: #1e1e1e;
  border-left: 1px solid #333;
  display: flex;
  flex-direction: column;
}

.properties-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid #333;
}

.properties-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #999;
}

.btn-close {
  background: none;
  border: none;
  color: #666;
  cursor: pointer;
  padding: 4px;
}

.btn-close:hover {
  color: #fff;
}

.properties-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.property-group {
  margin-bottom: 20px;
}

.property-group label {
  display: block;
  margin-bottom: 8px;
  font-size: 12px;
  color: #999;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.property-value {
  font-size: 14px;
  color: #fff;
}

.property-value.status {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  text-transform: uppercase;
}

.property-value.status.idle {
  background: rgba(148, 163, 184, 0.2);
  color: #94a3b8;
}

.property-value.status.running {
  background: rgba(74, 222, 128, 0.2);
  color: #4ade80;
}

.property-value.status.paused {
  background: rgba(251, 191, 36, 0.2);
  color: #fbbf24;
}

.property-value.status.error {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

.property-select,
.property-textarea {
  width: 100%;
  padding: 8px 12px;
  background: #2a2a2a;
  border: 1px solid #333;
  border-radius: 6px;
  color: #fff;
  font-size: 14px;
}

.property-textarea {
  resize: vertical;
  font-family: inherit;
}

.property-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 24px;
}

/* Transitions */
.slide-enter-active,
.slide-leave-active {
  transition: transform 0.3s;
}

.slide-enter-from,
.slide-leave-to {
  transform: translateX(100%);
}

/* Scrollbars */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: #1a1a1a;
}

::-webkit-scrollbar-thumb {
  background: #333;
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: #444;
}
</style>