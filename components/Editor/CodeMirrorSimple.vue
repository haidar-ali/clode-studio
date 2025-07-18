<template>
  <div ref="editorContainer" class="codemirror-simple"></div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';
import { EditorView, basicSetup } from 'codemirror';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';

const props = defineProps<{
  modelValue: string;
  language?: string;
  readonly?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
  'change': [value: string];
}>();

const editorContainer = ref<HTMLElement>();
let editorView: EditorView | null = null;
let isUpdatingExternally = false;

// Create editor extensions
const createEditorExtensions = () => {
  const extensions = [
    basicSetup,
    oneDark,
    EditorView.theme({
      '&': {
        fontSize: '13px',
        fontFamily: 'Consolas, Monaco, "Courier New", monospace',
        height: '100%'
      },
      '.cm-content': {
        padding: '16px',
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
        overflow: 'auto'
      }
    }),
    EditorView.updateListener.of((update) => {
      if (update.docChanged && !isUpdatingExternally) {
        const content = update.state.doc.toString();
        emit('update:modelValue', content);
        emit('change', content);
      }
    })
  ];

  // Add language support
  if (props.language === 'markdown') {
    extensions.push(markdown());
  }

  // Add readonly mode
  if (props.readonly) {
    extensions.push(EditorState.readOnly.of(true));
  }

  return extensions;
};

// Initialize editor
onMounted(() => {
  if (!editorContainer.value) return;

  const state = EditorState.create({
    doc: props.modelValue || '',
    extensions: createEditorExtensions()
  });

  editorView = new EditorView({
    state,
    parent: editorContainer.value
  });
});

// Watch for external changes to modelValue
watch(() => props.modelValue, (newValue) => {
  if (!editorView) return;

  const currentContent = editorView.state.doc.toString();
  if (newValue !== currentContent) {
    isUpdatingExternally = true;
    
    const transaction = editorView.state.update({
      changes: {
        from: 0,
        to: currentContent.length,
        insert: newValue
      }
    });
    
    editorView.dispatch(transaction);
    
    // Reset flag after update
    setTimeout(() => {
      isUpdatingExternally = false;
    }, 10);
  }
});

// Cleanup
onUnmounted(() => {
  if (editorView) {
    editorView.destroy();
  }
});
</script>

<style scoped>
.codemirror-simple {
  height: 100%;
  width: 100%;
  overflow: hidden;
}

.codemirror-simple :deep(.cm-editor) {
  height: 100% !important;
}

.codemirror-simple :deep(.cm-scroller) {
  height: 100% !important;
  overflow: auto !important;
  scrollbar-width: thin;
  scrollbar-color: #555 #2d2d30;
}

.codemirror-simple :deep(.cm-scroller)::-webkit-scrollbar {
  width: 12px;
  height: 12px;
}

.codemirror-simple :deep(.cm-scroller)::-webkit-scrollbar-track {
  background: #2d2d30;
}

.codemirror-simple :deep(.cm-scroller)::-webkit-scrollbar-thumb {
  background: #555;
  border-radius: 6px;
}

.codemirror-simple :deep(.cm-scroller)::-webkit-scrollbar-thumb:hover {
  background: #777;
}
</style>