<template>
  <div class="knowledge-graph-viewer">
    <!-- Header -->
    <div class="panel-header">
      <div class="header-left">
        <h3>Knowledge Graph</h3>
        <span class="badge" :class="getBadgeClass()">{{ getStatusText() }}</span>
      </div>
      <div class="header-right">
        <button @click="refreshGraph" class="btn-icon" :disabled="isRefreshing">
          <Icon name="mdi:refresh" :class="{ spinning: isRefreshing }" />
        </button>
        <button @click="centerGraph" class="btn-icon">
          <Icon name="mdi:target" />
        </button>
        <button @click="showFilters = !showFilters" class="btn-secondary">
          <Icon name="mdi:filter" /> Filters
        </button>
        <button @click="showSettings = true" class="btn-secondary">
          <Icon name="mdi:cog" /> Settings
        </button>
      </div>
    </div>

    <!-- Filters Panel -->
    <div v-if="showFilters" class="filters-panel">
      <div class="filter-group">
        <label>Node Types</label>
        <div class="checkbox-group">
          <label v-for="type in nodeTypes" :key="type" class="checkbox-label">
            <input 
              v-model="activeNodeTypes"
              :value="type"
              type="checkbox"
              class="checkbox-input"
            />
            <Icon :name="getNodeTypeIcon(type)" />
            {{ formatNodeType(type) }}
          </label>
        </div>
      </div>
      
      <div class="filter-group">
        <label>Relationship Types</label>
        <div class="checkbox-group">
          <label v-for="type in relationshipTypes" :key="type" class="checkbox-label">
            <input 
              v-model="activeRelationshipTypes"
              :value="type"
              type="checkbox"
              class="checkbox-input"
            />
            {{ formatRelationshipType(type) }}
          </label>
        </div>
      </div>
      
      <div class="filter-group">
        <label>Confidence Threshold</label>
        <input 
          v-model.number="confidenceThreshold"
          type="range"
          min="0"
          max="1"
          step="0.1"
          class="range-input"
        />
        <span class="threshold-value">{{ (confidenceThreshold * 100).toFixed(0) }}%</span>
      </div>
    </div>

    <!-- Graph Container -->
    <div class="graph-container">
      <div ref="graphElement" class="graph-canvas"></div>
      
      <!-- Graph Controls -->
      <div class="graph-controls">
        <button @click="zoomIn" class="control-btn">
          <Icon name="mdi:plus" />
        </button>
        <button @click="zoomOut" class="control-btn">
          <Icon name="mdi:minus" />
        </button>
        <button @click="resetZoom" class="control-btn">
          <Icon name="mdi:fit-to-page" />
        </button>
      </div>
      
      <!-- Layout Controls -->
      <div class="layout-controls">
        <button 
          v-for="layout in availableLayouts" 
          :key="layout.id"
          @click="setLayout(layout.id)"
          class="layout-btn"
          :class="{ active: currentLayout === layout.id }"
        >
          <Icon :name="layout.icon" />
          {{ layout.name }}
        </button>
      </div>
      
      <!-- Loading Overlay -->
      <div v-if="isLoading" class="loading-overlay">
        <div class="loading-spinner">
          <Icon name="mdi:loading" class="spinning" />
          <span>Building graph...</span>
        </div>
      </div>
    </div>

    <!-- Node Details Panel -->
    <div v-if="selectedNode" class="node-details-panel">
      <div class="details-header">
        <h4>{{ selectedNode.label }}</h4>
        <button @click="selectedNode = null" class="btn-icon">
          <Icon name="mdi:close" />
        </button>
      </div>
      
      <div class="details-content">
        <div class="detail-section">
          <h5>Type</h5>
          <span class="node-type" :class="`type-${selectedNode.type}`">
            <Icon :name="getNodeTypeIcon(selectedNode.type)" />
            {{ formatNodeType(selectedNode.type) }}
          </span>
        </div>
        
        <div class="detail-section" v-if="selectedNode.description">
          <h5>Description</h5>
          <p>{{ selectedNode.description }}</p>
        </div>
        
        <div class="detail-section" v-if="selectedNode.metadata">
          <h5>Metadata</h5>
          <div class="metadata-grid">
            <div v-if="selectedNode.metadata.confidence" class="metadata-item">
              <span class="metadata-label">Confidence</span>
              <span class="metadata-value">{{ (selectedNode.metadata.confidence * 100).toFixed(1) }}%</span>
            </div>
            <div v-if="selectedNode.metadata.usageCount" class="metadata-item">
              <span class="metadata-label">Usage Count</span>
              <span class="metadata-value">{{ selectedNode.metadata.usageCount }}</span>
            </div>
            <div v-if="selectedNode.metadata.createdAt" class="metadata-item">
              <span class="metadata-label">Created</span>
              <span class="metadata-value">{{ formatDate(selectedNode.metadata.createdAt) }}</span>
            </div>
          </div>
        </div>
        
        <div class="detail-section">
          <h5>Connections</h5>
          <div class="connections-list">
            <div 
              v-for="connection in getNodeConnections(selectedNode.id)" 
              :key="connection.id"
              class="connection-item"
              @click="focusOnNode(connection.targetId)"
            >
              <Icon :name="getRelationshipIcon(connection.type)" />
              <span>{{ connection.label }}</span>
              <Icon name="mdi:arrow-right" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Settings Modal -->
    <Teleport to="body">
      <div v-if="showSettings" class="modal-overlay" @click="showSettings = false">
        <div class="modal-content" @click.stop>
          <div class="modal-header">
            <h3>Graph Settings</h3>
            <button @click="showSettings = false" class="btn-icon">
              <Icon name="mdi:close" />
            </button>
          </div>
          
          <div class="modal-body">
            <div class="settings-form">
              <div class="form-group">
                <label>Physics Simulation</label>
                <div class="checkbox-group">
                  <input 
                    v-model="settings.physicsEnabled"
                    type="checkbox"
                    id="physics-enabled"
                    class="form-checkbox"
                  />
                  <label for="physics-enabled">Enable physics simulation</label>
                </div>
              </div>
              
              <div class="form-group">
                <label>Node Repulsion</label>
                <input 
                  v-model.number="settings.nodeRepulsion" 
                  type="range"
                  min="1"
                  max="100"
                  class="range-input"
                />
                <span>{{ settings.nodeRepulsion }}</span>
              </div>
              
              <div class="form-group">
                <label>Link Distance</label>
                <input 
                  v-model.number="settings.linkDistance" 
                  type="range"
                  min="10"
                  max="200"
                  class="range-input"
                />
                <span>{{ settings.linkDistance }}</span>
              </div>
              
              <div class="form-group">
                <label>Show Labels</label>
                <div class="checkbox-group">
                  <input 
                    v-model="settings.showLabels"
                    type="checkbox"
                    id="show-labels"
                    class="form-checkbox"
                  />
                  <label for="show-labels">Show node labels</label>
                </div>
              </div>
              
              <div class="form-group">
                <label>Color Scheme</label>
                <select v-model="settings.colorScheme" class="form-select">
                  <option value="category">By Category</option>
                  <option value="confidence">By Confidence</option>
                  <option value="usage">By Usage</option>
                  <option value="age">By Age</option>
                </select>
              </div>
            </div>
          </div>
          
          <div class="modal-footer">
            <button @click="showSettings = false" class="btn-secondary">Cancel</button>
            <button @click="applySettings" class="btn-primary">Apply Settings</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import * as d3 from 'd3';

