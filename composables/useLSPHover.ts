import { hoverTooltip } from '@codemirror/view';
import type { EditorView } from '@codemirror/view';
import { useEditorStore } from '~/stores/editor';
import { useRemoteLSP } from '~/composables/useRemoteLSP';

export function useLSPHover() {
  const editorStore = useEditorStore();
  const isRemoteMode = !window.electronAPI;

  // Create hover tooltip extension
  const createLSPHoverTooltip = () => {
    // Use remote LSP if in browser mode
    if (isRemoteMode) {
      const { createRemoteLSPHover } = useRemoteLSP();
      return hoverTooltip(createRemoteLSPHover());
    }
    
    // Original desktop implementation
    return hoverTooltip(async (view: EditorView, pos: number, side: number) => {
      try {
        // Get the active tab to determine file path
        const activeTab = editorStore.activeTab;
        if (!activeTab?.path) {
          return null;
        }

        // Calculate line and character from position
        const doc = view.state.doc;
        const line = doc.lineAt(pos);
        const lineNumber = line.number; // 1-based
        const character = pos - line.from; // 0-based

        // Check if we're in remote mode (no electronAPI)
        if (!window.electronAPI?.lsp) {
          // In remote mode, skip LSP hover
          return null;
        }

        // Call LSP hover through IPC
        const response = await window.electronAPI.lsp.getHover({
          uri: `file://${activeTab.path}`,
          filepath: activeTab.path,
          content: doc.toString(),
          position: {
            line: lineNumber,
            character: character
          }
        });

        if (!response.success || !response.hover) {
          return null;
        }

        const contents = response.hover.contents || response.hover;
        let text = '';

        // Handle different content formats
        if (typeof contents === 'string') {
          text = contents;
        } else if (contents.value) {
          text = contents.value;
        } else if (contents.language && contents.value) {
          // Markdown code block
          text = `\`\`\`${contents.language}\n${contents.value}\n\`\`\``;
        } else if (Array.isArray(contents)) {
          // Handle array of contents
          text = contents.map(c => {
            if (typeof c === 'string') return c;
            if (c.value) return c.value;
            return '';
          }).join('\n\n');
        }

        if (!text) {
          return null;
        }

        // Parse markdown to HTML for better display
        const htmlContent = parseMarkdownToHTML(text);

        return {
          pos: pos,
          end: pos,
          above: true,
          create() {
            const dom = document.createElement('div');
            dom.className = 'cm-lsp-hover-tooltip';
            dom.innerHTML = htmlContent;
            return { dom };
          }
        };
      } catch (error) {
        console.error('[LSP Hover] Error:', error);
        return null;
      }
    }, {
      hideOnChange: true,
      hoverTime: 300 // 300ms delay before showing tooltip
    });
  };

  // Simple markdown to HTML parser for hover content
  function parseMarkdownToHTML(markdown: string): string {
    // Escape HTML
    let html = markdown
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Convert code blocks
    html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
      return `<pre class="cm-hover-code"><code class="language-${lang || 'text'}">${code.trim()}</code></pre>`;
    });

    // Convert inline code
    html = html.replace(/`([^`]+)`/g, '<code class="cm-hover-inline-code">$1</code>');

    // Convert bold
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Convert italic
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Convert line breaks
    html = html.replace(/\n/g, '<br>');

    return html;
  }

  return {
    createLSPHoverTooltip
  };
}