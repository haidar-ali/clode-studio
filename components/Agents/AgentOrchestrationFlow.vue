<template>
  <div class="agent-orchestration-flow">
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
        <button @click="savePipeline" class="btn-icon" title="Save Pipeline">
          <Icon name="mdi:content-save" />
        </button>
        <button @click="loadPipeline" class="btn-icon" title="Load Pipeline">
          <Icon name="mdi:folder-open" />
        </button>
        <button @click="clearCanvas" class="btn-icon" title="Clear Canvas">
          <Icon name="mdi:delete-sweep" />
        </button>
        <button @click="showSettings = true" class="btn-icon">
          <Icon name="mdi:cog" />
        </button>
      </div>
    </div>

    <!-- Main Content Area -->
    <div class="content-area">
      <!-- Sidebar: Agent Library -->
      <div class="agent-library" :class="{ collapsed: libraryCollapsed }">
        <div class="library-header" v-if="!libraryCollapsed">
          <h3>Agent Library</h3>
          <div class="header-actions">
            <button 
              @click="createEmptyGroup" 
              class="btn-group"
              title="Create Group">
              <Icon name="mdi:group" size="14" />
              <span>Group</span>
            </button>
            <button @click="libraryCollapsed = !libraryCollapsed" class="btn-collapse">
              <Icon name="mdi:chevron-left" />
            </button>
          </div>
        </div>
        
        <!-- Collapsed state toggle -->
        <div v-if="libraryCollapsed" class="library-collapsed-toggle">
          <button @click="libraryCollapsed = false" class="btn-expand">
            <Icon name="mdi:chevron-right" />
            <span>Library</span>
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
          <div class="info-banner">
            <Icon name="mdi:information" size="14" />
            <span>Drag agents to canvas, then click to configure AI model & prompts</span>
          </div>
          <div class="agent-cards">
            <div 
              v-for="agent in availableAgentTypes" 
              :key="agent.id"
              class="agent-card"
              :draggable="true"
              @dragstart="onDragStart($event, agent)"
              @dragend="isDragging = false"
              :class="{ dragging: isDragging && draggedItem?.id === agent.id }"
            >
              <div class="agent-avatar" :style="{ background: agent.color }">
                <Icon :name="agent.icon" size="20" />
              </div>
              <div class="agent-info">
                <h4>{{ agent.name }}</h4>
                <p>{{ agent.description }}</p>
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

      <!-- Main Canvas Area with Vue Flow -->
      <div class="canvas-container" :class="{ 'library-collapsed': libraryCollapsed }">
        <div v-if="currentView === 'canvas'" class="workflow-canvas">
          <!-- Loading state -->
          <div v-if="!isFlowReady" class="flow-loading">
            <Icon name="mdi:loading" class="animate-spin" size="48" />
            <p>Initializing canvas...</p>
          </div>
          
          <!-- Vue Flow container -->
          <div v-show="isFlowReady" class="vue-flow-wrapper">
            <VueFlow
            v-model:nodes="nodes"
            v-model:edges="edges"
            @node-click="onNodeClick"
            @edge-click="onEdgeClick"
            @connect="onConnect"
            @nodes-change="onNodesChange"
            @edges-change="onEdgesChange"
            @dragover="onDragOver"
            @drop="onDrop"
            @node-drag-stop="onNodeDragStop"
            :node-types="nodeTypes"
            :default-edge-options="defaultEdgeOptions"
            :connection-line-style="connectionLineStyle"
            :delete-key-code="editingGroup ? [] : ['Delete', 'Backspace']"
            :multi-selection-key-code="editingGroup ? [] : ['Meta', 'Ctrl']"
            :zoom-on-scroll="!editingGroup"
            :zoom-on-pinch="!editingGroup"
            :pan-on-drag="!editingGroup"
            :pan-on-scroll="!editingGroup"
            :prevent-scrolling="true"
            :fit-view-on-init="false"
            :default-zoom="0.5"
            :min-zoom="0.1"
            :max-zoom="2"
            :nodes-draggable="!editingGroup"
            :nodes-connectable="!editingGroup"
            :elements-selectable="!editingGroup"
            class="vue-flow-canvas"
          >
            <!-- Custom Nodes -->
            <template #node-agent="nodeProps">
              <AgentNode v-bind="nodeProps" />
            </template>
            <template #node-group="nodeProps">
              <GroupNode v-bind="nodeProps" @edit="onEditGroup" @dblclick="onEditGroup(nodeProps.id)" />
            </template>
            
            <!-- Controls -->
            <Background pattern-color="#1a1a1a" :gap="20" />
            <Controls />
            <MiniMap />
            
            <!-- Drop Zone Indicator -->
            <div v-if="isDraggingOver" class="drop-indicator">
              Drop here to add agent
            </div>
          </VueFlow>
          </div>
        </div>
        
        <!-- Pipeline View -->
        <div v-if="currentView === 'pipeline'" class="pipeline-view">
          <div class="pipeline-list">
            <div v-for="pipeline in savedPipelines" :key="pipeline.id" class="pipeline-card">
              <h3>{{ pipeline.name }}</h3>
              <p>{{ pipeline.description }}</p>
              <div class="pipeline-actions">
                <button @click="loadPipelineById(pipeline.id)" class="btn-action">
                  <Icon name="mdi:play" /> Load
                </button>
                <button @click="deletePipeline(pipeline.id)" class="btn-action danger">
                  <Icon name="mdi:delete" /> Delete
                </button>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Monitor View -->
        <div v-if="currentView === 'monitor'" class="monitor-view">
          <div class="metrics-grid">
            <div class="metric-card">
              <div class="metric-icon success">
                <Icon name="mdi:check-circle" />
              </div>
              <div class="metric-data">
                <h3>{{ activeAgentsCount }}</h3>
                <p>Active Agents</p>
              </div>
            </div>
            
            <div class="metric-card">
              <div class="metric-icon warning">
                <Icon name="mdi:clock" />
              </div>
              <div class="metric-data">
                <h3>{{ runningPipelinesCount }}</h3>
                <p>Running Pipelines</p>
              </div>
            </div>
            
            <div class="metric-card">
              <div class="metric-icon info">
                <Icon name="mdi:pipe-connected" />
              </div>
              <div class="metric-data">
                <h3>{{ completedPipelinesCount }}</h3>
                <p>Completed</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Group Editor Modal -->
      <div v-if="editingGroup" class="group-editor-modal">
        <div class="group-modal-overlay" @click.stop="closeGroupEditor"></div>
        <div class="group-modal-content">
          <div class="modal-header">
            <h3>
              <Icon name="mdi:group" /> Edit Group: {{ editingGroup.data.name }}
            </h3>
            <button @click="closeGroupEditor" class="btn-close">
              <Icon name="mdi:close" />
            </button>
          </div>
          
          <div class="modal-body">
            <!-- Group Properties -->
            <div class="group-properties">
              <label>Group Name</label>
              <input 
                v-model="editingGroup.data.name" 
                class="property-input"
                placeholder="Enter group name"
              />
              
              <label>Entry Agent</label>
              <select v-model="groupEntryAgent" class="property-select">
                <option value="">None (Use first agent)</option>
                <option 
                  v-for="agent in groupAgents" 
                  :key="agent.id" 
                  :value="agent.id"
                >
                  {{ agent.data.name }}
                </option>
              </select>
            </div>
            
            <!-- Internal Flow Canvas -->
            <div class="group-flow-container">
              <div class="group-flow-header">
                <h4>Internal Agent Flow</h4>
                <span class="help-text">Drag agents from below to add them to this group</span>
              </div>
              <div class="group-flow-canvas">
                <VueFlow
                  v-if="editingGroup"
                  :key="`group-flow-${editingGroup.id}`"
                  v-model:nodes="groupNodes"
                  v-model:edges="groupEdges"
                  @connect="onGroupConnect"
                  @node-click="onGroupNodeClick"
                  @dragover="onGroupDragOver"
                  @drop="onGroupDrop"
                  :node-types="nodeTypes"
                  :default-edge-options="defaultEdgeOptions"
                  :connection-line-style="connectionLineStyle"
                  :delete-key-code="['Delete', 'Backspace']"
                  :zoom-on-scroll="true"
                  :pan-on-drag="true"
                  :nodes-draggable="true"
                  :nodes-connectable="true"
                  :elements-selectable="true"
                  :default-zoom="0.8"
                  :min-zoom="0.3"
                  :max-zoom="1.5"
                  class="vue-flow-inner"
                >
                  <template #node-agent="nodeProps">
                    <AgentNode v-bind="nodeProps" />
                  </template>
                  <Background pattern-color="#0a0a0a" :gap="15" />
                  <Controls position="top-right" />
                </VueFlow>
              </div>
              
              <!-- Available Agents for Group -->
              <div class="group-bottom-section">
                <div class="group-agent-library">
                  <h4>Available Agents - Drag to add to group</h4>
                  <div class="mini-agent-cards">
                    <div 
                      v-for="agent in availableAgentTypes" 
                      :key="agent.id"
                      class="mini-agent-card"
                      :draggable="true"
                      @dragstart="onGroupAgentDragStart($event, agent)"
                      title="Drag into the canvas above"
                    >
                      <div class="mini-avatar" :style="{ background: agent.color }">
                        <Icon :name="agent.icon" size="16" />
                      </div>
                      <span>{{ agent.name }}</span>
                    </div>
                  </div>
                </div>
                
                <!-- Group Agents List -->
                <div class="group-agents-list">
                  <h4>Agents in Group ({{ groupAgents.length }})</h4>
                  <div class="agent-list-items">
                    <div v-for="agent in groupAgents" :key="agent.id" class="agent-list-item">
                      <div class="mini-avatar" :style="{ background: agent.data.color }">
                        <Icon :name="agent.data.icon" size="14" />
                      </div>
                      <span>{{ agent.data.name }}</span>
                      <button @click="removeAgentFromGroup(agent.id)" class="btn-remove">
                        <Icon name="mdi:close" size="14" />
                      </button>
                    </div>
                    <div v-if="groupAgents.length === 0" class="empty-message">
                      No agents in group yet. Drag agents from the left to add them.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div class="modal-footer">
            <button @click="saveGroupChanges" class="btn-primary">
              <Icon name="mdi:check" /> Save Changes
            </button>
            <button @click="closeGroupEditor" class="btn-secondary">
              Cancel
            </button>
          </div>
        </div>
      </div>
      
      <!-- Properties Panel -->
      <transition name="slide">
        <div v-if="selectedNode && !editingGroup" class="properties-panel">
          <div class="properties-header">
            <h3>{{ selectedNode.type === 'group' ? 'Group' : 'Agent' }} Properties</h3>
            <button @click="selectedNode = null" class="btn-close">
              <Icon name="mdi:close" />
            </button>
          </div>
          
          <div class="properties-content">
            <!-- Agent Properties -->
            <template v-if="selectedNode.type === 'agent'">
              <div class="property-group">
                <label>Instance ID</label>
                <div class="property-value">{{ selectedNode.id }}</div>
              </div>
              
              <div class="property-group">
                <label>Role</label>
                <div class="property-value">{{ selectedNode.data.type }}</div>
              </div>
              
              <div class="property-group">
                <label>Instance Type</label>
                <select v-model="selectedNode.data.instanceType" class="property-select">
                  <option value="claude">Claude</option>
                  <option value="codex">Codex</option>
                </select>
              </div>
              
              <div class="property-group">
                <label>Personality</label>
                <select v-model="selectedNode.data.personalityId" class="property-select">
                  <option value="">Default</option>
                  <option v-for="p in personalities" :key="p.id" :value="p.id">
                    {{ p.name }}
                  </option>
                </select>
              </div>
              
              <div class="property-group">
                <label>Status</label>
                <div class="property-value status" :class="selectedNode.data.status">
                  {{ selectedNode.data.status }}
                </div>
              </div>
              
              <div class="property-group">
                <label>Custom Instructions</label>
                <textarea 
                  v-model="selectedNode.data.customInstructions" 
                  class="property-textarea"
                  rows="4"
                  placeholder="Add custom instructions for this agent..."
                />
              </div>
            </template>
            
            <!-- Group Properties -->
            <template v-else-if="selectedNode.type === 'group'">
              <div class="property-group">
                <label>Group Name</label>
                <input v-model="selectedNode.data.name" class="property-input" />
              </div>
              
              <div class="property-group">
                <label>Agents in Group</label>
                <div class="property-value">{{ selectedNode.data.agentCount || 0 }}</div>
              </div>
              
              <div class="property-group">
                <label>Entry Points</label>
                <div class="property-value">{{ selectedNode.data.entryAgents?.length || 0 }}</div>
              </div>
              
              <div class="property-group">
                <label>Exit Points</label>
                <div class="property-value">{{ selectedNode.data.exitAgents?.length || 0 }}</div>
              </div>
            </template>
            
            <div class="property-actions">
              <button @click="saveNodeProperties" class="btn-primary">
                Save Changes
              </button>
              <button @click="spawnInstance" class="btn-secondary" v-if="selectedNode.type === 'agent'">
                <Icon name="mdi:console" /> Spawn Instance
              </button>
              <button @click="startFromKanban" class="btn-secondary">
                <Icon name="mdi:view-kanban" /> Start from Kanban
              </button>
            </div>
          </div>
        </div>
      </transition>
    </div>
    
    <!-- Pipeline Save Modal -->
  <div v-if="showPipelineModal" class="modal-overlay" @click="closePipelineModal">
    <div class="modal" @click.stop>
      <div class="modal-header">
        <h3>Save Pipeline</h3>
        <button @click="closePipelineModal" class="close-button">
          <Icon name="mdi:close" />
        </button>
      </div>
      
      <form @submit.prevent="submitPipelineSave" class="modal-form">
        <div class="form-group">
          <label for="pipeline-name">Pipeline Name *</label>
          <input
            id="pipeline-name"
            v-model="pipelineForm.name"
            type="text"
            required
            placeholder="Enter pipeline name..."
            autofocus
          />
        </div>
        
        <div class="form-group">
          <label for="pipeline-description">Description (Optional)</label>
          <textarea
            id="pipeline-description"
            v-model="pipelineForm.description"
            rows="3"
            placeholder="Pipeline description..."
          ></textarea>
        </div>
        
        <div class="modal-actions">
          <button type="button" @click="closePipelineModal" class="cancel-btn">
            Cancel
          </button>
          <button type="submit" class="save-btn">
            Save Pipeline
          </button>
        </div>
      </form>
    </div>
  </div>
  
  <!-- Task Selection Modal -->
  <div v-if="showTaskModal" class="modal-overlay" @click="closeTaskModal">
    <div class="modal task-selection-modal" @click.stop>
      <div class="modal-header">
        <h3>Select Task for Pipeline</h3>
        <button @click="closeTaskModal" class="close-button">
          <Icon name="mdi:close" />
        </button>
      </div>
      
      <div class="modal-body">
        <div class="task-filter">
          <input
            v-model="taskFilter"
            type="text"
            placeholder="Filter tasks..."
            class="filter-input"
          />
        </div>
        
        <div class="task-list">
          <div v-if="filteredTasks.length === 0" class="empty-state">
            No tasks found
          </div>
          <div 
            v-for="task in filteredTasks" 
            :key="task.id"
            @click="selectTask(task)"
            class="task-item"
            :class="{ selected: selectedTask?.id === task.id }"
          >
            <div class="task-type">{{ task.type.toUpperCase() }}</div>
            <div class="task-title">{{ task.title || task.content || 'Untitled' }}</div>
            <div v-if="task.description" class="task-description">
              {{ task.description }}
            </div>
            <div v-if="task.status" class="task-status">
              Status: {{ task.status }}
            </div>
          </div>
        </div>
        
        <div class="modal-actions">
          <button @click="closeTaskModal" class="cancel-btn">
            Cancel
          </button>
          <button 
            @click="confirmTaskSelection" 
            :disabled="!selectedTask"
            class="save-btn"
          >
            Select Task
          </button>
        </div>
      </div>
    </div>
  </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, markRaw, nextTick, onMounted, watch, onBeforeUnmount } from 'vue';

