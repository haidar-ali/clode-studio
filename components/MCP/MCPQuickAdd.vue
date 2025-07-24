<template>
  <div class="mcp-quick-add">
    <h3>Popular MCP Servers</h3>
    <p class="description">
      Quick-add popular MCP servers to enhance Claude's capabilities
    </p>

    <div class="server-categories">
      <!-- Development Tools -->
      <div class="category">
        <h4>
          <Icon name="mdi:code-braces" size="16" />
          Development Tools
        </h4>
        <div class="server-grid">
          <div
            v-for="server in developmentServers"
            :key="server.id"
            class="server-card"
            :class="{ installed: isInstalled(server.name) }"
            @click="quickAddServer(server)"
            :title="getServerTooltip(server)"
          >
            <Icon :name="server.icon" size="24" />
            <h5>{{ server.name }}</h5>
            <p>{{ server.description }}</p>
            <span v-if="isInstalled(server.name)" class="installed-badge">
              <Icon name="mdi:check" size="14" /> Installed
            </span>
            <span v-if="server.requirements && server.requirements.length > 0" class="requirements-badge">
              <Icon name="mdi:alert-circle-outline" size="14" />
            </span>
          </div>
        </div>
      </div>

      <!-- Cloud & Infrastructure -->
      <div class="category">
        <h4>
          <Icon name="mdi:cloud" size="16" />
          Cloud & Infrastructure
        </h4>
        <div class="server-grid">
          <div
            v-for="server in cloudServers"
            :key="server.id"
            class="server-card"
            :class="{ installed: isInstalled(server.name) }"
            @click="quickAddServer(server)"
            :title="getServerTooltip(server)"
          >
            <Icon :name="server.icon" size="24" />
            <h5>{{ server.name }}</h5>
            <p>{{ server.description }}</p>
            <span v-if="isInstalled(server.name)" class="installed-badge">
              <Icon name="mdi:check" size="14" /> Installed
            </span>
            <span v-if="server.requirements && server.requirements.length > 0" class="requirements-badge">
              <Icon name="mdi:alert-circle-outline" size="14" />
            </span>
          </div>
        </div>
      </div>

      <!-- Data & APIs -->
      <div class="category">
        <h4>
          <Icon name="mdi:database" size="16" />
          Data & APIs
        </h4>
        <div class="server-grid">
          <div
            v-for="server in dataServers"
            :key="server.id"
            class="server-card"
            :class="{ installed: isInstalled(server.name) }"
            @click="quickAddServer(server)"
            :title="getServerTooltip(server)"
          >
            <Icon :name="server.icon" size="24" />
            <h5>{{ server.name }}</h5>
            <p>{{ server.description }}</p>
            <span v-if="isInstalled(server.name)" class="installed-badge">
              <Icon name="mdi:check" size="14" /> Installed
            </span>
            <span v-if="server.requirements && server.requirements.length > 0" class="requirements-badge">
              <Icon name="mdi:alert-circle-outline" size="14" />
            </span>
          </div>
        </div>
      </div>

      <!-- Communication & Productivity -->
      <div class="category">
        <h4>
          <Icon name="mdi:chat" size="16" />
          Communication & Productivity
        </h4>
        <div class="server-grid">
          <div
            v-for="server in communicationServers"
            :key="server.id"
            class="server-card"
            :class="{ installed: isInstalled(server.name) }"
            @click="quickAddServer(server)"
            :title="getServerTooltip(server)"
          >
            <Icon :name="server.icon" size="24" />
            <h5>{{ server.name }}</h5>
            <p>{{ server.description }}</p>
            <span v-if="isInstalled(server.name)" class="installed-badge">
              <Icon name="mdi:check" size="14" /> Installed
            </span>
            <span v-if="server.requirements && server.requirements.length > 0" class="requirements-badge">
              <Icon name="mdi:alert-circle-outline" size="14" />
            </span>
          </div>
        </div>
      </div>

      <!-- Web & Automation -->
      <div class="category">
        <h4>
          <Icon name="mdi:robot" size="16" />
          Web & Automation
        </h4>
        <div class="server-grid">
          <div
            v-for="server in automationServers"
            :key="server.id"
            class="server-card"
            :class="{ installed: isInstalled(server.name) }"
            @click="quickAddServer(server)"
            :title="getServerTooltip(server)"
          >
            <Icon :name="server.icon" size="24" />
            <h5>{{ server.name }}</h5>
            <p>{{ server.description }}</p>
            <span v-if="isInstalled(server.name)" class="installed-badge">
              <Icon name="mdi:check" size="14" /> Installed
            </span>
            <span v-if="server.requirements && server.requirements.length > 0" class="requirements-badge">
              <Icon name="mdi:alert-circle-outline" size="14" />
            </span>
          </div>
        </div>
      </div>

      <!-- Utilities -->
      <div class="category">
        <h4>
          <Icon name="mdi:tools" size="16" />
          Utilities
        </h4>
        <div class="server-grid">
          <div
            v-for="server in utilitiesServers"
            :key="server.id"
            class="server-card"
            :class="{ installed: isInstalled(server.name) }"
            @click="quickAddServer(server)"
            :title="getServerTooltip(server)"
          >
            <Icon :name="server.icon" size="24" />
            <h5>{{ server.name }}</h5>
            <p>{{ server.description }}</p>
            <span v-if="isInstalled(server.name)" class="installed-badge">
              <Icon name="mdi:check" size="14" /> Installed
            </span>
            <span v-if="server.requirements && server.requirements.length > 0" class="requirements-badge">
              <Icon name="mdi:alert-circle-outline" size="14" />
            </span>
          </div>
        </div>
      </div>

      <!-- Remote Services -->
      <div class="category">
        <h4>
          <Icon name="mdi:cloud-sync" size="16" />
          Remote Services (SSE/HTTP)
        </h4>
        <div class="server-grid">
          <div
            v-for="server in remoteServers"
            :key="server.id"
            class="server-card"
            :class="{ installed: isInstalled(server.name) }"
            @click="quickAddServer(server)"
          >
            <Icon :name="server.icon" size="24" />
            <h5>{{ server.name }}</h5>
            <p>{{ server.description }}</p>
            <div v-if="server.type !== 'stdio'" class="server-type">
              <Icon :name="server.type === 'sse' ? 'mdi:broadcast' : 'mdi:api'" size="12" />
              {{ server.type.toUpperCase() }}
            </div>
            <span v-if="isInstalled(server.name)" class="installed-badge">
              <Icon name="mdi:check" size="14" /> Installed
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Installation Modal -->
    <div v-if="selectedServer" class="modal-overlay" @click="closeModal">
      <div class="modal" @click.stop>
        <div class="modal-header">
          <h3>
            <Icon :name="selectedServer.icon" size="20" />
            Install {{ selectedServer.name }}
          </h3>
          <button @click="closeModal" class="close-button">
            <Icon name="mdi:close" />
          </button>
        </div>

        <div class="modal-content">
          <p class="server-description">{{ selectedServer.detailedDescription || selectedServer.description }}</p>

          <!-- Requirements section -->
          <div v-if="selectedServer.requirements && selectedServer.requirements.length > 0" class="requirements-section">
            <h4>
              <Icon name="mdi:alert-circle-outline" size="16" />
              Requirements
            </h4>
            <ul class="requirements-list">
              <li v-for="req in selectedServer.requirements" :key="req">
                <Icon name="mdi:check-circle-outline" size="14" />
                {{ req }}
              </li>
            </ul>
          </div>

          <div class="installation-steps">
            <h4>{{ selectedServer.type === 'stdio' ? 'Installation' : 'Configuration' }}</h4>
            
            <!-- For stdio servers, show installation command -->
            <div v-if="selectedServer.type === 'stdio' && selectedServer.installCommand" class="command-box">
              <code>{{ selectedServer.installCommand }}</code>
              <button @click="copyCommand(selectedServer.installCommand)" class="copy-button">
                <Icon name="mdi:content-copy" size="16" />
              </button>
            </div>

            <!-- For remote servers, show connection info -->
            <div v-if="selectedServer.type !== 'stdio'" class="connection-info">
              <div class="info-item">
                <Icon :name="selectedServer.type === 'sse' ? 'mdi:broadcast' : 'mdi:api'" size="16" />
                <span><strong>Type:</strong> {{ selectedServer.type.toUpperCase() }} (Remote Service)</span>
              </div>
              
              <!-- Custom URL input for customizable servers -->
              <div v-if="selectedServer.customizable" class="custom-url-section">
                <label for="custom-url">
                  <Icon name="mdi:link-variant" size="16" />
                  <strong>Server Endpoint:</strong>
                </label>
                <input
                  id="custom-url"
                  v-model="customUrl"
                  type="url"
                  :placeholder="selectedServer.url"
                  class="custom-url-input"
                  required
                />
                <small>Enter your custom MCP server endpoint URL</small>
              </div>
              
              <!-- Default endpoint display for non-customizable servers -->
              <div v-else class="info-item">
                <Icon name="mdi:link-variant" size="16" />
                <span><strong>Endpoint:</strong> <code>{{ selectedServer.url }}</code></span>
              </div>
              
              <p class="remote-note">
                <Icon name="mdi:information-outline" size="14" />
                No local installation required. This is a hosted service.
              </p>
            </div>

            <div v-if="selectedServer.configExample" class="config-section">
              <h5>{{ selectedServer.type === 'stdio' ? 'Configuration' : 'Claude Configuration' }}</h5>
              <pre class="config-example">{{ selectedServer.configExample }}</pre>
            </div>

            <div v-if="selectedServer.envVars && selectedServer.envVars.length > 0" class="env-section">
              <h5>{{ selectedServer.type === 'stdio' ? 'Required Environment Variables' : 'Authentication' }}</h5>
              
              <!-- Environment Variable Input Form -->
              <div class="env-inputs">
                <div v-for="envVar in selectedServer.envVars" :key="envVar" class="env-input-group">
                  <label :for="`env-${envVar}`">
                    <code>{{ envVar }}</code>
                    <span class="required">*</span>
                  </label>
                  <input
                    :id="`env-${envVar}`"
                    v-model="envValues[envVar]"
                    :type="envVar.toLowerCase().includes('token') || envVar.toLowerCase().includes('key') || envVar.toLowerCase().includes('secret') ? 'password' : 'text'"
                    :placeholder="`Enter ${envVar} value`"
                    class="env-input"
                  />
                  <small v-if="envVar === 'GITHUB_TOKEN'">
                    <a href="https://github.com/settings/tokens" target="_blank" rel="noopener">
                      Generate token <Icon name="mdi:open-in-new" size="12" />
                    </a>
                  </small>
                  <small v-else-if="envVar === 'NOTION_API_KEY'">
                    <a href="https://www.notion.so/my-integrations" target="_blank" rel="noopener">
                      Get API key <Icon name="mdi:open-in-new" size="12" />
                    </a>
                  </small>
                  <small v-else-if="envVar === 'LINEAR_API_KEY'">
                    <a href="https://linear.app/settings/api" target="_blank" rel="noopener">
                      Get API key <Icon name="mdi:open-in-new" size="12" />
                    </a>
                  </small>
                  <small v-else-if="envVar === 'SLACK_TOKEN'">
                    <a href="https://api.slack.com/apps" target="_blank" rel="noopener">
                      Create app & get token <Icon name="mdi:open-in-new" size="12" />
                    </a>
                  </small>
                  <small v-else-if="envVar === 'STRIPE_API_KEY'">
                    <a href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noopener">
                      Get API key <Icon name="mdi:open-in-new" size="12" />
                    </a>
                  </small>
                </div>
              </div>
              
              <p v-if="selectedServer.type !== 'stdio'" class="auth-note">
                <Icon name="mdi:shield-lock-outline" size="14" />
                Your credentials are only used for this MCP server configuration.
              </p>
            </div>
          </div>

          <div class="modal-actions">
            <button @click="closeModal" class="cancel-button">Cancel</button>
            <button 
              @click="installServer" 
              class="primary-button"
              :disabled="!canInstall"
              :title="!canInstall ? 'Please fill in all required fields' : ''"
            >
              <Icon name="mdi:download" size="16" />
              Add to Project
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useMCPStore, type MCPServerConfig } from '~/stores/mcp';

