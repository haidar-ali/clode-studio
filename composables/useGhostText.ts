import { ref, shallowRef } from 'vue';
import {
  ViewPlugin,
  EditorView,
  ViewUpdate,
  Decoration,
  WidgetType,
  keymap,
} from "@codemirror/view";
import {
  StateEffect,
  Text,
  Facet,
  Prec,
  StateField,
  EditorState,
  EditorSelection,
} from "@codemirror/state";
import { debounce } from 'lodash-es';

/**
 * Ghost text implementation for AI suggestions (like GitHub Copilot)
 * Based on codemirror-copilot but adapted for Vue/TypeScript
 */

// Types
type GhostTextFetchFn = (prefix: string, suffix: string) => Promise<string>;

interface GhostTextOptions {
  fetchFn: GhostTextFetchFn;
  delay?: number;
  acceptOnClick?: boolean;
}

interface GhostTextState {
  suggestion: string | null;
}

// State management
const GhostTextStateField = StateField.define<GhostTextState>({
  create() {
    return { suggestion: null };
  },
  update(previousValue, tr) {
    const ghostTextEffect = tr.effects.find((e) =>
      e.is(GhostTextEffect),
    );
    if (tr.state.doc) {
      if (ghostTextEffect && tr.state.doc == ghostTextEffect.value.doc) {
        // New suggestion that applies to current document
        return { suggestion: ghostTextEffect.value.text };
      } else if (!tr.docChanged && !tr.selection) {
        // Transaction doesn't affect document or selection
        return previousValue;
      }
    }
    return { suggestion: null };
  },
});

const GhostTextEffect = StateEffect.define<{
  text: string | null;
  doc: Text;
}>();

// Configuration facet
const ghostTextConfigFacet = Facet.define<
  { acceptOnClick: boolean; fetchFn: GhostTextFetchFn; delay: number },
  { acceptOnClick: boolean; fetchFn: GhostTextFetchFn | undefined; delay: number }
>({
  combine(value) {
    return {
      acceptOnClick: !!value.at(-1)?.acceptOnClick,
      fetchFn: value.at(-1)?.fetchFn,
      delay: value.at(-1)?.delay || 1000,
    };
  },
});

// Ghost text widget
class GhostTextWidget extends WidgetType {
  suggestion: string;

  constructor(suggestion: string) {
    super();
    this.suggestion = suggestion;
  }

  toDOM(view: EditorView) {
    const span = document.createElement("span");
    span.style.opacity = "0.4";
    span.style.fontStyle = "italic";
    span.className = "cm-ghost-text";
    span.textContent = this.suggestion;
    
    const config = view.state.facet(ghostTextConfigFacet);
    if (config.acceptOnClick) {
      span.style.cursor = "pointer";
      span.onclick = (e) => this.accept(e, view);
    }
    
    return span;
  }

  accept(e: MouseEvent, view: EditorView) {
    e.stopPropagation();
    e.preventDefault();

    const suggestionText = view.state.field(GhostTextStateField)?.suggestion;
    if (!suggestionText) return false;

    view.dispatch({
      ...insertGhostText(
        view.state,
        suggestionText,
        view.state.selection.main.head,
        view.state.selection.main.head,
      ),
    });
    return true;
  }
}

// Create ghost text decoration
function createGhostTextDecoration(view: EditorView, suggestionText: string) {
  const pos = view.state.selection.main.head;
  const widgets = [];
  const w = Decoration.widget({
    widget: new GhostTextWidget(suggestionText),
    side: 1, // After cursor
  });
  widgets.push(w.range(pos));
  return Decoration.set(widgets);
}

// Fetch suggestions plugin
const fetchGhostSuggestion = ViewPlugin.fromClass(
  class Plugin {
    private debouncedFetch: ((update: ViewUpdate) => void) | null = null;
    private isInitialLoad = true;

    constructor(private view: EditorView) {
      const config = view.state.facet(ghostTextConfigFacet);
      if (config.fetchFn) {
        this.debouncedFetch = debounce(this.fetchSuggestion.bind(this), config.delay);
      }
    }

    async update(update: ViewUpdate) {
      // Skip initial document load
      if (this.isInitialLoad) {
        this.isInitialLoad = false;
        return;
      }

      // Only fetch if document changed
      if (!update.docChanged) return;

      // Skip if this was an autocomplete event
      const isAutocompleted = update.transactions.some((t) =>
        t.isUserEvent("input.complete"),
      );
      if (isAutocompleted) return;

      // Only trigger on actual typing (not delete/backspace), not programmatic changes
      const isUserInput = update.transactions.some((t) => 
        t.isUserEvent("input") || t.isUserEvent("input.type")
      );
      if (!isUserInput) return;

      // Call debounced fetch
      if (this.debouncedFetch) {
        this.debouncedFetch(update);
      }
    }

    private async fetchSuggestion(update: ViewUpdate) {
      const config = this.view.state.facet(ghostTextConfigFacet);
      if (!config.fetchFn) return;

      const { from, to } = update.state.selection.ranges[0];
      const text = update.state.doc.toString();
      const prefix = text.slice(0, to);
      const suffix = text.slice(from);

      try {
        const result = await config.fetchFn(prefix, suffix);
        if (result) {
          this.view.dispatch({
            effects: GhostTextEffect.of({ text: result, doc: update.state.doc }),
          });
        }
      } catch (error) {
        console.error('[GhostText] Fetch error:', error);
      }
    }
  },
);

