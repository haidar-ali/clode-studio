<template>
  <div class="status-bar">
    <div class="status-bar-left">
      <!-- Activity Bar Toggle Button when collapsed -->
      <button
        v-if="layoutStore.activityBarCollapsed"
        class="activity-bar-toggle-btn"
        @click="toggleActivityBar"
        title="Toggle Activity Bar (Cmd/Ctrl + B)"
      >
        <Icon name="mdi:menu" size="16" />
      </button>
      
      <!-- Branch status commented out for now
      <span class="status-item">
        <Icon name="mdi:source-branch" />
        main
      </span>
      -->
      <span class="status-item" v-if="activeTab">
        {{ activeTab.language }}
      </span>
      <AutocompleteStatus @show-settings="$emit('show-autocomplete-settings')" />
    </div>
    
    <!--<div class="status-bar-center">
      <span class="status-item" :class="claudeStatusClass">
        <Icon :name="claudeStatusIcon" />
        Claude: {{ claudeStatus }}
      </span>
    </div> -->
    
    <div class="status-bar-right">
      <ConnectionStatus @view-logs="$emit('view-logs')" />
      <SnapshotButton />
      <QuickAccessToolbar />
      <span class="status-item" v-if="activeTab">
        Ln {{ cursorLine }}, Col {{ cursorColumn }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useEditorStore } from '~/stores/editor';
import { useChatStore } from '~/stores/chat';
import { useClaudeInstancesStore } from '~/stores/claude-instances';
import { useLayoutStore } from '~/stores/layout';
import QuickAccessToolbar from '~/components/Layout/QuickAccessToolbar.vue';
import SnapshotButton from '~/components/Snapshots/SnapshotButton.vue';
import AutocompleteStatus from '~/components/Editor/AutocompleteStatus.vue';
import ConnectionStatus from '~/components/Layout/ConnectionStatus.vue';

const emit = defineEmits<{
  'show-autocomplete-settings': [];
  'view-logs': [];
}>();

const editorStore = useEditorStore();
const chatStore = useChatStore();
const claudeInstancesStore = useClaudeInstancesStore();
const layoutStore = useLayoutStore();

const activeTab = computed(() => editorStore.activeTab);
const claudeStatus = computed(() => {
  const activeInstance = claudeInstancesStore.activeInstance;
  return activeInstance?.status || 'disconnected';
});

const cursorLine = ref(1);
const cursorColumn = ref(1);

const claudeStatusClass = computed(() => ({
  'status-connected': claudeStatus.value === 'connected',
  'status-disconnected': claudeStatus.value === 'disconnected',
  'status-connecting': claudeStatus.value === 'connecting'
}));

const claudeStatusIcon = computed(() => {
  switch (claudeStatus.value) {
    case 'connected':
      return 'mdi:check-circle';
    case 'connecting':
      return 'mdi:loading';
    case 'disconnected':
    default:
      return 'mdi:alert-circle';
  }
});

const toggleActivityBar = () => {
  layoutStore.setActivityBarCollapsed(false);
};

</script>

<style scoped>
.status-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #007acc;
  color: white;
  height: 22px;
  padding: 0 10px;
  font-size: 12px;
  font-weight: 500;
}

.status-bar-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.status-bar-center {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
}

.status-bar-right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  justify-content: flex-end;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.status-connected {
  color: #4ec9b0;
}

.status-disconnected {
  color: #f48771;
}

.status-connecting {
  color: #e7c547;
}

/* Activity Bar Toggle Button */
.activity-bar-toggle-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  border-radius: 3px;
  color: white;
  cursor: pointer;
  padding: 0 8px;
  height: 18px;
  margin-right: 8px;
  transition: all 0.2s;
}

.activity-bar-toggle-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.activity-bar-toggle-btn:active {
  transform: scale(0.95);
}
</style>