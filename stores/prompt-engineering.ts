import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useTasksStore } from './tasks';
import { useKnowledgeStore } from './knowledge';
import { useMCPStore } from './mcp';
import { useClaudeInstancesStore } from './claude-instances';
import type { KnowledgeEntry } from './knowledge';
import type { ClaudePersonality } from './claude-instances';

export interface PromptSection {
  id: string;
  type: 'system' | 'context' | 'instruction' | 'example' | 'constraint' | 'output' | 'subagent';
  label: string;
  content: string;
  metadata?: Record<string, any>;
}

export interface SubAgentDefinition {
  id: string;
  name: string;
  role: string;
  personality: string; // personality ID
  tasks: string[];
  tools: string[];
  constraints: string[];
  outputFormat: string;
  resources?: ResourceReference[]; // Add resources for subagent
}

export interface ResourceReference {
  type: 'file' | 'knowledge' | 'hook' | 'mcp' | 'command' | 'task';
  id: string;
  path?: string;
  name: string;
  metadata?: Record<string, any>;
}

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  category: 'coding' | 'research' | 'analysis' | 'refactoring' | 'debugging' | 'custom';
  structure: {
    systemPrompt?: string;
    sections: PromptSection[];
    resources: ResourceReference[];
    subagents: SubAgentDefinition[];
  };
  metadata: {
    complexity: 'simple' | 'moderate' | 'complex';
    estimatedTokens: number;
    successMetrics: string[];
    tags: string[];
    createdAt: string;
    lastUsed?: string;
    usageCount: number;
  };
}

export interface PromptExecution {
  id: string;
  templateId?: string;
  prompt: string;
  resources: ResourceReference[];
  subagents: SubAgentDefinition[];
  timestamp: string;
  tokenUsage?: number;
  executionTime?: number;
  success: boolean;
  feedback?: string;
}

