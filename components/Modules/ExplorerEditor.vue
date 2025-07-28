<template>
  <div class="explorer-editor-module">
    <Splitpanes class="default-theme">
      <!-- Explorer Pane -->
      <Pane :size="25" :min-size="15" :max-size="40">
        <div class="explorer-section">
          <FileTree />
        </div>
      </Pane>
      
      <!-- Editor Pane -->
      <Pane :size="75" :min-size="60">
        <div class="editor-section">
          <EditorTabs />
          <ClientOnly>
            <CodeMirrorWrapper v-if="activeTab" />
            <template #fallback>
              <div class="loading-editor">
                Loading editor...
              </div>
            </template>
          </ClientOnly>
          <div v-if="!activeTab" class="welcome-screen">
            <h2>Claude Code IDE</h2>
            <p>Open a file to start editing</p>
          </div>
        </div>
      </Pane>
    </Splitpanes>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Splitpanes, Pane } from 'splitpanes';
import { useEditorStore } from '~/stores/editor';
import FileTree from '~/components/FileExplorer/FileTree.vue';
import EditorTabs from '~/components/Editor/EditorTabs.vue';
import CodeMirrorWrapper from '~/components/Editor/CodeMirrorWrapper.vue';

const editorStore = useEditorStore();
const activeTab = computed(() => editorStore.activeTab);
</script>

<style scoped>
.explorer-editor-module {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
}

.explorer-section {
  height: 100%;
  overflow: hidden;
}

.editor-section {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
}

.loading-editor {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #858585;
  font-style: italic;
}

.welcome-screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #858585;
}

.welcome-screen h2 {
  font-size: 24px;
  margin-bottom: 8px;
}

/* Ensure proper splitpanes styling */
.explorer-editor-module :deep(.splitpanes__pane) {
  overflow: hidden;
}

.explorer-editor-module :deep(.splitpanes--vertical > .splitpanes__splitter) {
  width: 2px;
  background-color: #3c3c3c;
}
</style>