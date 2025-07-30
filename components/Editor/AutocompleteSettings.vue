<template>
  <div class="autocomplete-settings">
    <h3>Autocomplete Settings</h3>
    
    <!-- Master Toggle -->
    <div class="setting-group">
      <label class="toggle-setting">
        <input 
          type="checkbox" 
          v-model="settings.enabled"
          @change="updateSettings"
        />
        <span>Enable Autocomplete</span>
      </label>
    </div>

    <!-- Provider Settings -->
    <div class="setting-section" v-if="settings.enabled">
      <h4>Completion Providers</h4>
      
      <div class="setting-group">
        <label class="toggle-setting">
          <input 
            type="checkbox" 
            v-model="settings.providers.claude.enabled"
            @change="updateSettings"
          />
          <span>Claude AI Ghost Text</span>
        </label>
        <div class="sub-settings" v-if="settings.providers.claude.enabled">
          <div class="setting-description">
            Claude provides inline suggestions that appear as ghost text after you pause typing.
            Press Tab to accept suggestions.
          </div>
          <label class="setting-item">
            <span>Model:</span>
            <select v-model="settings.providers.claude.model" @change="updateSettings">
              <option value="claude-sonnet-4-20250514">Claude Sonnet 4 (Fast)</option>
              <option value="claude-opus-4-20250514">Claude Opus 4 (Powerful)</option>
            </select>
          </label>
          <label class="setting-item">
            <span>Delay (ms):</span>
            <input 
              type="number" 
              v-model.number="settings.providers.claude.timeout"
              @change="updateSettings"
              min="500"
              max="3000"
              step="100"
              title="How long to wait after typing stops before requesting suggestions"
            />
          </label>
          <label class="setting-item">
            <span>Context Lines:</span>
            <input 
              type="number" 
              v-model.number="settings.providers.claude.contextLines"
              @change="updateSettings"
              min="5"
              max="50"
              step="5"
            />
          </label>
        </div>
      </div>

      <div class="setting-group">
        <label class="toggle-setting">
          <input 
            type="checkbox" 
            v-model="settings.providers.lsp.enabled"
            @change="updateSettings"
          />
          <span>Language Server Protocol (Dropdown)</span>
        </label>
        <div class="sub-settings" v-if="settings.providers.lsp.enabled">
          <div class="setting-description">
            LSP provides instant dropdown completions as you type, powered by language-specific servers.
          </div>
          <label class="setting-item">
            <span>Timeout (ms):</span>
            <input 
              type="number" 
              v-model.number="settings.providers.lsp.timeout"
              @change="updateSettings"
              min="10"
              max="200"
              step="10"
            />
          </label>
        </div>
      </div>

      <div class="setting-group">
        <label class="toggle-setting">
          <input 
            type="checkbox" 
            v-model="settings.providers.cache.enabled"
            @change="updateSettings"
          />
          <span>Local Cache</span>
        </label>
        <div class="sub-settings" v-if="settings.providers.cache.enabled">
          <label class="setting-item">
            <span>Cache Size:</span>
            <input 
              type="number" 
              v-model.number="settings.providers.cache.maxSize"
              @change="updateSettings"
              min="100"
              max="5000"
              step="100"
            />
          </label>
          <button @click="clearCache" class="clear-cache-btn">
            Clear Cache
          </button>
        </div>
      </div>
    </div>

    <!-- Privacy Settings -->
    <div class="setting-section" v-if="settings.enabled">
      <h4>Privacy</h4>
      
      <div class="setting-group">
        <label class="setting-item">
          <span>Mode:</span>
          <select v-model="settings.privacy.mode" @change="updateSettings">
            <option value="offline">Offline Only</option>
            <option value="selective">Selective (Whitelist)</option>
            <option value="full">Full (All Files)</option>
          </select>
        </label>
      </div>

      <div class="setting-group" v-if="settings.privacy.mode === 'selective'">
        <label>File Patterns to Allow:</label>
        <div class="pattern-list">
          <div 
            v-for="(pattern, index) in settings.privacy.fileWhitelist" 
            :key="index"
            class="pattern-item"
          >
            <span>{{ pattern }}</span>
            <button @click="removePattern(index)" class="remove-btn">×</button>
          </div>
          <input 
            v-model="newPattern" 
            @keyup.enter="addPattern"
            placeholder="Add pattern (e.g., *.ts)"
            class="pattern-input"
          />
        </div>
      </div>
    </div>

    <!-- UI Settings -->
    <div class="setting-section" v-if="settings.enabled">
      <h4>Display Options</h4>
      
      <div class="setting-group">
        <label class="setting-item">
          <span>Max Suggestions:</span>
          <input 
            type="number" 
            v-model.number="settings.ui.maxSuggestions"
            @change="updateSettings"
            min="5"
            max="20"
          />
        </label>
      </div>

      <div class="setting-group">
        <label class="toggle-setting">
          <input 
            type="checkbox" 
            v-model="settings.ui.showSource"
            @change="updateSettings"
          />
          <span>Show Completion Source</span>
        </label>
      </div>

      <div class="setting-group">
        <label class="toggle-setting">
          <input 
            type="checkbox" 
            v-model="settings.ui.showLatency"
            @change="updateSettings"
          />
          <span>Show Latency</span>
        </label>
      </div>
    </div>

    <!-- LSP Status -->
    <div class="setting-section" v-if="settings.enabled && settings.providers.lsp.enabled">
      <LSPStatus />
    </div>

    <!-- Performance Metrics -->
    <div class="setting-section" v-if="settings.enabled && metrics">
      <h4>Performance Metrics</h4>
      
      <div class="metrics">
        <div class="metric-item">
          <span class="metric-label">Total Completions:</span>
          <span class="metric-value">{{ metrics.totalCompletions }}</span>
        </div>
        
        <div class="metric-item" v-if="metrics.avgLatency.claude > 0">
          <span class="metric-label">Claude Avg Latency:</span>
          <span class="metric-value">{{ Math.round(metrics.avgLatency.claude) }}ms</span>
        </div>
        
        <div class="metric-item" v-if="metrics.avgLatency.lsp > 0">
          <span class="metric-label">LSP Avg Latency:</span>
          <span class="metric-value">{{ Math.round(metrics.avgLatency.lsp) }}ms</span>
        </div>
        
        <div class="metric-item" v-if="metrics.successRate.claude > 0">
          <span class="metric-label">Claude Success Rate:</span>
          <span class="metric-value">{{ Math.round(metrics.successRate.claude) }}%</span>
        </div>
        
        <button @click="resetMetrics" class="reset-metrics-btn">
          Reset Metrics
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useAutocompleteStore } from '~/stores/autocomplete';
import LSPStatus from './LSPStatus.vue';