export const usePromptEngineeringStore = defineStore('prompt-engineering', () => {
  // State
  const templates = ref<PromptTemplate[]>([]);
  const currentPrompt = ref<Partial<PromptTemplate>>({
    structure: {
      sections: [],
      resources: [],
      subagents: []
    },
    metadata: {
      complexity: 'simple',
      estimatedTokens: 0,
      successMetrics: [],
      tags: [],
      createdAt: new Date().toISOString(),
      usageCount: 0
    }
  });
  const currentTemplateId = ref<string | null>(null); // Track loaded template ID
  const executions = ref<PromptExecution[]>([]);
  const selectedResources = ref<ResourceReference[]>([]);
  const isStudioOpen = ref(false);
  const mode = ref<'terminal' | 'studio' | 'chat'>('terminal');

  // Get other stores
  const tasksStore = useTasksStore();
  const knowledgeStore = useKnowledgeStore();
  const mcpStore = useMCPStore();
  const claudeInstancesStore = useClaudeInstancesStore();

  // Computed
  const tokenEstimate = computed(() => {
    if (!currentPrompt.value.structure) return 0;

    let tokens = 0;

    // Estimate tokens for sections
    currentPrompt.value.structure.sections?.forEach(section => {
      tokens += estimateTokens(section.content);
    });

    // Add tokens for resources
    currentPrompt.value.structure.resources?.forEach(resource => {
      tokens += 100; // Rough estimate per resource
    });

    // Add tokens for subagents
    currentPrompt.value.structure.subagents?.forEach(agent => {
      tokens += 200; // Rough estimate per subagent definition
    });

    return tokens;
  });

  const complexityScore = computed(() => {
    const prompt = currentPrompt.value;
    if (!prompt.structure) return 'simple';

    const sectionCount = prompt.structure.sections?.length || 0;
    const resourceCount = prompt.structure.resources?.length || 0;
    const subagentCount = prompt.structure.subagents?.length || 0;

    const score = sectionCount * 10 + resourceCount * 5 + subagentCount * 20;

    if (score > 100) return 'complex';
    if (score > 50) return 'moderate';
    return 'simple';
  });

  const availablePersonalities = computed(() => {
    return claudeInstancesStore.personalities;
  });

  // Actions
  function estimateTokens(text: string): number {
    // Rough estimate: 1 token ~= 4 characters
    return Math.ceil(text.length / 4);
  }

  function addSection(type: PromptSection['type'], content: string = '') {
    const section: PromptSection = {
      id: `section-${Date.now()}`,
      type,
      label: getSectionLabel(type),
      content
    };

    if (!currentPrompt.value.structure) {
      currentPrompt.value.structure = { sections: [], resources: [], subagents: [] };
    }

    currentPrompt.value.structure.sections.push(section);
  }

  function getSectionLabel(type: PromptSection['type']): string {
    const labels: Record<PromptSection['type'], string> = {
      system: 'System Prompt',
      context: 'Context',
      instruction: 'Instructions',
      example: 'Example',
      constraint: 'Constraints',
      output: 'Output Format',
      subagent: 'SubAgent Instructions'
    };
    return labels[type];
  }

  function updateSection(id: string, content: string) {
    if (!currentPrompt.value.structure) return;

    const section = currentPrompt.value.structure.sections.find(s => s.id === id);
    if (section) {
      section.content = content;
    }
  }

  function removeSection(id: string) {
    if (!currentPrompt.value.structure) return;

    const index = currentPrompt.value.structure.sections.findIndex(s => s.id === id);
    if (index > -1) {
      currentPrompt.value.structure.sections.splice(index, 1);
    }
  }

  function addResource(resource: ResourceReference) {
    if (!currentPrompt.value.structure) {
      currentPrompt.value.structure = { sections: [], resources: [], subagents: [] };
    }

    // Avoid duplicates
    const exists = currentPrompt.value.structure.resources.some(
      r => r.type === resource.type && r.id === resource.id
    );

    if (!exists) {
      currentPrompt.value.structure.resources.push(resource);
    }
  }

  function removeResource(index: number) {
    if (!currentPrompt.value.structure) return;
    currentPrompt.value.structure.resources.splice(index, 1);
  }

  function addSubAgent(subagent: Partial<SubAgentDefinition> = {}) {
    if (!currentPrompt.value.structure) {
      currentPrompt.value.structure = { sections: [], resources: [], subagents: [] };
    }

    const newAgent: SubAgentDefinition = {
      id: `agent-${Date.now()}`,
      name: subagent.name || 'New Agent',
      role: subagent.role || 'Assistant',
      personality: subagent.personality || 'developer', // Use a valid default personality ID
      tasks: subagent.tasks || [],
      tools: subagent.tools || [],
      constraints: subagent.constraints || [],
      outputFormat: subagent.outputFormat || 'markdown',
      resources: subagent.resources || []
    };

    currentPrompt.value.structure.subagents.push(newAgent);
  }

  function updateSubAgent(id: string, updates: Partial<SubAgentDefinition>) {
    if (!currentPrompt.value.structure) return;

    const agent = currentPrompt.value.structure.subagents.find(a => a.id === id);
    if (agent) {
      Object.assign(agent, updates);
    }
  }

  function removeSubAgent(id: string) {
    if (!currentPrompt.value.structure) return;

    const index = currentPrompt.value.structure.subagents.findIndex(a => a.id === id);
    if (index > -1) {
      currentPrompt.value.structure.subagents.splice(index, 1);
    }
  }

  function buildPrompt(): string {
    if (!currentPrompt.value.structure) return '';

    const parts: string[] = [];

    // Add sections in order
    currentPrompt.value.structure.sections.forEach(section => {
      if (section.content.trim()) {
        if (section.type === 'system') {
          parts.unshift(section.content); // System prompt goes first
        } else {
          parts.push(`<${section.type}>\n${section.content}\n</${section.type}>`);
        }
      }
    });

    // Add resources as context
    if (currentPrompt.value.structure.resources.length > 0) {
      const resourceParts: string[] = [];

      // Group resources by type
      const mcpResources = currentPrompt.value.structure.resources.filter(r => r.type === 'mcp');
      const otherResources = currentPrompt.value.structure.resources.filter(r => r.type !== 'mcp');

      // Add MCP tools with special instruction
      if (mcpResources.length > 0) {
        const mcpTools = mcpResources.map(r => r.metadata?.tool || r.name).join(', ');
        resourceParts.push(`MCP Tools Available: ${mcpTools}`);
        resourceParts.push('You can use these MCP tools to complete the task.');
      }

      // Add other resources
      if (otherResources.length > 0) {
        const otherContext = otherResources
          .map(r => `- ${r.type}: ${r.name}`)
          .join('\n');
        resourceParts.push(otherContext);
      }

      if (resourceParts.length > 0) {
        parts.push(`<resources>\n${resourceParts.join('\n\n')}\n</resources>`);
      }
    }

    // Add subagent definitions
    if (currentPrompt.value.structure.subagents.length > 0) {
      const subagentDefs = currentPrompt.value.structure.subagents
        .map(agent => {
          const personalityName = claudeInstancesStore.personalities.get(agent.personality)?.name || agent.personality;
          const resourcesList = agent.resources?.map(r => `${r.type}:${r.name}`).join(', ') || 'None';
          return `<subagent id="${agent.id}" name="${agent.name}">
Role: ${agent.role}
Personality: ${personalityName}
Tasks: ${agent.tasks.join(', ')}
Tools: ${agent.tools.join(', ')}
Constraints: ${agent.constraints.join(', ')}
Resources: ${resourcesList}
Output Format: ${agent.outputFormat}
</subagent>`;
        })
        .join('\n\n');
      parts.push(`<subagents>\n${subagentDefs}\n</subagents>`);
    }

    return parts.join('\n\n');
  }

  async function saveTemplate(name: string, description: string, category: PromptTemplate['category']) {
    if (!currentPrompt.value.structure) return;

    const template: PromptTemplate = {
      id: `template-${Date.now()}`,
      name,
      description,
      category,
      structure: JSON.parse(JSON.stringify(currentPrompt.value.structure)),
      metadata: {
        complexity: complexityScore.value as 'simple' | 'moderate' | 'complex',
        estimatedTokens: tokenEstimate.value,
        successMetrics: currentPrompt.value.metadata?.successMetrics || [],
        tags: currentPrompt.value.metadata?.tags || [],
        createdAt: new Date().toISOString(),
        usageCount: 0
      }
    };

    templates.value.push(template);

    // Save to file system
    await saveTemplateToFile(template);

    // Clear the current template ID since we saved as new
    currentTemplateId.value = null;

    return template;
  }

  async function updateTemplate(name: string, description: string, category: PromptTemplate['category']) {
    if (!currentPrompt.value.structure || !currentTemplateId.value) return;

    const templateIndex = templates.value.findIndex(t => t.id === currentTemplateId.value);
    if (templateIndex === -1) return;

    const existingTemplate = templates.value[templateIndex];

    // Update the template
    const updatedTemplate: PromptTemplate = {
      ...existingTemplate,
      name,
      description,
      category,
      structure: JSON.parse(JSON.stringify(currentPrompt.value.structure)),
      metadata: {
        ...existingTemplate.metadata,
        complexity: complexityScore.value as 'simple' | 'moderate' | 'complex',
        estimatedTokens: tokenEstimate.value,
      }
    };

    // Update in array
    templates.value[templateIndex] = updatedTemplate;

    // Save to file system
    await saveTemplateToFile(updatedTemplate);

    return updatedTemplate;
  }

  async function loadTemplate(templateId: string) {
    const template = templates.value.find(t => t.id === templateId);
    if (!template) return;

    currentPrompt.value = {
      structure: JSON.parse(JSON.stringify(template.structure)),
      metadata: JSON.parse(JSON.stringify(template.metadata))
    };

    // Track the loaded template ID
    currentTemplateId.value = templateId;

    // Don't update usage here - only when actually executed
  }

  function trackTemplateUsage(templateId: string) {
    // For built-in templates, we need to track usage separately
    // since they're not in the templates array
    if (templateId.startsWith('builtin-')) {
      // We could store this in localStorage or just skip tracking for built-in templates
      return;
    }

    const template = templates.value.find(t => t.id === templateId);
    if (!template) return;

    // Update usage statistics
    template.metadata.lastUsed = new Date().toISOString();
    template.metadata.usageCount++;

    // Save updated template (only for user templates)
    saveTemplateToFile(template);
  }

  async function executePrompt(instanceId?: string) {
    const prompt = buildPrompt();
    if (!prompt) {
      throw new Error('No prompt content to execute. Please add some sections to your prompt.');
    }

    // Get the active instance ID if not provided
    const claudeStore = useClaudeInstancesStore();
    const targetInstanceId = instanceId || claudeStore.activeInstanceId;

    if (!targetInstanceId) {
      throw new Error('No active Claude instance. Please start a Claude instance in the terminal first.');
    }

    // Check if the instance actually exists
    const instance = claudeStore.instances.get(targetInstanceId);
    if (!instance) {
      throw new Error('The active Claude instance is no longer available. Please select another instance.');
    }

    const execution: PromptExecution = {
      id: `exec-${Date.now()}`,
      templateId: currentTemplateId.value || undefined,
      prompt,
      resources: currentPrompt.value.structure?.resources || [],
      subagents: currentPrompt.value.structure?.subagents || [],
      timestamp: new Date().toISOString(),
      tokenUsage: tokenEstimate.value,
      success: true // Will be updated based on resul
    };

    executions.value.push(execution);

    try {
      if (window.electronAPI) {
        // Desktop mode - use direct Electron API
        let result = await window.electronAPI.claude.send(targetInstanceId, prompt);
        if (!result.success) {
          throw new Error(result.error || 'Failed to send prompt to Claude');
        }

        // Then send a carriage return to submit it (like pressing Enter)
        result = await window.electronAPI.claude.send(targetInstanceId, '\r');
        if (!result.success) {
          throw new Error(result.error || 'Failed to submit prompt to Claude');
        }
      } else {
        // Remote mode - use Socket.IO to delegate to desktop
        const { remoteConnection } = await import('~/services/remote-client/RemoteConnectionSingleton');
        
        const socket = remoteConnection.getSocket();
        if (!socket?.connected) {
          throw new Error('Not connected to desktop. Please check your connection.');
        }

        // Helper function to make socket requests
        const makeRequest = <T, R>(event: string, payload: T): Promise<R> => {
          return new Promise((resolve, reject) => {
            const request = {
              id: `req-${Date.now()}-${Math.random()}`,
              payload
            };
            
            socket.emit(event, request, (response: any) => {
              if (response.success) {
                resolve(response.data);
              } else {
                reject(new Error(response.error?.message || 'Request failed'));
              }
            });
          });
        };

        // Send the prompt via Socket.IO
        await makeRequest('claude:send', {
          instanceId: targetInstanceId,
          data: prompt
        });

        // Submit the prompt with carriage return
        await makeRequest('claude:send', {
          instanceId: targetInstanceId,
          data: '\r'
        });
      }

      execution.success = true;

      // Track template usage if this was from a template
      if (currentTemplateId.value) {
        trackTemplateUsage(currentTemplateId.value);
      }
    } catch (error) {
      console.error('Failed to send prompt to Claude:', error);
      execution.success = false;
      throw error;
    }

    return execution;
  }

  async function loadTemplatesFromFiles() {
    const tasksStore = useTasksStore();
    
    // In desktop mode, we need projectPath
    if (window.electronAPI && !tasksStore.projectPath) {
      console.log('[PromptEngineering] Skipping template load - no projectPath in desktop mode');
      return;
    }

    console.log('[PromptEngineering] Loading templates, remote mode:', !window.electronAPI);

    try {
      const templatesPath = '.claude/prompts';
      let result;

      if (window.electronAPI) {
        // Desktop mode
        const fullPath = `${tasksStore.projectPath}/${templatesPath}`;
        result = await window.electronAPI.fs.readDir(fullPath);
      } else {
        // Remote mode - use API (server will use global.__currentWorkspace)
        console.log('[PromptEngineering] Loading templates from API:', templatesPath);
        result = await $fetch('/api/files/readdir', {
          query: { path: templatesPath }
        });
        console.log('[PromptEngineering] API result:', result);
      }

      if (result.success && result.files) {
        const jsonFiles = result.files.filter((f: any) => f.name.endsWith('.json'));

        for (const file of jsonFiles) {
          let content;
          
          if (window.electronAPI) {
            // Desktop mode
            const fullPath = `${tasksStore.projectPath}/${templatesPath}`;
            content = await window.electronAPI.fs.readFile(`${fullPath}/${file.name}`);
          } else {
            // Remote mode - use API
            const filePath = `${templatesPath}/${file.name}`;
            try {
              const response = await $fetch('/api/files/read', {
                query: { path: filePath }
              });
              content = { success: true, content: response.content };
            } catch (error) {
              content = { success: false };
            }
          }
          
          if (content.success && content.content) {
            try {
              const template = JSON.parse(content.content);
              // Avoid duplicates
              if (!templates.value.some(t => t.id === template.id)) {
                templates.value.push(template);
              }
            } catch (e) {
              console.error('Failed to parse template:', file.name, e);
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to load templates:', error);
    }
  }

  async function saveTemplateToFile(template: PromptTemplate) {
    const tasksStore = useTasksStore();
    
    // In desktop mode, we need projectPath
    if (window.electronAPI && !tasksStore.projectPath) {
      console.log('[PromptEngineering] Skipping template save - no projectPath in desktop mode');
      return;
    }

    console.log('[PromptEngineering] Saving template:', template.id, 'remote mode:', !window.electronAPI);

    try {
      const templatesPath = '.claude/prompts';

      if (window.electronAPI) {
        // Desktop mode
        const fullPath = `${tasksStore.projectPath}/${templatesPath}`;
        await window.electronAPI.fs.ensureDir(fullPath);
        
        const filePath = `${fullPath}/${template.id}.json`;
        const content = JSON.stringify(template, null, 2);
        await window.electronAPI.fs.writeFile(filePath, content);
      } else {
        // Remote mode - use API (server will use global.__currentWorkspace)
        console.log('[PromptEngineering] Ensuring directory:', templatesPath);
        // Ensure directory exists
        await $fetch('/api/files/ensuredir', {
          method: 'POST',
          body: { path: templatesPath }
        });

        const filePath = `${templatesPath}/${template.id}.json`;
        const content = JSON.stringify(template, null, 2);

        console.log('[PromptEngineering] Writing file:', filePath);
        await $fetch('/api/files/write', {
          method: 'POST',
          body: { path: filePath, content }
        });
        console.log('[PromptEngineering] Template saved successfully');
      }
    } catch (error) {
      console.error('Failed to save template:', error);
    }
  }

  async function deleteTemplate(templateId: string): Promise<boolean> {
    try {
      // Find the template
      const templateIndex = templates.value.findIndex(t => t.id === templateId);
      if (templateIndex === -1) {
        console.error('Template not found:', templateId);
        return false;
      }

      // Don't allow deleting built-in templates
      if (templateId.startsWith('builtin-')) {
        console.warn('Cannot delete built-in templates');
        return false;
      }

      // If this is the currently loaded template, clear i
      if (currentTemplateId.value === templateId) {
        clearCurrentPrompt();
      }

      // Remove from file system
      const tasksStore = useTasksStore();
      
      // In desktop mode, we need projectPath
      if (!window.electronAPI || tasksStore.projectPath) {
        const templatesPath = '.claude/prompts';
        const filePath = `${templatesPath}/${templateId}.json`;

        try {
          if (window.electronAPI) {
            // Desktop mode
            const fullPath = `${tasksStore.projectPath}/${filePath}`;
            await window.electronAPI.fs.delete(fullPath);
          } else {
            // Remote mode - use API (server will use global.__currentWorkspace)
            await $fetch('/api/files/delete', {
              method: 'DELETE',
              query: { path: filePath }
            });
          }
        } catch (error) {
          console.error('Failed to delete template file:', error);
          // Continue with removing from store even if file deletion fails
        }
      }

      // Remove from store
      templates.value.splice(templateIndex, 1);

      return true;
    } catch (error) {
      console.error('Failed to delete template:', error);
      return false;
    }
  }

  function clearCurrentPrompt() {
    currentPrompt.value = {
      structure: {
        sections: [],
        resources: [],
        subagents: []
      },
      metadata: {
        complexity: 'simple',
        estimatedTokens: 0,
        successMetrics: [],
        tags: [],
        createdAt: new Date().toISOString(),
        usageCount: 0
      }
    };
    // Clear the current template ID
    currentTemplateId.value = null;
  }

  function setMode(newMode: 'terminal' | 'studio' | 'chat') {
    mode.value = newMode;
  }

  // Initialize
  async function initialize() {
    await loadTemplatesFromFiles();
  }

  return {
    // State
    templates,
    currentPrompt,
    currentTemplateId,
    executions,
    selectedResources,
    isStudioOpen,
    mode,

    // Computed
    tokenEstimate,
    complexityScore,
    availablePersonalities,

    // Actions
    addSection,
    updateSection,
    removeSection,
    addResource,
    removeResource,
    addSubAgent,
    updateSubAgent,
    removeSubAgent,
    buildPrompt,
    saveTemplate,
    updateTemplate,
    loadTemplate,
    deleteTemplate,
    trackTemplateUsage,
    executePrompt,
    clearCurrentPrompt,
    setMode,
    initialize
  };
});