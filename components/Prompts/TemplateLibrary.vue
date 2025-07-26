<template>
  <div class="template-library">
    <div class="library-header">
      <h3>Template Library</h3>
      <div class="header-actions">
        <select v-model="filterCategory" class="category-filter">
          <option value="">All Categories</option>
          <option value="coding">Coding</option>
          <option value="research">Research</option>
          <option value="analysis">Analysis</option>
          <option value="refactoring">Refactoring</option>
          <option value="debugging">Debugging</option>
          <option value="custom">Custom</option>
        </select>
      </div>
    </div>

    <div class="search-box">
      <Icon name="heroicons:magnifying-glass" />
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Search templates..."
      >
    </div>

    <div class="template-list">
      <!-- Built-in Templates -->
      <div v-if="filteredBuiltInTemplates.length > 0" class="template-section">
        <h4>Built-in Templates</h4>
        <div
          v-for="template in filteredBuiltInTemplates"
          :key="template.id"
          class="template-card"
          @click="loadTemplate(template)"
        >
          <div class="template-header">
            <Icon :name="getCategoryIcon(template.category)" />
            <span class="template-name">{{ template.name }}</span>
          </div>
          <p class="template-description">{{ template.description }}</p>
          <div class="template-meta">
            <span class="meta-item category">
              <Icon :name="getCategoryIcon(template.category)" />
              {{ template.category }}
            </span>
            <span class="meta-item">
              <Icon name="heroicons:calculator" />
              ~{{ template.metadata.estimatedTokens }} tokens
            </span>
            <span class="meta-item complexity" :class="template.metadata.complexity">
              {{ template.metadata.complexity }}
            </span>
          </div>
        </div>
      </div>

      <!-- User Templates -->
      <div v-if="filteredUserTemplates.length > 0" class="template-section">
        <h4>Your Templates</h4>
        <div
          v-for="template in filteredUserTemplates"
          :key="template.id"
          class="template-card user-template"
          @click="loadTemplate(template)"
        >
          <div class="template-header">
            <Icon :name="getCategoryIcon(template.category)" />
            <span class="template-name">{{ template.name }}</span>
            <button class="delete-btn" @click.stop="deleteTemplate(template.id)">
              <Icon name="heroicons:trash" />
            </button>
          </div>
          <p class="template-description">{{ template.description }}</p>
          <div class="template-meta">
            <span class="meta-item category">
              <Icon :name="getCategoryIcon(template.category)" />
              {{ template.category }}
            </span>
            <span class="meta-item">
              <Icon name="heroicons:calculator" />
              ~{{ template.metadata.estimatedTokens }} tokens
            </span>
            <span class="meta-item">
              <Icon name="heroicons:clock" />
              Used {{ template.metadata.usageCount }} times
            </span>
            <span class="meta-item complexity" :class="template.metadata.complexity">
              {{ template.metadata.complexity }}
            </span>
          </div>
        </div>
      </div>

      <div v-if="filteredTemplates.length === 0" class="empty-state">
        <Icon name="heroicons:document-text" />
        <p>No templates found</p>
        <span>Try a different search or category</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue';
import { usePromptEngineeringStore } from '~/stores/prompt-engineering';
import type { PromptTemplate } from '~/stores/prompt-engineering';

const promptStore = usePromptEngineeringStore();

const searchQuery = ref('');
const filterCategory = ref('');

