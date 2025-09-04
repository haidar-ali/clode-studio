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
        <button 
          @click="toggleGroupCreation" 
          class="btn-icon" 
          :class="{ active: isCreatingGroup }"
          title="Create Group">
          <Icon name="mdi:group" />
        </button>
        <button @click="savePipeline" class="btn-icon" title="Save Pipeline">
          <Icon name="mdi:content-save" />
        </button>
        <button @click="loadPipeline" class="btn-icon" title="Load Pipeline">
          <Icon name="mdi:folder-open" />
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
          <button @click="libraryCollapsed = !libraryCollapsed" class="btn-collapse">
            <Icon name="mdi:chevron-left" />
          </button>
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
             :class="{ 
               connecting: isConnecting,
               'agent-selection-mode': groupCreationMode 
             }"
             @dragover="handleCanvasDragOver"
             @drop="handleCanvasDrop"
             @mousemove="handleCanvasMouseMove"
             @click="handleCanvasClick"
             @wheel="handleCanvasWheel"
             @keydown.esc="cancelConnection">
          
          <!-- Zoom Controls -->
          <div class="zoom-controls">
            <button @click="zoomIn" class="zoom-btn" title="Zoom In">
              <Icon name="mdi:magnify-plus" />
            </button>
            <span class="zoom-level">{{ Math.round(canvasZoom * 100) }}%</span>
            <button @click="zoomOut" class="zoom-btn" title="Zoom Out">
              <Icon name="mdi:magnify-minus" />
            </button>
            <button @click="resetZoom" class="zoom-btn" title="Reset Zoom">
              <Icon name="mdi:magnify-scan" />
            </button>
          </div>
          
          <!-- Zoomable Container -->
          <div class="canvas-viewport" 
               :style="{ 
                 transform: `translate(${canvasTransform.x}px, ${canvasTransform.y}px) scale(${canvasZoom})`,
                 transformOrigin: '0 0'
               }">
            <!-- Grid Background -->
            <svg class="canvas-grid" width="200%" height="200%">
              <defs>
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#2a2a2a" stroke-width="1"/>
                </pattern>
              </defs>
              <rect width="200%" height="200%" fill="url(#grid)" />
            </svg>
          
            <!-- Connection Lines -->
            <svg class="connections-layer" width="200%" height="200%">
            <defs>
              <marker id="arrowhead" markerWidth="10" markerHeight="7" 
                refX="9" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill="#4a9eff" />
              </marker>
            </defs>
            <g v-for="conn in connections" :key="conn.id">
              <line 
                :x1="conn.x1" 
                :y1="conn.y1" 
                :x2="conn.x2" 
                :y2="conn.y2"
                stroke="#4a9eff"
                stroke-width="2"
                marker-end="url(#arrowhead)"
                class="connection-line"
              />
              <circle 
                :cx="conn.x1" 
                :cy="conn.y1" 
                r="4" 
                fill="#4a9eff"
              />
            </g>
            <!-- Temporary connection while dragging -->
            <line 
              v-if="tempConnection"
              :x1="tempConnection.x1" 
              :y1="tempConnection.y1" 
              :x2="tempConnection.x2" 
              :y2="tempConnection.y2"
              stroke="#4a9eff"
              stroke-width="2"
              stroke-dasharray="5,5"
              opacity="0.6"
            />
            </svg>
            
            <!-- Agent Groups -->
            <div 
              v-for="group in agentGroups" 
              :key="group.id"
              class="agent-group"
              :class="{ collapsed: group.collapsed, 'entry-point': group.inputs.length === 0 }"
              :style="{ 
                left: group.position.x + 'px', 
                top: group.position.y + 'px',
                width: group.size.width + 'px',
                height: group.collapsed ? 'auto' : group.size.height + 'px',
                '--group-color': group.color
              }"
              :draggable="!resizingGroup"
              @dragstart="startDragGroup($event, group)"
              @dragend="endDragGroup"
              @dragover="handleGroupDragOver($event, group)"
              @drop="handleGroupDrop($event, group)"
              @click="selectGroup(group)"
            >
              <!-- Group Header -->
              <div class="group-header">
                <div class="group-status-indicator" :class="getGroupStatus(group)"></div>
                <Icon name="mdi:group" />
                <span class="group-name">{{ group.name }}</span>
                <span class="group-status-text">({{ getGroupStatus(group) }})</span>
                <button @click.stop="toggleGroupCollapse(group)" class="group-toggle">
                  <Icon :name="group.collapsed ? 'mdi:chevron-down' : 'mdi:chevron-up'" />
                </button>
                <button @click.stop="deleteGroup(group)" class="group-delete">
                  <Icon name="mdi:close" />
                </button>
              </div>
              
              <!-- Entry Point Badge for Groups -->
              <div v-if="group.inputs.length === 0" class="entry-point-badge">
                <Icon name="mdi:location-enter" />
                <span>ENTRY</span>
              </div>
              
              <!-- Group Canvas (when expanded) -->
              <div v-if="!group.collapsed" class="group-canvas">
                <!-- Internal Connections SVG -->
                <svg class="group-connections-svg">
                  <defs>
                    <marker :id="`group-arrow-${group.id}`" markerWidth="10" markerHeight="7" 
                      refX="9" refY="3.5" orient="auto">
                      <polygon points="0 0, 10 3.5, 0 7" fill="#4a9eff" />
                    </marker>
                  </defs>
                  <!-- Internal connections between agents in this group -->
                  <g v-for="conn in getInternalConnections(group)" :key="conn.id">
                    <line 
                      :x1="getInternalConnX1(conn, group)" 
                      :y1="getInternalConnY1(conn, group)" 
                      :x2="getInternalConnX2(conn, group)" 
                      :y2="getInternalConnY2(conn, group)"
                      stroke="#4a9eff"
                      stroke-width="2"
                      :marker-end="`url(#group-arrow-${group.id})`"
                      class="internal-connection-line"
                    />
                  </g>
                  <!-- Group entry connections -->
                  <g v-for="agentId in group.entryAgents || []" :key="`entry-${agentId}`">
                    <line
                      :x1="10"
                      :y1="30"
                      :x2="getGroupAgentRelativePos(agentId, group).x"
                      :y2="getGroupAgentRelativePos(agentId, group).y + 25"
                      stroke="#4ade80"
                      stroke-width="2"
                      stroke-dasharray="5,5"
                      :marker-end="`url(#group-arrow-${group.id})`"
                      class="entry-connection-line"
                    />
                  </g>
                  <!-- Group exit connections -->
                  <g v-for="agentId in group.exitAgents || []" :key="`exit-${agentId}`">
                    <line
                      :x1="getGroupAgentRelativePos(agentId, group).x + 100"
                      :y1="getGroupAgentRelativePos(agentId, group).y + 25"
                      :x2="group.size.width - 50"
                      :y2="30"
                      stroke="#ef4444"
                      stroke-width="2"
                      stroke-dasharray="5,5"
                      :marker-end="`url(#group-arrow-${group.id})`"
                      class="exit-connection-line"
                    />
                  </g>
                </svg>
                
                <!-- Group Entry Point -->
                <div class="group-entry-point" title="Group Entry - Connect to agents that should start first">
                  <Icon name="mdi:location-enter" size="16" />
                  <div 
                    class="group-entry-connection-point"
                    @click.stop="handleGroupEntryClick(group)"
                    :class="{ 
                      active: connectingGroupEntry === group.id,
                      highlight: isConnecting && connectionStart?.itemType === 'group-entry'
                    }"
                  ></div>
                </div>
                
                <!-- Group Exit Point -->
                <div class="group-exit-point" title="Group Exit - Connect to agents that trigger next stage">
                  <Icon name="mdi:location-exit" size="16" />
                  <div 
                    class="group-exit-connection-point"
                    @click.stop="handleGroupExitClick(group)"
                    :class="{ 
                      active: connectingGroupExit === group.id,
                      highlight: isConnecting && connectionStart?.itemType === 'group-exit'
                    }"
                  ></div>
                </div>
                
                <!-- Agents in Group (full cards) -->
                <div 
                  v-for="agent in deployedAgents.filter(a => a.groupId === group.id)" 
                  :key="agent.instanceId"
                  class="group-agent"
                  :style="{ 
                    left: (agent.position.x - group.position.x) + 'px',
                    top: (agent.position.y - group.position.y) + 'px',
                    '--agent-color': agent.color
                  }"
                  :draggable="true"
                  @dragstart="startDragDeployed($event, agent)"
                  @dragend="endDragDeployed"
                  @click="selectAgent(agent)"
                  :class="{ 
                    selected: selectedAgent?.instanceId === agent.instanceId,
                    'entry-agent': group.entryAgents?.includes(agent.instanceId)
                  }"
                >
                  <div class="agent-icon">
                    <Icon :name="agent.icon" size="20" />
                  </div>
                  <div class="agent-label">{{ agent.name }}</div>
                  
                  <!-- Connection points for internal connections -->
                  <div 
                    class="connection-point input"
                    @click.stop="handleConnectionClick(agent, 'input')"
                    :class="{ 
                      highlight: shouldHighlightInput(agent),
                      active: isActiveInput(agent)
                    }"
                    title="Connect input"
                  ></div>
                  <div 
                    class="connection-point output"
                    @click.stop="handleConnectionClick(agent, 'output')"
                    :class="{ 
                      highlight: shouldHighlightOutput(agent),
                      active: isActiveOutput(agent)
                    }"
                    title="Connect output"
                  ></div>
                </div>
              </div>
              
              <!-- Resize Handles (only when not collapsed) -->
              <div v-if="!group.collapsed" class="resize-handles">
                <div 
                  class="resize-handle top-left" 
                  @mousedown="startResize($event, group, 'top-left')"
                ></div>
                <div 
                  class="resize-handle top-right" 
                  @mousedown="startResize($event, group, 'top-right')"
                ></div>
                <div 
                  class="resize-handle bottom-left" 
                  @mousedown="startResize($event, group, 'bottom-left')"
                ></div>
                <div 
                  class="resize-handle bottom-right" 
                  @mousedown="startResize($event, group, 'bottom-right')"
                ></div>
              </div>
              
              <!-- Connection Points for Groups -->
              <div 
                class="connection-point input"
                @click.stop="handleGroupConnectionClick(group, 'input')"
                :class="{ 
                  highlight: isConnecting && connectionStart?.type === 'output' && connectionStart?.item.id !== group.id
                }"
              ></div>
              <div 
                class="connection-point output"
                @click.stop="handleGroupConnectionClick(group, 'output')"
                :class="{ 
                  highlight: isConnecting && connectionStart?.type === 'input' && connectionStart?.item.id !== group.id
                }"
              ></div>
            </div>
            
            <!-- Drop Zone Indicator -->
            <div 
              v-if="showDropZone" 
              class="drop-zone"
              :style="{ left: dropZone.x + 'px', top: dropZone.y + 'px' }"
            >
              <Icon name="mdi:plus-circle" size="48" />
            </div>
            
            <!-- Deployed Agents (only standalone agents not in groups) -->
          <div 
            v-for="agent in deployedAgents.filter(a => !a.groupId)" 
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
              error: agent.status === 'error',
              'entry-point': agent.inputs.length === 0 && !agent.groupId,
              'in-group': !!agent.groupId,
              'selected-for-group': selectedForGroup.has(agent.instanceId)
            }"
          >
            <div class="agent-status-ring" :class="agent.status"></div>
            
            <!-- Entry Point Badge -->
            <div v-if="agent.inputs.length === 0 && !agent.groupId" class="entry-point-badge">
              <Icon name="mdi:location-enter" />
              <span>ENTRY</span>
            </div>
            
            <div class="agent-icon">
              <Icon :name="agent.icon" />
            </div>
            <div class="agent-label">{{ agent.name }}</div>
            <div class="agent-instance">{{ agent.instanceId.slice(0, 8) }}</div>
            
            <!-- Connection Points (only show for standalone agents) -->
            <div 
              v-if="!agent.groupId"
              class="connection-point input"
              @click.stop="handleConnectionClick(agent, 'input')"
              :class="{ 
                highlight: shouldHighlightInput(agent),
                active: isActiveInput(agent)
              }"
              title="Click to connect input"
            ></div>
            <div 
              v-if="!agent.groupId"
              class="connection-point output"
              @click.stop="handleConnectionClick(agent, 'output')"
              :class="{ 
                highlight: shouldHighlightOutput(agent),
                active: isActiveOutput(agent)
              }"
              title="Click to connect output"
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
        </div>
          
          <!-- Connection Mode Indicator -->
          <div v-if="isConnecting" class="connection-mode-indicator">
            <Icon name="mdi:connection" />
            <span>Connecting from {{ getConnectionStartName() }} ({{ connectionStart?.type }})</span>
            <span class="connection-hint">Click on another {{ connectionStart?.type === 'output' ? 'input' : 'output' }} point or press ESC to cancel</span>
          </div>
          
          <!-- Group Creation Mode Indicator -->
          <div v-if="isCreatingGroup" class="group-creation-indicator">
            <Icon name="mdi:group" />
            <span v-if="selectedForGroup.size === 0">Click on agents to select them for grouping</span>
            <span v-else>{{ selectedForGroup.size }} agents selected</span>
            <button 
              v-if="selectedForGroup.size > 0"
              @click="createGroupFromSelected" 
              :disabled="selectedForGroup.size < 2"
              class="btn-create-group">
              Create Group
            </button>
            <button @click="cancelGroupCreation" class="btn-cancel">
              Cancel
            </button>
          </div>
          
          <!-- Entry Points Indicator -->
          <div v-if="deployedAgents.length > 0 && entryPoints.length === 0" class="no-entry-warning">
            <Icon name="mdi:alert" />
            <span>No entry point! Connect an agent or leave one unconnected to create an entry.</span>
          </div>
          
          <!-- Help Text for Empty Canvas -->
          <div v-if="deployedAgents.length === 0" class="empty-canvas-help">
            <Icon name="mdi:information-outline" size="48" />
            <h3>Start Building Your Pipeline</h3>
            <p>Drag agents from the library to the canvas or click the + button</p>
            <p class="connection-help">
              <strong>To connect agents:</strong><br/>
              1. Click on an agent's output point (right side)<br/>
              2. Click on another agent's input point (left side)<br/>
              <br/>
              <strong style="color: #4ade80;">📍 Entry Point:</strong><br/>
              Agents without inputs become pipeline entry points (marked with green border and ENTRY badge).
            </p>
          </div>
          
          <!-- Group Creation Toolbar -->
          <div v-if="groupCreationMode" class="group-creation-toolbar">
            <span>{{ selectedForGroup.size }} agents selected</span>
            <button 
              @click="createGroupFromSelected" 
              :disabled="selectedForGroup.size < 2"
              class="btn-create"
            >
              <Icon name="mdi:group" /> Create Group
            </button>
            <button @click="cancelGroupCreation" class="btn-cancel">
              <Icon name="mdi:close" /> Cancel
            </button>
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
                  <span><Icon name="mdi:robot" /> {{ pipeline.stages.length }} agents</span>
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
                <Icon name="mdi:pipe-connected" />
              </div>
              <div class="metric-data">
                <h3>{{ pipelineCount }}</h3>
                <p>Active Pipelines</p>
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
              <label>Role</label>
              <div class="property-value">{{ selectedAgent.type }}</div>
            </div>
            
            <div class="property-group">
              <label>Instance Type</label>
              <select v-model="selectedAgent.instanceType" class="property-select">
                <option value="claude">Claude</option>
                <option value="codex">Codex</option>
              </select>
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
              <button @click="spawnAgentInstance" class="btn-secondary">
                <Icon name="mdi:console" /> Spawn {{ selectedAgent?.instanceType === 'codex' ? 'Codex' : 'Claude' }}
              </button>
              <button @click="startFromKanban" class="btn-secondary">
                <Icon name="mdi:view-kanban" /> Start from Kanban
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
import { useCodexInstancesStore } from '~/stores/codex-instances';
import { usePipelineOrchestratorStore } from '~/stores/pipeline-orchestrator';
import { useTasksStore } from '~/stores/tasks';
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
  instanceType: 'claude' | 'codex'; // Which instance to spawn
  name: string;
  icon: string;
  color: string;
  position: { x: number; y: number };
  status: 'idle' | 'running' | 'paused' | 'error';
  personalityId?: string;
  customInstructions?: string;
  inputs: string[]; // Array of agent/group IDs that connect TO this agent
  outputs: string[]; // Array of agent/group IDs that this agent connects TO
  groupId?: string; // If this agent belongs to a group
}

