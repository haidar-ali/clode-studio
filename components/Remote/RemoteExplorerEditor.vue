<template>
  <div class="explorer-editor">
    <Splitpanes class="default-theme" @ready="onSplitpanesReady">
      <!-- Explorer Pane -->
      <Pane :size="explorerSize" :min-size="15" :max-size="50">
        <MobileExplorer @file-opened="handleFileOpened" />
      </Pane>
      
      <!-- Editor Pane -->
      <Pane :size="100 - explorerSize">
        <MobileEditor 
          :file-data="currentFile"
          @file-opened="handleFileOpened"
        />
      </Pane>
    </Splitpanes>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { Splitpanes, Pane } from 'splitpanes';
import 'splitpanes/dist/splitpanes.css';
import MobileExplorer from './MobileExplorer.vue';
import MobileEditor from './MobileEditor.vue';
import { useEditorStore } from '~/stores/editor';

const editorStore = useEditorStore();

const explorerSize = ref(25); // 25% for explorer by default
const currentFile = ref<{ path: string; content: string; name: string } | null>(null);

const onSplitpanesReady = () => {
  // Do nothing - just prevent errors
};

const handleFileOpened = (fileData: { path: string; content: string; name: string }) => {
  currentFile.value = fileData;
  // Also update the editor store
  editorStore.openFileWithContent(fileData.path, fileData.content, fileData.name);
};
</script>

<style scoped>
.explorer-editor {
  height: 100%;
  display: flex;
  overflow: hidden;
}

/* Override splitpanes styles for this component */
.splitpanes.default-theme .splitpanes__pane {
  background-color: #252526;
}

.splitpanes.default-theme .splitpanes__splitter {
  background-color: #3e3e42;
  border: none;
  width: 1px;
}

.splitpanes.default-theme .splitpanes__splitter:hover {
  background-color: #007acc;
}

.splitpanes--vertical > .splitpanes__splitter {
  cursor: ew-resize;
}
</style>