// Built-in templates
const builtInTemplates: PromptTemplate[] = [
  {
    id: 'builtin-refactor',
    name: 'Smart Refactoring',
    description: 'Analyze and refactor code following best practices',
    category: 'refactoring',
    structure: {
      sections: [
        {
          id: 's1',
          type: 'system',
          label: 'System Prompt',
          content: 'You are an expert software engineer specializing in code refactoring and optimization.'
        },
        {
          id: 's2',
          type: 'instruction',
          label: 'Instructions',
          content: `Analyze the provided code and suggest refactoring improvements:
1. Identify code smells and anti-patterns
2. Suggest design pattern applications
3. Improve code readability and maintainability
4. Optimize performance where possible
5. Ensure all tests still pass`
        },
        {
          id: 's3',
          type: 'constraint',
          label: 'Constraints',
          content: `• Preserve all public APIs
• Follow existing code style conventions
• Maintain backward compatibility
• Add comments for complex changes
• Keep changes atomic and testable`
        }
      ],
      resources: [],
      subagents: []
    },
    metadata: {
      complexity: 'moderate',
      estimatedTokens: 500,
      successMetrics: ['Code quality improved', 'Tests pass', 'Performance gains'],
      tags: ['refactoring', 'code-quality'],
      createdAt: new Date().toISOString(),
      usageCount: 0
    }
  },
  {
    id: 'builtin-debug',
    name: 'Bug Detective',
    description: 'Multi-agent debugging with specialized analysis',
    category: 'debugging',
    structure: {
      sections: [
        {
          id: 's1',
          type: 'system',
          label: 'System Prompt',
          content: 'You are a debugging specialist who coordinates multiple agents to find and fix bugs.'
        },
        {
          id: 's2',
          type: 'context',
          label: 'Context',
          content: 'Error logs and stack traces will be provided here'
        }
      ],
      resources: [],
      subagents: [
        {
          id: 'agent1',
          name: 'Error Analyzer',
          role: 'Analyze error messages and stack traces',
          personality: 'analyzer',
          tasks: ['Parse error messages', 'Identify root causes', 'Trace execution flow'],
          tools: ['read_file', 'search_files'],
          constraints: ['Focus on error origin', 'Check related files'],
          outputFormat: 'markdown'
        },
        {
          id: 'agent2',
          name: 'Test Creator',
          role: 'Create tests to reproduce and verify fixes',
          personality: 'qa',
          tasks: ['Write reproduction tests', 'Verify fixes work', 'Add edge case tests'],
          tools: ['write_file', 'run_bash_command'],
          constraints: ['Tests must be deterministic', 'Cover edge cases'],
          outputFormat: 'code'
        }
      ]
    },
    metadata: {
      complexity: 'complex',
      estimatedTokens: 800,
      successMetrics: ['Bug identified', 'Fix implemented', 'Tests added'],
      tags: ['debugging', 'multi-agent'],
      createdAt: new Date().toISOString(),
      usageCount: 0
    }
  },
  {
    id: 'builtin-api-docs',
    name: 'API Documentation Generator',
    description: 'Generate comprehensive API documentation',
    category: 'research',
    structure: {
      sections: [
        {
          id: 's1',
          type: 'instruction',
          label: 'Instructions',
          content: `Generate comprehensive API documentation including:
1. Endpoint descriptions
2. Request/response schemas
3. Authentication requirements
4. Error codes and handling
5. Usage examples`
        },
        {
          id: 's2',
          type: 'output',
          label: 'Output Format',
          content: 'Generate documentation in OpenAPI 3.0 format with markdown descriptions'
        }
      ],
      resources: [],
      subagents: []
    },
    metadata: {
      complexity: 'simple',
      estimatedTokens: 300,
      successMetrics: ['Complete API coverage', 'Clear examples', 'Valid OpenAPI spec'],
      tags: ['documentation', 'api'],
      createdAt: new Date().toISOString(),
      usageCount: 0
    }
  }
];

const userTemplates = computed(() => promptStore.templates);

const filteredBuiltInTemplates = computed(() => {
  return builtInTemplates.filter(template => {
    const matchesSearch = !searchQuery.value ||
      template.name.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      template.description.toLowerCase().includes(searchQuery.value.toLowerCase());

    const matchesCategory = !filterCategory.value ||
      template.category === filterCategory.value;

    return matchesSearch && matchesCategory;
  });
});

const filteredUserTemplates = computed(() => {
  return userTemplates.value.filter(template => {
    const matchesSearch = !searchQuery.value ||
      template.name.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      template.description.toLowerCase().includes(searchQuery.value.toLowerCase());

    const matchesCategory = !filterCategory.value ||
      template.category === filterCategory.value;

    return matchesSearch && matchesCategory;
  });
});