export interface MCPServerTemplate {
  id: string;
  name: string;
  description: string;
  detailedDescription?: string;
  icon: string;
  type: 'stdio' | 'http' | 'sse';
  installCommand?: string;
  command?: string;
  args?: string[];
  url?: string;
  configExample?: string;
  envVars?: string[];
  headers?: Record<string, string>;
  category: 'development' | 'cloud' | 'data' | 'communication' | 'automation' | 'utilities' | 'remote';
  requirements?: string[];
  customizable?: boolean;
}

const mcpStore = useMCPStore();
const selectedServer = ref<MCPServerTemplate | null>(null);
const envValues = ref<Record<string, string>>({});
const customUrl = ref<string>('');
const emit = defineEmits<{
  'server-added': [server: MCPServerTemplate];
}>();

// Server templates
const serverTemplates: MCPServerTemplate[] = [
  // Development Tools
  {
    id: 'filesystem',
    name: 'Filesystem',
    description: 'Read, write, and manage files',
    detailedDescription: 'Provides secure file system access with read/write capabilities. Perfect for project management and file operations.',
    icon: 'mdi:folder-open',
    type: 'stdio',
    installCommand: 'npx -y @modelcontextprotocol/server-filesystem',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem'],
    category: 'development'
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'Manage repos, issues, and PRs',
    detailedDescription: 'Official GitHub MCP server for managing repositories, issues, pull requests, and more. Note: This server requires Docker or manual Go installation.',
    icon: 'mdi:github',
    type: 'stdio',
    installCommand: 'docker pull ghcr.io/github/github-mcp-server:latest',
    command: 'docker',
    args: ['run', '-i', '--rm', '-e', 'GITHUB_TOKEN', 'ghcr.io/github/github-mcp-server:latest'],
    envVars: ['GITHUB_TOKEN'],
    configExample: `{
  "name": "github",
  "type": "stdio",
  "command": "docker",
  "args": ["run", "-i", "--rm", "-e", "GITHUB_TOKEN", "ghcr.io/github/github-mcp-server:latest"],
  "env": {
    "GITHUB_TOKEN": "your-github-token"
  }
}`,
    category: 'development',
    requirements: ['Docker Desktop must be installed and running', 'GitHub Personal Access Token required']
  },
  {
    id: 'git',
    name: 'Git',
    description: 'Git operations and history',
    detailedDescription: 'Execute git commands, view history, manage branches, and more.',
    icon: 'mdi:git',
    type: 'stdio',
    installCommand: 'npx -y @modelcontextprotocol/server-git',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-git'],
    category: 'development',
    requirements: ['Git must be installed', 'Must be run in a Git repository']
  },
  {
    id: 'sequential-thinking',
    name: 'Sequential Thinking',
    description: 'Break down complex problems',
    detailedDescription: 'Helps Claude break down complex tasks into logical steps. Great for architecture, refactoring, and planning.',
    icon: 'mdi:brain',
    type: 'stdio',
    installCommand: 'npx -y @modelcontextprotocol/server-sequential-thinking',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
    category: 'development'
  },
  {
    id: 'python-runner',
    name: 'Python Runner',
    description: 'Execute Python code safely',
    detailedDescription: 'Run Python code in a secure sandbox environment with full standard library support.',
    icon: 'mdi:language-python',
    type: 'stdio',
    installCommand: 'uvx mcp-run-python',
    command: 'uvx',
    args: ['mcp-run-python'],
    category: 'development',
    requirements: ['Python 3.8+ must be installed', 'uv package manager required (pip install uv)']
  },
  {
    id: 'memory',
    name: 'Memory',
    description: 'Persistent knowledge graph memory',
    detailedDescription: 'Knowledge graph-based persistent memory system for long-term context retention.',
    icon: 'mdi:memory',
    type: 'stdio',
    installCommand: 'npx -y @modelcontextprotocol/server-memory',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    category: 'development'
  },
  {
    id: 'everything',
    name: 'Everything',
    description: 'Reference server with all features',
    detailedDescription: 'Reference/test server with prompts, resources, and tools for testing MCP capabilities.',
    icon: 'mdi:infinity',
    type: 'stdio',
    installCommand: 'npx -y @modelcontextprotocol/server-everything',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-everything'],
    category: 'development'
  },
  {
    id: 'jupyter',
    name: 'Jupyter',
    description: 'Execute Jupyter notebooks',
    detailedDescription: 'Run and interact with Jupyter notebooks, execute cells, and manage notebook content.',
    icon: 'mdi:notebook-outline',
    type: 'stdio',
    installCommand: 'npx -y @modelcontextprotocol/server-jupyter',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-jupyter'],
    category: 'development',
    requirements: ['Jupyter must be installed (pip install jupyter)']
  },

  // Cloud & Infrastructure
  {
    id: 'aws',
    name: 'AWS',
    description: 'Manage AWS resources',
    detailedDescription: 'Interact with AWS services including S3, EC2, Lambda, and more.',
    icon: 'mdi:aws',
    type: 'stdio',
    installCommand: 'npx -y @modelcontextprotocol/server-aws',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-aws'],
    envVars: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION'],
    category: 'cloud'
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    description: 'Deploy and manage Cloudflare resources',
    detailedDescription: 'Deploy, configure & manage Workers, KV, R2, D1, and other Cloudflare services.',
    icon: 'mdi:cloud-outline',
    type: 'stdio',
    installCommand: 'npx -y @modelcontextprotocol/server-cloudflare',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-cloudflare'],
    envVars: ['CLOUDFLARE_API_TOKEN'],
    category: 'cloud'
  },
  {
    id: 'docker',
    name: 'Docker',
    description: 'Manage containers and images',
    detailedDescription: 'Control Docker containers, images, volumes, networks, and docker-compose.',
    icon: 'mdi:docker',
    type: 'stdio',
    installCommand: 'npx -y @modelcontextprotocol/server-docker',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-docker'],
    category: 'cloud',
    requirements: ['Docker Desktop must be installed and running']
  },
  {
    id: 'kubernetes',
    name: 'Kubernetes',
    description: 'Manage K8s clusters',
    detailedDescription: 'Deploy and manage Kubernetes resources, pods, services, and configurations.',
    icon: 'mdi:kubernetes',
    type: 'stdio',
    installCommand: 'npx -y @modelcontextprotocol/server-kubernetes',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-kubernetes'],
    category: 'cloud',
    requirements: ['kubectl must be installed and configured']
  },
  {
    id: 'google-cloud',
    name: 'Google Cloud',
    description: 'Manage GCP resources',
    detailedDescription: 'Interact with Google Cloud Platform services and resources.',
    icon: 'mdi:google-cloud',
    type: 'stdio',
    installCommand: 'npx -y @modelcontextprotocol/server-gcp',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-gcp'],
    envVars: ['GOOGLE_APPLICATION_CREDENTIALS'],
    category: 'cloud'
  },

  // Data & APIs
  {
    id: 'postgres',
    name: 'PostgreSQL',
    description: 'Query and manage PostgreSQL',
    detailedDescription: 'Execute queries, manage schemas, and interact with PostgreSQL databases.',
    icon: 'mdi:database',
    type: 'stdio',
    installCommand: 'npx -y @modelcontextprotocol/server-postgres',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-postgres'],
    envVars: ['DATABASE_URL'],
    configExample: `{
  "name": "postgres",
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-postgres"],
  "env": {
    "DATABASE_URL": "postgresql://user:pass@host:5432/db"
  }
}`,
    category: 'data',
    requirements: ['PostgreSQL database must be accessible']
  },
  {
    id: 'sqlite',
    name: 'SQLite',
    description: 'Local SQLite database access',
    detailedDescription: 'Query and manage SQLite databases with full SQL support.',
    icon: 'mdi:database-outline',
    type: 'stdio',
    installCommand: 'npx -y @modelcontextprotocol/server-sqlite',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sqlite', 'path/to/database.db'],
    category: 'data'
  },
  {
    id: 'mysql',
    name: 'MySQL',
    description: 'Query and manage MySQL',
    detailedDescription: 'Execute queries and manage MySQL/MariaDB databases.',
    icon: 'mdi:database-sync',
    type: 'stdio',
    installCommand: 'npx -y @modelcontextprotocol/server-mysql',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-mysql'],
    envVars: ['MYSQL_CONNECTION_STRING'],
    category: 'data',
    requirements: ['MySQL/MariaDB database must be accessible']
  },
  {
    id: 'mongodb',
    name: 'MongoDB',
    description: 'NoSQL database operations',
    detailedDescription: 'Query and manage MongoDB collections and documents.',
    icon: 'mdi:leaf',
    type: 'stdio',
    installCommand: 'npx -y @modelcontextprotocol/server-mongodb',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-mongodb'],
    envVars: ['MONGODB_URI'],
    category: 'data',
    requirements: ['MongoDB database must be accessible']
  },
  {
    id: 'redis',
    name: 'Redis',
    description: 'Key-value store operations',
    detailedDescription: 'Interact with Redis for caching, pub/sub, and data storage.',
    icon: 'mdi:database-refresh',
    type: 'stdio',
    installCommand: 'npx -y @modelcontextprotocol/server-redis',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-redis'],
    envVars: ['REDIS_URL'],
    category: 'data',
    requirements: ['Redis server must be running and accessible']
  },
  {
    id: 'bigquery',
    name: 'BigQuery',
    description: 'Google BigQuery analytics',
    detailedDescription: 'Query and analyze large datasets using Google BigQuery.',
    icon: 'mdi:google',
    type: 'stdio',
    installCommand: 'npx -y @modelcontextprotocol/server-bigquery',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-bigquery'],
    envVars: ['GOOGLE_APPLICATION_CREDENTIALS'],
    category: 'data'
  },
  {
    id: 'brave-search',
    name: 'Brave Search',
    description: 'Privacy-focused web search',
    detailedDescription: 'Search the web using Brave Search API with privacy protection.',
    icon: 'mdi:magnify',
    type: 'stdio',
    installCommand: 'npx -y @modelcontextprotocol/server-brave-search',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-brave-search'],
    envVars: ['BRAVE_API_KEY'],
    category: 'data'
  },
  {
    id: 'apollo-graphql',
    name: 'Apollo GraphQL',
    description: 'Connect GraphQL APIs',
    detailedDescription: 'Query and interact with GraphQL APIs using Apollo Client.',
    icon: 'mdi:graphql',
    type: 'stdio',
    installCommand: 'npx -y @modelcontextprotocol/server-apollo',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-apollo'],
    category: 'data'
  },
  {
    id: 'stripe',
    name: 'Stripe',
    description: 'Payment processing API',
    detailedDescription: 'Official Stripe MCP server for payment processing, subscriptions, and financial operations.',
    icon: 'mdi:credit-card',
    type: 'stdio',
    installCommand: 'npm install @stripe/mcp',
    command: 'npx',
    args: ['@stripe/mcp'],
    envVars: ['STRIPE_API_KEY'],
    configExample: `{
  "name": "stripe",
  "type": "stdio",
  "command": "npx",
  "args": ["@stripe/mcp"],
  "env": {
    "STRIPE_API_KEY": "sk_test_..."
  }
}`,
    category: 'data'
  },
  {
    id: 'gitlab',
    name: 'GitLab',
    description: 'Manage GitLab projects and merge requests',
    detailedDescription: 'Interact with GitLab API for managing projects, merge requests, issues, and CI/CD pipelines.',
    icon: 'mdi:gitlab',
    type: 'stdio',
    installCommand: 'npx -y @modelcontextprotocol/server-gitlab',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-gitlab'],
    envVars: ['GITLAB_TOKEN', 'GITLAB_URL'],
    configExample: `{
  "name": "gitlab",
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-gitlab"],
  "env": {
    "GITLAB_TOKEN": "your-gitlab-token",
    "GITLAB_URL": "https://gitlab.com"
  }
}`,
    category: 'data'
  },
  {
    id: 'google-maps',
    name: 'Google Maps',
    description: 'Location services and mapping',
    detailedDescription: 'Access Google Maps API for geocoding, directions, places search, and location-based services.',
    icon: 'mdi:map-marker',
    type: 'stdio',
    installCommand: 'npx -y @modelcontextprotocol/server-google-maps',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-google-maps'],
    envVars: ['GOOGLE_MAPS_API_KEY'],
    category: 'data'
  },

  // Communication & Productivity
  {
    id: 'slack',
    name: 'Slack',
    description: 'Read and send Slack messages',
    detailedDescription: 'Interact with Slack workspaces, channels, and direct messages.',
    icon: 'mdi:slack',
    type: 'stdio',
    installCommand: 'npx -y @modelcontextprotocol/server-slack',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-slack'],
    envVars: ['SLACK_TOKEN'],
    category: 'communication'
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Manage Notion pages and databases',
    detailedDescription: 'Create, read, and update Notion pages, databases, and blocks.',
    icon: 'mdi:notebook',
    type: 'stdio',
    installCommand: 'npx -y @modelcontextprotocol/server-notion',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-notion'],
    envVars: ['NOTION_API_KEY'],
    category: 'communication'
  },
  {
    id: 'linear',
    name: 'Linear',
    description: 'Manage issues and projects',
    detailedDescription: 'Create and manage Linear issues, projects, and teams.',
    icon: 'mdi:chart-timeline-variant',
    type: 'stdio',
    installCommand: 'npx -y @modelcontextprotocol/server-linear',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-linear'],
    envVars: ['LINEAR_API_KEY'],
    category: 'communication'
  },
  {
    id: 'discord',
    name: 'Discord',
    description: 'Discord bot operations',
    detailedDescription: 'Send messages, manage channels, and interact with Discord servers.',
    icon: 'mdi:discord',
    type: 'stdio',
    installCommand: 'npx -y @modelcontextprotocol/server-discord',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-discord'],
    envVars: ['DISCORD_BOT_TOKEN'],
    category: 'communication'
  },
  {
    id: 'twilio',
    name: 'Twilio',
    description: 'SMS and voice messaging',
    detailedDescription: 'Send SMS, make calls, and manage phone numbers through Twilio.',
    icon: 'mdi:message-text',
    type: 'stdio',
    installCommand: 'npx -y @modelcontextprotocol/server-twilio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-twilio'],
    envVars: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'],
    category: 'communication'
  },
  {
    id: 'google-drive',
    name: 'Google Drive',
    description: 'Access Google Drive files',
    detailedDescription: 'Read, write, and manage files in Google Drive.',
    icon: 'mdi:google-drive',
    type: 'stdio',
    installCommand: 'npx -y @modelcontextprotocol/server-google-drive',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-google-drive'],
    envVars: ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET'],
    category: 'communication'
  },

  // Web & Automation
  {
    id: 'puppeteer',
    name: 'Puppeteer',
    description: 'Browser automation',
    detailedDescription: 'Automate web browsers for testing, scraping, and UI automation.',
    icon: 'mdi:puppet',
    type: 'stdio',
    installCommand: 'npx -y @modelcontextprotocol/server-puppeteer',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-puppeteer'],
    category: 'automation',
    requirements: ['Chrome or Chromium browser']
  },
  {
    id: 'fetch',
    name: 'Fetch',
    description: 'Web content fetching',
    detailedDescription: 'Fetch and convert web content optimized for LLM processing.',
    icon: 'mdi:download',
    type: 'stdio',
    installCommand: 'pip install mcp-server-fetch',
    command: 'mcp-server-fetch',
    category: 'automation',
    requirements: ['Python 3.8+ required', 'Install with pip: pip install mcp-server-fetch']
  },
  {
    id: 'playwright',
    name: 'Playwright',
    description: 'Cross-browser automation',
    detailedDescription: 'Automate Chromium, Firefox and WebKit with a single API.',
    icon: 'mdi:web',
    type: 'stdio',
    installCommand: 'npm install -g @playwright/mcp',
    command: 'npx',
    args: ['@playwright/mcp'],
    category: 'automation'
  },
  {
    id: 'browser',
    name: 'Browser Control',
    description: 'Control your local browser',
    detailedDescription: 'Automate and control your local browser instance.',
    icon: 'mdi:google-chrome',
    type: 'stdio',
    installCommand: 'npx -y @modelcontextprotocol/server-browser',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-browser'],
    category: 'automation'
  },
  {
    id: 'zapier',
    name: 'Zapier',
    description: 'Connect to 8,000+ apps',
    detailedDescription: 'Official Zapier MCP server to connect your AI agents to thousands of apps and automate workflows.',
    icon: 'mdi:link-variant',
    type: 'http',
    url: 'https://api.zapier.com/mcp/v1',
    configExample: `{
  "name": "zapier",
  "type": "http",
  "url": "https://api.zapier.com/mcp/v1",
  "headers": {
    "Authorization": "Bearer YOUR_ZAPIER_API_KEY"
  }
}`,
    envVars: ['ZAPIER_API_KEY'],
    category: 'automation',
    requirements: ['Zapier account and API key']
  },
  {
    id: 'supabase',
    name: 'Supabase',
    description: 'Database and backend services',
    detailedDescription: 'Create tables, query data, deploy edge functions, and manage your Supabase project.',
    icon: 'mdi:database-arrow-up',
    type: 'stdio',
    installCommand: 'npx supabase-mcp',
    command: 'npx',
    args: ['supabase-mcp'],
    envVars: ['SUPABASE_URL', 'SUPABASE_ANON_KEY'],
    configExample: `{
  "name": "supabase",
  "type": "stdio",
  "command": "npx",
  "args": ["supabase-mcp"],
  "env": {
    "SUPABASE_URL": "https://your-project.supabase.co",
    "SUPABASE_ANON_KEY": "your-anon-key"
  }
}`,
    category: 'automation'
  },

  // Utilities
  {
    id: 'calculator',
    name: 'Calculator',
    description: 'Precise numerical calculations',
    detailedDescription: 'Perform complex mathematical calculations with high precision.',
    icon: 'mdi:calculator',
    type: 'stdio',
    installCommand: 'npx -y @modelcontextprotocol/server-calculator',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-calculator'],
    category: 'utilities'
  },
  // Note: server-time has been archived by modelcontextprotocol
  {
    id: 'weather',
    name: 'Weather',
    description: 'Get weather information',
    detailedDescription: 'Fetch current weather and forecasts for any location.',
    icon: 'mdi:weather-partly-cloudy',
    type: 'stdio',
    installCommand: 'npx -y @modelcontextprotocol/server-weather',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-weather'],
    envVars: ['OPENWEATHER_API_KEY'],
    category: 'utilities'
  },
  {
    id: 'pdf',
    name: 'PDF Tools',
    description: 'Read and manipulate PDFs',
    detailedDescription: 'Extract text, merge, split, and manipulate PDF documents.',
    icon: 'mdi:file-pdf-box',
    type: 'stdio',
    installCommand: 'npx -y @modelcontextprotocol/server-pdf',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-pdf'],
    category: 'utilities'
  },

  // Remote Services (SSE/HTTP)
  {
    id: 'context7-sse',
    name: 'Context7 SSE',
    description: 'Real-time library documentation',
    detailedDescription: 'Provides up-to-date, version-specific documentation and code examples for any library directly in your prompt. No local installation required.',
    icon: 'mdi:book-open-variant',
    type: 'sse',
    url: 'https://mcp.context7.com/sse',
    configExample: `{
  "name": "context7",
  "type": "sse",
  "url": "https://mcp.context7.com/sse"
}`,
    category: 'remote'
  },
  {
    id: 'context7-http',
    name: 'Context7 HTTP',
    description: 'Library docs via streamable HTTP',
    detailedDescription: 'Modern streamable HTTP version of Context7. Provides the same documentation capabilities with better performance and compatibility.',
    icon: 'mdi:book-open-page-variant',
    type: 'http',
    url: 'https://mcp.context7.com/mcp',
    configExample: `{
  "name": "context7-http",
  "type": "http",
  "url": "https://mcp.context7.com/mcp"
}`,
    category: 'remote'
  },
  {
    id: 'context7-community',
    name: 'Context7 Community',
    description: 'Alternative Context7 endpoint',
    detailedDescription: 'Community-hosted Context7 server with HTTP streaming support. Provides the same documentation features.',
    icon: 'mdi:book-multiple',
    type: 'sse',
    url: 'https://context7.liam.sh/sse',
    configExample: `{
  "name": "context7-alt",
  "type": "sse",
  "url": "https://context7.liam.sh/sse"
}`,
    category: 'remote'
  },
  {
    id: 'cloudflare-remote-template',
    name: 'Cloudflare MCP Template',
    description: 'Deploy your own remote MCP',
    detailedDescription: 'Template for deploying your own remote MCP server on Cloudflare Workers with HTTP/SSE support.',
    icon: 'mdi:cloud-upload',
    type: 'http',
    url: 'https://your-worker.workers.dev/mcp',
    configExample: `{
  "name": "my-remote-mcp",
  "type": "http",
  "url": "https://your-worker.workers.dev/mcp",
  "headers": {
    "Authorization": "Bearer YOUR_API_KEY"
  }
}`,
    envVars: ['MCP_API_KEY'],
    category: 'remote'
  },
  {
    id: 'azure-remote-template',
    name: 'Azure Container Apps MCP',
    description: 'Azure-hosted MCP template',
    detailedDescription: 'Template for deploying MCP servers on Azure Container Apps with authentication and auto-scaling.',
    icon: 'mdi:microsoft-azure',
    type: 'sse',
    url: 'https://your-mcp.azurecontainerapps.io/sse',
    configExample: `{
  "name": "azure-mcp",
  "type": "sse",
  "url": "https://your-mcp.azurecontainerapps.io/sse",
  "headers": {
    "X-API-Key": "YOUR_API_KEY"
  }
}`,
    envVars: ['AZURE_API_KEY'],
    category: 'remote'
  },
  {
    id: 'apisix-bridge',
    name: 'APISIX MCP Bridge',
    description: 'API Gateway for MCP servers',
    detailedDescription: 'Apache APISIX plugin that converts stdio MCP servers to HTTP/SSE with authentication and rate limiting.',
    icon: 'mdi:api',
    type: 'sse',
    url: 'https://your-gateway.com/mcp',
    configExample: `{
  "name": "apisix-mcp",
  "type": "sse",
  "url": "https://your-gateway.com/mcp",
  "headers": {
    "Authorization": "Bearer YOUR_TOKEN"
  }
}`,
    category: 'remote'
  },
  {
    id: 'custom-http',
    name: 'Custom HTTP MCP',
    description: 'Connect to any HTTP MCP server',
    detailedDescription: 'Configure your own HTTP-based MCP server with custom endpoint and headers.',
    icon: 'mdi:api',
    type: 'http',
    url: 'https://api.example.com/mcp',
    configExample: `{
  "name": "custom-http",
  "type": "http",
  "url": "https://api.example.com/mcp",
  "headers": {
    "Authorization": "Bearer YOUR_TOKEN",
    "X-Custom-Header": "value"
  }
}`,
    category: 'remote',
    customizable: true
  },
  {
    id: 'custom-sse',
    name: 'Custom SSE MCP',
    description: 'Connect to any SSE MCP server',
    detailedDescription: 'Configure your own Server-Sent Events (SSE) based MCP server with custom endpoint and headers.',
    icon: 'mdi:broadcast',
    type: 'sse',
    url: 'https://api.example.com/sse',
    configExample: `{
  "name": "custom-sse",
  "type": "sse",
  "url": "https://api.example.com/sse",
  "headers": {
    "Authorization": "Bearer YOUR_TOKEN",
    "X-Custom-Header": "value"
  }
}`,
    category: 'remote',
    customizable: true
  }
];

