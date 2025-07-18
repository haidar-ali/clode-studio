<template>
  <div class="knowledge-editor">
    <div ref="editorContainer" class="editor-container"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { markdown } from '@codemirror/lang-markdown';
import { yaml } from '@codemirror/lang-yaml';
import { languages } from '@codemirror/language-data';
import { autocompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { keymap } from '@codemirror/view';
import { useKnowledgeStore } from '~/stores/knowledge';

interface Props {
  modelValue: string;
  entryId?: string;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  'update:modelValue': [value: string];
  'save': [];
}>();

const knowledgeStore = useKnowledgeStore();
const editorContainer = ref<HTMLElement>();
let editorView: EditorView | null = null;

// Custom autocomplete for knowledge base
const knowledgeAutocomplete = (context: CompletionContext): CompletionResult | null => {
  const word = context.matchBefore(/[@#\[\[]\w*/);
  if (!word) return null;

  const options = [];
  
  // Tag autocomplete
  if (word.text.startsWith('#')) {
    const searchTerm = word.text.slice(1).toLowerCase();
    const tags = knowledgeStore.allTags.filter(tag => 
      tag.toLowerCase().includes(searchTerm)
    );
    
    options.push(...tags.map(tag => ({
      label: `#${tag}`,
      type: 'keyword',
      detail: 'tag'
    })));
  }
  
  // Knowledge entry reference autocomplete
  if (word.text.startsWith('[[')) {
    const searchTerm = word.text.slice(2).toLowerCase();
    const entries = knowledgeStore.entries.filter(entry => 
      entry.title.toLowerCase().includes(searchTerm)
    );
    
    options.push(...entries.map(entry => ({
      label: `[[${entry.title}]]`,
      type: 'text',
      detail: entry.metadata.category,
      info: entry.content.slice(0, 100) + '...'
    })));
  }
  
  // Template autocomplete
  if (word.text.startsWith('@')) {
    const templates = [
      { label: '@api-endpoint', detail: 'API endpoint documentation template' },
      { label: '@architecture', detail: 'Architecture decision record template' },
      { label: '@troubleshooting', detail: 'Troubleshooting guide template' },
      { label: '@pattern', detail: 'Design pattern documentation template' }
    ];
    
    const searchTerm = word.text.slice(1).toLowerCase();
    options.push(...templates.filter(t => 
      t.label.toLowerCase().includes(searchTerm)
    ).map(t => ({
      ...t,
      type: 'function'
    })));
  }

  if (options.length === 0) return null;

  return {
    from: word.from,
    options,
    validFor: /^[@#\[\[]?\w*$/
  };
};

// Template expansion
const expandTemplate = (template: string): string => {
  const templates: Record<string, string> = {
    '@api-endpoint': `---
title: API Endpoint - 
tags: [api]
category: api
priority: medium
---

# API Endpoint: 

## Overview

## Request

\`\`\`http
METHOD /path/to/endpoint
Content-Type: application/json
\`\`\`

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| param1    | string | Yes     | Description |

### Request Body

\`\`\`json
{
  "field": "value"
}
\`\`\`

## Response

### Success Response (200 OK)

\`\`\`json
{
  "status": "success",
  "data": {}
}
\`\`\`

### Error Responses

- **400 Bad Request**: Invalid parameters
- **401 Unauthorized**: Missing or invalid authentication
- **500 Internal Server Error**: Server error

## Examples

### cURL

\`\`\`bash
curl -X POST https://api.example.com/endpoint \\
  -H "Content-Type: application/json" \\
  -d '{"field": "value"}'
\`\`\``,

    '@architecture': `---
title: Architecture Decision - 
tags: [architecture, adr]
category: architecture
priority: high
---

# Architecture Decision Record: 

## Status
Proposed / Accepted / Deprecated

## Context
What is the issue that we're seeing that is motivating this decision?

## Decision
What is the change that we're proposing and/or doing?

## Consequences
What becomes easier or more difficult to do because of this change?

### Positive
- 

### Negative
- 

## Alternatives Considered
1. **Alternative 1**: Description
   - Pros: 
   - Cons: 

## References
- [Link to relevant documentation]()`,

    '@troubleshooting': `---
title: Troubleshooting - 
tags: [troubleshooting, debug]
category: troubleshooting
---

# Troubleshooting: 

## Problem Description

## Symptoms
- 

## Common Causes
1. 
2. 

## Solutions

### Solution 1: 
1. Step one
2. Step two

### Solution 2: 
1. Step one
2. Step two

## Prevention
- 

## Related Issues
- [[Related Knowledge Entry]]`,

    '@pattern': `---
title: Pattern - 
tags: [pattern, design]
category: patterns
---

# Design Pattern: 

## Intent
What problem does this pattern solve?

## Motivation
Real-world example of where this pattern is useful.

## Structure
Description of the pattern's components and their relationships.

## Implementation

\`\`\`typescript
// Example implementation
\`\`\`

## When to Use
- 
- 

## When NOT to Use
- 
- 

## Examples in This Project
- 

## Related Patterns
- [[Related Pattern]]`
  };

  return templates[template] || '';
};

const createEditorState = (doc: string) => {
  return EditorState.create({
    doc,
    extensions: [
      basicSetup,
      oneDark,
      markdown({ codeLanguages: languages }),
      yaml(),
      autocompletion({
        override: [knowledgeAutocomplete]
      }),
      keymap.of([
        {
          key: 'Ctrl-s',
          mac: 'Cmd-s',
          run: () => {
            emit('save');
            return true;
          }
        },
        {
          key: 'Ctrl-Space',
          mac: 'Cmd-Space',
          run: (view) => {
            // Trigger autocomplete
            const { state } = view;
            const word = state.doc.lineAt(state.selection.main.head).text;
            const lastChar = word[word.length - 1];
            
            if (lastChar === '@') {
              // Show template options
              return true;
            }
            return false;
          }
        }
      ]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          const content = update.state.doc.toString();
          emit('update:modelValue', content);
          
          // Check for template expansion
          const changes = update.state.changes;
          changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
            const text = inserted.toString();
            if (text.endsWith(' ') || text.endsWith('\n')) {
              const line = update.state.doc.lineAt(fromB).text;
              const match = line.match(/@[\w-]+/);
              if (match && templates[match[0]]) {
                const template = expandTemplate(match[0]);
                // Schedule template replacement
                setTimeout(() => {
                  if (editorView) {
                    const lineStart = update.state.doc.lineAt(fromB).from;
                    editorView.dispatch({
                      changes: {
                        from: lineStart,
                        to: fromB + text.length,
                        insert: template
                      }
                    });
                  }
                }, 0);
              }
            }
          });
        }
      })
    ]
  });
};