const filteredTemplates = computed(() => [
  ...filteredBuiltInTemplates.value,
  ...filteredUserTemplates.value
]);

function getCategoryIcon(category: string): string {
  const icons: Record<string, string> = {
    coding: 'heroicons:code-bracket',
    research: 'heroicons:magnifying-glass',
    analysis: 'heroicons:chart-bar',
    refactoring: 'heroicons:arrow-path',
    debugging: 'heroicons:bug-ant',
    custom: 'heroicons:sparkles'
  };
  return icons[category] || 'heroicons:document';
}

async function loadTemplate(template: PromptTemplate) {
  if (template.id.startsWith('builtin-')) {
    // For built-in templates, load them directly without adding to user templates
    promptStore.currentPrompt = {
      structure: JSON.parse(JSON.stringify(template.structure)),
      metadata: JSON.parse(JSON.stringify(template.metadata))
    };

    // Set the current template ID for tracking
    promptStore.currentTemplateId = template.id;
  } else {
    // Load user template through the store
    await promptStore.loadTemplate(template.id);
  }
}

async function deleteTemplate(templateId: string) {
  if (confirm('Are you sure you want to delete this template?')) {
    const success = await promptStore.deleteTemplate(templateId);
    if (success) {
      // Force a re-render by triggering reactivity
      await nextTick();
    } else {
      alert('Failed to delete template. Please try again.');
    }
  }
}
</script>

<style scoped>
.template-library {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.library-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid #2d2d30;
}

.library-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #cccccc;
}

.category-filter {
  padding: 6px 8px;
  border: 1px solid #3c3c3c;
  border-radius: 4px;
  background-color: #2d2d30;
  color: #cccccc;
  font-size: 12px;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background-color: #2d2d30;
  border-bottom: 1px solid #181818;
}

.search-box input {
  flex: 1;
  padding: 6px 8px;
  border: 1px solid #3c3c3c;
  border-radius: 4px;
  background-color: #1e1e1e;
  color: #cccccc;
  font-size: 13px;
}

.search-box input:focus {
  outline: none;
  border-color: #007acc;
}

.template-list {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
}

.template-section {
  margin-bottom: 24px;
}

.template-section h4 {
  margin: 0 0 12px 0;
  font-size: 12px;
  font-weight: 600;
  color: #858585;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.template-card {
  margin-bottom: 12px;
  padding: 12px;
  border: 1px solid #2d2d30;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.template-card:hover {
  background-color: #3e3e42;
  border-color: #007acc;
}

.template-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.template-name {
  flex: 1;
  font-size: 14px;
  font-weight: 500;
  color: #cccccc;
}

.delete-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: none;
  color: #858585;
  cursor: pointer;
  border-radius: 4px;
  opacity: 0;
  transition: all 0.2s;
}

.template-card:hover .delete-btn {
  opacity: 1;
}

.delete-btn:hover {
  background-color: #3e3e42;
  color: #cd3131;
}

.template-description {
  margin: 0 0 8px 0;
  font-size: 12px;
  color: #858585;
  line-height: 1.4;
}

.template-meta {
  display: flex;
  align-items: center;
  gap: 12px;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #858585;
}

.meta-item svg {
  width: 14px;
  height: 14px;
}

.complexity.simple { color: #10b981; }
.complexity.moderate { color: #f59e0b; }
.complexity.complex { color: #ef4444; }

.meta-item.category {
  color: #007acc;
  text-transform: capitalize;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px 20px;
  color: #858585;
  text-align: center;
}

.empty-state svg {
  width: 48px;
  height: 48px;
  opacity: 0.5;
}

.empty-state p {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
}

.empty-state span {
  font-size: 12px;
}

/* Scrollbar styling */
.template-list::-webkit-scrollbar {
  width: 8px;
}

.template-list::-webkit-scrollbar-track {
  background: #1e1e1e;
}

.template-list::-webkit-scrollbar-thumb {
  background: #424242;
  border-radius: 4px;
}

.template-list::-webkit-scrollbar-thumb:hover {
  background: #4f4f4f;
}
</style>