// Types
interface GraphNode {
  id: string;
  label: string;
  type: 'pattern' | 'task' | 'agent' | 'epic' | 'story' | 'snapshot' | 'category';
  description?: string;
  metadata?: {
    confidence?: number;
    usageCount?: number;
    createdAt?: string;
    category?: string;
  };
  x?: number;
  y?: number;
  fx?: number;
  fy?: number;
}

interface GraphLink {
  id: string;
  source: string;
  target: string;
  type: 'uses' | 'implements' | 'derives_from' | 'validates' | 'relates_to' | 'contains';
  label: string;
  strength?: number;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

// State
const isRefreshing = ref(false);
const isLoading = ref(false);
const showFilters = ref(false);
const showSettings = ref(false);
const selectedNode = ref<GraphNode | null>(null);
const graphElement = ref<HTMLDivElement>();

// Graph data
const graphData = ref<GraphData>({ nodes: [], links: [] });
const filteredData = computed(() => {
  const nodes = graphData.value.nodes.filter(node => {
    if (!activeNodeTypes.value.includes(node.type)) return false;
    if (node.metadata?.confidence && node.metadata.confidence < confidenceThreshold.value) return false;
    return true;
  });
  
  const nodeIds = new Set(nodes.map(n => n.id));
  const links = graphData.value.links.filter(link => {
    if (!activeRelationshipTypes.value.includes(link.type)) return false;
    return nodeIds.has(link.source) && nodeIds.has(link.target);
  });
  
  return { nodes, links };
});

// Filters
const nodeTypes = ref(['pattern', 'task', 'agent', 'epic', 'story', 'snapshot', 'category']);
const relationshipTypes = ref(['uses', 'implements', 'derives_from', 'validates', 'relates_to', 'contains']);
const activeNodeTypes = ref([...nodeTypes.value]);
const activeRelationshipTypes = ref([...relationshipTypes.value]);
const confidenceThreshold = ref(0.0);

// Layout
const availableLayouts = [
  { id: 'force', name: 'Force', icon: 'mdi:vector-arrange-above' },
  { id: 'hierarchical', name: 'Hierarchical', icon: 'mdi:file-tree' },
  { id: 'circular', name: 'Circular', icon: 'mdi:circle-outline' },
  { id: 'grid', name: 'Grid', icon: 'mdi:grid' }
];
const currentLayout = ref('force');

// Settings
const settings = ref({
  physicsEnabled: true,
  nodeRepulsion: 30,
  linkDistance: 100,
  showLabels: true,
  colorScheme: 'category'
});

// D3 references
let svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
let simulation: d3.Simulation<GraphNode, GraphLink>;
let zoom: d3.ZoomBehavior<SVGSVGElement, unknown>;

// Methods
async function refreshGraph() {
  if (isRefreshing.value) return;
  
  isRefreshing.value = true;
  isLoading.value = true;
  
  try {
    // Fetch graph data from electron API
    if (window.electronAPI?.knowledge) {
      const result = await window.electronAPI.knowledge.executeTask('getGraphData', {});
      
      if (result.success) {
        graphData.value = result.data;
      }
    } else {
      // Mock graph data for development
      graphData.value = generateMockGraphData();
    }
    
    await nextTick();
    renderGraph();
  } catch (error) {
    console.error('Failed to refresh graph:', error);
  } finally {
    isRefreshing.value = false;
    isLoading.value = false;
  }
}

function generateMockGraphData(): GraphData {
  const nodes: GraphNode[] = [
    // Patterns
    { id: 'pattern-1', label: 'React Component', type: 'pattern', description: 'React functional component pattern', metadata: { confidence: 0.95, usageCount: 25, category: 'implementation' } },
    { id: 'pattern-2', label: 'Error Boundary', type: 'pattern', description: 'Error handling pattern', metadata: { confidence: 0.78, usageCount: 12, category: 'debugging' } },
    { id: 'pattern-3', label: 'API Client', type: 'pattern', description: 'Type-safe API client', metadata: { confidence: 0.89, usageCount: 18, category: 'architecture' } },
    
    // Tasks
    { id: 'task-1', label: 'Component Refactor', type: 'task', description: 'Refactor UI components' },
    { id: 'task-2', label: 'Error Handling', type: 'task', description: 'Improve error handling' },
    { id: 'task-3', label: 'API Integration', type: 'task', description: 'Integrate external APIs' },
    
    // Agents
    { id: 'agent-dev', label: 'Developer', type: 'agent', description: 'Code development agent' },
    { id: 'agent-arch', label: 'Architect', type: 'agent', description: 'System architecture agent' },
    { id: 'agent-qa', label: 'QA Engineer', type: 'agent', description: 'Quality assurance agent' },
    
    // Categories
    { id: 'cat-impl', label: 'Implementation', type: 'category', description: 'Implementation patterns' },
    { id: 'cat-arch', label: 'Architecture', type: 'category', description: 'Architectural patterns' },
    { id: 'cat-debug', label: 'Debugging', type: 'category', description: 'Debugging patterns' },
    
    // Epics/Stories
    { id: 'epic-1', label: 'UI Modernization', type: 'epic', description: 'Modernize user interface' },
    { id: 'story-1', label: 'Component Library', type: 'story', description: 'Build component library' }
  ];
  
  const links: GraphLink[] = [
    // Pattern relationships
    { id: 'link-1', source: 'pattern-1', target: 'cat-impl', type: 'relates_to', label: 'belongs to' },
    { id: 'link-2', source: 'pattern-2', target: 'cat-debug', type: 'relates_to', label: 'belongs to' },
    { id: 'link-3', source: 'pattern-3', target: 'cat-arch', type: 'relates_to', label: 'belongs to' },
    
    // Task relationships
    { id: 'link-4', source: 'task-1', target: 'pattern-1', type: 'implements', label: 'implements' },
    { id: 'link-5', source: 'task-2', target: 'pattern-2', type: 'implements', label: 'implements' },
    { id: 'link-6', source: 'task-3', target: 'pattern-3', type: 'implements', label: 'implements' },
    
    // Agent relationships
    { id: 'link-7', source: 'agent-dev', target: 'task-1', type: 'uses', label: 'executes' },
    { id: 'link-8', source: 'agent-dev', target: 'task-2', type: 'uses', label: 'executes' },
    { id: 'link-9', source: 'agent-arch', target: 'task-3', type: 'uses', label: 'executes' },
    { id: 'link-10', source: 'agent-qa', target: 'pattern-2', type: 'validates', label: 'validates' },
    
    // Epic/Story relationships
    { id: 'link-11', source: 'epic-1', target: 'story-1', type: 'contains', label: 'contains' },
    { id: 'link-12', source: 'story-1', target: 'task-1', type: 'contains', label: 'contains' },
    
    // Cross-pattern relationships
    { id: 'link-13', source: 'pattern-1', target: 'pattern-3', type: 'uses', label: 'uses' },
    { id: 'link-14', source: 'pattern-2', target: 'pattern-1', type: 'derives_from', label: 'extends' }
  ];
  
  return { nodes, links };
}

function renderGraph() {
  if (!graphElement.value) return;
  
  // Clear existing graph
  d3.select(graphElement.value).selectAll('*').remove();
  
  const width = graphElement.value.clientWidth;
  const height = graphElement.value.clientHeight;
  
  // Create SVG
  svg = d3.select(graphElement.value)
    .append('svg')
    .attr('width', width)
    .attr('height', height);
  
  // Create zoom behavior
  zoom = d3.zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.1, 4])
    .on('zoom', (event) => {
      svg.select('g').attr('transform', event.transform);
    });
  
  svg.call(zoom);
  
  const g = svg.append('g');
  
  // Create simulation
  simulation = d3.forceSimulation<GraphNode>(filteredData.value.nodes)
    .force('link', d3.forceLink<GraphNode, GraphLink>(filteredData.value.links)
      .id(d => d.id)
      .distance(settings.value.linkDistance))
    .force('charge', d3.forceManyBody().strength(-settings.value.nodeRepulsion))
    .force('center', d3.forceCenter(width / 2, height / 2));
  
  // Apply layout-specific forces
  applyLayoutForces();
  
  // Create link elements
  const link = g.append('g')
    .attr('class', 'links')
    .selectAll('line')
    .data(filteredData.value.links)
    .join('line')
    .attr('class', 'link')
    .attr('stroke', d => getLinkColor(d.type))
    .attr('stroke-width', 2)
    .attr('opacity', 0.6);
  
  // Create link labels
  const linkLabel = g.append('g')
    .attr('class', 'link-labels')
    .selectAll('text')
    .data(filteredData.value.links)
    .join('text')
    .attr('class', 'link-label')
    .attr('text-anchor', 'middle')
    .attr('font-size', '10px')
    .attr('fill', '#999')
    .text(d => d.label);
  
  // Create node elements
  const node = g.append('g')
    .attr('class', 'nodes')
    .selectAll('circle')
    .data(filteredData.value.nodes)
    .join('circle')
    .attr('class', 'node')
    .attr('r', d => getNodeSize(d))
    .attr('fill', d => getNodeColor(d))
    .attr('stroke', '#fff')
    .attr('stroke-width', 2)
    .style('cursor', 'pointer')
    .call(d3.drag<SVGCircleElement, GraphNode>()
      .on('start', dragStarted)
      .on('drag', dragged)
      .on('end', dragEnded))
    .on('click', (event, d) => {
      selectedNode.value = d;
    });
  
  // Create node labels
  const nodeLabel = g.append('g')
    .attr('class', 'node-labels')
    .selectAll('text')
    .data(filteredData.value.nodes)
    .join('text')
    .attr('class', 'node-label')
    .attr('text-anchor', 'middle')
    .attr('dy', 4)
    .attr('font-size', '12px')
    .attr('fill', '#fff')
    .attr('pointer-events', 'none')
    .style('opacity', settings.value.showLabels ? 1 : 0)
    .text(d => d.label);
  
  // Update positions on simulation tick
  simulation.on('tick', () => {
    link
      .attr('x1', d => (d.source as GraphNode).x!)
      .attr('y1', d => (d.source as GraphNode).y!)
      .attr('x2', d => (d.target as GraphNode).x!)
      .attr('y2', d => (d.target as GraphNode).y!);
    
    linkLabel
      .attr('x', d => ((d.source as GraphNode).x! + (d.target as GraphNode).x!) / 2)
      .attr('y', d => ((d.source as GraphNode).y! + (d.target as GraphNode).y!) / 2);
    
    node
      .attr('cx', d => d.x!)
      .attr('cy', d => d.y!);
    
    nodeLabel
      .attr('x', d => d.x!)
      .attr('y', d => d.y!);
  });
}