interface AgentGroup {
  id: string;
  name: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  agents: string[]; // Agent IDs in this group
  entryAgents?: string[]; // Agents that are connected from group entry point (start first)
  exitAgents?: string[]; // Agents that trigger group completion and downstream execution
  inputs: string[]; // Array of agent/group IDs that connect TO this group
  outputs: string[]; // Array of agent/group IDs that this group connects TO
  collapsed: boolean; // Whether the group is collapsed or expanded
  color: string;
}

interface Connection {
  id: string;
  from: string; // Source agent/group ID
  to: string; // Target agent/group ID
  fromType: 'agent' | 'group';
  toType: 'agent' | 'group';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
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
const codexStore = useCodexInstancesStore();
const pipelineStore = usePipelineOrchestratorStore();
const tasksStore = useTasksStore();

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
const agentGroups = ref<AgentGroup[]>([]);
const connections = ref<Connection[]>([]);

// Connection state
const isConnecting = ref(false);
const connectionStart = ref<{ item: DeployedAgent | AgentGroup; type: 'input' | 'output'; itemType: 'agent' | 'group' } | null>(null);
const tempConnection = ref<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

// Canvas zoom and pan
const canvasZoom = ref(1);
const canvasTransform = ref({ x: 0, y: 0 });
const isPanning = ref(false);
const panStart = ref({ x: 0, y: 0 });
const isDragging = ref(false);

// Group creation mode
const groupCreationMode = ref(false);
const selectedForGroup = ref<Set<string>>(new Set());
const connectingGroupEntry = ref<string | null>(null); // Group ID when connecting from entry point
const connectingGroupExit = ref<string | null>(null); // Group ID when connecting from exit point
const resizingGroup = ref<AgentGroup | null>(null);
const resizeStart = ref<{ x: number; y: number; width: number; height: number; handle: string; originalX?: number; originalY?: number } | null>(null);

// Group creation state
const isCreatingGroup = ref(false);

// Pipelines
const activePipelines = ref<Pipeline[]>([]);

// Metrics
const activeAgentsCount = computed(() => deployedAgents.value.filter(a => a.status === 'running').length);
const successRate = ref(92);
const avgResponseTime = ref(245);

// Entry points - agents with no inputs
const entryPoints = computed(() => {
  return deployedAgents.value.filter(agent => agent.inputs.length === 0);
});

// Recent Activities
const recentActivities = ref([
  { id: '1', type: 'success', message: 'Architect completed system design', timestamp: new Date() },
  { id: '2', type: 'info', message: 'Developer started implementation', timestamp: new Date(Date.now() - 60000) },
  { id: '3', type: 'warning', message: 'QA Tester found 3 issues', timestamp: new Date(Date.now() - 120000) }
]);

// Drag and Drop
const draggedAgent = ref<AgentType | null>(null);
const draggedDeployed = ref<DeployedAgent | null>(null);
const draggedGroup = ref<AgentGroup | null>(null);

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

function startDragGroup(event: DragEvent, group: AgentGroup) {
  draggedGroup.value = group;
  event.dataTransfer!.effectAllowed = 'move';
  // Store the offset of where we clicked in the group
  const rect = (event.target as HTMLElement).getBoundingClientRect();
  const offset = {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
  event.dataTransfer!.setData('offset', JSON.stringify(offset));
}

function endDragGroup() {
  draggedGroup.value = null;
}

function handleGroupDragOver(event: DragEvent, group: AgentGroup) {
  event.preventDefault();
  event.stopPropagation();
  
  // Accept agents being dragged
  if (draggedAgent.value || draggedDeployed.value) {
    event.dataTransfer!.dropEffect = 'move';
  }
}

function handleGroupDrop(event: DragEvent, group: AgentGroup) {
  event.preventDefault();
  event.stopPropagation();
  
  // Calculate position relative to group
  const groupEl = event.currentTarget as HTMLElement;
  const rect = groupEl.getBoundingClientRect();
  const relativeX = event.clientX - rect.left - 50; // Center on cursor
  const relativeY = event.clientY - rect.top - 40;
  
  if (draggedAgent.value) {
    // Create new agent in this group
    const agent = draggedAgent.value;
    const instanceId = `${agent.id}-${Date.now().toString(36)}`;
    
    const newAgent: DeployedAgent = {
      instanceId,
      type: agent.id,
      instanceType: 'claude',
      name: agent.name,
      icon: agent.icon,
      color: agent.color,
      position: {
        x: group.position.x + relativeX,
        y: group.position.y + relativeY
      },
      status: 'idle',
      personalityId: selectedPersonality.value,
      inputs: [],
      outputs: [],
      groupId: group.id
    };
    
    deployedAgents.value.push(newAgent);
    group.agents.push(instanceId);
    
    console.log(`✅ Added ${agent.name} to ${group.name}`);
    draggedAgent.value = null;
  } else if (draggedDeployed.value) {
    // Move existing agent into this group
    const agent = draggedDeployed.value;
    
    // Remove from old group if any
    if (agent.groupId) {
      const oldGroup = agentGroups.value.find(g => g.id === agent.groupId);
      if (oldGroup) {
        const idx = oldGroup.agents.indexOf(agent.instanceId);
        if (idx !== -1) oldGroup.agents.splice(idx, 1);
      }
    }
    
    // Add to new group
    agent.groupId = group.id;
    agent.position = {
      x: group.position.x + relativeX,
      y: group.position.y + relativeY
    };
    
    if (!group.agents.includes(agent.instanceId)) {
      group.agents.push(agent.instanceId);
    }
    
    console.log(`✅ Moved ${agent.name} to ${group.name}`);
    draggedDeployed.value = null;
  }
}

function startResize(event: MouseEvent, group: AgentGroup, handle: string) {
  event.preventDefault();
  event.stopPropagation();
  
  resizingGroup.value = group;
  resizeStart.value = {
    x: event.clientX,
    y: event.clientY,
    width: group.size.width,
    height: group.size.height,
    handle,
    originalX: group.position.x,
    originalY: group.position.y
  };
  
  document.addEventListener('mousemove', handleResize);
  document.addEventListener('mouseup', endResize);
}

function handleResize(event: MouseEvent) {
  if (!resizingGroup.value || !resizeStart.value) return;
  
  const dx = (event.clientX - resizeStart.value.x) / canvasZoom.value;
  const dy = (event.clientY - resizeStart.value.y) / canvasZoom.value;
  const handle = resizeStart.value.handle;
  
  let newWidth = resizeStart.value.width;
  let newHeight = resizeStart.value.height;
  let newX = resizeStart.value.originalX || resizingGroup.value.position.x;
  let newY = resizeStart.value.originalY || resizingGroup.value.position.y;
  
  if (handle.includes('right')) {
    newWidth = Math.max(300, resizeStart.value.width + dx);
  }
  if (handle.includes('left')) {
    newWidth = Math.max(300, resizeStart.value.width - dx);
    // Move position when resizing from left
    newX = resizeStart.value.originalX! + (resizeStart.value.width - newWidth);
  }
  if (handle.includes('bottom')) {
    newHeight = Math.max(200, resizeStart.value.height + dy);
  }
  if (handle.includes('top')) {
    newHeight = Math.max(200, resizeStart.value.height - dy);
    // Move position when resizing from top
    newY = resizeStart.value.originalY! + (resizeStart.value.height - newHeight);
  }
  
  // Update the group size and position
  resizingGroup.value.size = { width: newWidth, height: newHeight };
  resizingGroup.value.position = { x: newX, y: newY };
}

function endResize() {
  document.removeEventListener('mousemove', handleResize);
  document.removeEventListener('mouseup', endResize);
  resizingGroup.value = null;
}

function handleCanvasDragOver(event: DragEvent) {
  event.preventDefault();
  event.dataTransfer!.dropEffect = draggedAgent.value ? 'copy' : 'move';
  
  // Get the canvas viewport element
  const canvasEl = document.querySelector('.workflow-canvas');
  const viewportEl = document.querySelector('.canvas-viewport');
  
  if (canvasEl && viewportEl) {
    const canvasRect = canvasEl.getBoundingClientRect();
    const viewportRect = viewportEl.getBoundingClientRect();
    
    // Calculate position relative to viewport, accounting for zoom and centering
    const relativeX = (event.clientX - viewportRect.left) / canvasZoom.value;
    const relativeY = (event.clientY - viewportRect.top) / canvasZoom.value;
    
    // Center the drop zone on cursor (50px is half the agent width)
    dropZone.x = relativeX - 50;
    dropZone.y = relativeY - 50;
    showDropZone.value = true;
  }
}

function handleCanvasDrop(event: DragEvent) {
  event.preventDefault();
  showDropZone.value = false;
  
  // Get the canvas viewport element
  const canvasEl = document.querySelector('.workflow-canvas') as HTMLElement;
  const viewportEl = document.querySelector('.canvas-viewport') as HTMLElement;
  
  if (!canvasEl || !viewportEl) return;
  
  const viewportRect = viewportEl.getBoundingClientRect();
  
  // Proper coordinate transformation accounting for zoom and pan
  // Convert screen coordinates to canvas coordinates
  const screenX = event.clientX - viewportRect.left;
  const screenY = event.clientY - viewportRect.top;
  
  // Apply inverse zoom to get actual canvas position
  const canvasX = screenX / canvasZoom.value - canvasTransform.value.x;
  const canvasY = screenY / canvasZoom.value - canvasTransform.value.y;
  
  // Center the item on cursor position
  const x = canvasX - 50;
  const y = canvasY - 50;
  
  if (draggedAgent.value) {
    // Deploy new agent
    const agent = draggedAgent.value;
    const instanceId = `${agent.id}-${Date.now().toString(36)}`;
    
    deployedAgents.value.push({
      instanceId,
      type: agent.id,
      instanceType: 'claude', // Default to Claude
      name: agent.name,
      icon: agent.icon,
      color: agent.color,
      position: { x, y },
      status: 'idle',
      personalityId: selectedPersonality.value,
      inputs: [],
      outputs: []
    });
    
    draggedAgent.value = null;
  } else if (draggedDeployed.value) {
    // Move existing agent  
    draggedDeployed.value.position = { x, y };
    updateConnectionPositions(); // Update connection lines
    draggedDeployed.value = null;
  } else if (draggedGroup.value) {
    // Move existing group
    const oldX = draggedGroup.value.position.x;
    const oldY = draggedGroup.value.position.y;
    const deltaX = x - oldX;
    const deltaY = y - oldY;
    
    draggedGroup.value.position = { x, y };
    
    // Move all agents in the group
    deployedAgents.value.forEach(agent => {
      if (agent.groupId === draggedGroup.value!.id) {
        agent.position.x += deltaX;
        agent.position.y += deltaY;
      }
    });
    
    // Update connection lines for the group
    connections.value = connections.value.map(conn => {
      if (conn.from === draggedGroup.value!.id) {
        conn.x1 = x + draggedGroup.value!.size.width; // Right side of group
        conn.y1 = y + draggedGroup.value!.size.height / 2; // Center of group
      }
      if (conn.to === draggedGroup.value!.id) {
        conn.x2 = x; // Left side of group  
        conn.y2 = y + draggedGroup.value!.size.height / 2; // Center of group
      }
      return conn;
    });
    
    updateConnectionPositions(); // Update all internal connections
    draggedGroup.value = null;
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
    instanceType: 'claude', // Default to Claude
    name: agent.name,
    icon: agent.icon,
    color: agent.color,
    position: { x, y },
    status: 'idle',
    personalityId: selectedPersonality.value,
    inputs: [],
    outputs: []
  });
}

function selectAgent(agent: DeployedAgent) {
  // Handle group entry point connection
  if (connectingGroupEntry.value && agent.groupId === connectingGroupEntry.value) {
    const group = agentGroups.value.find(g => g.id === connectingGroupEntry.value);
    if (group) {
      if (!group.entryAgents) {
        group.entryAgents = [];
      }
      if (!group.entryAgents.includes(agent.instanceId)) {
        group.entryAgents.push(agent.instanceId);
        console.log(`✅ Connected ${group.name} entry → ${agent.name}`);
      } else {
        // Remove if already connected
        const idx = group.entryAgents.indexOf(agent.instanceId);
        group.entryAgents.splice(idx, 1);
        console.log(`❌ Disconnected ${group.name} entry → ${agent.name}`);
      }
    }
    connectingGroupEntry.value = null;
    return;
  }
  
  // Handle group exit point connection
  if (connectingGroupExit.value && agent.groupId === connectingGroupExit.value) {
    const group = agentGroups.value.find(g => g.id === connectingGroupExit.value);
    if (group) {
      if (!group.exitAgents) {
        group.exitAgents = [];
      }
      if (!group.exitAgents.includes(agent.instanceId)) {
        group.exitAgents.push(agent.instanceId);
        console.log(`✅ Connected ${agent.name} → ${group.name} exit`);
      } else {
        // Remove if already connected
        const idx = group.exitAgents.indexOf(agent.instanceId);
        group.exitAgents.splice(idx, 1);
        console.log(`❌ Disconnected ${agent.name} → ${group.name} exit`);
      }
    }
    connectingGroupExit.value = null;
    return;
  }
  
  if (isCreatingGroup.value && !agent.groupId) {
    // Toggle selection for group creation
    if (selectedForGroup.value.has(agent.instanceId)) {
      selectedForGroup.value.delete(agent.instanceId);
    } else {
      selectedForGroup.value.add(agent.instanceId);
    }
  } else {
    selectedAgent.value = agent;
  }
}

function selectGroup(group: AgentGroup) {
  console.log('Selected group:', group.name);
}

function toggleGroupCreation() {
  // Create an empty group immediately
  const groupId = `group-${Date.now()}`;
  
  // Find a good position for the new group
  const existingGroups = agentGroups.value.length;
  const x = 150 + (existingGroups % 2) * 450;
  const y = 100 + Math.floor(existingGroups / 2) * 350;
  
  const newGroup: AgentGroup = {
    id: groupId,
    name: `Group ${agentGroups.value.length + 1}`,
    position: { x, y },
    size: { width: 400, height: 300 },
    agents: [],
    entryAgents: [],
    exitAgents: [],
    inputs: [],
    outputs: [],
    collapsed: false,
    color: '#4a9eff'
  };
  
  agentGroups.value.push(newGroup);
  console.log(`✅ Created empty group: ${newGroup.name}`);
}

function createGroupFromSelected() {
  if (selectedForGroup.value.size < 2) {
    console.log('Need at least 2 agents to create a group');
    return;
  }
  
  const groupId = `group-${Date.now()}`;
  const selectedAgents = deployedAgents.value.filter(a => selectedForGroup.value.has(a.instanceId));
  
  // Calculate group position (center of selected agents)
  const avgX = selectedAgents.reduce((sum, a) => sum + a.position.x, 0) / selectedAgents.length;
  const avgY = selectedAgents.reduce((sum, a) => sum + a.position.y, 0) / selectedAgents.length;
  
  // Create the group
  const newGroup: AgentGroup = {
    id: groupId,
    name: `Group ${agentGroups.value.length + 1}`,
    position: { x: avgX - 100, y: avgY - 50 },
    agents: Array.from(selectedForGroup.value),
    inputs: [],
    outputs: [],
    collapsed: false,
    color: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
  };
  
  // Update agents to belong to this group
  selectedAgents.forEach(agent => {
    agent.groupId = groupId;
    // Collect all external connections
    agent.inputs.forEach(inputId => {
      const inputAgent = deployedAgents.value.find(a => a.instanceId === inputId);
      if (!inputAgent || !selectedForGroup.value.has(inputAgent.instanceId)) {
        // External input
        if (!newGroup.inputs.includes(inputId)) {
          newGroup.inputs.push(inputId);
        }
      }
    });
    agent.outputs.forEach(outputId => {
      const outputAgent = deployedAgents.value.find(a => a.instanceId === outputId);
      if (!outputAgent || !selectedForGroup.value.has(outputAgent.instanceId)) {
        // External output
        if (!newGroup.outputs.includes(outputId)) {
          newGroup.outputs.push(outputId);
        }
      }
    });
  });
  
  agentGroups.value.push(newGroup);
  
  // Update connections to point to group instead of individual agents
  updateConnectionsForGroup(newGroup);
  
  // Clear selection
  selectedForGroup.value.clear();
  isCreatingGroup.value = false;
  groupCreationMode.value = false;
}

function cancelGroupCreation() {
  selectedForGroup.value.clear();
  isCreatingGroup.value = false;
  groupCreationMode.value = false;
}

function toggleGroupCollapse(group: AgentGroup) {
  group.collapsed = !group.collapsed;
}

function deleteGroup(group: AgentGroup) {
  // Remove group reference from agents
  deployedAgents.value.forEach(agent => {
    if (agent.groupId === group.id) {
      delete agent.groupId;
    }
  });
  
  // Remove group
  const index = agentGroups.value.findIndex(g => g.id === group.id);
  if (index !== -1) {
    agentGroups.value.splice(index, 1);
  }
  
  // Update connections
  updateConnectionPositions();
}

function getAgentById(agentId: string): DeployedAgent | undefined {
  return deployedAgents.value.find(a => a.instanceId === agentId);
}

function handleGroupConnectionClick(group: AgentGroup, type: 'input' | 'output') {
  if (!isConnecting.value) {
    // Start a new connection from group
    startGroupConnection(group, type);
  } else {
    // Try to complete the connection to group
    completeGroupConnection(group, type);
  }
}

function startGroupConnection(group: AgentGroup, type: 'input' | 'output') {
  isConnecting.value = true;
  connectionStart.value = { item: group, type, itemType: 'group' };
  
  // Calculate connection point position for the temporary line
  const x = group.position.x + (type === 'output' ? 200 : 0) + 100;
  const y = group.position.y + 50;
  tempConnection.value = { x1: x, y1: y, x2: x, y2: y };
  
  console.log(`Starting connection from ${group.name} group (${type})`);
}

function completeGroupConnection(targetGroup: AgentGroup, targetType: 'input' | 'output') {
  // Use the unified completeConnection function
  completeConnection(targetGroup, targetType, 'group');
}

// Group connection functions removed - using the ones defined later in the file

function updateConnectionsForGroup(group: AgentGroup) {
  // Update existing connections to point to the group
  connections.value = connections.value.map(conn => {
    if (group.agents.includes(conn.from) || group.agents.includes(conn.to)) {
      // This connection involves a grouped agent, update it
      // For now, we'll keep internal connections but could hide them
    }
    return conn;
  });
}

function getConnectionStartName(): string {
  if (!connectionStart.value) return '';
  if (connectionStart.value.itemType === 'agent') {
    return (connectionStart.value.item as DeployedAgent).name;
  } else {
    return (connectionStart.value.item as AgentGroup).name + ' (group)';
  }
}

function toggleAgentStatus(agent: DeployedAgent) {
  if (agent.status === 'running') {
    agent.status = 'paused';
  } else if (agent.status === 'paused' || agent.status === 'idle') {
    agent.status = 'running';
  }
}

function removeAgent(agent: DeployedAgent) {
  // Remove connections involving this agent
  connections.value = connections.value.filter(
    conn => conn.from !== agent.instanceId && conn.to !== agent.instanceId
  );
  
  // Remove references from other agents
  deployedAgents.value.forEach(otherAgent => {
    otherAgent.inputs = otherAgent.inputs.filter(id => id !== agent.instanceId);
    otherAgent.outputs = otherAgent.outputs.filter(id => id !== agent.instanceId);
  });
  
  // Remove the agent
  const index = deployedAgents.value.findIndex(a => a.instanceId === agent.instanceId);
  if (index !== -1) {
    deployedAgents.value.splice(index, 1);
  }
  if (selectedAgent.value?.instanceId === agent.instanceId) {
    selectedAgent.value = null;
  }
}

function handleConnectionClick(agent: DeployedAgent, type: 'input' | 'output') {
  if (!isConnecting.value) {
    // Start a new connection
    startConnection(agent, type);
  } else {
    // Try to complete the connection
    completeConnection(agent, type);
  }
}

function startConnection(agent: DeployedAgent, type: 'input' | 'output') {
  isConnecting.value = true;
  connectionStart.value = { item: agent, type, itemType: 'agent' };
  
  // Calculate connection point position for the temporary line
  const x = agent.position.x + (type === 'output' ? 100 : 0) + 50;
  const y = agent.position.y + 50;
  tempConnection.value = { x1: x, y1: y, x2: x, y2: y };
  
  console.log(`Starting connection from ${agent.name} (${type})`);
}

function completeConnection(targetItem: DeployedAgent | AgentGroup, targetType: 'input' | 'output', targetItemType: 'agent' | 'group' = 'agent') {
  if (!connectionStart.value) {
    cancelConnection();
    return;
  }
  
  const { item: sourceItem, type: sourceType, itemType: sourceItemType } = connectionStart.value;
  
  // Can't connect to self (for agents)
  if (sourceItemType === 'agent' && targetItemType === 'agent') {
    const sourceAgent = sourceItem as DeployedAgent;
    const targetAgent = targetItem as DeployedAgent;
    if (sourceAgent.instanceId === targetAgent.instanceId) {
      console.log('Cannot connect agent to itself');
      cancelConnection();
      return;
    }
  }
  
  // Can't connect group to itself
  if (sourceItemType === 'group' && targetItemType === 'group') {
    const sourceGroup = sourceItem as AgentGroup;
    const targetGroup = targetItem as AgentGroup;
    if (sourceGroup.id === targetGroup.id) {
      console.log('Cannot connect group to itself');
      cancelConnection();
      return;
    }
  }
  
  // Handle different connection types
  if (sourceType === 'output' && targetType === 'input') {
    // Output -> Input connection
    if (sourceItemType === 'agent' && targetItemType === 'agent') {
      createConnection(sourceItem as DeployedAgent, targetItem as DeployedAgent);
    } else if (sourceItemType === 'agent' && targetItemType === 'group') {
      createAgentToGroupConnection(sourceItem as DeployedAgent, targetItem as AgentGroup);
    } else if (sourceItemType === 'group' && targetItemType === 'agent') {
      createGroupToAgentConnection(sourceItem as AgentGroup, targetItem as DeployedAgent);
    } else if (sourceItemType === 'group' && targetItemType === 'group') {
      createGroupToGroupConnection(sourceItem as AgentGroup, targetItem as AgentGroup);
    }
    cancelConnection();
  } 
  else if (sourceType === 'input' && targetType === 'output') {
    // Input <- Output connection (reverse direction)
    if (sourceItemType === 'agent' && targetItemType === 'agent') {
      createConnection(targetItem as DeployedAgent, sourceItem as DeployedAgent);
    } else if (sourceItemType === 'agent' && targetItemType === 'group') {
      createGroupToAgentConnection(targetItem as AgentGroup, sourceItem as DeployedAgent);
    } else if (sourceItemType === 'group' && targetItemType === 'agent') {
      createAgentToGroupConnection(targetItem as DeployedAgent, sourceItem as AgentGroup);
    } else if (sourceItemType === 'group' && targetItemType === 'group') {
      createGroupToGroupConnection(targetItem as AgentGroup, sourceItem as AgentGroup);
    }
    cancelConnection();
  } 
  else {
    console.log(`Invalid connection: ${sourceType} to ${targetType}`);
    cancelConnection();
  }
}

function createConnection(fromAgent: DeployedAgent, toAgent: DeployedAgent) {
  // Check group membership rules
  if (fromAgent.groupId || toAgent.groupId) {
    // Both agents are in groups
    if (fromAgent.groupId && toAgent.groupId) {
      // Only allow connection if they're in the same group
      if (fromAgent.groupId !== toAgent.groupId) {
        console.log('❌ Cannot connect agents from different groups. Use group-level connections instead.');
        return;
      }
    } else {
      // One agent is in a group, the other is standalone
      console.log('❌ Cannot connect grouped agent to standalone agent. Use group-level connections.');
      return;
    }
  }
  
  // Check if connection already exists
  const existingConnection = connections.value.find(
    conn => conn.from === fromAgent.instanceId && conn.to === toAgent.instanceId
  );
  
  if (existingConnection) {
    console.log('Connection already exists');
    return;
  }
  
  // Add connection to agents
  if (!fromAgent.outputs.includes(toAgent.instanceId)) {
    fromAgent.outputs.push(toAgent.instanceId);
  }
  if (!toAgent.inputs.includes(fromAgent.instanceId)) {
    toAgent.inputs.push(fromAgent.instanceId);
  }
  
  // Calculate connection line coordinates
  const x1 = fromAgent.position.x + 100; // Right side of source
  const y1 = fromAgent.position.y + 50; // Center vertically
  const x2 = toAgent.position.x; // Left side of target
  const y2 = toAgent.position.y + 50; // Center vertically
  
  // Add visual connection
  connections.value.push({
    id: `${fromAgent.instanceId}-${toAgent.instanceId}`,
    from: fromAgent.instanceId,
    to: toAgent.instanceId,
    x1, y1, x2, y2
  });
  
  console.log(`✅ Connected: ${fromAgent.name} → ${toAgent.name}`);
}

function createAgentToGroupConnection(fromAgent: DeployedAgent, toGroup: AgentGroup) {
  // Add agent to group's inputs
  if (!toGroup.inputs.includes(fromAgent.instanceId)) {
    toGroup.inputs.push(fromAgent.instanceId);
  }
  
  // Add group to agent's outputs
  if (!fromAgent.outputs.includes(toGroup.id)) {
    fromAgent.outputs.push(toGroup.id);
  }
  
  // Calculate connection line coordinates
  const x1 = fromAgent.position.x + 100; // Right side of agent
  const y1 = fromAgent.position.y + 50; // Center vertically
  const x2 = toGroup.position.x; // Left side of group
  const y2 = toGroup.position.y + 60; // Center of group
  
  // Add visual connection
  connections.value.push({
    id: `${fromAgent.instanceId}-${toGroup.id}`,
    from: fromAgent.instanceId,
    to: toGroup.id,
    x1, y1, x2, y2
  });
  
  console.log(`✅ Connected: ${fromAgent.name} → Group ${toGroup.name}`);
}

function createGroupToAgentConnection(fromGroup: AgentGroup, toAgent: DeployedAgent) {
  // Add group to agent's inputs
  if (!toAgent.inputs.includes(fromGroup.id)) {
    toAgent.inputs.push(fromGroup.id);
  }
  
  // Add agent to group's outputs
  if (!fromGroup.outputs.includes(toAgent.instanceId)) {
    fromGroup.outputs.push(toAgent.instanceId);
  }
  
  // Calculate connection line coordinates
  const x1 = fromGroup.position.x + 200; // Right side of group
  const y1 = fromGroup.position.y + 60; // Center of group
  const x2 = toAgent.position.x; // Left side of agent
  const y2 = toAgent.position.y + 50; // Center vertically
  
  // Add visual connection
  connections.value.push({
    id: `${fromGroup.id}-${toAgent.instanceId}`,
    from: fromGroup.id,
    to: toAgent.instanceId,
    x1, y1, x2, y2
  });
  
  console.log(`✅ Connected: Group ${fromGroup.name} → ${toAgent.name}`);
}

function createGroupToGroupConnection(fromGroup: AgentGroup, toGroup: AgentGroup) {
  // Add group to group's inputs/outputs
  if (!toGroup.inputs.includes(fromGroup.id)) {
    toGroup.inputs.push(fromGroup.id);
  }
  if (!fromGroup.outputs.includes(toGroup.id)) {
    fromGroup.outputs.push(toGroup.id);
  }
  
  // Calculate connection line coordinates
  const x1 = fromGroup.position.x + 200; // Right side of source group
  const y1 = fromGroup.position.y + 60; // Center of source group
  const x2 = toGroup.position.x; // Left side of target group
  const y2 = toGroup.position.y + 60; // Center of target group
  
  // Add visual connection
  connections.value.push({
    id: `${fromGroup.id}-${toGroup.id}`,
    from: fromGroup.id,
    to: toGroup.id,
    x1, y1, x2, y2
  });
  
  console.log(`✅ Connected: Group ${fromGroup.name} → Group ${toGroup.name}`);
}

function cancelConnection() {
  isConnecting.value = false;
  connectionStart.value = null;
  tempConnection.value = null;
}

function handleCanvasMouseMove(event: MouseEvent) {
  if (!isConnecting.value || !tempConnection.value) return;
  
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  // Adjust for zoom level
  const x = (event.clientX - rect.left) / canvasZoom.value;
  const y = (event.clientY - rect.top) / canvasZoom.value;
  
  // Update temporary connection line to follow mouse
  if (tempConnection.value) {
    tempConnection.value.x2 = x;
    tempConnection.value.y2 = y;
  }
}

function handleCanvasClick(event: MouseEvent) {
  // If clicking on empty canvas while connecting, cancel the connection
  if (isConnecting.value) {
    // Check if we clicked on empty space (not on an agent or connection point)
    const target = event.target as HTMLElement;
    if (target.classList.contains('workflow-canvas') || 
        target.classList.contains('canvas-viewport') ||
        target.classList.contains('canvas-grid') ||
        target.tagName === 'svg' ||
        target.tagName === 'rect') {
      console.log('Connection cancelled');
      cancelConnection();
    }
  }
}

function handleCanvasWheel(event: WheelEvent) {
  event.preventDefault();
  
  // Zoom with Ctrl/Cmd + scroll
  if (event.ctrlKey || event.metaKey) {
    const delta = event.deltaY > 0 ? -0.1 : 0.1;
    const newZoom = Math.max(0.25, Math.min(2, canvasZoom.value + delta));
    canvasZoom.value = newZoom;
  }
}

function zoomIn() {
  canvasZoom.value = Math.min(2, canvasZoom.value + 0.1);
}

function zoomOut() {
  canvasZoom.value = Math.max(0.25, canvasZoom.value - 0.1);
}

function resetZoom() {
  canvasZoom.value = 1;
  canvasTransform.value = { x: 0, y: 0 };
}

function updateConnectionPositions() {
  // Update all connection positions when agents move
  connections.value = connections.value.map(conn => {
    const fromAgent = deployedAgents.value.find(a => a.instanceId === conn.from);
    const toAgent = deployedAgents.value.find(a => a.instanceId === conn.to);
    
    if (fromAgent && toAgent) {
      return {
        ...conn,
        x1: fromAgent.position.x + 100,
        y1: fromAgent.position.y + 50,
        x2: toAgent.position.x,
        y2: toAgent.position.y + 50
      };
    }
    return conn;
  });
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

async function spawnAgentInstance() {
  if (!selectedAgent.value) return;
  
  const instanceId = selectedAgent.value.instanceId;
  const workingDirectory = localStorage.getItem('workspacePath') || '.';
  
  if (selectedAgent.value.instanceType === 'codex') {
    // Spawn Codex instance
    await codexStore.createInstance(
      `${selectedAgent.value.name} Agent`,
      workingDirectory
    );
    
    // Start the Codex instance if electronAPI is available
    if (window.electronAPI?.codex?.start) {
      await window.electronAPI.codex.start(instanceId, workingDirectory);
    }
  } else {
    // Spawn Claude instance with personality
    const personality = selectedAgent.value.personalityId || undefined;
    await claudeStore.createInstance(
      `${selectedAgent.value.name} Agent`,
      personality,
      workingDirectory
    );
    
    // Start the Claude instance if electronAPI is available
    if (window.electronAPI?.claude?.start) {
      await window.electronAPI.claude.start(instanceId, workingDirectory);
    }
  }
  
  selectedAgent.value.status = 'running';
  console.log(`Spawning ${selectedAgent.value.instanceType} instance for`, selectedAgent.value.name);
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

// Pipeline count for metrics
const pipelineCount = computed(() => activePipelines.value.length);

// Save current pipeline configuration
async function savePipeline() {
  if (deployedAgents.value.length === 0) {
    console.log('No agents to save');
    return;
  }
  
  // Create pipeline from deployed agents
  const pipeline = pipelineStore.createPipeline({
    name: `Pipeline ${Date.now()}`,
    description: 'Visual pipeline created from canvas',
    executionMode: 'smart'
  });
  
  // Add agents to pipeline
  const agentMap = new Map<string, string>(); // Old ID to new ID mapping
  
  deployedAgents.value.forEach(agent => {
    const newAgent = pipelineStore.addAgent(pipeline.id, {
      type: agent.instanceType,
      name: agent.name,
      role: agent.type as any,
      position: agent.position,
      config: {
        personalityId: agent.personalityId,
        prompt: agent.customInstructions
      }
    });
    if (newAgent) {
      agentMap.set(agent.instanceId, newAgent.id);
    }
  });
  
  // Add connections to pipeline
  connections.value.forEach(conn => {
    const fromId = agentMap.get(conn.from);
    const toId = agentMap.get(conn.to);
    if (fromId && toId) {
      pipelineStore.connectAgents(pipeline.id, fromId, toId);
    }
  });
  
  // Save pipeline to storage
  await pipelineStore.savePipeline(pipeline.id);
  console.log('Pipeline saved:', pipeline.id);
}

// Load saved pipeline
async function loadPipeline() {
  await pipelineStore.loadSavedPipelines();
  const pipelines = pipelineStore.pipelinesList;
  
  if (pipelines.length > 0) {
    // Load the first pipeline for now (could show a selector)
    const pipeline = pipelines[0];
    
    // Clear current agents
    deployedAgents.value = [];
    
    // Load agents from pipeline
    const agents = pipelineStore.getPipelineAgents(pipeline.id);
    agents.forEach(agent => {
      const agentType = availableAgentTypes.value.find(t => t.id === agent.role) || availableAgentTypes.value[0];
      deployedAgents.value.push({
        instanceId: agent.id,
        type: agent.role,
        instanceType: agent.type,
        name: agent.name,
        icon: agentType.icon,
        color: agentType.color,
        position: agent.position,
        status: 'idle',
        personalityId: agent.config.personalityId,
        customInstructions: agent.config.prompt,
        inputs: [],
        outputs: []
      });
    });
    
    console.log('Pipeline loaded:', pipeline.id);
  }
}

// Group entry/exit point handling
function handleGroupEntryClick(group: AgentGroup) {
  if (connectingGroupEntry.value === group.id) {
    // Cancel if clicking the same entry point
    connectingGroupEntry.value = null;
  } else {
    // Start connecting from group entry
    connectingGroupEntry.value = group.id;
    connectingGroupExit.value = null; // Cancel any exit connection
    console.log(`🔗 Connect from ${group.name} entry point to agents...`);
  }
}

function handleGroupExitClick(group: AgentGroup) {
  if (connectingGroupExit.value === group.id) {
    // Cancel if clicking the same exit point
    connectingGroupExit.value = null;
  } else {
    // Start connecting from group exit
    connectingGroupExit.value = group.id;
    connectingGroupEntry.value = null; // Cancel any entry connection
    console.log(`🔗 Connect agents to ${group.name} exit point...`);
  }
}

function getInternalConnections(group: AgentGroup): Connection[] {
  const groupAgentIds = new Set(group.agents);
  return connections.value.filter(conn => 
    groupAgentIds.has(conn.from) && groupAgentIds.has(conn.to)
  );
}

function getInternalConnX1(conn: Connection, group: AgentGroup): number {
  const agent = deployedAgents.value.find(a => a.instanceId === conn.from);
  if (!agent) return 0;
  return (agent.position.x - group.position.x) + 100; // Right side of agent
}

function getInternalConnY1(conn: Connection, group: AgentGroup): number {
  const agent = deployedAgents.value.find(a => a.instanceId === conn.from);
  if (!agent) return 0;
  return (agent.position.y - group.position.y) + 25; // Center of agent
}

function getInternalConnX2(conn: Connection, group: AgentGroup): number {
  const agent = deployedAgents.value.find(a => a.instanceId === conn.to);
  if (!agent) return 0;
  return (agent.position.x - group.position.x); // Left side of agent
}

function getInternalConnY2(conn: Connection, group: AgentGroup): number {
  const agent = deployedAgents.value.find(a => a.instanceId === conn.to);
  if (!agent) return 0;
  return (agent.position.y - group.position.y) + 25; // Center of agent
}

function getGroupAgentRelativePos(agentId: string, group: AgentGroup): { x: number; y: number } {
  const agent = deployedAgents.value.find(a => a.instanceId === agentId);
  if (!agent) return { x: 0, y: 0 };
  return {
    x: agent.position.x - group.position.x,
    y: agent.position.y - group.position.y
  };
}

// Group completion detection
function isGroupCompleted(group: AgentGroup): boolean {
  const groupAgents = deployedAgents.value.filter(a => a.groupId === group.id);
  if (groupAgents.length === 0) return false;
  return groupAgents.every(agent => agent.status === 'completed' || agent.status === 'idle');
}

function getGroupStatus(group: AgentGroup): string {
  const groupAgents = deployedAgents.value.filter(a => a.groupId === group.id);
  if (groupAgents.length === 0) return 'idle';
  
  if (groupAgents.some(agent => agent.status === 'error')) return 'error';
  if (groupAgents.some(agent => agent.status === 'running')) return 'running';
  if (groupAgents.every(agent => agent.status === 'completed')) return 'completed';
  if (groupAgents.every(agent => agent.status === 'idle')) return 'idle';
  
  return 'mixed';
}

function executeNextInPipeline(itemId: string) {
  // Find all connections from this item
  const outgoingConnections = connections.value.filter(conn => conn.from === itemId);
  
  outgoingConnections.forEach(conn => {
    const targetAgent = deployedAgents.value.find(a => a.instanceId === conn.to);
    const targetGroup = agentGroups.value.find(g => g.id === conn.to);
    
    if (targetAgent) {
      // Start the target agent
      targetAgent.status = 'running';
      console.log(`▶️ Starting agent: ${targetAgent.name}`);
      // Here you would trigger the actual agent execution
    } else if (targetGroup) {
      // Start all agents in the target group
      const groupAgents = deployedAgents.value.filter(a => a.groupId === targetGroup.id);
      groupAgents.forEach(agent => {
        agent.status = 'running';
        console.log(`▶️ Starting agent in group: ${agent.name}`);
      });
    }
  });
}

// Helper functions for connection point highlighting
function shouldHighlightInput(agent: DeployedAgent): boolean {
  if (!isConnecting.value || !connectionStart.value) return false;
  if (connectionStart.value.type !== 'output') return false;
  
  // Don't highlight if it's the same agent
  if (connectionStart.value.itemType === 'agent') {
    const sourceAgent = connectionStart.value.item as DeployedAgent;
    return sourceAgent.instanceId !== agent.instanceId;
  }
  
  return true; // Highlight for group connections
}

function shouldHighlightOutput(agent: DeployedAgent): boolean {
  if (!isConnecting.value || !connectionStart.value) return false;
  if (connectionStart.value.type !== 'input') return false;
  
  // Don't highlight if it's the same agent
  if (connectionStart.value.itemType === 'agent') {
    const sourceAgent = connectionStart.value.item as DeployedAgent;
    return sourceAgent.instanceId !== agent.instanceId;
  }
  
  return true; // Highlight for group connections
}

function isActiveInput(agent: DeployedAgent): boolean {
  if (!isConnecting.value || !connectionStart.value) return false;
  if (connectionStart.value.type !== 'input') return false;
  if (connectionStart.value.itemType !== 'agent') return false;
  
  const sourceAgent = connectionStart.value.item as DeployedAgent;
  return sourceAgent.instanceId === agent.instanceId;
}

function isActiveOutput(agent: DeployedAgent): boolean {
  if (!isConnecting.value || !connectionStart.value) return false;
  if (connectionStart.value.type !== 'output') return false;
  if (connectionStart.value.itemType !== 'agent') return false;
  
  const sourceAgent = connectionStart.value.item as DeployedAgent;
  return sourceAgent.instanceId === agent.instanceId;
}

// Start pipeline from Kanban item
async function startFromKanban() {
  // Show a modal to select Epic/Story/Task
  const epics = tasksStore.epics;
  const stories = tasksStore.stories;
  const tasks = tasksStore.tasks;
  
  // For now, create from the first epic if available
  if (epics.length > 0) {
    const pipeline = await pipelineStore.startPipelineFromEpic(epics[0].id);
    if (pipeline) {
      console.log('Pipeline created from epic:', pipeline.id);
      // Could refresh the view or switch to pipeline view
    }
  }
}

// Keyboard event handler
function handleKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape' && isConnecting.value) {
    cancelConnection();
  }
}

// Initialize
onMounted(async () => {
  // Initialize orchestration store if needed
  const workspacePath = localStorage.getItem('workspacePath');
  if (workspacePath && !orchestrationStore.isInitialized) {
    orchestrationStore.initialize(workspacePath);
  }
  
  // Initialize stores
  await claudeStore.init();
  await codexStore.init();
  await pipelineStore.loadSavedPipelines();
  
  // Initialize tasks if needed
  if (workspacePath && !tasksStore.isInitialized) {
    tasksStore.initialize(workspacePath);
  }
  
  // Add keyboard event listener
  document.addEventListener('keydown', handleKeyDown);
});

onUnmounted(() => {
  // Clean up keyboard event listener
  document.removeEventListener('keydown', handleKeyDown);
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

.library-collapsed-toggle {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 8px;
}

.btn-expand {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px 4px;
  background: #2a2a2a;
  border: 1px solid #333;
  border-radius: 6px;
  color: #999;
  cursor: pointer;
  transition: all 0.2s;
  writing-mode: vertical-lr;
  transform: rotate(180deg);
}

.btn-expand:hover {
  background: #333;
  color: #fff;
  border-color: #4a9eff;
}

.btn-expand span {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 1px;
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

.workflow-canvas.connecting {
  cursor: crosshair;
}

.canvas-viewport {
  position: absolute;
  width: 100%;
  height: 100%;
  transition: transform 0.2s ease-out;
  transform-origin: 0 0;
}

.zoom-controls {
  position: absolute;
  bottom: 20px;
  right: 20px;
  display: flex;
  align-items: center;
  gap: 8px;
  background: #2a2a2a;
  padding: 8px;
  border-radius: 8px;
  border: 1px solid #333;
  z-index: 100;
}

.zoom-btn {
  width: 32px;
  height: 32px;
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

.zoom-btn:hover {
  background: #444;
  color: #fff;
}

.zoom-level {
  min-width: 50px;
  text-align: center;
  font-size: 12px;
  color: #999;
  font-weight: 500;
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
  height: 100px;
  padding: 12px;
  background: var(--agent-color, #2a2a2a);
  border: 2px solid #333;
  border-radius: 12px;
  cursor: move;
  transition: all 0.2s;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
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

.deployed-agent.entry-point {
  border-color: #4ade80;
  border-width: 3px;
  box-shadow: 0 0 20px rgba(74, 222, 128, 0.3);
}

.deployed-agent.entry-point:hover {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4), 0 0 30px rgba(74, 222, 128, 0.4);
}

.entry-point-badge {
  position: absolute;
  top: -12px;
  right: -12px;
  background: linear-gradient(135deg, #4ade80, #22c55e);
  color: #fff;
  padding: 4px 8px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.5px;
  z-index: 15;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  animation: pulse-entry 2s infinite;
}

.entry-point-badge svg {
  width: 12px;
  height: 12px;
}

@keyframes pulse-entry {
  0%, 100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.05);
  }
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
  width: 16px;
  height: 16px;
  background: #4a9eff;
  border: 2px solid #1a1a1a;
  border-radius: 50%;
  cursor: pointer;
  opacity: 0;
  transition: all 0.2s;
  z-index: 20;
}

.deployed-agent:hover .connection-point {
  opacity: 1;
}

.connection-point:hover {
  transform: scale(1.2);
  background: #5aafff;
}

.connection-point.highlight {
  opacity: 1 !important;
  animation: pulse-highlight 1s infinite;
  background: #4ade80;
  transform: scale(1.3);
}

.connection-point.active {
  opacity: 1 !important;
  background: #fbbf24;
  transform: scale(1.2);
  box-shadow: 0 0 8px rgba(251, 191, 36, 0.6);
}

@keyframes pulse-highlight {
  0%, 100% { 
    transform: scale(1.3);
    box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.7);
  }
  50% { 
    transform: scale(1.5);
    box-shadow: 0 0 0 6px rgba(74, 222, 128, 0);
  }
}

.connection-point.input {
  left: -8px;
  top: 50%;
  transform: translateY(-50%);
}

.connection-point.output {
  right: -8px;
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
  z-index: 5;
}

.connection-mode-indicator {
  position: absolute;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: #2a2a2a;
  border: 1px solid #4a9eff;
  border-radius: 8px;
  padding: 12px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  z-index: 1000;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

.connection-mode-indicator span {
  color: #fff;
  font-size: 14px;
  font-weight: 500;
}

.connection-hint {
  font-size: 12px !important;
  color: #999 !important;
  font-weight: 400 !important;
}

.no-entry-warning {
  position: absolute;
  top: 60px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid #ef4444;
  border-radius: 8px;
  padding: 8px 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  z-index: 1000;
  color: #ef4444;
  font-size: 13px;
  font-weight: 500;
  animation: pulse-warning 2s infinite;
}

@keyframes pulse-warning {
  0%, 100% {
    opacity: 0.9;
  }
  50% {
    opacity: 1;
  }
}

.empty-canvas-help {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  color: #666;
  max-width: 400px;
  padding: 40px;
  background: rgba(26, 26, 26, 0.8);
  border-radius: 12px;
  border: 1px solid #333;
}

.empty-canvas-help h3 {
  margin: 16px 0 8px 0;
  color: #999;
  font-size: 20px;
  font-weight: 600;
}

.empty-canvas-help p {
  margin: 8px 0;
  color: #666;
  font-size: 14px;
  line-height: 1.5;
}

.connection-help {
  margin-top: 24px !important;
  padding-top: 24px;
  border-top: 1px solid #333;
  text-align: left;
}

.connection-help strong {
  color: #999;
  display: block;
  margin-bottom: 8px;
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

/* Agent Groups */
.agent-group {
  position: absolute;
  background: linear-gradient(135deg, #2d2d3d 0%, #252535 100%);
  border: 2px solid var(--group-color, #4a9eff);
  border-radius: 12px;
  padding: 12px;
  min-width: 200px;
  max-width: 350px;
  transition: all 0.3s ease;
  cursor: move;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.agent-group.collapsed {
  min-width: 150px;
  max-width: 200px;
}

.agent-group:not(.collapsed) {
  min-height: 250px;
  min-width: 400px;
  max-width: 600px;
}

.agent-group.entry-point {
  border-color: #4ade80;
  box-shadow: 0 0 20px rgba(74, 222, 128, 0.3);
}

.group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.group-name {
  flex: 1;
  font-weight: 600;
  font-size: 14px;
}

.group-status-text {
  font-size: 11px;
  color: #888;
  margin-left: 4px;
}

.group-status-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #666;
  margin-right: 6px;
  transition: all 0.3s;
}

.group-status-indicator.idle {
  background: #666;
}

.group-status-indicator.running {
  background: #4a9eff;
  animation: pulse-status 1.5s infinite;
}

.group-status-indicator.completed {
  background: #4ade80;
}

.group-status-indicator.error {
  background: #ef4444;
}

.group-status-indicator.mixed {
  background: linear-gradient(90deg, #4a9eff 50%, #fbbf24 50%);
}

@keyframes pulse-status {
  0% { box-shadow: 0 0 0 0 rgba(74, 158, 255, 0.7); }
  70% { box-shadow: 0 0 0 8px rgba(74, 158, 255, 0); }
  100% { box-shadow: 0 0 0 0 rgba(74, 158, 255, 0); }
}

.group-toggle,
.group-delete {
  background: none;
  border: none;
  color: #888;
  cursor: pointer;
  padding: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s;
}

.group-toggle:hover,
.group-delete:hover {
  color: #fff;
}

.group-canvas {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 200px;
  margin-top: 10px;
  background: rgba(0, 0, 0, 0.1);
  border-radius: 8px;
  overflow: hidden;
}

.group-connections-svg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 1;
}

.internal-connection-line {
  opacity: 0.7;
  transition: opacity 0.2s;
}

.entry-connection-line {
  opacity: 0.8;
  animation: pulse-entry-line 2s infinite;
}

@keyframes pulse-entry-line {
  0%, 100% { opacity: 0.8; }
  50% { opacity: 0.4; }
}

.exit-connection-line {
  opacity: 0.8;
  animation: pulse-exit-line 2s infinite;
}

@keyframes pulse-exit-line {
  0%, 100% { opacity: 0.8; }
  50% { opacity: 0.4; }
}

.group-entry-point {
  position: absolute;
  top: 10px;
  left: 10px;
  width: 40px;
  height: 40px;
  background: linear-gradient(135deg, #4ade80, #22c55e);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  z-index: 10;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(74, 222, 128, 0.4);
  transition: all 0.2s;
}

.group-entry-point:hover {
  transform: scale(1.1);
  box-shadow: 0 4px 12px rgba(74, 222, 128, 0.6);
}

.group-entry-connection-point {
  position: absolute;
  right: -5px;
  top: 50%;
  transform: translateY(-50%);
  width: 12px;
  height: 12px;
  background: #fff;
  border: 2px solid #4ade80;
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.2s;
}

.group-entry-connection-point:hover,
.group-entry-connection-point.active,
.group-entry-connection-point.highlight {
  width: 16px;
  height: 16px;
  box-shadow: 0 0 10px rgba(74, 222, 128, 0.8);
}

.group-exit-point {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 40px;
  height: 40px;
  background: linear-gradient(135deg, #ef4444, #dc2626);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  z-index: 10;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(239, 68, 68, 0.4);
  transition: all 0.2s;
}

.group-exit-point:hover {
  transform: scale(1.1);
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.6);
}

.group-exit-connection-point {
  position: absolute;
  left: -5px;
  top: 50%;
  transform: translateY(-50%);
  width: 12px;
  height: 12px;
  background: #fff;
  border: 2px solid #ef4444;
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.2s;
}

.group-exit-connection-point:hover,
.group-exit-connection-point.active,
.group-exit-connection-point.highlight {
  width: 16px;
  height: 16px;
  box-shadow: 0 0 10px rgba(239, 68, 68, 0.8);
}

/* Resize Handles */
.resize-handles {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.resize-handle {
  position: absolute;
  width: 10px;
  height: 10px;
  background: #4a9eff;
  border: 2px solid #1a1a1a;
  border-radius: 50%;
  cursor: nwse-resize;
  pointer-events: all;
  opacity: 0;
  transition: opacity 0.2s;
}

.agent-group:hover .resize-handle {
  opacity: 0.8;
}

.resize-handle:hover {
  opacity: 1 !important;
  transform: scale(1.2);
}

.resize-handle.top-left {
  top: -5px;
  left: -5px;
  cursor: nw-resize;
}

.resize-handle.top-right {
  top: -5px;
  right: -5px;
  cursor: ne-resize;
}

.resize-handle.bottom-left {
  bottom: -5px;
  left: -5px;
  cursor: sw-resize;
}

.resize-handle.bottom-right {
  bottom: -5px;
  right: -5px;
  cursor: se-resize;
}

.group-agent {
  position: absolute;
  width: 100px;
  height: 80px;
  background: linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%);
  border: 2px solid var(--agent-color, #4a9eff);
  border-radius: 8px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: move;
  transition: all 0.2s;
  z-index: 5;
}

.group-agent:hover {
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.group-agent.selected {
  border-color: #fbbf24;
  box-shadow: 0 0 15px rgba(251, 191, 36, 0.4);
}

.group-agent.entry-agent {
  background: linear-gradient(135deg, rgba(74,222,128,0.1) 0%, rgba(74,222,128,0.05) 100%);
}

.group-agent .agent-icon {
  width: 32px;
  height: 32px;
  background: var(--agent-color, #4a9eff);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  margin-bottom: 4px;
}

.group-agent .agent-label {
  font-size: 11px;
  font-weight: 500;
  color: #e0e0e0;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  width: 90%;
}

.group-agent .connection-point {
  position: absolute;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #4a9eff;
  border: 2px solid #1a1a1a;
  cursor: pointer;
  transition: all 0.2s;
  z-index: 10;
}

.group-agent .connection-point.input {
  left: -6px;
  top: 50%;
  transform: translateY(-50%);
}

.group-agent .connection-point.output {
  right: -6px;
  top: 50%;
  transform: translateY(-50%);
}

.group-agent-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%);
  border: 1px solid var(--agent-color, #4a9eff);
  border-radius: 6px;
  font-size: 12px;
  position: relative;
  min-height: 32px;
  transition: all 0.2s;
}

.group-agent-card:hover {
  background: linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.04) 100%);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.agent-mini-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: var(--agent-color, #4a9eff);
  border-radius: 4px;
  color: #fff;
}

.agent-mini-name {
  flex: 1;
  font-weight: 500;
  color: #e0e0e0;
}

.mini-connection-point {
  position: absolute;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #4a9eff;
  border: 2px solid #1a1a1a;
  cursor: pointer;
  transition: all 0.2s;
  z-index: 5;
}

.mini-connection-point.input {
  left: -6px;
  top: 50%;
  transform: translateY(-50%);
}

.mini-connection-point.output {
  right: -6px;
  top: 50%;
  transform: translateY(-50%);
}

.mini-connection-point:hover,
.mini-connection-point.highlight {
  width: 14px;
  height: 14px;
  box-shadow: 0 0 8px rgba(74, 158, 255, 0.6);
}

.mini-connection-point.active {
  background: #fbbf24;
  box-shadow: 0 0 10px rgba(251, 191, 36, 0.8);
}

.agent-group .connection-point {
  position: absolute;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #4a9eff;
  border: 2px solid #1a1a1a;
  cursor: pointer;
  transition: all 0.2s;
  z-index: 10;
}

.agent-group .connection-point.input {
  left: -8px;
  top: 50%;
  transform: translateY(-50%);
}

.agent-group .connection-point.output {
  right: -8px;
  top: 50%;
  transform: translateY(-50%);
}

.agent-group .connection-point:hover,
.agent-group .connection-point.highlight {
  width: 20px;
  height: 20px;
  box-shadow: 0 0 10px rgba(74, 158, 255, 0.6);
}

.agent-group .entry-point-badge {
  position: absolute;
  top: -10px;
  right: 10px;
  background: linear-gradient(135deg, #4ade80, #22c55e);
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: bold;
  color: #000;
  display: flex;
  align-items: center;
  gap: 4px;
  box-shadow: 0 2px 8px rgba(74, 222, 128, 0.4);
  animation: pulse-entry 2s infinite;
}

/* Group Creation Mode */
.agent-selection-mode .deployed-agent {
  cursor: pointer;
}

.agent-selection-mode .deployed-agent:hover {
  border-color: #fbbf24;
  box-shadow: 0 0 12px rgba(251, 191, 36, 0.4);
}

.agent-selection-mode .deployed-agent.selected-for-group {
  border-color: #fbbf24;
  background: linear-gradient(135deg, #3d3d4d 0%, #353545 100%);
  box-shadow: 0 0 20px rgba(251, 191, 36, 0.6);
}

.group-creation-toolbar {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: linear-gradient(135deg, #2d2d3d 0%, #252535 100%);
  border: 2px solid #fbbf24;
  border-radius: 12px;
  padding: 12px 20px;
  display: flex;
  gap: 12px;
  align-items: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  z-index: 100;
}

.group-creation-toolbar span {
  font-weight: 600;
  color: #fbbf24;
}

.group-creation-toolbar button {
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
}

.group-creation-toolbar .btn-create {
  background: linear-gradient(135deg, #fbbf24, #f59e0b);
  color: #000;
}

.group-creation-toolbar .btn-cancel {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}
</style>