const templates = {
  '@api-endpoint': true,
  '@architecture': true,
  '@troubleshooting': true,
  '@pattern': true
};

onMounted(() => {
  if (!editorContainer.value) return;

  const state = createEditorState(props.modelValue);
  editorView = new EditorView({
    state,
    parent: editorContainer.value
  });
});

onUnmounted(() => {
  if (editorView) {
    editorView.destroy();
    editorView = null;
  }
});

// Watch for external changes
watch(() => props.modelValue, (newValue) => {
  if (editorView && newValue !== editorView.state.doc.toString()) {
    editorView.dispatch({
      changes: {
        from: 0,
        to: editorView.state.doc.length,
        insert: newValue
      }
    });
  }
});
</script>

<style scoped>
.knowledge-editor {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.editor-container {
  flex: 1;
  overflow: hidden;
}

/* CodeMirror theme overrides */
.editor-container :deep(.cm-editor) {
  height: 100%;
  font-size: 14px;
  font-family: 'JetBrains Mono', Consolas, 'Courier New', monospace;
}

.editor-container :deep(.cm-scroller) {
  font-family: inherit;
}

.editor-container :deep(.cm-content) {
  padding: 16px;
}

/* Syntax highlighting for frontmatter */
.editor-container :deep(.cm-line:has(.cm-hr)) {
  color: #858585;
}

/* Autocomplete styling */
.editor-container :deep(.cm-tooltip-autocomplete) {
  background: #252526;
  border: 1px solid #3e3e42;
  border-radius: 4px;
}

.editor-container :deep(.cm-tooltip-autocomplete ul li[aria-selected]) {
  background: #094771;
}

.editor-container :deep(.cm-completionLabel) {
  color: #d4d4d4;
}

.editor-container :deep(.cm-completionDetail) {
  color: #858585;
  font-style: italic;
  margin-left: 1em;
}

.editor-container :deep(.cm-completionInfo) {
  background: #1e1e1e;
  border: 1px solid #3e3e42;
  border-radius: 4px;
  padding: 8px;
  margin-top: 4px;
  color: #cccccc;
  font-size: 12px;
}
</style>