function applyLayoutForces() {
  if (!simulation) return;
  
  switch (currentLayout.value) {
    case 'hierarchical':
      simulation
        .force('y', d3.forceY(d => {
          if (d.type === 'category') return 100;
          if (d.type === 'pattern') return 200;
          if (d.type === 'task') return 300;
          if (d.type === 'agent') return 400;
          return 300;
        }).strength(0.3));
      break;
      
    case 'circular':
      simulation
        .force('radial', d3.forceRadial(150, graphElement.value!.clientWidth / 2, graphElement.value!.clientHeight / 2).strength(0.1));
      break;
      
    case 'grid':
      const gridSize = Math.ceil(Math.sqrt(filteredData.value.nodes.length));
      simulation
        .force('x', d3.forceX((d, i) => (i % gridSize) * 100 + 100).strength(0.5))
        .force('y', d3.forceY((d, i) => Math.floor(i / gridSize) * 100 + 100).strength(0.5));
      break;
      
    default: // force
      simulation
        .force('y', null)
        .force('radial', null)
        .force('x', null);
      break;
  }
  
  if (simulation.alpha() < 0.1) {
    simulation.alpha(0.3).restart();
  }
}

function setLayout(layoutId: string) {
  currentLayout.value = layoutId;
  applyLayoutForces();
}

