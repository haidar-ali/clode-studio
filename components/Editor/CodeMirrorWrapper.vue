<template>
  <div class="codemirror-wrapper">
    <!-- Knowledge Metadata Bar (only for knowledge files) -->
    <KnowledgeMetadataBar v-if="activeTab" />

    <div
      v-if="activeTab"
      ref="editorContainer"
      class="editor-container"
    ></div>

    <div v-else class="no-tab-message">
      No file selected
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { EditorView, basicSetup } from 'codemirror';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorState, StateEffect, StateField } from '@codemirror/state';
import { keymap, Decoration } from '@codemirror/view';
import { useEditorStore } from '~/stores/editor';
import { useCodeMirrorLanguages } from '~/composables/useCodeMirrorLanguages';
import KnowledgeMetadataBar from '~/components/Knowledge/KnowledgeMetadataBar.vue';

const editorStore = useEditorStore();
const { getLanguageSupport, getLanguageName } = useCodeMirrorLanguages();

const activeTab = computed(() => editorStore.activeTab);
const editorContainer = ref<HTMLElement>();
let editorView: EditorView | null = null;
let isSettingContent = false;

// Create a state effect for highlighting a line
const highlightLineEffect = StateEffect.define<{line: number}>();

// Create a state field to track highlighted lines
const highlightLineField = StateField.define({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    decorations = decorations.map(tr.changes);
    for (let e of tr.effects) {
      if (e.is(highlightLineEffect)) {
        decorations = Decoration.none;
        const line = tr.state.doc.line(e.value.line);
        decorations = decorations.update({
          add: [
            Decoration.line({
              class: 'cm-highlight-line'
            }).range(line.from)
          ]
        });
      }
    }
    return decorations;
  },
  provide: f => EditorView.decorations.from(f)
});

// Create editor extensions based on file type
const createEditorExtensions = (filename?: string): any[] => {
  const extensions: any[] = [
    basicSetup,
    oneDark,
    highlightLineField,
    // Add Ctrl+S save keybinding
    keymap.of([
      {
        key: 'Ctrl-s',
        mac: 'Cmd-s',
        run: () => {
          if (activeTab.value) {
            editorStore.saveTab(activeTab.value.id).catch((error) => {
              console.error('Save failed:', error);
            });
          }
          return true; // Prevent default browser save
        }
      }
    ]),
    EditorView.theme({
      '&': {
        fontSize: '14px',
        fontFamily: 'Consolas, Monaco, "Courier New", monospace',
        height: '100%'
      },
      '.cm-content': {
        padding: '10px',
        minHeight: '100%'
      },
      '.cm-focused': {
        outline: 'none'
      },
      '.cm-editor': {
        height: '100%'
      },
      '.cm-scroller': {
        fontFamily: 'Consolas, Monaco, "Courier New", monospace !important',
        overflow: 'auto',
        paddingBottom: '50px' // Add padding for search panel
      },
      // Fix search panel positioning
      '.cm-panels': {
        position: 'fixed',
        bottom: '0',
        left: '0',
        right: '0',
        zIndex: 10,
        backgroundColor: '#2d2d30',
        borderTop: '1px solid #181818'
      },
      '.cm-panels.cm-panels-bottom': {
        position: 'absolute',
        bottom: '0'
      },
      '.cm-search': {
        backgroundColor: '#2d2d30',
        color: '#cccccc',
        padding: '8px'
      },
      '.cm-searchField': {
        backgroundColor: '#3c3c3c',
        border: '1px solid #6c6c6c',
        color: '#d4d4d4'
      },
      '.cm-highlight-line': {
        backgroundColor: 'rgba(255, 255, 0, 0.1)',
        animation: 'highlight-fade 8s ease-out'
      },
      '@keyframes highlight-fade': {
        '0%': { backgroundColor: 'rgba(255, 255, 0, 0.3)' },
        '25%': { backgroundColor: 'rgba(255, 255, 0, 0.25)' },
        '50%': { backgroundColor: 'rgba(255, 255, 0, 0.15)' },
        '75%': { backgroundColor: 'rgba(255, 255, 0, 0.08)' },
        '100%': { backgroundColor: 'rgba(255, 255, 0, 0.03)' }
      }
    }),
    EditorView.updateListener.of((update) => {
      if (update.docChanged && activeTab.value && !isSettingContent) {
        const content = update.state.doc.toString();
        editorStore.updateTabContent(activeTab.value.id, content);
      }
    })
  ];

  // Add language support based on file type
  if (filename) {
    const languageSupport = getLanguageSupport(filename);
    if (languageSupport) {
      extensions.push(languageSupport);
      // Language support loaded
    }
  }

  return extensions;
};

