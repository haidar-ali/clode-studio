import { linter, type Diagnostic } from '@codemirror/lint';
import type { EditorView } from '@codemirror/view';
import { useEditorStore } from '~/stores/editor';

export function useLSPDiagnostics() {
  const editorStore = useEditorStore();
  const isRemoteMode = !window.electronAPI;

  // Create linter extension for LSP diagnostics
  const createLSPDiagnostics = () => {
    // In remote mode, skip diagnostics for now (could be implemented via Socket.IO)
    if (isRemoteMode) {
      return linter(async () => []);
    }
    
    // Original desktop implementation
    return linter(async (view: EditorView) => {
      try {
        // Get the active tab to determine file path
        const activeTab = editorStore.activeTab;
        if (!activeTab?.path) {
          return [];
        }

        // Check if we're in remote mode (no electronAPI)
        if (!window.electronAPI?.lsp) {
          // In remote mode, skip LSP diagnostics
          return [];
        }

        // Get diagnostics from LSP through IPC
        const response = await window.electronAPI.lsp.getDiagnostics({
          uri: `file://${activeTab.path}`,
          filepath: activeTab.path,
          content: view.state.doc.toString()
        });

        if (!response.success || !response.diagnostics) {
          return [];
        }

        // Convert LSP diagnostics to CodeMirror format
        const diagnostics: Diagnostic[] = response.diagnostics.map((diag: any) => {
          // Log diagnostic info for Vue files to debug position issues
          if (activeTab.path.endsWith('.vue')) {
            console.log('[LSP Diagnostics] Vue diagnostic:', {
              message: diag.message,
              range: diag.range,
              source: diag.source,
              documentLines: view.state.doc.lines
            });
          }
          
          // Calculate positions
          const doc = view.state.doc;
          const totalLines = doc.lines;
          
          // LSP line numbers are 0-based, CodeMirror line numbers are 1-based
          const startLineNum = diag.range.start.line + 1;
          const endLineNum = diag.range.end.line + 1;
          
          // Check if line numbers are within document bounds
          if (startLineNum > totalLines || endLineNum > totalLines) {
            console.warn(`[LSP Diagnostics] Line out of bounds: diagnostic at line ${diag.range.start.line} but document has ${totalLines} lines`);
            // Fallback to first line if out of bounds
            const from = 0;
            const to = Math.min(10, doc.length);
            return {
              from,
              to,
              severity: mapSeverity(diag.severity),
              message: `${diag.message} (at line ${diag.range.start.line + 1})`,
              source: diag.source || 'lsp'
            };
          }
          
          const startLine = doc.line(startLineNum);
          const endLine = doc.line(endLineNum);
          
          // Fix: startLine.length is the total length, not relative to startLine.from
          const startLineLength = startLine.to - startLine.from;
          const endLineLength = endLine.to - endLine.from;
          
          const from = startLine.from + Math.min(diag.range.start.character, startLineLength);
          let to = endLine.from + Math.min(diag.range.end.character, endLineLength);
          
          // Ensure we have at least some width for the diagnostic underline
          if (to <= from) {
            to = from + 1;
          }
          
          // Debug position calculation for Vue CSS diagnostics
          if (activeTab.path.endsWith('.vue') && diag.source === 'css') {
            console.log('[LSP Diagnostics] Position calculation:', {
              lspLine: diag.range.start.line,
              cmLine: startLineNum,
              from,
              to,
              lineContent: doc.sliceString(startLine.from, startLine.to).substring(0, 50),
              startLineFrom: startLine.from,
              startLineTo: startLine.to
            });
          }

          return {
            from,
            to,
            severity: mapSeverity(diag.severity),
            message: diag.message,
            source: diag.source || 'lsp',
            actions: diag.codeActions ? diag.codeActions.map((action: any) => ({
              name: action.title,
              apply: async (view: EditorView, from: number, to: number) => {
                // Apply code action through LSP
                const result = await window.electronAPI.lsp.executeCodeAction({
                  filepath: activeTab.path,
                  action: action
                });
                
                if (result.success && result.edit) {
                  // Apply workspace edit
                  applyWorkspaceEdit(view, result.edit);
                }
              }
            })) : undefined
          };
        });

        return diagnostics;
      } catch (error) {
        console.error('[LSP Diagnostics] Error:', error);
        return [];
      }
    }, {
      delay: 750, // Delay before running diagnostics
      needsRefresh: (update) => update.docChanged || update.viewportChanged
    });
  };

  // Map LSP severity to CodeMirror severity
  function mapSeverity(lspSeverity: number): 'error' | 'warning' | 'info' {
    switch (lspSeverity) {
      case 1: // Error
        return 'error';
      case 2: // Warning
        return 'warning';
      case 3: // Information
      case 4: // Hint
        return 'info';
      default:
        return 'info';
    }
  }

  // Apply workspace edit from code action
  function applyWorkspaceEdit(view: EditorView, edit: any) {
    if (!edit.changes) return;

    const changes: { from: number; to: number; insert: string }[] = [];
    
    // Process text edits
    for (const [uri, edits] of Object.entries(edit.changes)) {
      // Only apply edits for the current file
      if (uri === `file://${editorStore.activeTab?.path}`) {
        for (const textEdit of edits as any[]) {
          const doc = view.state.doc;
          const startLine = doc.line(textEdit.range.start.line + 1);
          const endLine = doc.line(textEdit.range.end.line + 1);
          
          const from = startLine.from + Math.min(textEdit.range.start.character, startLine.length - startLine.from);
          const to = endLine.from + Math.min(textEdit.range.end.character, endLine.length - endLine.from);
          
          changes.push({
            from,
            to,
            insert: textEdit.newText
          });
        }
      }
    }

    // Apply all changes
    if (changes.length > 0) {
      view.dispatch({ changes });
    }
  }

  return {
    createLSPDiagnostics
  };
}