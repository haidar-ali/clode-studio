<template>
  <div class="subagent-designer">
    <div class="designer-header">
      <h3>SubAgents</h3>
      <button class="add-btn" @click="addSubAgent">
        <Icon name="heroicons:plus" />
        Add SubAgent
      </button>
    </div>

    <div v-if="subagents.length === 0" class="empty-state">
      <Icon name="heroicons:users" />
      <p>No subagents defined</p>
      <span>Add subagents to delegate specific tasks</span>
    </div>

    <div v-else class="subagent-list">
      <div 
        v-for="agent in subagents" 
        :key="agent.id"
        class="subagent-card"
      >
        <div class="agent-header">
          <input 
            v-model="agent.name" 
            class="agent-name"
            placeholder="Agent Name"
            @change="updateAgent(agent.id)"
          >
          <button class="remove-btn" @click="removeAgent(agent.id)">
            <Icon name="heroicons:trash" />
          </button>
        </div>

        <div class="agent-body">
          <!-- Role -->
          <div class="form-group">
            <label>Role</label>
            <input 
              v-model="agent.role" 
              placeholder="e.g., Error Analyzer, Test Writer"
              @change="updateAgent(agent.id)"
            >
          </div>

          <!-- Personality -->
          <div class="form-group">
            <label>Personality</label>
            <select v-model="agent.personality" @change="updateAgent(agent.id)">
              <option 
                v-for="personality in personalities" 
                :key="personality.id"
                :value="personality.id"
              >
                {{ personality.name }}
              </option>
            </select>
          </div>

          <!-- Tasks -->
          <div class="form-group">
            <label>Tasks</label>
            <div class="task-list">
              <div 
                v-for="(task, index) in agent.tasks" 
                :key="index"
                class="task-item"
              >
                <input 
                  v-model="agent.tasks[index]" 
                  placeholder="Task description"
                  @change="updateAgent(agent.id)"
                >
                <button class="remove-btn" @click="removeTask(agent.id, index)">
                  <Icon name="heroicons:x-mark" />
                </button>
              </div>
              <button class="add-task-btn" @click="addTask(agent.id)">
                <Icon name="heroicons:plus" />
                Add Task
              </button>
            </div>
          </div>

          <!-- Tools -->
          <div class="form-group">
            <label>Allowed Tools</label>
            <div class="tool-selector">
              <div 
                v-for="tool in availableTools" 
                :key="tool"
                class="tool-checkbox"
              >
                <input 
                  :id="`${agent.id}-${tool}`"
                  type="checkbox"
                  :checked="agent.tools.includes(tool)"
                  @change="toggleTool(agent.id, tool)"
                >
                <label :for="`${agent.id}-${tool}`">{{ tool }}</label>
              </div>
            </div>
          </div>

          <!-- Output Format -->
          <div class="form-group">
            <label>Output Format</label>
            <select v-model="agent.outputFormat" @change="updateAgent(agent.id)">
              <option value="markdown">Markdown</option>
              <option value="json">JSON</option>
              <option value="text">Plain Text</option>
              <option value="code">Code</option>
            </select>
          </div>

          <!-- Constraints -->
          <div class="form-group">
            <label>Constraints</label>
            <textarea 
              v-model="constraintsText[agent.id]"
              placeholder="One constraint per line"
              rows="3"
              @change="updateConstraints(agent.id)"
            ></textarea>
          </div>

          <!-- Resources -->
          <div class="form-group">
            <label>Resources</label>
            <div class="resources-section">
              <div v-if="agent.resources && agent.resources.length > 0" class="resource-list">
                <div 
                  v-for="(resource, index) in agent.resources" 
                  :key="`${resource.type}-${resource.id}`"
                  class="resource-item"
                >
                  <Icon :name="getResourceIcon(resource.type)" />
                  <span>{{ resource.name }}</span>
                  <button class="remove-btn" @click="removeAgentResource(agent.id, index)">
                    <Icon name="heroicons:x-mark" />
                  </button>
                </div>
              </div>
              <button class="add-resource-btn" @click="$emit('open-resources', agent.id)">
                <Icon name="heroicons:plus" />
                Add Resource
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { usePromptEngineeringStore } from '~/stores/prompt-engineering';
import { useMCPStore } from '~/stores/mcp';

const promptStore = usePromptEngineeringStore();
const mcpStore = useMCPStore();

const emit = defineEmits<{
  'open-resources': [subagentId: string];
}>();

const subagents = computed(() => promptStore.currentPrompt.structure?.subagents || []);
const personalities = computed(() => {
  // Convert Map to array for v-for
  return Array.from(promptStore.availablePersonalities.values());
});

const constraintsText = ref<Record<string, string>>({});

// Initialize constraints text
watch(subagents, (agents) => {
  agents.forEach(agent => {
    if (!constraintsText.value[agent.id]) {
      constraintsText.value[agent.id] = agent.constraints.join('\n');
    }
  });
}, { immediate: true });

