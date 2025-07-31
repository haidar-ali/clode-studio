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
          No language servers found. Install them below for better completions.
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
        <div class="section-title">One-Click Install</div>
        <div class="lsp-servers">
          <div 
            v-for="lspServer in lspServers" 
            :key="lspServer.id"
            class="lsp-server-card"
            :class="{ 
              installed: activeServers.includes(lspServer.id),
              installing: installingServers.includes(lspServer.id)
            }"
          >
            <div class="server-header">
              <div class="server-info">
                <Icon 
                  :name="getServerIcon(lspServer.id)" 
                  :color="getServerColor(lspServer.id)"
                  size="20" 
                />
                <div>
                  <div class="server-name">{{ lspServer.name }}</div>
                  <div class="server-languages">{{ lspServer.languages.join(', ') }}</div>
                </div>
              </div>
              <div class="server-status">
                <Icon 
                  v-if="activeServers.includes(lspServer.id)"
                  name="mdi:check-circle" 
                  color="#4ec9b0"
                  size="16" 
                />
                <Icon 
                  v-else-if="installingServers.includes(lspServer.id)"
                  name="mdi:loading" 
                  color="#007acc"
                  size="16" 
                  class="spinning"
                />
              </div>
            </div>
            
            <div class="server-description">{{ lspServer.description }}</div>
            
            <div class="server-actions">
              <button 
                v-if="!activeServers.includes(lspServer.id)"
                @click="installServer(lspServer)"
                :disabled="installingServers.includes(lspServer.id)"
                class="install-btn"
                :class="{ installing: installingServers.includes(lspServer.id) }"
              >
                <Icon 
                  :name="installingServers.includes(lspServer.id) ? 'mdi:loading' : 'mdi:download'" 
                  size="14" 
                  :class="{ spinning: installingServers.includes(lspServer.id) }"
                />
                {{ installingServers.includes(lspServer.id) ? 'Installing...' : 'Install' }}
              </button>
              
              <button 
                v-else
                @click="uninstallServer(lspServer)"
                class="uninstall-btn"
              >
                <Icon name="mdi:delete" size="14" />
                Uninstall
              </button>
              
              <div class="manual-command">
                <code>{{ lspServer.command }}</code>
                <button 
                  @click="copyCommand(lspServer.command)"
                  class="copy-btn"
                  title="Copy command"
                >
                  <Icon name="mdi:content-copy" size="12" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div class="actions">
        <button @click="refreshStatus" class="refresh-btn">
          <Icon name="mdi:refresh" size="16" />
          Refresh Status
        </button>
        
        <button @click="installAll" class="install-all-btn" :disabled="installingAll">
          <Icon 
            :name="installingAll ? 'mdi:loading' : 'mdi:download-multiple'" 
            size="16" 
            :class="{ spinning: installingAll }"
          />
          {{ installingAll ? 'Installing All...' : 'Install Popular' }}
        </button>
      </div>
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
const installingServers = ref<string[]>([]);
const installingAll = ref(false);