function getNodeColor(node: GraphNode): string {
  switch (settings.value.colorScheme) {
    case 'category':
      return getNodeTypeColor(node.type);
    case 'confidence':
      const confidence = node.metadata?.confidence ?? 0.5;
      return d3.interpolateRdYlGn(confidence);
    case 'usage':
      const usage = node.metadata?.usageCount ?? 0;
      const maxUsage = Math.max(...graphData.value.nodes.map(n => n.metadata?.usageCount ?? 0));
      return d3.interpolateBlues(usage / maxUsage);
    case 'age':
      const createdAt = node.metadata?.createdAt ? new Date(node.metadata.createdAt).getTime() : Date.now();
      const oldest = Math.min(...graphData.value.nodes.map(n => 
        n.metadata?.createdAt ? new Date(n.metadata.createdAt).getTime() : Date.now()
      ));
      const newest = Math.max(...graphData.value.nodes.map(n => 
        n.metadata?.createdAt ? new Date(n.metadata.createdAt).getTime() : Date.now()
      ));
      const ageRatio = (createdAt - oldest) / (newest - oldest);
      return d3.interpolateViridis(ageRatio);
    default:
      return getNodeTypeColor(node.type);
  }
}

function getNodeTypeColor(type: string): string {
  switch (type) {
    case 'pattern': return '#4fc3f7';
    case 'task': return '#66bb6a';
    case 'agent': return '#ff9800';
    case 'epic': return '#ab47bc';
    case 'story': return '#26c6da';
    case 'snapshot': return '#ffca28';
    case 'category': return '#8d6e63';
    default: return '#78909c';
  }
}