// Define props
defineProps<{
  projectPath?: string
}>();
import { 
  VueFlow, 
  useVueFlow, 
  type Node, 
  type Edge, 
  type Connection,
  type NodeChange,
  type EdgeChange,
  MarkerType,
  Position
} from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { Controls } from '@vue-flow/controls';
import { MiniMap } from '@vue-flow/minimap';

import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import '@vue-flow/controls/dist/style.css';
import '@vue-flow/minimap/dist/style.css';

import AgentNode from './nodes/AgentNode.vue';
import GroupNode from './nodes/GroupNode.vue';
import Icon from '~/components/Icon.vue';

import { useAgentOrchestrationStore } from '~/stores/agent-orchestration-client';
import { useClaudeInstancesStore } from '~/stores/claude-instances';
import { useCodexInstancesStore } from '~/stores/codex-instances';
import { usePipelineOrchestratorStore } from '~/stores/pipeline-orchestrator';
import { useTasksStore } from '~/stores/tasks';
import { useElectronDialog } from '~/composables/useElectronDialog';

interface AgentType {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  tags: string[];
  capabilities: string[];
}

const orchestrationStore = useAgentOrchestrationStore();
const claudeStore = useClaudeInstancesStore();
const codexStore = useCodexInstancesStore();
const pipelineStore = usePipelineOrchestratorStore();
const tasksStore = useTasksStore();
const { showMessage, showConfirm, showPrompt } = useElectronDialog();

