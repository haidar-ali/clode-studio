<template>
  <div class="mcp-manager">
    <div class="mcp-header">
      <h3>MCP Connections</h3>
      <div class="header-actions">
        <button @click="showAddModal = true" class="primary-button">
          <Icon name="mdi:plus" size="16" />
          Add Server
        </button>
        <button @click="refreshServers" class="icon-button" title="Refresh">
          <Icon name="mdi:refresh" :class="{ 'spinning': isRefreshing }" size="18" />
        </button>
      </div>
    </div>

    <div class="mcp-content">
      <!-- MCP Servers -->
      <div v-if="servers.length > 0" class="server-section">
        <h4 class="section-title">
          <Icon name="mdi:server" size="16" />
          MCP Servers ({{ servers.length }})
        </h4>
        <div class="server-list">
          <MCPServerCard
            v-for="server in servers"
            :key="server.name"
            :server="server"
            @refresh="refreshServerDetails"
            @remove="removeServer"
          />
        </div>
      </div>

      <!-- Empty State -->
      <div v-if="servers.length === 0" class="empty-state">
        <Icon name="mdi:server-network-off" size="48" />
        <h4>No MCP Servers Configured</h4>
        <p>Add your first MCP server to extend Claude's capabilities</p>
        <button @click="showAddModal = true" class="primary-button">
          <Icon name="mdi:plus" size="16" />
          Add Server
        </button>
      </div>

      <!-- Loading State -->
      <div v-if="mcpStore.isLoading" class="loading-state">
        <Icon name="mdi:loading" class="spinning" size="32" />
        <p>Loading MCP servers...</p>
      </div>
    </div>

    <!-- Add Server Modal -->
    <div v-if="showAddModal" class="modal-overlay" @click="closeAddModal">
      <div class="modal" @click.stop>
        <div class="modal-header">
          <h3>Add MCP Server</h3>
          <button @click="closeAddModal" class="close-button">
            <Icon name="mdi:close" />
          </button>
        </div>

        <form @submit.prevent="addServer" class="modal-form">
          <div class="form-group">
            <label for="server-name">Server Name</label>
            <input
              id="server-name"
              v-model="serverForm.name"
              type="text"
              required
              placeholder="my-server"
            />
          </div>

          <div class="form-group">
            <label for="server-type">Connection Type</label>
            <select id="server-type" v-model="serverForm.type" @change="onTypeChange">
              <option value="stdio">Stdio (Local Command)</option>
              <option value="sse">SSE (Server-Sent Events)</option>
              <option value="http">HTTP</option>
            </select>
          </div>

          <!-- Stdio Configuration -->
          <div v-if="serverForm.type === 'stdio'" class="type-config">
            <div class="form-group">
              <label for="server-command">Command</label>
              <input
                id="server-command"
                v-model="serverForm.command"
                type="text"
                required
                placeholder="/path/to/server or npx @example/server"
              />
              <small>The command to run the MCP server</small>
            </div>

            <div class="form-group">
              <label for="server-args">Arguments (optional)</label>
              <input
                id="server-args"
                v-model="serverForm.argsString"
                type="text"
                placeholder="--arg1 value1 --arg2 value2"
              />
              <small>Space-separated command arguments</small>
            </div>
          </div>

          <!-- SSE/HTTP Configuration -->
          <div v-else class="type-config">
            <div class="form-group">
              <label for="server-url">Server URL</label>
              <input
                id="server-url"
                v-model="serverForm.url"
                type="url"
                required
                placeholder="http://localhost:3000"
              />
              <small>The URL of the {{ serverForm.type.toUpperCase() }} server</small>
            </div>
          </div>

          <!-- Environment Variables -->
          <div class="form-group">
            <label>Environment Variables (optional)</label>
            <div class="env-vars">
              <div v-for="(env, index) in serverForm.envVars" :key="index" class="env-var-row">
                <input
                  v-model="env.key"
                  type="text"
                  placeholder="KEY"
                  class="env-key"
                />
                <input
                  v-model="env.value"
                  type="text"
                  placeholder="value"
                  class="env-value"
                />
                <button
                  type="button"
                  @click="removeEnvVar(index)"
                  class="icon-button small"
                >
                  <Icon name="mdi:close" size="14" />
                </button>
              </div>
              <button
                type="button"
                @click="addEnvVar"
                class="text-button"
              >
                <Icon name="mdi:plus" size="14" />
                Add Variable
              </button>
            </div>
          </div>

          <div class="form-actions">
            <button
              type="button"
              @click="testConnection"
              class="test-button"
              :disabled="isTestingConnection"
            >
              <Icon name="mdi:connection" size="16" />
              {{ isTestingConnection ? 'Testing...' : 'Test Connection' }}
            </button>
            <div class="spacer"></div>
            <button type="button" @click="closeAddModal" class="cancel-button">
              Cancel
            </button>
            <button type="submit" class="save-button">
              Add Server
            </button>
          </div>

          <div v-if="testResult" class="test-result" :class="testResult.success ? 'success' : 'error'">
            <Icon :name="testResult.success ? 'mdi:check-circle' : 'mdi:alert-circle'" />
            <span>{{ testResult.message }}</span>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useMCPStore } from '~/stores/mcp';
import type { MCPServerConfig } from '~/stores/mcp';

const mcpStore = useMCPStore();

const showAddModal = ref(false);
const isRefreshing = ref(false);
const isTestingConnection = ref(false);
const testResult = ref<{ success: boolean; message: string } | null>(null);

const serverForm = ref({
  name: '',
  type: 'stdio' as 'stdio' | 'sse' | 'http',
  command: '',
  argsString: '',
  url: '',
  envVars: [] as { key: string; value: string }[],
});