// 2025 Updated LSP Server List
const lspServers = ref([
  {
    id: 'typescript',
    name: 'TypeScript Language Server',
    languages: ['TypeScript', 'JavaScript', 'JSX', 'TSX'],
    description: 'Official TypeScript language server with excellent IntelliSense and refactoring support.',
    command: 'npm install -g typescript-language-server typescript',
    packageManager: 'npm',
    icon: 'mdi:language-typescript',
    color: '#3178c6'
  },
  {
    id: 'python',
    name: 'Python LSP Server',
    languages: ['Python'],
    description: 'Fork of python-language-server with active maintenance and comprehensive Python support.',
    command: 'pip install python-lsp-server[all]',
    packageManager: 'pip',
    icon: 'mdi:language-python',
    color: '#3776ab'
  },
  {
    id: 'rust',
    name: 'Rust Analyzer',
    languages: ['Rust'],
    description: 'Fast and feature-rich language server for Rust with excellent macro support.',
    command: 'rustup component add rust-analyzer',
    packageManager: 'rustup',
    icon: 'mdi:language-rust',
    color: '#ce422b'
  },
  {
    id: 'go',
    name: 'gopls',
    languages: ['Go'],
    description: 'Official Go language server maintained by the Go team.',
    command: 'go install golang.org/x/tools/gopls@latest',
    packageManager: 'go',
    icon: 'mdi:language-go',
    color: '#00add8'
  },
  {
    id: 'java',
    name: 'Eclipse JDT LS',
    languages: ['Java'],
    description: 'Eclipse Java Development Tools Language Server with comprehensive Java support.',
    command: 'brew install jdtls',
    packageManager: 'brew',
    icon: 'mdi:language-java',
    color: '#ed8b00'
  },
  {
    id: 'cpp',
    name: 'clangd',
    languages: ['C', 'C++', 'Objective-C'],
    description: 'LLVM-based language server with excellent C++ support and fast indexing.',
    command: 'brew install llvm',
    packageManager: 'brew',
    icon: 'mdi:language-cpp',
    color: '#00599c'
  },
  {
    id: 'vue',
    name: 'Vue Language Server',
    languages: ['Vue', 'TypeScript', 'JavaScript'],
    description: 'Official Vue.js language server with Vue 3 and Composition API support.',
    command: 'npm install -g @vue/language-server',
    packageManager: 'npm',
    icon: 'mdi:vuejs',
    color: '#4fc08d'
  },
  {
    id: 'html',
    name: 'HTML/CSS/JSON Language Servers',
    languages: ['HTML', 'CSS', 'JSON', 'SCSS'],
    description: 'VS Code extracted language servers for web technologies.',
    command: 'npm install -g vscode-langservers-extracted',
    packageManager: 'npm',
    icon: 'mdi:language-html5',
    color: '#e34f26'
  },
  {
    id: 'php',
    name: 'Intelephense',
    languages: ['PHP'],
    description: 'Premium PHP language server with excellent IntelliSense and Laravel support.',
    command: 'npm install -g intelephense',
    packageManager: 'npm',
    icon: 'mdi:language-php',
    color: '#777bb4'
  },
  {
    id: 'csharp',
    name: 'OmniSharp',
    languages: ['C#', '.NET'],
    description: 'Cross-platform .NET development language server.',
    command: 'dotnet tool install -g omnisharp',
    packageManager: 'dotnet',
    icon: 'mdi:language-csharp',
    color: '#239120'
  },
  {
    id: 'kotlin',
    name: 'Kotlin Language Server',
    languages: ['Kotlin'],
    description: 'JetBrains-maintained language server for Kotlin development.',
    command: 'brew install kotlin-language-server',
    packageManager: 'brew',
    icon: 'mdi:language-kotlin',
    color: '#7f52ff'
  },
  {
    id: 'ruby',
    name: 'Ruby LSP',
    languages: ['Ruby'],
    description: 'Shopify-maintained language server for Ruby with Rails support.',
    command: 'gem install ruby-lsp',
    packageManager: 'gem',
    icon: 'mdi:language-ruby',
    color: '#cc342d'
  },
  {
    id: 'svelte',
    name: 'Svelte Language Server',
    languages: ['Svelte', 'TypeScript'],
    description: 'Official Svelte language server with TypeScript integration.',
    command: 'npm install -g svelte-language-server',
    packageManager: 'npm',
    icon: 'mdi:fire',
    color: '#ff3e00'
  },
  {
    id: 'lua',
    name: 'Lua Language Server',
    languages: ['Lua'],
    description: 'Feature-rich Lua language server with excellent Neovim integration.',
    command: 'brew install lua-language-server',
    packageManager: 'brew',
    icon: 'mdi:language-lua',
    color: '#000080'
  },
  {
    id: 'yaml',
    name: 'YAML Language Server',
    languages: ['YAML'],
    description: 'Language server for YAML with schema validation support.',
    command: 'npm install -g yaml-language-server',
    packageManager: 'npm',
    icon: 'mdi:code-json',
    color: '#cb171e'
  }
]);

const getServerIcon = (serverId: string) => {
  const server = lspServers.value.find(s => s.id === serverId);
  return server?.icon || 'mdi:cog';
};

const getServerColor = (serverId: string) => {
  const server = lspServers.value.find(s => s.id === serverId);
  return server?.color || '#858585';
};

const installServer = async (server: any) => {
  installingServers.value.push(server.id);
  
  try {
    // Call electron API to install the LSP server
    if (window.electronAPI?.lsp?.install) {
      const result = await window.electronAPI.lsp.install({
        id: server.id,
        command: server.command,
        packageManager: server.packageManager
      });
      
      if (result.success) {
        // Refresh status to detect newly installed server
        await refreshStatus();
      } else {
        console.error('Failed to install LSP server:', result.error);
        // Show error notification
        if (window.electronAPI?.showError) {
          window.electronAPI.showError(`Failed to install ${server.name}: ${result.error}`);
        }
      }
    }
  } catch (error) {
    console.error('Error installing LSP server:', error);
  } finally {
    installingServers.value = installingServers.value.filter(id => id !== server.id);
  }
};

const uninstallServer = async (server: any) => {
  try {
    if (window.electronAPI?.lsp?.uninstall) {
      const result = await window.electronAPI.lsp.uninstall({
        id: server.id,
        packageManager: server.packageManager
      });
      
      if (result.success) {
        await refreshStatus();
      } else {
        console.error('Failed to uninstall LSP server:', result.error);
      }
    }
  } catch (error) {
    console.error('Error uninstalling LSP server:', error);
  }
};