// Modal states
const showPipelineModal = ref(false);
const showTaskModal = ref(false);
const pipelineForm = reactive({
  name: '',
  description: ''
});
const taskFilter = ref('');
const selectedTask = ref<any>(null);

// Vue Flow instance
const { addNodes, addEdges, removeNodes, removeEdges, toObject, fitView, zoomTo } = useVueFlow();

// Node types
const nodeTypes = {
  agent: markRaw(AgentNode),
  group: markRaw(GroupNode)
};

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
const selectedNode = ref<Node | null>(null);
const isDragging = ref(false);
const isDraggingOver = ref(false);
const draggedItem = ref<AgentType | null>(null);
const isFlowReady = ref(false);

// Group Editing State - completely separate from main canvas
const editingGroup = ref<Node | null>(null);
const groupNodes = ref<Node[]>([]); // Internal nodes for group editor only
const groupEdges = ref<Edge[]>([]); // Internal edges for group editor only
const groupAgents = computed(() => groupNodes.value.filter(n => n.type === 'agent'));
const groupEntryAgent = ref<string>('');
const groupDraggedItem = ref<AgentType | null>(null);

// Backup of main canvas state while editing group
const mainCanvasBackup = ref<{ nodes: Node[], edges: Edge[] } | null>(null);

// Flow Data
const nodes = ref<Node[]>([]);
const edges = ref<Edge[]>([]);
const savedPipelines = ref<any[]>([]);

// Agent Types
const availableAgentTypes = ref<AgentType[]>([
  {
    id: 'architect',
    name: 'Architect',
    description: 'System design and planning',
    icon: 'mdi:floor-plan',
    color: '#667eea',
    tags: ['planner', 'designer'],
    capabilities: ['system-design', 'architecture', 'planning']
  },
  {
    id: 'developer',
    name: 'Developer',
    description: 'Code implementation and features',
    icon: 'mdi:code-braces',
    color: '#f093fb',
    tags: ['coder', 'implementer'],
    capabilities: ['coding', 'debugging', 'refactoring']
  },
  {
    id: 'reviewer',
    name: 'Code Reviewer',
    description: 'Code quality and best practices',
    icon: 'mdi:magnify-scan',
    color: '#4facfe',
    tags: ['quality', 'reviewer'],
    capabilities: ['code-review', 'quality-check', 'best-practices']
  },
  {
    id: 'tester',
    name: 'QA Tester',
    description: 'Testing and validation',
    icon: 'mdi:test-tube',
    color: '#43e97b',
    tags: ['testing', 'qa'],
    capabilities: ['testing', 'validation', 'bug-finding']
  },
  {
    id: 'documenter',
    name: 'Documenter',
    description: 'Documentation and guides',
    icon: 'mdi:book-open-page-variant',
    color: '#fa709a',
    tags: ['docs', 'writer'],
    capabilities: ['documentation', 'guides', 'api-docs']
  },
  {
    id: 'devops',
    name: 'DevOps',
    description: 'Deployment and infrastructure',
    icon: 'mdi:docker',
    color: '#30cfd0',
    tags: ['deploy', 'infra'],
    capabilities: ['deployment', 'ci-cd', 'infrastructure']
  }
]);

// Personalities
const personalities = ref([
  { id: 'focused', name: 'Focused & Efficient' },
  { id: 'creative', name: 'Creative & Explorative' },
  { id: 'thorough', name: 'Thorough & Detailed' },
  { id: 'pragmatic', name: 'Pragmatic & Practical' },
  { id: 'mentor', name: 'Teaching & Explanatory' }
]);

// Custom Agent
const customAgent = reactive({
  name: '',
  instructions: ''
});

// Metrics
const activeAgentsCount = computed(() => nodes.value.filter(n => n.type === 'agent' && n.data.status === 'running').length);
const runningPipelinesCount = computed(() => savedPipelines.value.filter(p => p.status === 'running').length);
const completedPipelinesCount = computed(() => savedPipelines.value.filter(p => p.status === 'completed').length);

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

