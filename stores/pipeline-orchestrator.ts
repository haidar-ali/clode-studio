/**
 * Pipeline Orchestrator Store
 * Manages agent pipelines and templates
 */

import { defineStore } from 'pinia';
import { useTasksStore } from './tasks';
import type {
  Pipeline,
  AgentNode,
  PipelineTemplate,
  ExecutionContext,
  PipelineEvent,
  PipelineStoreState,
  AgentStatus,
  PipelineStatus,
  AgentRole,
  AgentInstanceType,
  ExecutionMode,
  WorktreeStrategy
} from '../types/agent-orchestrator';

export const usePipelineOrchestratorStore = defineStore('pipelineOrchestrator', {
  state: (): PipelineStoreState => ({
    pipelines: new Map(),
    templates: new Map(),
    activePipelineId: null,
    executionContexts: new Map(),
    events: []
  }),

  getters: {
    pipelinesList: (state) => Array.from(state.pipelines.values()),
    
    templatesList: (state) => Array.from(state.templates.values()),
    
    activePipeline: (state) => state.activePipelineId ? state.pipelines.get(state.activePipelineId) : null,
    
    runningPipelines: (state) => Array.from(state.pipelines.values()).filter(p => p.status === 'running'),
    
    getPipelineById: (state) => (id: string) => state.pipelines.get(id),
    
    getTemplateById: (state) => (id: string) => state.templates.get(id),
    
    getPipelineAgents: (state) => (pipelineId: string) => {
      const pipeline = state.pipelines.get(pipelineId);
      return pipeline ? Array.from(pipeline.agents.values()) : [];
    },
    
    getPipelineEvents: (state) => (pipelineId: string) => {
      return state.events.filter(e => e.pipelineId === pipelineId);
    },
    
    getAgentById: (state) => (pipelineId: string, agentId: string) => {
      const pipeline = state.pipelines.get(pipelineId);
      return pipeline ? pipeline.agents.get(agentId) : null;
    }
  },

  actions: {
    /**
     * Create a new pipeline
     */
    createPipeline(config: {
      name: string;
      description?: string;
      epicId?: string;
      storyId?: string;
      taskIds?: string[];
      executionMode?: ExecutionMode;
      worktreeStrategy?: WorktreeStrategy;
    }): Pipeline {
      const pipeline: Pipeline = {
        id: `pipeline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: config.name,
        description: config.description,
        epicId: config.epicId,
        storyId: config.storyId,
        taskIds: config.taskIds,
        agents: new Map(),
        edges: [],
        status: 'draft',
        executionMode: config.executionMode || 'smart',
        worktreeStrategy: config.worktreeStrategy || 'none',
        currentAgents: [],
        completedAgents: [],
        failedAgents: []
      };
      
      this.pipelines.set(pipeline.id, pipeline);
      return pipeline;
    },

    /**
     * Create pipeline from template
     */
    createFromTemplate(templateId: string, config: {
      name: string;
      epicId?: string;
      storyId?: string;
      taskIds?: string[];
    }): Pipeline | null {
      const template = this.templates.get(templateId);
      if (!template) return null;
      
      const pipeline = this.createPipeline({
        name: config.name,
        description: template.description,
        epicId: config.epicId,
        storyId: config.storyId,
        taskIds: config.taskIds,
        executionMode: template.defaultConfig?.executionMode,
        worktreeStrategy: template.defaultConfig?.worktreeStrategy
      });
      
      // Add agents from template
      const agentIdMap = new Map<number, string>();
      template.agents.forEach((agentTemplate, index) => {
        const agent = this.addAgent(pipeline.id, {
          type: agentTemplate.type,
          name: agentTemplate.name,
          role: agentTemplate.role,
          position: agentTemplate.position,
          config: agentTemplate.config
        });
        if (agent) {
          agentIdMap.set(index, agent.id);
        }
      });
      
      // Add edges from template
      template.edges.forEach(edge => {
        const fromId = agentIdMap.get(edge.from);
        const toId = agentIdMap.get(edge.to);
        if (fromId && toId) {
          this.connectAgents(pipeline.id, fromId, toId);
        }
      });
      
      return pipeline;
    },

    /**
     * Add an agent to a pipeline
     */
    addAgent(pipelineId: string, config: {
      type: AgentInstanceType;
      name: string;
      role: AgentRole;
      position?: { x: number; y: number };
      config?: Partial<AgentNode['config']>;
    }): AgentNode | null {
      const pipeline = this.pipelines.get(pipelineId);
      if (!pipeline) return null;
      
      const agent: AgentNode = {
        id: `agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: config.type,
        name: config.name,
        role: config.role,
        position: config.position || { x: 0, y: 0 },
        config: config.config || {},
        dependencies: [],
        status: 'pending',
        execution: {}
      };
      
      pipeline.agents.set(agent.id, agent);
      return agent;
    },

    /**
     * Update an agent
     */
    updateAgent(pipelineId: string, agentId: string, updates: Partial<AgentNode>): void {
      const pipeline = this.pipelines.get(pipelineId);
      if (!pipeline) return;
      
      const agent = pipeline.agents.get(agentId);
      if (!agent) return;
      
      // Update agent properties
      Object.assign(agent, updates);
    },

    /**
     * Remove an agent
     */
    removeAgent(pipelineId: string, agentId: string): void {
      const pipeline = this.pipelines.get(pipelineId);
      if (!pipeline) return;
      
      // Remove agent
      pipeline.agents.delete(agentId);
      
      // Remove edges connected to this agent
      pipeline.edges = pipeline.edges.filter(
        edge => edge.from !== agentId && edge.to !== agentId
      );
      
      // Remove from dependencies of other agents
      pipeline.agents.forEach(agent => {
        agent.dependencies = agent.dependencies.filter(depId => depId !== agentId);
      });
    },

    /**
     * Connect two agents
     */
    connectAgents(pipelineId: string, fromId: string, toId: string, condition?: string): void {
      const pipeline = this.pipelines.get(pipelineId);
      if (!pipeline) return;
      
      const fromAgent = pipeline.agents.get(fromId);
      const toAgent = pipeline.agents.get(toId);
      if (!fromAgent || !toAgent) return;
      
      // Check for circular dependency
      if (this.wouldCreateCircularDependency(pipeline, fromId, toId)) {
        console.error('Cannot create circular dependency');
        return;
      }
      
      // Add edge
      pipeline.edges.push({ from: fromId, to: toId, condition });
      
      // Update dependencies
      if (!toAgent.dependencies.includes(fromId)) {
        toAgent.dependencies.push(fromId);
      }
    },

    /**
     * Disconnect two agents
     */
    disconnectAgents(pipelineId: string, fromId: string, toId: string): void {
      const pipeline = this.pipelines.get(pipelineId);
      if (!pipeline) return;
      
      // Remove edge
      pipeline.edges = pipeline.edges.filter(
        edge => !(edge.from === fromId && edge.to === toId)
      );
      
      // Update dependencies
      const toAgent = pipeline.agents.get(toId);
      if (toAgent) {
        toAgent.dependencies = toAgent.dependencies.filter(depId => depId !== fromId);
      }
    },

    /**
     * Check if connecting agents would create circular dependency
     */
    wouldCreateCircularDependency(pipeline: Pipeline, fromId: string, toId: string): boolean {
      // DFS to check if toId can reach fromId
      const visited = new Set<string>();
      const stack = [toId];
      
      while (stack.length > 0) {
        const current = stack.pop()!;
        if (current === fromId) return true;
        
        if (visited.has(current)) continue;
        visited.add(current);
        
        // Add dependencies to stack
        const agent = pipeline.agents.get(current);
        if (agent) {
          stack.push(...agent.dependencies);
        }
      }
      
      return false;
    },

    /**
     * Update agent position
     */
    updateAgentPosition(pipelineId: string, agentId: string, position: { x: number; y: number }): void {
      const pipeline = this.pipelines.get(pipelineId);
      if (!pipeline) return;
      
      const agent = pipeline.agents.get(agentId);
      if (agent) {
        agent.position = position;
      }
    },

    /**
     * Start pipeline execution
     */
    async startPipeline(pipelineId: string): Promise<void> {
      const pipeline = this.pipelines.get(pipelineId);
      if (!pipeline) return;
      
      // Update status
      pipeline.status = 'running';
      pipeline.startedAt = new Date();
      
      // Call backend to start execution
      if (window.electronAPI) {
        await window.electronAPI.orchestrator.startPipeline({ pipelineId });
      } else {
        // Remote mode
        const provider = (window as any).__remoteProvider;
        if (provider?.orchestrator) {
          await provider.orchestrator.startPipeline({ pipelineId });
        }
      }
    },

    /**
     * Pause pipeline execution
     */
    async pausePipeline(pipelineId: string): Promise<void> {
      const pipeline = this.pipelines.get(pipelineId);
      if (!pipeline) return;
      
      pipeline.status = 'paused';
      
      if (window.electronAPI) {
        await window.electronAPI.orchestrator.pausePipeline({ pipelineId });
      } else {
        const provider = (window as any).__remoteProvider;
        if (provider?.orchestrator) {
          await provider.orchestrator.pausePipeline({ pipelineId });
        }
      }
    },

    /**
     * Resume pipeline execution
     */
    async resumePipeline(pipelineId: string): Promise<void> {
      const pipeline = this.pipelines.get(pipelineId);
      if (!pipeline) return;
      
      pipeline.status = 'running';
      
      if (window.electronAPI) {
        await window.electronAPI.orchestrator.resumePipeline({ pipelineId });
      } else {
        const provider = (window as any).__remoteProvider;
        if (provider?.orchestrator) {
          await provider.orchestrator.resumePipeline({ pipelineId });
        }
      }
    },

    /**
     * Stop pipeline execution
     */
    async stopPipeline(pipelineId: string): Promise<void> {
      const pipeline = this.pipelines.get(pipelineId);
      if (!pipeline) return;
      
      pipeline.status = 'cancelled';
      pipeline.completedAt = new Date();
      
      if (window.electronAPI) {
        await window.electronAPI.orchestrator.stopPipeline({ pipelineId });
      } else {
        const provider = (window as any).__remoteProvider;
        if (provider?.orchestrator) {
          await provider.orchestrator.stopPipeline({ pipelineId });
        }
      }
    },

    /**
     * Handle pipeline event from backend
     */
    handlePipelineEvent(event: PipelineEvent): void {
      // Add to events list
      this.events.push(event);
      
      // Update pipeline state based on event
      const pipeline = this.pipelines.get(event.pipelineId);
      if (!pipeline) return;
      
      switch (event.type) {
        case 'pipeline:started':
          pipeline.status = 'running';
          pipeline.startedAt = event.timestamp;
          break;
          
        case 'pipeline:completed':
          pipeline.status = 'completed';
          pipeline.completedAt = event.timestamp;
          break;
          
        case 'pipeline:failed':
          pipeline.status = 'failed';
          pipeline.completedAt = event.timestamp;
          break;
          
        case 'pipeline:paused':
          pipeline.status = 'paused';
          pipeline.pausedAt = event.timestamp;
          break;
          
        case 'agent:started':
          if (event.agentId) {
            const agent = pipeline.agents.get(event.agentId);
            if (agent) {
              agent.status = 'running';
              agent.execution.startTime = event.timestamp;
            }
            pipeline.currentAgents.push(event.agentId);
          }
          break;
          
        case 'agent:completed':
          if (event.agentId) {
            const agent = pipeline.agents.get(event.agentId);
            if (agent) {
              agent.status = 'completed';
              agent.execution.endTime = event.timestamp;
            }
            pipeline.currentAgents = pipeline.currentAgents.filter(id => id !== event.agentId);
            pipeline.completedAgents.push(event.agentId);
          }
          break;
          
        case 'agent:failed':
          if (event.agentId) {
            const agent = pipeline.agents.get(event.agentId);
            if (agent) {
              agent.status = 'failed';
              agent.execution.endTime = event.timestamp;
              if (event.data?.error) {
                agent.execution.error = event.data.error;
              }
            }
            pipeline.currentAgents = pipeline.currentAgents.filter(id => id !== event.agentId);
            pipeline.failedAgents.push(event.agentId);
          }
          break;
          
        case 'agent:output':
          if (event.agentId && event.data?.output) {
            const agent = pipeline.agents.get(event.agentId);
            if (agent) {
              if (!agent.execution.output) {
                agent.execution.output = '';
              }
              agent.execution.output += event.data.output;
            }
          }
          break;
      }
    },

    /**
     * Save pipeline as template
     */
    saveAsTemplate(pipelineId: string, config: {
      name: string;
      description: string;
      category: string;
      tags: string[];
    }): PipelineTemplate | null {
      const pipeline = this.pipelines.get(pipelineId);
      if (!pipeline) return null;
      
      const agents = Array.from(pipeline.agents.values());
      const template: PipelineTemplate = {
        id: `template-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: config.name,
        description: config.description,
        category: config.category,
        tags: config.tags,
        agents: agents.map(agent => ({
          type: agent.type,
          name: agent.name,
          role: agent.role,
          position: agent.position,
          config: agent.config,
          dependencies: agent.dependencies
        })),
        edges: pipeline.edges.map(edge => {
          const fromIndex = agents.findIndex(a => a.id === edge.from);
          const toIndex = agents.findIndex(a => a.id === edge.to);
          return { from: fromIndex, to: toIndex };
        }),
        defaultConfig: {
          executionMode: pipeline.executionMode,
          worktreeStrategy: pipeline.worktreeStrategy,
          maxConcurrentAgents: pipeline.maxConcurrentAgents
        }
      };
      
      this.templates.set(template.id, template);
      return template;
    },

    /**
     * Load templates from storage
     */
    async loadTemplates(): Promise<void> {
      // Load built-in templates
      this.loadBuiltInTemplates();
      
      // Load user templates from backend
      if (window.electronAPI) {
        const templates = await window.electronAPI.orchestrator.getTemplates();
        templates.forEach(template => {
          this.templates.set(template.id, template);
        });
      }
    },

    /**
     * Load built-in templates
     */
    loadBuiltInTemplates(): void {
      // Feature Implementation Template
      const featureTemplate: PipelineTemplate = {
        id: 'template-feature-implementation',
        name: 'Feature Implementation',
        description: 'Complete feature implementation pipeline with research, design, coding, and testing',
        category: 'Development',
        tags: ['feature', 'full-stack', 'testing'],
        agents: [
          {
            type: 'claude',
            name: 'Research',
            role: 'planner',
            position: { x: 100, y: 100 },
            config: {
              prompt: 'Research best practices and existing solutions for this feature',
              outputFiles: ['research-notes.md']
            },
            dependencies: []
          },
          {
            type: 'claude',
            name: 'Design',
            role: 'architect',
            position: { x: 300, y: 100 },
            config: {
              prompt: 'Design the architecture and API for this feature',
              inputFiles: ['research-notes.md'],
              outputFiles: ['design.md', 'api-spec.yaml']
            },
            dependencies: []
          },
          {
            type: 'codex',
            name: 'Implementation',
            role: 'coder',
            position: { x: 500, y: 100 },
            config: {
              prompt: 'Implement the feature based on the design',
              inputFiles: ['design.md', 'api-spec.yaml'],
              useWorktree: true
            },
            dependencies: []
          },
          {
            type: 'claude',
            name: 'Testing',
            role: 'tester',
            position: { x: 700, y: 100 },
            config: {
              prompt: 'Write comprehensive tests for the implementation',
              useWorktree: true
            },
            dependencies: []
          },
          {
            type: 'claude',
            name: 'Review',
            role: 'reviewer',
            position: { x: 900, y: 100 },
            config: {
              prompt: 'Review the implementation and suggest improvements',
              outputFiles: ['review-report.md']
            },
            dependencies: []
          }
        ],
        edges: [
          { from: 0, to: 1 }, // Research -> Design
          { from: 1, to: 2 }, // Design -> Implementation
          { from: 2, to: 3 }, // Implementation -> Testing
          { from: 2, to: 4 }, // Implementation -> Review
          { from: 3, to: 4 }  // Testing -> Review
        ],
        defaultConfig: {
          executionMode: 'smart',
          worktreeStrategy: 'per-pipeline',
          maxConcurrentAgents: 3
        }
      };
      
      this.templates.set(featureTemplate.id, featureTemplate);
      
      // Bug Fix Template
      const bugFixTemplate: PipelineTemplate = {
        id: 'template-bug-fix',
        name: 'Bug Fix',
        description: 'Analyze, fix, and test a bug',
        category: 'Maintenance',
        tags: ['bug', 'fix', 'testing'],
        agents: [
          {
            type: 'claude',
            name: 'Analyze',
            role: 'planner',
            position: { x: 100, y: 100 },
            config: {
              prompt: 'Analyze the bug and identify root cause',
              outputFiles: ['analysis.md']
            },
            dependencies: []
          },
          {
            type: 'codex',
            name: 'Fix',
            role: 'coder',
            position: { x: 300, y: 100 },
            config: {
              prompt: 'Fix the bug based on the analysis',
              inputFiles: ['analysis.md'],
              useWorktree: true
            },
            dependencies: []
          },
          {
            type: 'claude',
            name: 'Test',
            role: 'tester',
            position: { x: 500, y: 100 },
            config: {
              prompt: 'Test the fix and verify the bug is resolved',
              useWorktree: true
            },
            dependencies: []
          }
        ],
        edges: [
          { from: 0, to: 1 }, // Analyze -> Fix
          { from: 1, to: 2 }  // Fix -> Test
        ],
        defaultConfig: {
          executionMode: 'sequential',
          worktreeStrategy: 'per-agent'
        }
      };
      
      this.templates.set(bugFixTemplate.id, bugFixTemplate);
    },

    /**
     * Delete pipeline
     */
    deletePipeline(pipelineId: string): void {
      this.pipelines.delete(pipelineId);
      if (this.activePipelineId === pipelineId) {
        this.activePipelineId = null;
      }
    },

    /**
     * Delete template
     */
    deleteTemplate(templateId: string): void {
      this.templates.delete(templateId);
    },

    /**
     * Set active pipeline
     */
    setActivePipeline(pipelineId: string | null): void {
      this.activePipelineId = pipelineId;
    },

    /**
     * Clear all events
     */
    clearEvents(): void {
      this.events = [];
    },

    /**
     * Clear events for a specific pipeline
     */
    clearPipelineEvents(pipelineId: string): void {
      this.events = this.events.filter(e => e.pipelineId !== pipelineId);
    },

    /**
     * Save pipeline to storage
     */
    async savePipeline(pipelineId: string): Promise<void> {
      const pipeline = this.pipelines.get(pipelineId);
      if (!pipeline) return;
      
      if (window.electronAPI?.store) {
        try {
          // Get existing saved pipelines
          const savedPipelines = await window.electronAPI.store.get('savedPipelines') || [];
          
          // Convert pipeline to serializable format
          const serializable = {
            id: pipeline.id,
            name: pipeline.name,
            description: pipeline.description,
            epicId: pipeline.epicId,
            storyId: pipeline.storyId,
            taskIds: pipeline.taskIds,
            agents: Array.from(pipeline.agents.values()),
            edges: pipeline.edges,
            status: pipeline.status,
            executionMode: pipeline.executionMode,
            worktreeStrategy: pipeline.worktreeStrategy,
            maxConcurrentAgents: pipeline.maxConcurrentAgents,
            baseBranch: pipeline.baseBranch,
            autoMerge: pipeline.autoMerge,
            continueOnFailure: pipeline.continueOnFailure
          };
          
          // Update or add pipeline
          const existingIndex = savedPipelines.findIndex(p => p.id === pipeline.id);
          if (existingIndex >= 0) {
            savedPipelines[existingIndex] = serializable;
          } else {
            savedPipelines.push(serializable);
          }
          
          await window.electronAPI.store.set('savedPipelines', savedPipelines);
        } catch (error) {
          console.error('Failed to save pipeline:', error);
        }
      }
    },

    /**
     * Load saved pipelines from storage
     */
    async loadSavedPipelines(): Promise<void> {
      if (window.electronAPI?.store) {
        try {
          const savedPipelines = await window.electronAPI.store.get('savedPipelines');
          if (savedPipelines && Array.isArray(savedPipelines)) {
            savedPipelines.forEach(saved => {
              const pipeline: Pipeline = {
                ...saved,
                agents: new Map(saved.agents.map(a => [a.id, a])),
                currentAgents: [],
                completedAgents: [],
                failedAgents: []
              };
              this.pipelines.set(pipeline.id, pipeline);
            });
          }
        } catch (error) {
          console.error('Failed to load saved pipelines:', error);
        }
      }
    },

    /**
     * Start pipeline from Epic
     */
    async startPipelineFromEpic(epicId: string, templateId?: string): Promise<Pipeline | null> {
      const tasksStore = useTasksStore();
      const epic = tasksStore.epics.find(e => e.id === epicId);
      if (!epic) return null;

      let pipeline: Pipeline | null = null;
      
      if (templateId) {
        pipeline = this.createFromTemplate(templateId, {
          name: `Pipeline for ${epic.title}`,
          epicId: epicId
        });
      } else {
        pipeline = this.createPipeline({
          name: `Pipeline for ${epic.title}`,
          description: epic.description,
          epicId: epicId
        });
      }
      
      if (pipeline) {
        await this.savePipeline(pipeline.id);
        this.setActivePipeline(pipeline.id);
      }
      
      return pipeline;
    },

    /**
     * Start pipeline from Story
     */
    async startPipelineFromStory(storyId: string, templateId?: string): Promise<Pipeline | null> {
      const tasksStore = useTasksStore();
      const story = tasksStore.stories.find(s => s.id === storyId);
      if (!story) return null;

      let pipeline: Pipeline | null = null;
      
      if (templateId) {
        pipeline = this.createFromTemplate(templateId, {
          name: `Pipeline for ${story.title}`,
          storyId: storyId
        });
      } else {
        pipeline = this.createPipeline({
          name: `Pipeline for ${story.title}`,
          description: story.description,
          storyId: storyId
        });
      }
      
      if (pipeline) {
        await this.savePipeline(pipeline.id);
        this.setActivePipeline(pipeline.id);
      }
      
      return pipeline;
    },

    /**
     * Start pipeline from Task
     */
    async startPipelineFromTask(taskId: string, templateId?: string): Promise<Pipeline | null> {
      const tasksStore = useTasksStore();
      const task = tasksStore.tasks.find(t => t.id === taskId);
      if (!task) return null;

      let pipeline: Pipeline | null = null;
      
      if (templateId) {
        pipeline = this.createFromTemplate(templateId, {
          name: `Pipeline for ${task.title}`,
          taskIds: [taskId]
        });
      } else {
        pipeline = this.createPipeline({
          name: `Pipeline for ${task.title}`,
          description: task.description,
          taskIds: [taskId]
        });
      }
      
      if (pipeline) {
        await this.savePipeline(pipeline.id);
        this.setActivePipeline(pipeline.id);
      }
      
      return pipeline;
    }
  }
});