const servers = computed(() => mcpStore.servers);
const connectedServers = computed(() => mcpStore.servers); // All servers from Claude CLI are considered connected

const refreshServers = async () => {
  isRefreshing.value = true;
  await mcpStore.loadServers();
  setTimeout(() => {
    isRefreshing.value = false;
  }, 1000);
};

// Claude CLI manages connections, so we just refresh the details
const refreshServerDetails = async (name: string) => {
  await mcpStore.getServerDetails(name);
};

const removeServer = async (name: string) => {
  if (confirm(`Remove MCP server "${name}"?`)) {
    await mcpStore.removeServer(name);
  }
};

const onTypeChange = () => {
  testResult.value = null;
};

const addEnvVar = () => {
  serverForm.value.envVars.push({ key: '', value: '' });
};

const removeEnvVar = (index: number) => {
  serverForm.value.envVars.splice(index, 1);
};

const testConnection = async () => {
  isTestingConnection.value = true;
  testResult.value = null;

  try {
    const config = buildServerConfig();
    const result = await mcpStore.testServer(config);
    
    testResult.value = {
      success: result.success,
      message: result.success ? 'Connection successful!' : (result.error || 'Connection failed'),
    };
  } catch (error) {
    testResult.value = {
      success: false,
      message: error instanceof Error ? error.message : 'Test failed',
    };
  } finally {
    isTestingConnection.value = false;
  }
};

const buildServerConfig = (): MCPServerConfig => {
  const config: MCPServerConfig = {
    name: serverForm.value.name,
    type: serverForm.value.type,
  };

  if (serverForm.value.type === 'stdio') {
    config.command = serverForm.value.command;
    if (serverForm.value.argsString.trim()) {
      config.args = serverForm.value.argsString.trim().split(/\s+/);
    }
  } else {
    config.url = serverForm.value.url;
  }

  // Add environment variables
  if (serverForm.value.envVars.length > 0) {
    config.env = {};
    for (const env of serverForm.value.envVars) {
      if (env.key && env.value) {
        config.env[env.key] = env.value;
      }
    }
  }

  return config;
};

const addServer = async () => {
  if (!serverForm.value.name) return;

  try {
    const config = buildServerConfig();
    await mcpStore.addServer(config);
    closeAddModal();
  } catch (error) {
    alert(`Failed to add server: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

const closeAddModal = () => {
  showAddModal.value = false;
  // Reset form
  serverForm.value = {
    name: '',
    type: 'stdio',
    command: '',
    argsString: '',
    url: '',
    envVars: [],
  };
  testResult.value = null;
};

onMounted(async () => {
  await mcpStore.loadServers();
});
</script>

<style scoped>
.mcp-manager {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
}

.mcp-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid #2d2d30;
}

.mcp-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 500;
  color: #cccccc;
}

.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.primary-button {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: #007acc;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
}

.primary-button:hover {
  background: #005a9e;
}

.icon-button {
  background: none;
  border: none;
  color: #cccccc;
  cursor: pointer;
  padding: 6px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-button:hover {
  background: #2d2d30;
}

.icon-button.small {
  padding: 2px;
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.mcp-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.server-section {
  margin-bottom: 24px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 500;
  color: #cccccc;
}

.server-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 48px 24px;
  color: #858585;
}

.empty-state h4 {
  margin: 16px 0 8px 0;
  font-size: 16px;
  font-weight: 500;
}

.empty-state p {
  margin: 0 0 24px 0;
  font-size: 14px;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px;
  color: #858585;
  gap: 16px;
}

/* Modal Styles */
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
  border-radius: 8px;
  width: 90%;
  max-width: 600px;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #3e3e42;
}

.modal-header h3 {
  margin: 0;
  font-size: 16px;
}

.close-button {
  background: none;
  border: none;
  color: #cccccc;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
}

.close-button:hover {
  background: #3e3e42;
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
  font-size: 13px;
  color: #cccccc;
  font-weight: 500;
}

.form-group input,
.form-group select {
  width: 100%;
  padding: 8px 12px;
  background: #3c3c3c;
  border: 1px solid #6c6c6c;
  border-radius: 4px;
  color: #d4d4d4;
  font-size: 14px;
}

.form-group input:focus,
.form-group select:focus {
  outline: none;
  border-color: #007acc;
  box-shadow: 0 0 0 1px #007acc;
}

.form-group small {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: #858585;
}

.type-config {
  margin: 16px 0;
  padding: 16px;
  background: #2d2d30;
  border-radius: 4px;
}

.env-vars {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.env-var-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.env-key {
  flex: 0 0 120px;
}

.env-value {
  flex: 1;
}

.text-button {
  background: none;
  border: none;
  color: #007acc;
  cursor: pointer;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
}

.text-button:hover {
  text-decoration: underline;
}

.form-actions {
  display: flex;
  align-items: center;
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid #3e3e42;
}

.test-button {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: #3e3e42;
  color: #cccccc;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}

.test-button:hover:not(:disabled) {
  background: #4e4e52;
}

.test-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.spacer {
  flex: 1;
}

.cancel-button,
.save-button {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  margin-left: 8px;
}

.cancel-button {
  background: #3e3e42;
  color: #cccccc;
}

.cancel-button:hover {
  background: #4e4e52;
}

.save-button {
  background: #007acc;
  color: white;
}

.save-button:hover {
  background: #005a9e;
}

.test-result {
  margin-top: 16px;
  padding: 12px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.test-result.success {
  background: rgba(78, 201, 176, 0.2);
  color: #4ec9b0;
  border: 1px solid rgba(78, 201, 176, 0.4);
}

.test-result.error {
  background: rgba(244, 135, 113, 0.2);
  color: #f48771;
  border: 1px solid rgba(244, 135, 113, 0.4);
}
</style>