// Computed for filtered tasks in modal
const filteredTasks = computed(() => {
  // Get all tasks from the store (combines tasks, stories, and epics)
  const tasks = tasksStore.tasks || [];
  const stories = tasksStore.stories || [];
  const epics = tasksStore.epics || [];
  
  // Combine all into a unified list with type indicators
  const allItems = [
    ...tasks.map(t => ({ 
      ...t, 
      type: 'task',
      title: t.content,
      description: t.description || ''
    })),
    ...stories.map(s => ({ 
      ...s, 
      type: 'story',
      description: s.userStory || s.description || ''
    })),
    ...epics.map(e => ({ 
      ...e, 
      type: 'epic',
      description: e.businessValue || e.description || ''
    }))
  ];
  
  if (!taskFilter.value) return allItems;
  
  const filter = taskFilter.value.toLowerCase();
  return allItems.filter(item => 
    item.title.toLowerCase().includes(filter) ||
    item.type.toLowerCase().includes(filter) ||
    item.description.toLowerCase().includes(filter)
  );
});

// Edge Options
const defaultEdgeOptions = {
  type: 'smoothstep',
  animated: true,
  markerEnd: MarkerType.ArrowClosed,
  style: { stroke: '#4a9eff', strokeWidth: 2 }
};

const connectionLineStyle = {
  stroke: '#4a9eff',
  strokeWidth: 2,
  strokeDasharray: '5 5',
  opacity: 0.6
};

// Methods
function onDragStart(event: DragEvent, agent: AgentType) {
  isDragging.value = true;
  draggedItem.value = agent;
  event.dataTransfer!.effectAllowed = 'copy';
  event.dataTransfer!.setData('application/vueflow', JSON.stringify(agent));
}

function onDragOver(event: DragEvent) {
  event.preventDefault();
  isDraggingOver.value = true;
  event.dataTransfer!.dropEffect = 'copy';
}

function onDrop(event: DragEvent) {
  event.preventDefault();
  isDraggingOver.value = false;
  
  const data = event.dataTransfer!.getData('application/vueflow');
  if (!data) return;
  
  const agent = JSON.parse(data) as AgentType;
  
  // Get the canvas element to calculate position
  const flowElement = document.querySelector('.vue-flow') as HTMLElement;
  if (!flowElement) return;
  
  const rect = flowElement.getBoundingClientRect();
  const position = {
    x: event.clientX - rect.left - 90, // Center on cursor
    y: event.clientY - rect.top - 40
  };
  
  // Create new agent node
  const newNode: Node = {
    id: `${agent.id}-${Date.now()}`,
    type: 'agent',
    position,
    data: {
      name: agent.name,
      type: agent.id,
      icon: agent.icon,
      color: agent.color,
      status: 'idle',
      instanceType: 'claude',
      personalityId: selectedPersonality.value,
      customInstructions: ''
    }
  };
  
  addNodes([newNode]);
}

function onNodeClick({ event, node }: { event: MouseEvent; node: Node }) {
  console.log('Node clicked:', node);
  selectedNode.value = node;
}

function onEdgeClick(event: MouseEvent, edge: Edge) {
  console.log('Edge clicked:', edge);
}

function onConnect(connection: Connection) {
  // Validate connection
  if (connection.source === connection.target) return;
  
  // Add edge
  const newEdge: Edge = {
    id: `${connection.source}-${connection.target}`,
    source: connection.source!,
    target: connection.target!,
    sourceHandle: connection.sourceHandle,
    targetHandle: connection.targetHandle,
    ...defaultEdgeOptions
  };
  
  addEdges([newEdge]);
}

function onNodesChange(changes: NodeChange[]) {
  // Handle node changes (position, selection, etc.)
  // Removed console log for cleaner output
}

function onEdgesChange(changes: EdgeChange[]) {
  // Handle edge changes
  // Removed console log for cleaner output
}

function onNodeDragStop(event: MouseEvent, node: Node) {
  console.log('Node drag stopped:', node);
}

function createEmptyGroup() {
  const position = {
    x: 200 + Math.random() * 200,
    y: 100 + Math.random() * 200
  };
  
  const newGroup: Node = {
    id: `group-${Date.now()}`,
    type: 'group',
    position,
    data: {
      name: `Group ${nodes.value.filter(n => n.type === 'group').length + 1}`,
      status: 'idle',
      agentCount: 0,
      agents: [],
      entryAgents: [],
      exitAgents: [],
      color: '#9333ea'
    }
  };
  
  addNodes([newGroup]);
}

async function clearCanvas() {
  const confirmed = await showConfirm('Are you sure you want to clear the canvas?', 'Clear Canvas');
  if (confirmed) {
    nodes.value = [];
    edges.value = [];
  }
}

async function savePipeline() {
  // Show the pipeline save modal
  pipelineForm.name = '';
  pipelineForm.description = `${nodes.value.length} agents, ${edges.value.length} connections`;
  showPipelineModal.value = true;
}

function closePipelineModal() {
  showPipelineModal.value = false;
  pipelineForm.name = '';
  pipelineForm.description = '';
}

async function submitPipelineSave() {
  const name = pipelineForm.name.trim();
  if (!name) {
    await showMessage('Pipeline name is required', 'warning');
    return;
  }
  
  const pipeline = {
    id: `pipeline-${Date.now()}`,
    name,
    description: pipelineForm.description || `${nodes.value.length} agents, ${edges.value.length} connections`,
    nodes: nodes.value,
    edges: edges.value,
    status: 'idle',
    createdAt: new Date()
  };
  
  savedPipelines.value.push(pipeline);
  
  // Save to store
  await pipelineStore.savePipeline({
    name,
    agents: nodes.value,
    connections: edges.value
  });
  
  closePipelineModal();
  await showMessage('Pipeline saved successfully!', 'info');
}

async function loadPipeline() {
  // Show list of saved pipelines
  currentView.value = 'pipeline';
}

function loadPipelineById(id: string) {
  const pipeline = savedPipelines.value.find(p => p.id === id);
  if (pipeline) {
    nodes.value = pipeline.nodes;
    edges.value = pipeline.edges;
    currentView.value = 'canvas';
    nextTick(() => {
      fitView();
    });
  }
}

async function deletePipeline(id: string) {
  const confirmed = await showConfirm('Are you sure you want to delete this pipeline?', 'Delete Pipeline');
  if (confirmed) {
    savedPipelines.value = savedPipelines.value.filter(p => p.id !== id);
  }
}

async function saveNodeProperties() {
  if (!selectedNode.value) return;
  console.log('Saving node properties:', selectedNode.value);
  await showMessage('Properties saved!', 'info');
}