// Render ghost text plugin
const renderGhostTextPlugin = ViewPlugin.fromClass(
  class Plugin {
    decorations: any; // DecorationSet type
    
    constructor() {
      this.decorations = Decoration.none;
    }
    
    update(update: ViewUpdate) {
      const suggestionText = update.state.field(GhostTextStateField)?.suggestion;
      if (!suggestionText) {
        this.decorations = Decoration.none;
        return;
      }
      this.decorations = createGhostTextDecoration(update.view, suggestionText);
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);

// Tab key handler
const ghostTextKeymap = Prec.highest(
  keymap.of([
    {
      key: "Tab",
      run: (view) => {
        const suggestionText = view.state.field(GhostTextStateField)?.suggestion;
        if (!suggestionText) return false;

        view.dispatch({
          ...insertGhostText(
            view.state,
            suggestionText,
            view.state.selection.main.head,
            view.state.selection.main.head,
          ),
        });
        return true;
      },
    },
    {
      key: "Escape",
      run: (view) => {
        const hasSuggestion = !!view.state.field(GhostTextStateField)?.suggestion;
        if (!hasSuggestion) return false;

        // Clear suggestion
        view.dispatch({
          effects: GhostTextEffect.of({ text: null, doc: view.state.doc }),
        });
        return true;
      },
    },
    {
      key: "Ctrl-g",
      mac: "Cmd-g", 
      run: (view) => {
        console.log('[Ghost Text] Manual trigger activated (Cmd+G detected)');
        
        // Manually trigger ghost text suggestion
        const config = view.state.facet(ghostTextConfigFacet);
        if (!config.fetchFn) {
          console.log('[Ghost Text] No fetch function available');
          return false;
        }
        
        const pos = view.state.selection.main.head;
        const doc = view.state.doc;
        const line = doc.lineAt(pos);
        
        // Get text before and after cursor
        const prefix = doc.sliceString(Math.max(0, pos - 2000), pos);
        const suffix = doc.sliceString(pos, Math.min(doc.length, pos + 1000));
        
        console.log('[Ghost Text] Fetching suggestion manually...');
        
        // Create a modified fetch function that includes forceManual flag
        const manualFetchFn = async (prefix: string, suffix: string) => {
          if (window.electronAPI?.autocomplete?.getGhostText) {
            const result = await window.electronAPI.autocomplete.getGhostText({ 
              prefix, 
              suffix, 
              forceManual: true 
            });
            return result.success ? result.suggestion : '';
          }
          // Fallback to regular fetch if not using electron API
          return config.fetchFn(prefix, suffix);
        };
        
        // Fetch suggestion immediately (no debounce)
        manualFetchFn(prefix, suffix).then(result => {
          if (result) {
            console.log('[Ghost Text] Manual suggestion received:', result.substring(0, 50) + '...');
            view.dispatch({
              effects: GhostTextEffect.of({ text: result, doc: view.state.doc }),
            });
          } else {
            console.log('[Ghost Text] No suggestion returned');
          }
        }).catch(error => {
          console.error('Manual ghost text fetch failed:', error);
        });
        
        return true;
      },
    },
  ]),
);

// Insert ghost text helper
function insertGhostText(
  state: EditorState,
  text: string,
  from: number,
  to: number,
): any {
  return {
    ...state.changeByRange((range) => {
      if (range == state.selection.main)
        return {
          changes: { from: from, to: to, insert: text },
          range: EditorSelection.cursor(from + text.length),
        };
      const len = to - from;
      if (
        !range.empty ||
        (len &&
          state.sliceDoc(range.from - len, range.from) !=
            state.sliceDoc(from, to))
      )
        return { range };
      return {
        changes: { from: range.from - len, to: range.from, insert: text },
        range: EditorSelection.cursor(range.from - len + text.length),
      };
    }),
    userEvent: "input.complete",
  };
}

// Main composable
export function useGhostText() {
  const isLoading = ref(false);
  const currentSuggestion = shallowRef<string | null>(null);
  
  // Local cache for suggestions
  const suggestionCache = new Map<string, string>();
  
  /**
   * Create ghost text extension for CodeMirror
   */
  const createGhostTextExtension = (fetchFn: GhostTextFetchFn, options?: Partial<GhostTextOptions>): any[] => {
    const { delay = 1000, acceptOnClick = true } = options || {};
    
    // Wrap fetch function with caching
    const cachedFetchFn: GhostTextFetchFn = async (prefix: string, suffix: string) => {
      const cacheKey = `${prefix}<:|:>${suffix}`;
      
      // Check cache first
      if (suggestionCache.has(cacheKey)) {
        const cached = suggestionCache.get(cacheKey)!;
        currentSuggestion.value = cached;
        return cached;
      }
      
      isLoading.value = true;
      try {
        const result = await fetchFn(prefix, suffix);
        if (result) {
          suggestionCache.set(cacheKey, result);
          currentSuggestion.value = result;
        }
        return result;
      } finally {
        isLoading.value = false;
      }
    };
    
    return [
      ghostTextConfigFacet.of({ acceptOnClick, fetchFn: cachedFetchFn, delay }),
      GhostTextStateField,
      fetchGhostSuggestion,
      renderGhostTextPlugin,
      ghostTextKeymap,
    ];
  };
  
  /**
   * Clear suggestion cache
   */
  const clearCache = () => {
    suggestionCache.clear();
  };
  
  return {
    isLoading,
    currentSuggestion,
    createGhostTextExtension,
    clearCache,
  };
}