// Computed categories
const developmentServers = computed(() => 
  serverTemplates.filter(s => s.category === 'development')
);

const cloudServers = computed(() => 
  serverTemplates.filter(s => s.category === 'cloud')
);

const dataServers = computed(() => 
  serverTemplates.filter(s => s.category === 'data')
);

const communicationServers = computed(() => 
  serverTemplates.filter(s => s.category === 'communication')
);

const automationServers = computed(() => 
  serverTemplates.filter(s => s.category === 'automation')
);

const utilitiesServers = computed(() => 
  serverTemplates.filter(s => s.category === 'utilities')
);

const remoteServers = computed(() => 
  serverTemplates.filter(s => s.category === 'remote')
);

// Computed property to check if server can be installed
const canInstall = computed(() => {
  if (!selectedServer.value) return false;
  
  // Check if custom URL is required and provided
  if (selectedServer.value.customizable && selectedServer.value.type !== 'stdio') {
    if (!customUrl.value.trim()) {
      return false;
    }
  }
  
  // Check if all required environment variables are filled
  if (selectedServer.value.envVars && selectedServer.value.envVars.length > 0) {
    const allEnvVarsFilled = selectedServer.value.envVars.every(
      envVar => envValues.value[envVar] && envValues.value[envVar].trim() !== ''
    );
    if (!allEnvVarsFilled) {
      return false;
    }
  }
  
  return true;
});