async function spawnInstance() {
  if (!selectedNode.value || selectedNode.value.type !== 'agent') return;
  
  const node = selectedNode.value;
  const workingDirectory = localStorage.getItem('workspacePath') || '.';
  
  if (node.data.instanceType === 'codex') {
    // Spawn Codex instance
    await codexStore.createInstance(
      `${node.data.name} Agent`,
      workingDirectory
    );
    
    // Start the Codex instance if electronAPI is available
    if (window.electronAPI?.codex?.start) {
      await window.electronAPI.codex.start(node.id, workingDirectory);
    }
  } else {
    // Spawn Claude instance with personality
    const personality = node.data.personalityId || undefined;
    await claudeStore.createInstance(
      `${node.data.name} Agent`,
      personality,
      workingDirectory
    );
    
    // Start the Claude instance if electronAPI is available
    if (window.electronAPI?.claude?.start) {
      await window.electronAPI.claude.start(node.id, workingDirectory);
    }
  }
  
  // Update node status
  node.data.status = 'running';
  await showMessage(`${node.data.instanceType === 'codex' ? 'Codex' : 'Claude'} instance spawned!`, 'info');
}

async function startFromKanban() {
  // Get Epic/Story/Task from Kanban
  const tasks = tasksStore.tasks || [];
  const stories = tasksStore.stories || [];
  const epics = tasksStore.epics || [];
  
  if (tasks.length === 0 && stories.length === 0 && epics.length === 0) {
    await showMessage('No tasks available in Kanban', 'warning');
    return;
  }
  
  // Show task selection modal
  selectedTask.value = null;
  taskFilter.value = '';
  showTaskModal.value = true;
}

function selectTask(task: any) {
  selectedTask.value = task;
}

function closeTaskModal() {
  showTaskModal.value = false;
  selectedTask.value = null;
  taskFilter.value = '';
}

async function confirmTaskSelection() {
  if (!selectedTask.value) {
    await showMessage('Please select a task', 'warning');
    return;
  }
  
  const task = selectedTask.value;
  closeTaskModal();
  
  // Start pipeline execution with the selected task
  await showMessage(`Starting pipeline for: ${task.type} - ${task.title}`, 'info');
  
  // Here you would integrate with your automation system
  // For now, just showing the task was selected
  if (window.electronAPI?.automation) {
    try {
      await window.electronAPI.automation.pipelineStart({
        taskId: task.id,
        pipeline: {
          nodes: nodes.value,
          edges: edges.value
        }
      });
    } catch (error) {
      console.error('Failed to start pipeline:', error);
      await showMessage('Failed to start pipeline', 'error');
    }
  }
}

// Group Editing Functions
function onEditGroup(groupId: string) {
  const group = nodes.value.find(n => n.id === groupId && n.type === 'group');
  if (!group) return;
  
  // Backup the entire main canvas state before opening editor
  mainCanvasBackup.value = {
    nodes: JSON.parse(JSON.stringify(nodes.value)),
    edges: JSON.parse(JSON.stringify(edges.value))
  };
  
  console.log('Opening group editor, backing up main canvas with', mainCanvasBackup.value.nodes.length, 'nodes');
  
  editingGroup.value = { ...group };
  
  // Load existing agents in the group if any
  if (group.data.agents && Array.isArray(group.data.agents)) {
    groupNodes.value = group.data.agents.map((agent: any, index: number) => ({
      id: agent.id || `agent-${Date.now()}-${index}`,
      type: 'agent',
      position: agent.position || { x: 100 + index * 200, y: 100 },
      data: {
        name: agent.name,
        type: agent.type,
        icon: agent.icon,
        color: agent.color,
        status: 'idle',
        instanceType: agent.instanceType || 'claude'
      }
    }));
    
    // Load existing edges if any
    groupEdges.value = group.data.edges || [];
  } else {
    groupNodes.value = [];
    groupEdges.value = [];
  }
  
  groupEntryAgent.value = group.data.entryAgents?.[0] || '';
}

function closeGroupEditor() {
  // Restore main canvas from backup if it got corrupted
  if (mainCanvasBackup.value && mainCanvasBackup.value.nodes.length > nodes.value.length) {
    console.log('Main canvas corrupted, restoring from backup');
    nodes.value = JSON.parse(JSON.stringify(mainCanvasBackup.value.nodes));
    edges.value = JSON.parse(JSON.stringify(mainCanvasBackup.value.edges));
  }
  
  // Reset the group editing state
  editingGroup.value = null;
  groupNodes.value = []; // Clear internal group nodes only
  groupEdges.value = []; // Clear internal group edges only
  groupEntryAgent.value = '';
  groupDraggedItem.value = null;
  mainCanvasBackup.value = null;
  
  console.log('After close, main canvas has', nodes.value.length, 'nodes');
}

function saveGroupChanges() {
  if (!editingGroup.value || !mainCanvasBackup.value) return;
  
  console.log('Saving group changes, using backup with', mainCanvasBackup.value.nodes.length, 'nodes');
  
  // Restore the main canvas from backup first
  nodes.value = JSON.parse(JSON.stringify(mainCanvasBackup.value.nodes));
  edges.value = JSON.parse(JSON.stringify(mainCanvasBackup.value.edges));
  
  // Find the group node in the restored canvas
  const groupNodeIndex = nodes.value.findIndex(n => n.id === editingGroup.value!.id);
  if (groupNodeIndex === -1) {
    console.error('Group node not found in restored canvas!');
    return;
  }
  
  // Update the group node with new data
  nodes.value[groupNodeIndex] = {
    ...nodes.value[groupNodeIndex],
    data: {
      ...nodes.value[groupNodeIndex].data,
      name: editingGroup.value.data.name,
      agents: groupNodes.value.map(n => ({
        id: n.id,
        name: n.data.name,
        type: n.data.type,
        icon: n.data.icon,
        color: n.data.color,
        instanceType: n.data.instanceType,
        position: n.position
      })),
      edges: groupEdges.value,
      agentCount: groupNodes.value.length,
      entryAgents: groupEntryAgent.value ? [groupEntryAgent.value] : [],
      exitAgents: groupNodes.value
        .filter(n => !groupEdges.value.some(e => e.source === n.id))
        .map(n => n.id)
    }
  };
  
  console.log('After save: Main canvas has', nodes.value.length, 'nodes');
  
  // Clear the backup since we've successfully saved
  mainCanvasBackup.value = null;
  
  // Close the editor
  editingGroup.value = null;
  groupNodes.value = [];
  groupEdges.value = [];
  groupEntryAgent.value = '';
  groupDraggedItem.value = null;
}

function onGroupConnect(params: any) {
  const newEdge: Edge = {
    id: `edge-${Date.now()}`,
    source: params.source,
    target: params.target,
    type: 'smoothstep',
    animated: true
  };
  groupEdges.value.push(newEdge);
}

function onGroupNodeClick(node: Node) {
  // Handle node selection within group editor if needed
  console.log('Group node clicked:', node);
}

function onGroupDragOver(event: DragEvent) {
  event.preventDefault();
  event.dataTransfer!.dropEffect = 'copy';
}

function onGroupDrop(event: DragEvent) {
  event.preventDefault();
  
  if (!groupDraggedItem.value) return;
  
  // Get the VueFlow instance for the group editor
  const flowBounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const position = {
    x: event.clientX - flowBounds.left - 50,
    y: event.clientY - flowBounds.top - 25
  };
  
  // Create new agent node in group
  const newNode: Node = {
    id: `group-agent-${Date.now()}`,
    type: 'agent',
    position,
    data: {
      name: groupDraggedItem.value.name,
      type: groupDraggedItem.value.id,
      icon: groupDraggedItem.value.icon,
      color: groupDraggedItem.value.color,
      status: 'idle',
      instanceType: 'claude',
      capabilities: groupDraggedItem.value.capabilities
    }
  };
  
  groupNodes.value.push(newNode);
  groupDraggedItem.value = null;
}

