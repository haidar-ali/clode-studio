<template>
  <div class="lsp-status">
    <h4>Language Server Status</h4>
    
    <div v-if="!lspEnabled" class="status-disabled">
      LSP is disabled. Enable it in autocomplete settings.
    </div>
    
    <div v-else>
      <div class="server-list">
        <div class="section-title">Available Servers</div>
        <div v-if="availableServers.length === 0" class="no-servers">
          No language servers found. Install them to get better completions:
        </div>
        <div v-else class="servers">
          <div 
            v-for="server in availableServers" 
            :key="server"
            class="server-item"
            :class="{ active: activeServers.includes(server) }"
          >
            <Icon 
              :name="activeServers.includes(server) ? 'mdi:check-circle' : 'mdi:circle-outline'" 
              :color="activeServers.includes(server) ? '#4ec9b0' : '#858585'"
              size="16" 
            />
            <span>{{ server }}</span>
          </div>
        </div>
      </div>
      
      <div class="install-guide">
        <div class="section-title">Installation Commands</div>
        <div class="commands">
          <div class="command-item">
            <code>npm install -g typescript-language-server typescript</code>
            <span class="lang">TypeScript/JavaScript</span>
          </div>
          <div class="command-item">
            <code>pip install python-lsp-server[all]</code>
            <span class="lang">Python</span>
          </div>
          <div class="command-item">
            <code>rustup component add rust-analyzer</code>
            <span class="lang">Rust</span>
          </div>
          <div class="command-item">
            <code>go install golang.org/x/tools/gopls@latest</code>
            <span class="lang">Go</span>
          </div>
          <div class="command-item">
            <code>npm install -g @vue/language-server</code>
            <span class="lang">Vue</span>
          </div>
          <div class="command-item">
            <code>npm install -g vscode-langservers-extracted</code>
            <span class="lang">HTML/CSS/JSON</span>
          </div>
        </div>
      </div>
      
      <button @click="refreshStatus" class="refresh-btn">
        <Icon name="mdi:refresh" size="16" />
        Refresh Status
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useAutocompleteStore } from '~/stores/autocomplete';

const autocompleteStore = useAutocompleteStore();

const availableServers = computed(() => autocompleteStore.lspStatus.availableServers);
const activeServers = ref<string[]>([]);
const lspEnabled = computed(() => autocompleteStore.settings.providers.lsp.enabled);

const refreshStatus = async () => {
  // Check available servers
  await autocompleteStore.checkLSPServers();
  
  // Update connected servers
  await autocompleteStore.updateLSPConnectedServers();
  
  // Use the store's connected servers
  activeServers.value = autocompleteStore.lspStatus.connectedServers;
};

onMounted(() => {
  refreshStatus();
});
</script>

<style scoped>
.lsp-status {
  padding: 20px;
  max-width: 600px;
  margin: 0 auto;
}

h4 {
  margin-bottom: 20px;
  color: #e0e0e0;
}

.status-disabled {
  padding: 20px;
  background: #2d2d30;
  border-radius: 4px;
  color: #858585;
  text-align: center;
}

.section-title {
  font-size: 14px;
  font-weight: bold;
  color: #b0b0b0;
  margin-bottom: 10px;
  text-transform: uppercase;
}

.server-list {
  margin-bottom: 30px;
}

.no-servers {
  padding: 10px;
  background: #2d2d30;
  border-radius: 4px;
  color: #858585;
}

.servers {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.server-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #2d2d30;
  border-radius: 4px;
  transition: all 0.2s;
}

.server-item.active {
  background: #1e1e1e;
  border: 1px solid #4ec9b0;
}

.install-guide {
  margin-bottom: 20px;
}

.commands {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.command-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px;
  background: #1e1e1e;
  border-radius: 4px;
  border: 1px solid #3c3c3c;
}

.command-item code {
  font-family: 'Fira Code', monospace;
  font-size: 12px;
  color: #d4d4d4;
}

.command-item .lang {
  font-size: 11px;
  color: #858585;
  white-space: nowrap;
  margin-left: 10px;
}

.refresh-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: #007acc;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.2s;
}

.refresh-btn:hover {
  background: #005a9e;
}
</style>