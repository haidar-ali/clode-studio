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
import { EditorView } from 'codemirror';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorState, StateEffect, StateField } from '@codemirror/state';
import { keymap, Decoration } from '@codemirror/view';
import { acceptCompletion, startCompletion, closeCompletion, autocompletion } from '@codemirror/autocomplete';
import { history, defaultKeymap, historyKeymap } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches, search } from '@codemirror/search';
import { bracketMatching, foldGutter, indentOnInput, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { lineNumbers, highlightActiveLineGutter } from '@codemirror/view';
import { drawSelection, dropCursor, highlightActiveLine, rectangularSelection, crosshairCursor } from '@codemirror/view';
import { useEditorStore } from '~/stores/editor';
import { useCodeMirrorLanguages } from '~/composables/useCodeMirrorLanguages';
import { useLSPBridge } from '~/composables/useLSPBridge';
import { useGhostText } from '~/composables/useGhostText';
import KnowledgeMetadataBar from '~/components/Knowledge/KnowledgeMetadataBar.vue';

const editorStore = useEditorStore();
const { getLanguageSupport, getLanguageName } = useCodeMirrorLanguages();
const { createLSPCompletionSource } = useLSPBridge();
const { createGhostTextExtension } = useGhostText();

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
    // Basic editor features (replacing basicSetup but without default autocompletion)
    lineNumbers(),
    highlightActiveLineGutter(),
    history(),
    foldGutter(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    search(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    
    // Theme and styling
    oneDark,
    highlightLineField,
    
    // LSP completion integration
    autocompletion({
      override: [createLSPCompletionSource()]
    }),
    // Add ghost text extension (for Claude AI inline suggestions)
    createGhostTextExtension(async (prefix: string, suffix: string) => {
      try {
        // Check if ghost text is enabled in settings
        // Since we don't have the autocomplete store here, we'll let the ghost text service handle the check
        const result = await window.electronAPI.autocomplete.getGhostText({ prefix, suffix });
        return result.success ? result.suggestion : '';
      } catch (error) {
        return '';
      }
    }, {
      delay: 1000, // 1 second delay for ghost text
      acceptOnClick: true
    }),
    // Keyboard shortcuts
    keymap.of([
      ...defaultKeymap,
      ...historyKeymap,
      ...searchKeymap,
      ...closeBracketsKeymap,
      ...completionKeymap,
      // Manual trigger for autocomplete (Ctrl+Space, but use Ctrl+. on Mac to avoid Spotlight conflict)
      {
        key: 'Ctrl-Space',
        mac: 'Ctrl-.',
        run: (view) => {
          return startCompletion(view);
        }
      },
      // Alternative trigger for autocomplete
      {
        key: 'Alt-/',
        run: (view) => {
          return startCompletion(view);
        }
      },
      // Accept completion with Tab
      {
        key: 'Tab',
        run: acceptCompletion
      },
      // Close completion with Escape
      {
        key: 'Escape',
        run: closeCompletion
      },
      // Save file
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
      },
      // Autocomplete styles
      '.cm-tooltip-autocomplete': {
        backgroundColor: '#2d2d30',
        border: '1px solid #454545',
        borderRadius: '4px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.5)'
      },
      '.cm-tooltip-autocomplete > ul': {
        fontFamily: 'Consolas, Monaco, "Courier New", monospace',
        fontSize: '13px'
      },
      '.cm-tooltip-autocomplete > ul > li': {
        padding: '2px 8px',
        color: '#cccccc'
      },
      '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
        backgroundColor: '#094771',
        color: '#ffffff'
      },
      '.cm-completionIcon': {
        width: '16px',
        opacity: 0.7,
        marginRight: '4px'
      },
      '.cm-completionLabel': {
        flex: 1
      },
      '.cm-completionDetail': {
        fontStyle: 'italic',
        color: '#969696',
        marginLeft: '1em'
      },
      '.cm-completion-source': {
        fontSize: '11px',
        color: '#969696',
        marginLeft: '8px',
        fontStyle: 'italic'
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

// Store event listener reference
let gotoLineHandler: ((event: Event) => void) | null = null;

// Initialize CodeMirror
onMounted(async () => {
  if (!process.client || !editorContainer.value) return;

  // No need to initialize old autocomplete store anymore

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
      // Preload file context for better autocomplete
      if (activeTab.value.filepath && window.electronAPI?.autocomplete) {
        window.electronAPI.autocomplete.preloadFileContext(activeTab.value.filepath);
      }
    }

    // Listen for goto-line events
    gotoLineHandler = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail && customEvent.detail.line) {
        goToLine(customEvent.detail.line);
      }
    };

    window.addEventListener('editor:goto-line', gotoLineHandler);

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
      
      // Preload file context for better autocomplete
      if (newTab.filepath && window.electronAPI?.autocomplete) {
        window.electronAPI.autocomplete.preloadFileContext(newTab.filepath);
      }

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
  if (gotoLineHandler) {
    window.removeEventListener('editor:goto-line', gotoLineHandler);
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

/* Autocomplete Popup Styling */
:deep(.cm-tooltip-autocomplete) {
  background: #2a2a2a !important;
  border: 1px solid #444 !important;
  border-radius: 4px !important;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3) !important;
  padding: 4px 0 !important;
}

:deep(.cm-tooltip-autocomplete > ul) {
  font-family: 'Fira Code', monospace !important;
  font-size: 13px !important;
  max-height: 200px !important;
}

:deep(.cm-tooltip-autocomplete > ul > li) {
  padding: 4px 12px !important;
  color: #e0e0e0 !important;
  min-height: 24px !important;
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
}

:deep(.cm-tooltip-autocomplete > ul > li[aria-selected]) {
  background: #3d7aed !important;
  color: #fff !important;
}

:deep(.cm-completionLabel) {
  flex: 1 !important;
  white-space: pre !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
}

:deep(.cm-completionDetail) {
  font-size: 11px !important;
  opacity: 0.7 !important;
  margin-left: 8px !important;
  font-style: italic !important;
}

:deep(.cm-completion-custom) {
  display: flex !important;
  align-items: center !important;
  width: 100% !important;
  gap: 8px !important;
}

:deep(.cm-completion-source) {
  font-size: 10px !important;
  padding: 2px 6px !important;
  border-radius: 3px !important;
  font-weight: 500 !important;
  white-space: nowrap !important;
  flex-shrink: 0 !important;
}

:deep(.cm-completion-confidence) {
  font-size: 10px !important;
  opacity: 0.7 !important;
  margin-left: 4px !important;
  flex-shrink: 0 !important;
}

/* Completion icon styling */
:deep(.cm-completionIcon) {
  width: 16px !important;
  margin-right: 4px !important;
  opacity: 0.8 !important;
}
</style>