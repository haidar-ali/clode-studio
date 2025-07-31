import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { useEditorStore } from '~/stores/editor';

export function useLSPBridge() {
  const editorStore = useEditorStore();

  // Create a direct CodeMirror completion source
  const createLSPCompletionSource = () => {
    return async (context: CompletionContext): Promise<CompletionResult | null> => {
      try {
        // Get the active tab to determine file path
        const activeTab = editorStore.activeTab;
        if (!activeTab?.path) {
          return null;
        }

        // Get the current word being typed
        const match = context.matchBefore(/\w*/);
        if (!match || (match.text === "" && !context.explicit)) {
          return null;
        }

        // Calculate line and character from position
        const doc = context.state.doc;
        const line = doc.lineAt(context.pos);
        const lineNumber = line.number; // 1-based
        const character = context.pos - line.from; // 0-based

        // Call our LSP service through IPC
        const response = await window.electronAPI.lsp.getCompletions({
          uri: `file://${activeTab.path}`,
          filepath: activeTab.path,
          content: doc.toString(),
          position: {
            line: lineNumber,
            character: character
          },
          context: {
            triggerKind: context.explicit ? 1 : 2,
            triggerCharacter: undefined
          }
        });

        if (!response.success || !response.completions) {
          return null;
        }

        // Convert LSP completions to CodeMirror format
        const options = response.completions.map((item: any) => ({
          label: item.label,
          type: mapLSPCompletionKindToString(item.kind),
          detail: item.detail,
          info: item.documentation,
          apply: item.insertText || item.label,
          boost: item.preselect ? 2 : (item.sortText?.startsWith('11') ? -1 : 0)
        }));

        return {
          from: match.from,
          options: options.slice(0, 100) // Limit to 100 items for performance
        };

      } catch (error) {
        console.error('[LSP Bridge] Completion error:', error);
        return null;
      }
    };
  };

  // Map LSP completion kinds to CodeMirror completion types (strings)
  function mapLSPCompletionKindToString(kind: string): string {
    const kindMap: Record<string, string> = {
      'method': 'method',
      'function': 'function',
      'constructor': 'constructor',
      'field': 'field',
      'variable': 'variable',
      'class': 'class',
      'interface': 'interface',
      'module': 'module',
      'property': 'property',
      'unit': 'unit',
      'value': 'value',
      'enum': 'enum',
      'keyword': 'keyword',
      'snippet': 'snippet',
      'color': 'color',
      'file': 'file',
      'reference': 'reference',
      'folder': 'folder',
      'enumMember': 'enum',
      'constant': 'constant',
      'struct': 'struct',
      'event': 'event',
      'operator': 'operator',
      'typeParameter': 'type'
    };
    
    return kindMap[kind] || 'text'; // Default to text
  }

  return {
    createLSPCompletionSource
  };
}