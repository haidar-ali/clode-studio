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
  personality: ClaudePersonality;
  tasks: string[];
  tools: string[];
  constraints: string[];
  outputFormat: string;
}

export interface ResourceReference {
  type: 'file' | 'knowledge' | 'hook' | 'mcp' | 'command';
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
      personality: subagent.personality || 'full-stack',
      tasks: subagent.tasks || [],
      tools: subagent.tools || [],
      constraints: subagent.constraints || [],
      outputFormat: subagent.outputFormat || 'markdown'
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
          return `<subagent id="${agent.id}" name="${agent.name}">
Role: ${agent.role}
Personality: ${agent.personality}
Tasks: ${agent.tasks.join(', ')}
Tools: ${agent.tools.join(', ')}
Constraints: ${agent.constraints.join(', ')}
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
    
    return template;
  }
  
  async function loadTemplate(templateId: string) {
    const template = templates.value.find(t => t.id === templateId);
    if (!template) return;
    
    currentPrompt.value = {
      structure: JSON.parse(JSON.stringify(template.structure)),
      metadata: JSON.parse(JSON.stringify(template.metadata))
    };
    
    // Update usage
    template.metadata.lastUsed = new Date().toISOString();
    template.metadata.usageCount++;
  }
  
  async function executePrompt(instanceId?: string) {
    const prompt = buildPrompt();
    if (!prompt) return;
    
    // Get the active instance ID if not provided
    const targetInstanceId = instanceId || useClaudeInstancesStore().activeInstanceId;
    if (!targetInstanceId) {
      throw new Error('No active Claude instance to send prompt to');
    }
    
    const execution: PromptExecution = {
      id: `exec-${Date.now()}`,
      templateId: undefined, // Set if using a template
      prompt,
      resources: currentPrompt.value.structure?.resources || [],
      subagents: currentPrompt.value.structure?.subagents || [],
      timestamp: new Date().toISOString(),
      tokenUsage: tokenEstimate.value,
      success: true // Will be updated based on result
    };
    
    executions.value.push(execution);
    
    try {
      // Send the prompt to the Claude instance
      await window.electronAPI.claude.send(targetInstanceId, prompt);
      execution.success = true;
    } catch (error) {
      console.error('Failed to send prompt to Claude:', error);
      execution.success = false;
      throw error;
    }
    
    return execution;
  }
  
  async function loadTemplatesFromFiles() {
    const tasksStore = useTasksStore();
    if (!tasksStore.projectPath) return;
    
    try {
      const templatesPath = `${tasksStore.projectPath}/.claude/prompts`;
      const result = await window.electronAPI.fs.readDir(templatesPath);
      
      if (result.success && result.files) {
        const jsonFiles = result.files.filter((f: any) => f.name.endsWith('.json'));
        
        for (const file of jsonFiles) {
          const content = await window.electronAPI.fs.readFile(`${templatesPath}/${file.name}`);
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
    if (!tasksStore.projectPath) return;
    
    try {
      const templatesPath = `${tasksStore.projectPath}/.claude/prompts`;
      
      // Ensure directory exists
      await window.electronAPI.fs.ensureDir(templatesPath);
      
      const filePath = `${templatesPath}/${template.id}.json`;
      const content = JSON.stringify(template, null, 2);
      
      await window.electronAPI.fs.writeFile(filePath, content);
    } catch (error) {
      console.error('Failed to save template:', error);
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
    loadTemplate,
    executePrompt,
    clearCurrentPrompt,
    setMode,
    initialize
  };
});