function getNodeSize(node: GraphNode): number {
  const baseSize = 8;
  const usageMultiplier = Math.log((node.metadata?.usageCount ?? 0) + 1) * 2;
  const confidenceMultiplier = (node.metadata?.confidence ?? 0.5) * 4;
  return baseSize + usageMultiplier + confidenceMultiplier;
}

function getLinkColor(type: string): string {
  switch (type) {
    case 'uses': return '#4fc3f7';
    case 'implements': return '#66bb6a';
    case 'derives_from': return '#ff9800';
    case 'validates': return '#f44336';
    case 'relates_to': return '#9c27b0';
    case 'contains': return '#607d8b';
    default: return '#78909c';
  }
}

function getNodeConnections(nodeId: string) {
  return filteredData.value.links
    .filter(link => link.source === nodeId)
    .map(link => ({
      id: link.id,
      type: link.type,
      label: link.label,
      targetId: link.target
    }));
}

function focusOnNode(nodeId: string) {
  const node = filteredData.value.nodes.find(n => n.id === nodeId);
  if (node && svg && node.x && node.y) {
    const transform = d3.zoomIdentity
      .translate(graphElement.value!.clientWidth / 2 - node.x, graphElement.value!.clientHeight / 2 - node.y)
      .scale(1.5);
    
    svg.transition()
      .duration(750)
      .call(zoom.transform, transform);
    
    selectedNode.value = node;
  }
}