// Check if a server is already installed
const isInstalled = (serverName: string) => {
  return mcpStore.servers.some(s => 
    s.name.toLowerCase() === serverName.toLowerCase()
  );
};

// Quick add server
const quickAddServer = (server: MCPServerTemplate) => {
  if (isInstalled(server.name)) {
    // Show info that it's already installed
    return;
  }
  selectedServer.value = server;
  // Clear previous env values when selecting a new server
  envValues.value = {};
  // Initialize custom URL with the default URL for customizable servers
  customUrl.value = server.customizable ? '' : '';
};

// Close modal
const closeModal = () => {
  selectedServer.value = null;
  envValues.value = {};
  customUrl.value = '';
};

// Copy command to clipboard
const copyCommand = async (command: string) => {
  try {
    await navigator.clipboard.writeText(command);
    // Could add a toast notification here
  } catch (error) {
    console.error('Failed to copy command:', error);
  }
};

// Get tooltip for server card
const getServerTooltip = (server: MCPServerTemplate) => {
  if (server.requirements && server.requirements.length > 0) {
    return `Requirements:\n${server.requirements.join('\n')}`;
  }
  return server.detailedDescription || server.description;
};

// Install server
const installServer = async () => {
  if (!selectedServer.value) return;

  // Validate required environment variables
  if (selectedServer.value.envVars && selectedServer.value.envVars.length > 0) {
    const missingVars = selectedServer.value.envVars.filter(
      envVar => !envValues.value[envVar] || envValues.value[envVar].trim() === ''
    );
    
    if (missingVars.length > 0) {
      alert(`Please provide values for: ${missingVars.join(', ')}`);
      return;
    }
  }

  const config: MCPServerConfig = {
    name: selectedServer.value.name.toLowerCase().replace(/\s+/g, '-'),
    type: selectedServer.value.type,
  };

  // For stdio servers, add command and args
  if (selectedServer.value.type === 'stdio') {
    config.command = selectedServer.value.command;
    if (selectedServer.value.args) {
      // Create a new array to ensure it's serializable
      config.args = [...selectedServer.value.args];
    }
  } else {
    // For SSE/HTTP servers, add URL (use custom URL if provided)
    if (selectedServer.value.customizable && customUrl.value.trim()) {
      config.url = customUrl.value.trim();
    } else {
      config.url = selectedServer.value.url;
    }
  }

  // Add environment variables if any
  if (selectedServer.value.envVars && selectedServer.value.envVars.length > 0) {
    config.env = {};
    for (const envVar of selectedServer.value.envVars) {
      // Use the actual value entered by the user
      const value = envValues.value[envVar];
      if (value && value.trim() !== '') {
        config.env[envVar] = value;
      }
    }
  }

  // Add headers for remote servers
  if (selectedServer.value.headers && selectedServer.value.type !== 'stdio') {
    // Create a new object to ensure it's serializable
    config.headers = { ...selectedServer.value.headers };
  }

  try {
    // Create a clean config object to ensure all properties are serializable
    const cleanConfig: MCPServerConfig = JSON.parse(JSON.stringify(config));
    
    // Log the config to debug
    
    
    await mcpStore.addServer(cleanConfig);
    emit('server-added', selectedServer.value);
    closeModal();
  } catch (error) {
    console.error('Failed to add server:', error);
    console.error('Config that failed:', config);
    alert(`Failed to add server: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};
</script>

<style scoped>
.mcp-quick-add {
  padding: 16px;
  height: 100%;
  overflow-y: auto;
}

.mcp-quick-add h3 {
  font-size: 18px;
  font-weight: 500;
  margin: 0 0 8px;
}

.description {
  color: #858585;
  font-size: 13px;
  margin: 0 0 20px;
}

.server-categories {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.category h4 {
  font-size: 14px;
  font-weight: 500;
  margin: 0 0 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #858585;
}

.server-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
}

.server-card {
  background: #252526;
  border: 1px solid #3e3e42;
  border-radius: 6px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}

.server-card:hover {
  background: #2d2d30;
  border-color: #007acc;
  transform: translateY(-1px);
}

.server-card.installed {
  opacity: 0.7;
  cursor: default;
}

.server-card.installed:hover {
  transform: none;
  border-color: #3e3e42;
}

.server-card h5 {
  font-size: 14px;
  font-weight: 500;
  margin: 8px 0 4px;
}

.server-card p {
  font-size: 12px;
  color: #858585;
  margin: 0;
  line-height: 1.4;
}

.installed-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  background: #0e7a0d;
  color: white;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.requirements-badge {
  position: absolute;
  bottom: 8px;
  left: 8px;
  background: rgba(255, 152, 0, 0.2);
  color: #ff9800;
  padding: 2px 6px;
  border-radius: 3px;
  display: flex;
  align-items: center;
  border: 1px solid rgba(255, 152, 0, 0.4);
}

.server-type {
  position: absolute;
  bottom: 8px;
  right: 8px;
  background: #3e3e42;
  color: #858585;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 3px;
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

.modal {
  background: #1e1e1e;
  border: 1px solid #3e3e42;
  border-radius: 8px;
  width: 90%;
  max-width: 600px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid #3e3e42;
}

.modal-header h3 {
  margin: 0;
  font-size: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.close-button {
  background: none;
  border: none;
  color: #858585;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  border-radius: 4px;
}

.close-button:hover {
  background: #3e3e42;
  color: #cccccc;
}

.modal-content {
  padding: 16px;
  overflow-y: auto;
  flex: 1;
}

.server-description {
  color: #cccccc;
  margin: 0 0 20px;
  line-height: 1.5;
}

.installation-steps h4 {
  font-size: 14px;
  font-weight: 500;
  margin: 0 0 12px;
}

.command-box {
  background: #1e1e1e;
  border: 1px solid #3e3e42;
  border-radius: 4px;
  padding: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.command-box code {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 13px;
  color: #d7ba7d;
}

.copy-button {
  background: #3e3e42;
  border: none;
  color: #cccccc;
  cursor: pointer;
  padding: 6px;
  border-radius: 4px;
  display: flex;
  align-items: center;
}

.copy-button:hover {
  background: #5a5a5a;
}

.config-section,
.env-section {
  margin-top: 16px;
}

.config-section h5,
.env-section h5 {
  font-size: 13px;
  font-weight: 500;
  margin: 0 0 8px;
  color: #858585;
}

.config-example {
  background: #1e1e1e;
  border: 1px solid #3e3e42;
  border-radius: 4px;
  padding: 12px;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
  color: #cccccc;
  overflow-x: auto;
  white-space: pre;
}

.env-section ul {
  margin: 0;
  padding-left: 20px;
}

.env-section li {
  margin: 4px 0;
}

.env-section code {
  background: #252526;
  padding: 2px 4px;
  border-radius: 3px;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px;
  border-top: 1px solid #3e3e42;
}

.cancel-button {
  background: #3e3e42;
  border: none;
  color: #cccccc;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}

.cancel-button:hover {
  background: #5a5a5a;
}

.primary-button {
  background: #007acc;
  border: none;
  color: white;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.primary-button:hover:not(:disabled) {
  background: #005a9e;
}

.primary-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  background: #4a4a4a;
}

.connection-info {
  background: #1e1e1e;
  border: 1px solid #3e3e42;
  border-radius: 4px;
  padding: 16px;
  margin-bottom: 16px;
}

.info-item {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 13px;
}

.info-item:last-child {
  margin-bottom: 0;
}

.info-item code {
  background: #252526;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 12px;
}

.remote-note {
  margin-top: 12px;
  padding: 8px 12px;
  background: rgba(0, 122, 204, 0.1);
  border: 1px solid rgba(0, 122, 204, 0.3);
  border-radius: 4px;
  font-size: 12px;
  color: #7cc7ff;
  display: flex;
  align-items: center;
  gap: 6px;
}

.auth-note {
  margin-top: 8px;
  font-size: 12px;
  color: #858585;
  font-style: italic;
}

.env-inputs {
  margin-top: 12px;
}

.env-input-group {
  margin-bottom: 16px;
}

.env-input-group label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  color: #cccccc;
  font-weight: 500;
}

.env-input-group label code {
  background: #252526;
  padding: 2px 6px;
  border-radius: 3px;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
}

.env-input-group .required {
  color: #f48771;
  margin-left: 4px;
}

.env-input {
  width: 100%;
  padding: 8px 12px;
  background: #3c3c3c;
  border: 1px solid #6c6c6c;
  border-radius: 4px;
  color: #d4d4d4;
  font-size: 14px;
  font-family: 'Consolas', 'Monaco', monospace;
}

.env-input:focus {
  outline: none;
  border-color: #007acc;
  box-shadow: 0 0 0 1px #007acc;
}

.env-input:placeholder-shown {
  border-color: #6c6c6c;
}

.env-input:not(:placeholder-shown) {
  border-color: #0e7a0d;
}

.env-input[type="password"] {
  letter-spacing: 2px;
}

.env-input-group small {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: #858585;
}

.env-input-group small a {
  color: #007acc;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.env-input-group small a:hover {
  text-decoration: underline;
}

.requirements-section {
  margin: 16px 0;
  padding: 16px;
  background: rgba(255, 152, 0, 0.1);
  border: 1px solid rgba(255, 152, 0, 0.3);
  border-radius: 4px;
}

.requirements-section h4 {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 500;
  color: #ff9800;
}

.requirements-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.requirements-list li {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 6px 0;
  font-size: 13px;
  color: #cccccc;
}

.requirements-list li .icon {
  color: #ff9800;
  flex-shrink: 0;
}

.custom-url-section {
  margin: 16px 0;
}

.custom-url-section label {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  font-size: 13px;
  color: #cccccc;
}

.custom-url-input {
  width: 100%;
  padding: 8px 12px;
  background: #3c3c3c;
  border: 1px solid #6c6c6c;
  border-radius: 4px;
  color: #d4d4d4;
  font-size: 14px;
  font-family: 'Consolas', 'Monaco', monospace;
  margin-bottom: 4px;
}

.custom-url-input:focus {
  outline: none;
  border-color: #007acc;
  box-shadow: 0 0 0 1px #007acc;
}

.custom-url-section small {
  display: block;
  font-size: 11px;
  color: #858585;
  margin-top: 4px;
}
</style>