function onGroupAgentDragStart(event: DragEvent, agent: AgentType) {
  groupDraggedItem.value = agent;
  event.dataTransfer!.effectAllowed = 'copy';
}

function removeAgentFromGroup(agentId: string) {
  // Remove the agent node
  groupNodes.value = groupNodes.value.filter(n => n.id !== agentId);
  
  // Remove any edges connected to this agent
  groupEdges.value = groupEdges.value.filter(
    e => e.source !== agentId && e.target !== agentId
  );
  
  // Update entry agent if it was removed
  if (groupEntryAgent.value === agentId) {
    groupEntryAgent.value = '';
  }
}

function createCustomAgent() {
  if (!customAgent.name) return;
  
  const customAgentType: AgentType = {
    id: `custom-${Date.now()}`,
    name: customAgent.name,
    description: 'Custom agent',
    icon: 'mdi:robot',
    color: '#9ca3af',
    tags: ['custom'],
    capabilities: []
  };
  
  availableAgentTypes.value.push(customAgentType);
  customAgent.name = '';
  customAgent.instructions = '';
  selectedPersonality.value = '';
}

// Simple initialization - Vue Flow will handle its own dimensions
const initializeFlow = async () => {
  // Don't initialize if not on canvas view
  if (currentView.value !== 'canvas') return;
  
  // Just set ready after a short delay for DOM to settle
  isFlowReady.value = false;
  await nextTick();
  
  // Simple timeout to let the DOM render
  setTimeout(() => {
    isFlowReady.value = true;
    
    // Try to fit view after a bit with padding
    setTimeout(() => {
      if (currentView.value === 'canvas') {
        try {
          // Fit view with some padding if there are nodes
          if (nodes.value.length > 0) {
            fitView({ padding: 0.2, duration: 800 });
          } else {
            // For empty canvas, just set a reasonable zoom
            zoomTo(0.7, { duration: 300 });
          }
        } catch (e) {
          console.log('Could not fit view yet');
        }
      }
    }, 100);
  }, 50);
};

// Initialize Vue Flow after mount
onMounted(() => {
  if (currentView.value === 'canvas') {
    initializeFlow();
  }
});

// Reinitialize flow when switching to canvas view
watch(currentView, (newView, oldView) => {
  if (newView === 'canvas' && oldView !== 'canvas') {
    initializeFlow();
  }
});

// Clean up
onBeforeUnmount(() => {
  // Cleanup if needed
});
</script>

<style scoped>
.agent-orchestration-flow {
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
  height: 100%;
  width: 100%;
  position: relative;
}

/* Control Bar */
.control-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background: #252526;
  border-bottom: 1px solid #1e1e1e;
  flex-shrink: 0;
}

.control-left,
.control-center,
.control-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.panel-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: white;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.title-icon {
  color: #60a5fa;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  background: #2a2d2e;
}

.status-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
}

.status-indicator.idle .status-dot {
  background-color: #9ca3af;
}

.status-indicator.active .status-dot {
  background-color: #10b981;
  animation: pulse 2s infinite;
}

.status-indicator.initializing .status-dot {
  background-color: #eab308;
  animation: pulse 2s infinite;
}

.status-text {
  font-size: 0.75rem;
  color: #d1d5db;
}

.view-switcher {
  display: flex;
  gap: 0.25rem;
  background: #2a2d2e;
  border-radius: 0.5rem;
  padding: 0.25rem;
}

.view-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.75rem;
  border-radius: 0.25rem;
  font-size: 0.875rem;
  color: #9ca3af;
  background: none;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
}

.view-btn:hover {
  color: white;
}

.view-btn.active {
  background: #3e3e42;
  color: white;
}