// Combine built-in tools with MCP tools
const availableTools = computed(() => {
  const builtInTools = [
    'read_file',
    'write_file',
    'search_files',
    'run_bash_command',
    'web_search',
    'analyze_code'
  ];
  
  // Get all MCP tools from connected servers
  const servers = mcpStore.servers || [];
  const mcpTools = servers
    .filter(server => server && server.status === 'connected')
    .flatMap(server => 
      (server.tools || []).map(tool => `${server.name}:${tool.name}`)
    );
  
  return [...builtInTools, ...mcpTools];
});

function addSubAgent() {
  promptStore.addSubAgent();
}

function updateAgent(id: string) {
  const agent = subagents.value.find(a => a.id === id);
  if (agent) {
    promptStore.updateSubAgent(id, agent);
  }
}

function removeAgent(id: string) {
  promptStore.removeSubAgent(id);
  delete constraintsText.value[id];
}

function addTask(agentId: string) {
  const agent = subagents.value.find(a => a.id === agentId);
  if (agent) {
    agent.tasks.push('');
    updateAgent(agentId);
  }
}

function removeTask(agentId: string, index: number) {
  const agent = subagents.value.find(a => a.id === agentId);
  if (agent) {
    agent.tasks.splice(index, 1);
    updateAgent(agentId);
  }
}

function toggleTool(agentId: string, tool: string) {
  const agent = subagents.value.find(a => a.id === agentId);
  if (agent) {
    const index = agent.tools.indexOf(tool);
    if (index > -1) {
      agent.tools.splice(index, 1);
    } else {
      agent.tools.push(tool);
    }
    updateAgent(agentId);
  }
}

function updateConstraints(agentId: string) {
  const agent = subagents.value.find(a => a.id === agentId);
  if (agent) {
    agent.constraints = constraintsText.value[agentId]
      .split('\n')
      .filter(line => line.trim())
      .map(line => line.trim());
    updateAgent(agentId);
  }
}

function removeAgentResource(agentId: string, index: number) {
  const agent = subagents.value.find(a => a.id === agentId);
  if (agent && agent.resources) {
    agent.resources.splice(index, 1);
    updateAgent(agentId);
  }
}

function getResourceIcon(type: string): string {
  const icons: Record<string, string> = {
    file: 'heroicons:document',
    knowledge: 'heroicons:book-open',
    hook: 'heroicons:bolt',
    mcp: 'heroicons:server',
    command: 'heroicons:command-line'
  };
  return icons[type] || 'heroicons:document';
}

// Load MCP servers on mount
onMounted(async () => {
  if (mcpStore.servers.length === 0) {
    await mcpStore.loadServers();
  }
});
</script>

<style scoped>
.subagent-designer {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.designer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid #2d2d30;
}

.designer-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #cccccc;
}

.add-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border: 1px solid #007acc;
  border-radius: 6px;
  background-color: #007acc;
  color: white;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
}

.add-btn:hover {
  background-color: #005a9e;
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 20px;
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

.subagent-list {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
}

.subagent-card {
  margin-bottom: 16px;
  border: 1px solid #2d2d30;
  border-radius: 8px;
  overflow: hidden;
}

.agent-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background-color: #2d2d30;
  border-bottom: 1px solid #181818;
}

.agent-name {
  flex: 1;
  padding: 6px 8px;
  border: 1px solid #3c3c3c;
  border-radius: 4px;
  background-color: #1e1e1e;
  color: #cccccc;
  font-size: 14px;
  font-weight: 500;
}

.agent-name:focus {
  outline: none;
  border-color: #007acc;
}

.remove-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: none;
  color: #858585;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s;
}

.remove-btn:hover {
  background-color: #3e3e42;
  color: #cd3131;
}

.agent-body {
  padding: 16px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  font-weight: 500;
  color: #cccccc;
}

.form-group input,
.form-group select,
.form-group textarea {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid #3c3c3c;
  border-radius: 4px;
  background-color: #3c3c3c;
  color: #cccccc;
  font-size: 13px;
}

.form-group input:focus,
.form-group select:focus,
.form-group textarea:focus {
  outline: none;
  border-color: #007acc;
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.task-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.task-item input {
  flex: 1;
}

.add-task-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: 1px dashed #3c3c3c;
  border-radius: 4px;
  background: none;
  color: #858585;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
}

.add-task-btn:hover {
  border-color: #007acc;
  color: #007acc;
}

.tool-selector {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.tool-checkbox {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.tool-checkbox input {
  width: auto;
  margin: 0;
}

.tool-checkbox label {
  margin: 0;
  font-weight: normal;
  color: #cccccc;
  cursor: pointer;
}

/* Resources section */
.resources-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.resource-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.resource-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background-color: #2d2d30;
  border-radius: 4px;
  font-size: 12px;
}

.resource-item svg {
  width: 14px;
  height: 14px;
  color: #858585;
}

.resource-item span {
  flex: 1;
  color: #cccccc;
}

.add-resource-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px dashed #3c3c3c;
  border-radius: 4px;
  background: none;
  color: #858585;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
}

.add-resource-btn:hover {
  border-color: #007acc;
  color: #007acc;
  background-color: rgba(0, 122, 204, 0.1);
}
</style>