function centerGraph() {
  if (svg) {
    const transform = d3.zoomIdentity.translate(0, 0).scale(1);
    svg.transition().duration(750).call(zoom.transform, transform);
  }
}

function zoomIn() {
  if (svg) {
    svg.transition().call(zoom.scaleBy, 1.5);
  }
}

function zoomOut() {
  if (svg) {
    svg.transition().call(zoom.scaleBy, 1 / 1.5);
  }
}

function resetZoom() {
  if (svg) {
    const bounds = svg.select('g').node()?.getBBox();
    if (bounds) {
      const width = graphElement.value!.clientWidth;
      const height = graphElement.value!.clientHeight;
      const scale = Math.min(width / bounds.width, height / bounds.height) * 0.9;
      const transform = d3.zoomIdentity
        .translate(width / 2, height / 2)
        .scale(scale)
        .translate(-bounds.x - bounds.width / 2, -bounds.y - bounds.height / 2);
      
      svg.transition().duration(750).call(zoom.transform, transform);
    }
  }
}

function applySettings() {
  showSettings.value = false;
  renderGraph();
}

// Drag handlers
function dragStarted(event: d3.D3DragEvent<SVGCircleElement, GraphNode, GraphNode>, d: GraphNode) {
  if (!event.active) simulation.alphaTarget(0.3).restart();
  d.fx = d.x;
  d.fy = d.y;
}