const autocompleteStore = useAutocompleteStore();

// Local copy of settings for reactive editing
const settings = ref(JSON.parse(JSON.stringify(autocompleteStore.settings)));
const metrics = computed(() => autocompleteStore.metrics);
const newPattern = ref('');

// Update settings in store
const updateSettings = () => {
  autocompleteStore.updateSettings(settings.value);
};

// Clear cache
const clearCache = async () => {
  if (window.electronAPI?.autocomplete) {
    await window.electronAPI.autocomplete.clearCache();
  }
  autocompleteStore.clearCache();
};

// Pattern management
const addPattern = () => {
  if (newPattern.value && !settings.value.privacy.fileWhitelist.includes(newPattern.value)) {
    settings.value.privacy.fileWhitelist.push(newPattern.value);
    newPattern.value = '';
    updateSettings();
  }
};

const removePattern = (index: number) => {
  settings.value.privacy.fileWhitelist.splice(index, 1);
  updateSettings();
};

// Reset metrics
const resetMetrics = () => {
  autocompleteStore.resetMetrics();
};
</script>

<style scoped>
.autocomplete-settings {
  padding: 20px;
  max-width: 600px;
  margin: 0 auto;
}

h3 {
  margin-bottom: 20px;
  color: #e0e0e0;
}

h4 {
  margin-top: 20px;
  margin-bottom: 10px;
  color: #b0b0b0;
  font-size: 14px;
  text-transform: uppercase;
}

.setting-section {
  margin-bottom: 30px;
  padding-bottom: 20px;
  border-bottom: 1px solid #3c3c3c;
}

.setting-group {
  margin-bottom: 15px;
}

.toggle-setting {
  display: flex;
  align-items: center;
  cursor: pointer;
}

.toggle-setting input[type="checkbox"] {
  margin-right: 8px;
}

.setting-item {
  display: flex;
  align-items: center;
  margin-bottom: 10px;
}

.setting-item span:first-child {
  width: 120px;
  margin-right: 10px;
  color: #b0b0b0;
}

.sub-settings {
  margin-left: 24px;
  margin-top: 10px;
  padding-left: 16px;
  border-left: 2px solid #3c3c3c;
}

select,
input[type="number"] {
  background: #3c3c3c;
  color: #e0e0e0;
  border: 1px solid #545454;
  padding: 4px 8px;
  border-radius: 4px;
}

.pattern-list {
  margin-top: 10px;
}

.pattern-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px;
  background: #3c3c3c;
  margin-bottom: 4px;
  border-radius: 4px;
}

.remove-btn {
  background: none;
  border: none;
  color: #ff6b6b;
  cursor: pointer;
  font-size: 18px;
  padding: 0 4px;
}

.pattern-input {
  width: 100%;
  background: #3c3c3c;
  color: #e0e0e0;
  border: 1px solid #545454;
  padding: 6px 10px;
  border-radius: 4px;
  margin-top: 8px;
}

.clear-cache-btn,
.reset-metrics-btn {
  background: #007acc;
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  margin-top: 10px;
}

.clear-cache-btn:hover,
.reset-metrics-btn:hover {
  background: #005a9e;
}

.metrics {
  background: #2d2d30;
  padding: 15px;
  border-radius: 4px;
}

.metric-item {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
}

.metric-label {
  color: #b0b0b0;
}

.metric-value {
  color: #e0e0e0;
  font-weight: bold;
}

.setting-description {
  font-size: 12px;
  color: #9b9b9b;
  margin-bottom: 12px;
  line-height: 1.4;
}
</style>