// Function to go to a specific line
const goToLine = (lineNumber: number) => {
  if (!editorView) return;

  try {
    const line = editorView.state.doc.line(lineNumber);

    // Create a transaction to set selection and add highlight effect
    const transaction = editorView.state.update({
      selection: { anchor: line.from, head: line.from },
      effects: [highlightLineEffect.of({ line: lineNumber })]
    });

    editorView.dispatch(transaction);

    // Use requestAnimationFrame to ensure DOM is updated before scrolling
    requestAnimationFrame(() => {
      // Get the position of the line
      const pos = editorView.coordsAtPos(line.from);
      if (!pos) return;

      // Get editor dimensions
      const scrollerRect = editorView.scrollDOM.getBoundingClientRect();

      // Calculate the line's position relative to the scroller
      const lineY = pos.top - scrollerRect.top + editorView.scrollDOM.scrollTop;

      // Calculate scroll position to center the line
      // We want the line to be in the middle of the viewport
      const targetScrollTop = lineY - (scrollerRect.height / 2) + 10; // 10px for line height approximation

      // Smooth scroll to the target position
      editorView.scrollDOM.scrollTo({
        top: Math.max(0, targetScrollTop),
        behavior: 'smooth'
      });

      // Focus the editor
      editorView.focus();
    });

    // Remove highlight after animation completes
    setTimeout(() => {
      if (editorView) {
        editorView.dispatch({
          effects: [highlightLineEffect.of({ line: -1 })]
        });
      }
    }, 10000); // 10 seconds total: 8s animation + 2s extra
  } catch (error) {
    console.error('Error jumping to line:', error);
  }
};

// Initialize CodeMirror
onMounted(async () => {
  if (!process.client || !editorContainer.value) return;

  try {
    const state = EditorState.create({
      doc: '',
      extensions: createEditorExtensions(activeTab.value?.name)
    });

    editorView = new EditorView({
      state,
      parent: editorContainer.value
    });

    // Load initial content if there's an active tab
    if (activeTab.value) {
      setEditorContent(activeTab.value);
    }

    // Listen for goto-line events
    const handleGotoLine = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail && customEvent.detail.line) {
        goToLine(customEvent.detail.line);
      }
    };

    window.addEventListener('editor:goto-line', handleGotoLine);

    // Cleanup listener on unmount
    onUnmounted(() => {
      window.removeEventListener('editor:goto-line', handleGotoLine);
    });

  } catch (error) {
    console.error('Failed to initialize CodeMirror:', error);
  }
});

// Function to set editor content
const setEditorContent = (tab: any) => {
  if (!editorView) return;

  try {
    const content = tab.content || '';

    isSettingContent = true;

    const transaction = editorView.state.update({
      changes: {
        from: 0,
        to: editorView.state.doc.length,
        insert: content
      }
    });

    editorView.dispatch(transaction);

    // Reset flag after a short delay
    setTimeout(() => {
      isSettingContent = false;
    }, 100);

  } catch (error) {
    console.error('Error setting CodeMirror content:', error);
    isSettingContent = false;
  }
};

// Watch for tab changes
watch(activeTab, async (newTab, oldTab) => {
  if (newTab && editorView) {
    await nextTick();

    // Check if we need to update the language support
    const newExt = newTab.name.split('.').pop()?.toLowerCase();
    const oldExt = oldTab?.name.split('.').pop()?.toLowerCase();

    if (newExt !== oldExt || !oldTab) {
      // Recreate editor with new language support
      // Save current scroll position
      const scrollTop = editorView.scrollDOM.scrollTop;

      // Create new state with new extensions
      const newState = EditorState.create({
        doc: newTab.content || '',
        extensions: createEditorExtensions(newTab.name)
      });

      // Update the editor
      editorView.setState(newState);

      // Restore scroll position
      editorView.scrollDOM.scrollTop = scrollTop;

      // Mark content as set
      isSettingContent = true;
      setTimeout(() => {
        isSettingContent = false;
      }, 100);
    } else {
      // Same language, just update content
      setEditorContent(newTab);
    }
  }
});

// Watch for content changes (e.g., from external file updates)
watch(
  () => activeTab.value?.content,
  (newContent) => {
    if (activeTab.value && editorView && newContent !== undefined) {
      const currentContent = editorView.state.doc.toString();
      // Only update if content is different and we're not currently typing
      if (newContent !== currentContent && !isSettingContent) {
        setEditorContent(activeTab.value);
      }
    }
  }
);

// Cleanup
onUnmounted(() => {
  if (editorView) {
    editorView.destroy();
  }
});
</script>

<style scoped>
.codemirror-wrapper {
  height: 100%;
  width: 100%;
  position: relative;
  display: flex;
  flex-direction: column;
}

.editor-container {
  height: 100%;
  width: 100%;
  overflow: hidden;
  position: relative;
}

.editor-container :deep(.cm-editor) {
  height: 100% !important;
  width: 100% !important;
}

.editor-container :deep(.cm-scroller) {
  height: 100% !important;
  overflow: auto !important;
  scrollbar-width: thin;
  scrollbar-color: #555 #2d2d30;
}

.editor-container :deep(.cm-scroller)::-webkit-scrollbar {
  width: 14px;
  height: 14px;
}

.editor-container :deep(.cm-scroller)::-webkit-scrollbar-track {
  background: #2d2d30;
}

.editor-container :deep(.cm-scroller)::-webkit-scrollbar-thumb {
  background: #555;
  border-radius: 6px;
}

.editor-container :deep(.cm-scroller)::-webkit-scrollbar-thumb:hover {
  background: #777;
}

.no-tab-message {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #858585;
}
</style>