function dragged(event: d3.D3DragEvent<SVGCircleElement, GraphNode, GraphNode>, d: GraphNode) {
  d.fx = event.x;
  d.fy = event.y;
}

function dragEnded(event: d3.D3DragEvent<SVGCircleElement, GraphNode, GraphNode>, d: GraphNode) {
  if (!event.active) simulation.alphaTarget(0);
  d.fx = null;
  d.fy = null;
}

// Helper functions
function getBadgeClass() {
  const nodeCount = filteredData.value.nodes.length;
  if (nodeCount > 50) return 'badge-success';
  if (nodeCount > 20) return 'badge-info';
  return 'badge-warning';
}

function getStatusText() {
  const nodeCount = filteredData.value.nodes.length;
  return `${nodeCount} nodes`;
}

function getNodeTypeIcon(type: string) {
  switch (type) {
    case 'pattern': return 'mdi:lightbulb';
    case 'task': return 'mdi:checkbox-marked';
    case 'agent': return 'mdi:robot';
    case 'epic': return 'mdi:flag';
    case 'story': return 'mdi:book-open';
    case 'snapshot': return 'mdi:camera';
    case 'category': return 'mdi:folder';
    default: return 'mdi:circle';
  }
}

function getRelationshipIcon(type: string) {
  switch (type) {
    case 'uses': return 'mdi:arrow-right';
    case 'implements': return 'mdi:code-braces';
    case 'derives_from': return 'mdi:source-branch';
    case 'validates': return 'mdi:check-circle';
    case 'relates_to': return 'mdi:link';
    case 'contains': return 'mdi:folder-open';
    default: return 'mdi:arrow-right';
  }
}

function formatNodeType(type: string) {
  return type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' ');
}

function formatRelationshipType(type: string) {
  return type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString();
}

// Watch for filter changes
watch([activeNodeTypes, activeRelationshipTypes, confidenceThreshold], () => {
  if (simulation) {
    renderGraph();
  }
}, { deep: true });

// Lifecycle
onMounted(async () => {
  await refreshGraph();
  
  // Handle window resize
  window.addEventListener('resize', () => {
    if (graphElement.value) {
      renderGraph();
    }
  });
});

onUnmounted(() => {
  if (simulation) {
    simulation.stop();
  }
});
</script>