.btn-icon {
  padding: 0.5rem;
  border-radius: 0.25rem;
  color: #9ca3af;
  background: none;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-icon:hover {
  background: #2a2d2e;
  color: white;
}

/* Content Area */
.content-area {
  display: flex;
  overflow: hidden;
  flex: 1;
  min-height: 0;
  width: 100%;
}

/* Agent Library */
.agent-library {
  background: #252526;
  border-right: 1px solid #1e1e1e;
  display: flex;
  flex-direction: column;
  transition: all 0.3s;
  width: 320px;
  flex-shrink: 0;
}

.agent-library.collapsed {
  width: 3rem;
}

.library-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-bottom: 1px solid #1e1e1e;
  background: #2a2d2e;
  min-height: 30px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.btn-group {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  background: #0e639c;
  color: white;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  font-size: 11px;
  transition: all 0.2s;
}

.btn-group:hover {
  background: #1177bb;
}

.library-header h3 {
  color: #cccccc;
  font-weight: 500;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0;
}

.btn-collapse,
.btn-expand {
  padding: 2px;
  border-radius: 3px;
  color: #9ca3af;
  background: none;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-collapse:hover,
.btn-expand:hover {
  background: #3e3e42;
  color: #cccccc;
}

.library-collapsed-toggle {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 1rem 0;
}

.btn-expand {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
}

.library-content {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
}

.personality-selector {
  margin-bottom: 1rem;
}

.personality-selector label {
  display: block;
  font-size: 0.875rem;
  color: #9ca3af;
  margin-bottom: 0.5rem;
}

.personality-dropdown {
  width: 100%;
  padding: 0.5rem;
  background: #2a2d2e;
  color: white;
  border-radius: 0.25rem;
  border: 1px solid #3e3e42;
}

.personality-dropdown:focus {
  border-color: #3b82f6;
  outline: none;
}

.agent-cards {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.info-banner {
  background: #364a5f;
  border: 1px solid #4a6a8f;
  border-radius: 3px;
  padding: 8px 10px;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: #a8c7e8;
  line-height: 1.4;
}

.hint-text {
  font-size: 10px;
  color: #8b8b8b;
  margin-top: 4px;
  font-style: italic;
}

.custom-label {
  display: flex;
  align-items: center;
  font-size: 11px;
  color: #8b8b8b;
  margin-bottom: 4px;
  font-weight: 500;
}

.property-hint {
  font-size: 10px;
  color: #8b8b8b;
  margin-top: 4px;
  font-style: italic;
  line-height: 1.3;
}

.agent-card {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #2d2d30;
  border: 1px solid transparent;
  border-radius: 3px;
  padding: 8px 12px;
  cursor: grab;
  transition: all 0.2s;
  min-height: 48px;
}

.agent-card:hover {
  background: #3e3e42;
  border-color: #007acc;
}

.agent-card.dragging {
  opacity: 0.5;
  cursor: grabbing;
}

.agent-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.agent-info {
  flex: 1;
  min-width: 0;
}

.agent-info h4 {
  color: #cccccc;
  font-size: 13px;
  font-weight: 500;
  margin: 0;
}

.agent-info p {
  font-size: 11px;
  color: #9ca3af;
  margin: 2px 0 0 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.agent-tags {
  display: none; /* Compact view */
}

.tag {
  display: none;
}

.custom-creator {
  margin-top: 12px;
  padding: 12px;
  background: #2a2a2a;
  border: 1px solid #3e3e42;
  border-radius: 4px;
  animation: slideDown 0.2s ease-out;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.custom-input,
.custom-textarea {
  width: 100%;
  padding: 0.5rem;
  margin-bottom: 0.5rem;
  background: #252526;
  color: white;
  border-radius: 0.25rem;
  border: 1px solid #3e3e42;
}

.custom-input:focus,
.custom-textarea:focus {
  border-color: #3b82f6;
  outline: none;
}

.btn-create {
  width: 100%;
  padding: 8px 12px;
  background: #007acc;
  color: white;
  border: 1px solid #007acc;
  border-radius: 3px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 500;
  transition: all 0.2s;
  margin-top: 8px;
}

.btn-create:hover {
  background: #005a9e;
  border-color: #005a9e;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 122, 204, 0.3);
}

/* Canvas Container */
.canvas-container {
  background: #1e1e1e;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  position: relative;
}

.canvas-container.library-collapsed {
  margin-left: 0;
}

.workflow-canvas {
  position: relative;
  flex: 1;
  display: flex;
  min-height: 400px;
  height: 100%;
}

.flow-loading {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #9ca3af;
}

.flow-loading p {
  margin-top: 1rem;
  font-size: 0.875rem;
}

.vue-flow-wrapper {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: 100%;
}

.vue-flow-canvas {
  width: 100%;
  height: 100%;
  background: radial-gradient(ellipse at center, #1a1a1a 0%, #0d0d0d 100%);
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.drop-indicator {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  padding: 1rem 2rem;
  background-color: rgba(59, 130, 246, 0.2);
  border: 2px dashed #3b82f6;
  border-radius: 0.5rem;
  color: #60a5fa;
  font-weight: 600;
  pointer-events: none;
}

/* Pipeline View */
.pipeline-view {
  padding: 1.5rem;
  flex: 1;
  overflow-y: auto;
}

.pipeline-list {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
}

.pipeline-card {
  background: #252526;
  border-radius: 0.5rem;
  padding: 1rem;
  border: 1px solid #3e3e42;
}

.pipeline-card h3 {
  color: white;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.pipeline-card p {
  font-size: 0.875rem;
  color: #9ca3af;
  margin-bottom: 0.75rem;
}

.pipeline-actions {
  display: flex;
  gap: 0.5rem;
}

.btn-action {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.75rem;
  border-radius: 0.25rem;
  font-size: 0.875rem;
  background: #2a2d2e;
  color: white;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-action:hover {
  background: #3e3e42;
}

.btn-action.danger {
  background-color: #dc2626;
}

.btn-action.danger:hover {
  background-color: #b91c1c;
}

/* Monitor View */
.monitor-view {
  padding: 1.5rem;
  flex: 1;
  overflow-y: auto;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
}

.metric-card {
  background: #252526;
  border-radius: 0.5rem;
  padding: 1.5rem;
  border: 1px solid #3e3e42;
  display: flex;
  align-items: center;
  gap: 1rem;
}

.metric-icon {
  width: 3rem;
  height: 3rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.metric-icon.success {
  background-color: rgba(16, 185, 129, 0.2);
  color: #10b981;
}

.metric-icon.warning {
  background-color: rgba(234, 179, 8, 0.2);
  color: #eab308;
}

.metric-icon.info {
  background-color: rgba(59, 130, 246, 0.2);
  color: #3b82f6;
}

.metric-data h3 {
  font-size: 1.5rem;
  font-weight: bold;
  color: white;
}

.metric-data p {
  font-size: 0.875rem;
  color: #9ca3af;
}

/* Properties Panel */
.properties-panel {
  width: 320px;
  background: #252526;
  border-left: 1px solid #374151;
  display: flex;
  flex-direction: column;
}

.properties-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem;
  border-bottom: 1px solid #1e1e1e;
}

.properties-header h3 {
  color: white;
  font-weight: 600;
}

.btn-close {
  padding: 0.25rem;
  border-radius: 0.25rem;
  color: #9ca3af;
  background: none;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-close:hover {
  background: #2a2d2e;
  color: white;
}

.properties-content {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
}

.property-group {
  margin-bottom: 1rem;
}

.property-group label {
  display: block;
  font-size: 0.875rem;
  color: #9ca3af;
  margin-bottom: 0.5rem;
}

.property-value {
  color: white;
}

.property-value.status {
  display: inline-block;
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.875rem;
}

.property-value.idle {
  background: #3e3e42;
}

.property-value.running {
  background-color: #059669;
}

.property-value.completed {
  background-color: #2563eb;
}

.property-value.error {
  background-color: #dc2626;
}

.property-input,
.property-select,
.property-textarea {
  width: 100%;
  padding: 4px 8px;
  background: #3c3c3c;
  color: #cccccc;
  border-radius: 3px;
  border: 1px solid #3e3e42;
  font-size: 13px;
  font-family: inherit;
}

.property-input:focus,
.property-select:focus,
.property-textarea:focus {
  border-color: #007acc;
  outline: none;
  background: #2d2d30;
}

.property-actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 1.5rem;
}

.btn-primary {
  padding: 0.5rem 1rem;
  background-color: #3b82f6;
  color: white;
  border-radius: 0.25rem;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary:hover {
  background-color: #2563eb;
}

.btn-secondary {
  padding: 0.5rem 1rem;
  background: #2a2d2e;
  color: white;
  border-radius: 0.25rem;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  transition: all 0.2s;
}

.btn-secondary:hover {
  background: #3e3e42;
}

/* Transitions */
.slide-enter-active,
.slide-leave-active {
  transition: transform 0.3s;
}

.slide-enter-from {
  transform: translateX(100%);
}

.slide-leave-to {
  transform: translateX(100%);
}

/* Group Editor Modal */
.group-editor-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 2000; /* Higher than regular modals (1000) */
  display: flex;
  align-items: center;
  justify-content: center;
}

.group-modal-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  z-index: 1;
}

.group-modal-content {
  position: relative;
  background: #252526;
  border-radius: 4px;
  width: 95%;
  max-width: 1400px;
  height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.7);
  border: 1px solid #1e1e1e;
  z-index: 2;
  overflow: hidden;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  background: #2d2d30;
  border-bottom: 1px solid #1e1e1e;
  min-height: 35px;
}

.modal-header h3 {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #cccccc;
  font-size: 14px;
  font-weight: 400;
  margin: 0;
}

.btn-close {
  background: none;
  border: none;
  color: #9ca3af;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 3px;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-close:hover {
  background: #3e3e42;
  color: #cccccc;
}

.modal-body {
  flex: 1;
  padding: 12px;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  background: #1e1e1e;
}

.group-properties {
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: #2a2a2a;
  padding: 12px;
  border-radius: 3px;
  border: 1px solid #3e3e42;
  margin-bottom: 16px;
  flex-shrink: 0; /* Don't shrink the properties section */
}

.group-properties label {
  color: #9ca3af;
  font-size: 12px;
  margin-bottom: 4px;
  display: block;
}

.group-flow-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.group-flow-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.group-flow-header h4 {
  color: #cccccc;
  font-size: 13px;
  font-weight: 500;
  margin: 0;
}

.help-text {
  color: #6b7280;
  font-size: 11px;
  font-style: normal;
}

.group-flow-canvas {
  background: #1e1e1e;
  border-radius: 3px;
  border: 1px solid #3e3e42;
  position: relative;
  width: 100%;
  height: 450px;
  min-height: 450px;
  overflow: hidden;
}

.vue-flow-inner {
  width: 100%;
  height: 450px !important;
  position: relative;
  display: block;
}

/* Force VueFlow visibility */
.group-flow-canvas .vue-flow__viewport {
  width: 100%;
  height: 100%;
}

.group-flow-canvas .vue-flow__container {
  width: 100%;
  height: 100%;
}

.group-flow-canvas .vue-flow__transformationpane {
  width: 100%;
  height: 100%;
}

.group-flow-canvas .vue-flow__background {
  width: 100%;
  height: 100%;
}

/* Ensure VueFlow container is visible */
.group-flow-canvas .vue-flow {
  width: 100%;
  height: 100%;
  min-height: 450px;
  position: relative;
  display: block;
}

.group-bottom-section {
  display: flex;
  gap: 10px;
  margin-top: 12px;
  height: 140px;
  flex-shrink: 0;
}

.group-agent-library {
  flex: 1;
  background: #252526;
  border-radius: 3px;
  padding: 10px;
  border: 1px solid #3e3e42;
  overflow-y: auto;
}

.mini-agent-cards {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.mini-agent-card {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #2d2d30;
  border: 1px solid transparent;
  border-radius: 3px;
  padding: 5px 8px;
  cursor: grab;
  transition: all 0.2s;
  font-size: 12px;
}

.mini-agent-card:hover {
  border-color: #007acc;
  background: #3e3e42;
}

.mini-agent-card:active {
  cursor: grabbing;
}

.mini-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.mini-agent-card span {
  color: #cccccc;
  font-size: 12px;
}

.group-agents-list {
  background: #2a2a2a;
  border-radius: 3px;
  padding: 10px;
  border: 1px solid #3e3e42;
  overflow-y: auto;
  width: 250px;
  flex-shrink: 0;
}

.empty-message {
  color: #6b7280;
  font-size: 12px;
  font-style: italic;
  padding: 16px 8px;
  text-align: center;
}

.agent-list-items {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.agent-list-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background: #2d2d30;
  border-radius: 3px;
  border: 1px solid transparent;
  transition: all 0.2s;
}

.agent-list-item:hover {
  background: #3e3e42;
  border-color: #007acc;
}

.agent-list-item span {
  flex: 1;
  color: #cccccc;
  font-size: 12px;
}

.btn-remove {
  background: none;
  border: none;
  color: #9ca3af;
  cursor: pointer;
  padding: 0.25rem;
  border-radius: 0.25rem;
  transition: all 0.2s;
}

.btn-remove:hover {
  background: #ef4444;
  color: white;
}

.group-modal-content .modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 16px;
  background: #2d2d30;
  border-top: 1px solid #1e1e1e;
  /* Keep footer pinned to bottom within flex column */
  margin-top: auto;
  flex-shrink: 0;
}

.btn-primary {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  background: #007acc;
  color: white;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 400;
  transition: all 0.2s;
}

.btn-primary:hover {
  background: #1a8cff;
}

.btn-secondary {
  padding: 6px 14px;
  background: #3e3e42;
  color: #cccccc;
  border: 1px solid transparent;
  border-radius: 3px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 400;
  transition: all 0.2s;
}

.btn-secondary:hover {
  background: #505050;
  border-color: #6b6b6b;
  color: white;
}

/* Pipeline Save Modal */
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

.modal {
  background: #252526;
  border: 1px solid #3e3e42;
  border-radius: 8px;
  max-width: 500px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.group-modal-content .modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #3e3e42;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #3e3e42;
}

.modal-header h3 {
  font-size: 14px;
  font-weight: 500;
  color: #cccccc;
  margin: 0;
}

.close-button {
  background: none;
  border: none;
  color: #8b8b8b;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  transition: color 0.2s;
}

.close-button:hover {
  color: #cccccc;
}

.modal-form {
  padding: 20px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  font-weight: 500;
  color: #8b8b8b;
}

.form-group input,
.form-group textarea {
  width: 100%;
  background: #1e1e1e;
  border: 1px solid #3e3e42;
  border-radius: 3px;
  padding: 6px 8px;
  font-size: 12px;
  color: #cccccc;
  transition: all 0.2s;
  font-family: 'SF Mono', Monaco, 'Courier New', monospace;
}

.form-group input:focus,
.form-group textarea:focus {
  outline: none;
  border-color: #007acc;
  background: #2a2a2a;
}

.group-modal-content .modal-actions {
  padding: 16px 20px;
  border-top: 1px solid #3e3e42;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;
}

.cancel-btn,
.save-btn {
  padding: 6px 12px;
  font-size: 12px;
  border: 1px solid var(--color-border);
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.2s;
}

.cancel-btn {
  background: #2a2a2a;
  color: #8b8b8b;
  border-color: #3e3e42;
}

.cancel-btn:hover {
  background: #323232;
  color: #cccccc;
  border-color: #515151;
}

.save-btn {
  background: #007acc;
  color: white;
  border-color: #007acc;
}

.save-btn:hover {
  background: #005a9e;
  border-color: #005a9e;
}

.save-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Task Selection Modal */
.task-selection-modal {
  max-width: 600px;
  background: #252526;
}

.group-modal-content .modal-body {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 20px;
  background: #252526;
  min-height: 0; /* Important for flexbox scrolling */
  /* Override generic modal-body cap so body fills available space */
  max-height: none;
}

.modal-body {
  padding: 20px;
  max-height: 400px;
  overflow-y: auto;
  background: #252526;
}

.task-filter {
  margin-bottom: 16px;
}

.filter-input {
  width: 100%;
  padding: 8px 12px;
  background: #1e1e1e;
  border: 1px solid #3e3e42;
  border-radius: 3px;
  font-size: 12px;
  color: #cccccc;
  font-family: 'SF Mono', Monaco, 'Courier New', monospace;
}

.filter-input:focus {
  outline: none;
  border-color: #007acc;
  background: #2a2a2a;
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 200px;
}

.task-item {
  padding: 12px;
  background: #1e1e1e;
  border: 1px solid #3e3e42;
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.2s;
}

.task-item:hover {
  background: #2a2a2a;
  border-color: #007acc;
}

.task-item.selected {
  background: #2a2a2a;
  border-color: #007acc;
  box-shadow: 0 0 0 1px #007acc;
}

.task-type {
  font-size: 10px;
  text-transform: uppercase;
  color: #007acc;
  margin-bottom: 4px;
  font-weight: 500;
}

.task-title {
  font-size: 13px;
  color: #cccccc;
  font-weight: 500;
  margin-bottom: 4px;
}

.task-description {
  font-size: 11px;
  color: #8b8b8b;
  line-height: 1.4;
}

.task-status {
  font-size: 10px;
  color: #6b6b6b;
  margin-top: 4px;
  font-style: italic;
}

.empty-state {
  text-align: center;
  padding: 40px;
  color: #8b8b8b;
  font-size: 13px;
}
</style>