const copyCommand = async (command: string) => {
  try {
    await navigator.clipboard.writeText(command);
    // Show success feedback
    console.log('Command copied to clipboard');
  } catch (error) {
    console.error('Failed to copy command:', error);
  }
};

const installAll = async () => {
  installingAll.value = true;
  
  // Install popular servers (TypeScript, Python, HTML/CSS/JSON)
  const popularServers = lspServers.value.filter(s => 
    ['typescript', 'python', 'html'].includes(s.id) && 
    !activeServers.value.includes(s.id)
  );
  
  for (const server of popularServers) {
    await installServer(server);
  }
  
  installingAll.value = false;
};

const refreshStatus = async () => {
  // Check available servers
  await autocompleteStore.checkLSPServers();
  
  // Update connected servers
  await autocompleteStore.updateLSPConnectedServers();
  
  // Use availableServers (installed) instead of connectedServers (running)
  // For install/uninstall buttons, we care about what's installed, not what's running
  activeServers.value = autocompleteStore.lspStatus.availableServers;
  
  // Debug logging to see what's happening
  console.log('Available servers:', autocompleteStore.lspStatus.availableServers);
  console.log('Connected servers:', autocompleteStore.lspStatus.connectedServers);
  console.log('Active servers:', activeServers.value);
};

onMounted(() => {
  refreshStatus();
});
</script>

<style scoped>
.lsp-status {
  padding: 20px;
  max-width: 800px;
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
  margin-bottom: 15px;
  text-transform: uppercase;
  display: flex;
  align-items: center;
  gap: 8px;
}

.server-list {
  margin-bottom: 30px;
}

.no-servers {
  padding: 15px;
  background: #2d2d30;
  border-radius: 6px;
  color: #858585;
  text-align: center;
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
  margin-bottom: 30px;
}

.lsp-servers {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
  gap: 16px;
  margin-top: 16px;
}

.lsp-server-card {
  background: #2d2d30;
  border-radius: 8px;
  padding: 16px;
  border: 1px solid #3c3c3c;
  transition: all 0.2s ease;
  position: relative;
}

.lsp-server-card:hover {
  border-color: #555;
  transform: translateY(-1px);
}

.lsp-server-card.installed {
  border-color: #4ec9b0;
  background: #1e2e2a;
}

.lsp-server-card.installing {
  border-color: #007acc;
  background: #1e252e;
}

.server-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
}

.server-info {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  flex: 1;
}

.server-name {
  font-weight: 600;
  color: #e0e0e0;
  font-size: 14px;
  line-height: 1.2;
}

.server-languages {
  font-size: 11px;
  color: #b0b0b0;
  margin-top: 2px;
}

.server-status {
  flex-shrink: 0;
}

.server-description {
  font-size: 12px;
  color: #b0b0b0;
  line-height: 1.4;
  margin-bottom: 12px;
}

.server-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.install-btn,
.uninstall-btn,
.installed-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
}

.install-btn {
  background: #007acc;
  color: white;
}

.install-btn:hover:not(:disabled) {
  background: #005a9e;
}

.install-btn:disabled,
.install-btn.installing {
  background: #555;
  cursor: not-allowed;
}

.uninstall-btn {
  background: #dc3545;
  color: white;
}

.uninstall-btn:hover {
  background: #c82333;
}

.installed-btn {
  background: #28a745;
  color: white;
  cursor: default;
  opacity: 0.8;
}

.installed-btn:disabled {
  background: #28a745;
  color: white;
  cursor: default;
  opacity: 0.8;
}

.manual-command {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #1e1e1e;
  border-radius: 4px;
  padding: 6px 8px;
  border: 1px solid #3c3c3c;
}

.manual-command code {
  font-family: 'Fira Code', monospace;
  font-size: 10px;
  color: #d4d4d4;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.copy-btn {
  background: none;
  border: none;
  color: #858585;
  cursor: pointer;
  padding: 2px;
  border-radius: 2px;
  transition: color 0.2s;
}

.copy-btn:hover {
  color: #b0b0b0;
}

.actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  align-items: center;
}

.refresh-btn,
.install-all-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
}

.refresh-btn {
  background: #007acc;
  color: white;
}

.refresh-btn:hover {
  background: #005a9e;
}

.install-all-btn {
  background: #28a745;
  color: white;
}

.install-all-btn:hover:not(:disabled) {
  background: #218838;
}

.install-all-btn:disabled {
  background: #555;
  cursor: not-allowed;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.spinning {
  animation: spin 1s linear infinite;
}
</style>