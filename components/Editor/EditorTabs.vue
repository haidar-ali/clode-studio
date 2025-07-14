<template>
  <div class="editor-tabs">
    <div class="tabs-container">
      <div
        v-for="tab in tabs"
        :key="tab.id"
        :class="['tab', { active: tab.id === activeTabId, dirty: tab.isDirty }]"
        @click="setActiveTab(tab.id)"
      >
        <span class="tab-name">{{ tab.name }}</span>
        <span v-if="tab.isDirty" class="dirty-indicator">●</span>
        <button
          @click.stop="closeTab(tab.id)"
          class="close-button"
          title="Close"
        >
          <Icon name="mdi:close" size="16" />
        </button>
      </div>
    </div>
    
    <div class="tabs-actions">
      <button
        @click="openFileDialog"
        class="icon-button"
        title="Open file"
      >
        <Icon name="mdi:file-plus" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useEditorStore } from '~/stores/editor';

const editorStore = useEditorStore();

const tabs = computed(() => editorStore.tabs);
const activeTabId = computed(() => editorStore.activeTabId);

const setActiveTab = (tabId: string) => {
  editorStore.activeTabId = tabId;
};

const closeTab = async (tabId: string) => {
  const tab = tabs.value.find(t => t.id === tabId);
  if (tab?.isDirty) {
    const shouldSave = confirm(`Save changes to ${tab.name}?`);
    if (shouldSave) {
      try {
        await editorStore.saveTab(tabId);
      } catch (error) {
        alert(`Failed to save file: ${error.message}`);
        return;
      }
    }
  }
  editorStore.closeTab(tabId);
};

const openFileDialog = async () => {
  try {
    const result = await window.electronAPI.dialog.selectFile();
    if (result.success && result.path) {
      await editorStore.openFile(result.path);
    }
  } catch (error) {
    console.error('Failed to open file dialog:', error);
    alert(`Failed to open file: ${error.message}`);
  }
};
</script>

<style scoped>
.editor-tabs {
  display: flex;
  align-items: center;
  background: #2d2d30;
  border-bottom: 1px solid #181818;
  min-height: 35px;
}

.tabs-container {
  display: flex;
  flex: 1;
  overflow-x: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.tabs-container::-webkit-scrollbar {
  display: none;
}

.tab {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  background: #2d2d30;
  border-right: 1px solid #181818;
  cursor: pointer;
  color: #969696;
  font-size: 13px;
  white-space: nowrap;
  min-width: 120px;
  max-width: 200px;
  position: relative;
}

.tab:hover {
  background: #37373d;
}

.tab.active {
  background: #1e1e1e;
  color: #ffffff;
}

.tab.active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: #007acc;
}

.tab-name {
  flex: 1;
  text-overflow: ellipsis;
  overflow: hidden;
}

.dirty-indicator {
  color: #ffffff;
  margin: 0 4px;
  font-size: 16px;
  line-height: 1;
}

.close-button {
  background: transparent;
  border: none;
  color: #969696;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: 8px;
  transition: all 0.2s;
  min-width: 20px;
  min-height: 20px;
}

.tab:hover .close-button {
  color: #cccccc;
  background: rgba(255, 255, 255, 0.1);
}

.close-button:hover {
  background: rgba(255, 255, 255, 0.2);
  color: #ffffff;
}

.tab.active .close-button {
  color: #cccccc;
}

.tabs-actions {
  display: flex;
  padding: 0 8px;
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
  background: #37373d;
}
</style>