<style scoped>
.knowledge-graph-viewer {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
  color: #cccccc;
  overflow: hidden;
  position: relative;
  z-index: 100;
  margin-left: 0;
  /* Ensure it stays within its container bounds */
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
.badge-info { background: rgba(0, 122, 204, 0.2); color: #007acc; }
.badge-warning { background: rgba(255, 193, 7, 0.2); color: #ffc107; }

.header-right {
  display: flex;
  gap: 8px;
}

.filters-panel {
  padding: 12px 16px;
  background: #2d2d30;
  border-bottom: 1px solid #181818;
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.filter-group label {
  font-size: 12px;
  font-weight: 600;
  color: #ffffff;
}

.checkbox-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  cursor: pointer;
}

.checkbox-input {
  width: 14px;
  height: 14px;
}

.range-input {
  width: 100px;
}

.threshold-value {
  font-size: 11px;
  color: #007acc;
  font-weight: 600;
}

.graph-container {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.graph-canvas {
  width: 100%;
  height: 100%;
}

.graph-controls {
  position: absolute;
  top: 10px;
  right: 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  z-index: 110;
}

.control-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(37, 37, 38, 0.9);
  border: 1px solid #3c3c3c;
  border-radius: 4px;
  color: #cccccc;
  cursor: pointer;
  transition: all 0.2s;
}

.control-btn:hover {
  background: rgba(60, 60, 60, 0.9);
}

.layout-controls {
  position: absolute;
  bottom: 10px;
  left: 60px; /* Move away from left edge to avoid activity bar */
  display: flex;
  gap: 4px;
  z-index: 110;
}

.layout-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  background: rgba(37, 37, 38, 0.9);
  border: 1px solid #3c3c3c;
  border-radius: 4px;
  color: #cccccc;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s;
}

.layout-btn:hover {
  background: rgba(60, 60, 60, 0.9);
}

.layout-btn.active {
  background: #007acc;
  border-color: #007acc;
  color: #ffffff;
}

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(30, 30, 30, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 150; /* Highest z-index for loading overlay */
}

.loading-spinner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: #ffffff;
}

.loading-spinner span {
  font-size: 14px;
}

.node-details-panel {
  position: absolute;
  top: 60px;
  left: 60px; /* Move away from left edge to avoid activity bar */
  width: 300px;
  max-height: 400px;
  background: #252526;
  border: 1px solid #3c3c3c;
  border-radius: 6px;
  overflow-y: auto;
  z-index: 120; /* Higher z-index to ensure it's above everything */
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.details-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #3c3c3c;
  background: #2d2d30;
}

.details-header h4 {
  margin: 0;
  font-size: 13px;
  color: #ffffff;
}

.details-content {
  padding: 12px 16px;
}

.detail-section {
  margin-bottom: 16px;
}

.detail-section h5 {
  margin: 0 0 6px 0;
  font-size: 11px;
  color: #999;
  text-transform: uppercase;
  font-weight: 600;
}

.node-type {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
}

.type-pattern { background: rgba(79, 195, 247, 0.2); color: #4fc3f7; }
.type-task { background: rgba(102, 187, 106, 0.2); color: #66bb6a; }
.type-agent { background: rgba(255, 152, 0, 0.2); color: #ff9800; }
.type-epic { background: rgba(171, 71, 188, 0.2); color: #ab47bc; }
.type-story { background: rgba(38, 198, 218, 0.2); color: #26c6da; }

.metadata-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 6px;
}

.metadata-item {
  display: flex;
  justify-content: space-between;
  padding: 4px 8px;
  background: #1e1e1e;
  border-radius: 3px;
  font-size: 11px;
}

.metadata-label {
  color: #999;
}

.metadata-value {
  color: #007acc;
  font-weight: 600;
}

.connections-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.connection-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  background: #1e1e1e;
  border-radius: 3px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s;
}

.connection-item:hover {
  background: #3c3c3c;
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
  max-width: 500px;
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

.settings-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  font-weight: 500;
  font-size: 12px;
  color: #cccccc;
}

.form-checkbox {
  width: 16px;
  height: 16px;
}

.form-select {
  padding: 8px 12px;
  background: #3c3c3c;
  border: 1px solid #6c6c6c;
  border-radius: 4px;
  color: #d4d4d4;
  font-size: 13px;
}

.form-select:focus {
  outline: none;
  border-color: #007acc;
}

/* Graph-specific styles */
:deep(.link) {
  stroke-dasharray: none;
}

:deep(.node) {
  transition: r 0.2s;
}

:deep(.node:hover) {
  r: 12;
}

:deep(.node-label) {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-weight: 500;
}

:deep(.link-label) {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  opacity: 0.7;
}
</style>