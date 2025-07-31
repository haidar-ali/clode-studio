import { ref, shallowRef } from 'vue';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';

export interface CodeGenerationRequest {
  prompt: string;
  fileContent: string;
  filePath: string;
  language?: string;
  resources?: any[];
}

export interface CodeGenerationResult {
  success: boolean;
  generatedCode?: string;
  error?: string;
  replaceWholeFile?: boolean;
}

export function useCodeGeneration() {
  const isOpen = ref(false);
  const prompt = ref('');
  const isGenerating = ref(false);
  const generatedCode = shallowRef<string>('');
  const originalCode = shallowRef<string>('');
  const error = ref<string | null>(null);
  
  const open = (content: string) => {
    originalCode.value = content;
    isOpen.value = true;
    prompt.value = '';
    generatedCode.value = '';
    error.value = null;
  };
  
  const close = () => {
    isOpen.value = false;
    prompt.value = '';
    generatedCode.value = '';
    error.value = null;
  };
  
  const generate = async (request: CodeGenerationRequest): Promise<CodeGenerationResult> => {
    isGenerating.value = true;
    error.value = null;
    
    try {
      if (window.electronAPI?.codeGeneration?.generate) {
        const result = await window.electronAPI.codeGeneration.generate(request);
        
        if (result.success && result.generatedCode) {
          generatedCode.value = result.generatedCode;
        } else {
          error.value = result.error || 'Failed to generate code';
        }
        
        return result;
      }
      
      return {
        success: false,
        error: 'Code generation API not available'
      };
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Generation failed';
      return {
        success: false,
        error: error.value
      };
    } finally {
      isGenerating.value = false;
    }
  };
  
  return {
    isOpen,
    prompt,
    isGenerating,
    generatedCode,
    originalCode,
    error,
    open,
    close,
    generate
  };
}