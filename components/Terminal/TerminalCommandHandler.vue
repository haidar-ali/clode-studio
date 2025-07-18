<template>
  <div class="terminal-command-handler">
    <!-- Slash command suggestions overlay -->
    <Transition name="suggestions">
      <div
        v-if="showSuggestions && suggestions.length > 0"
        class="command-suggestions"
        :style="suggestionStyle"
      >
        <div
          v-for="(suggestion, index) in suggestions"
          :key="suggestion.command"
          class="suggestion-item"
          :class="{ selected: index === selectedIndex }"
          @click="selectSuggestion(index)"
        >
          <Icon v-if="suggestion.icon" :name="suggestion.icon" size="14" />
          <span class="command-name">/{{ suggestion.command }}</span>
          <span class="command-desc">{{ suggestion.description }}</span>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useCommands } from '~/composables/useCommands';
import { useCommandsStore } from '~/stores/commands';

const props = defineProps<{
  instanceId: string;
  terminal: any; // Terminal instance from xterm
  currentLine: string;
  cursorX: number;
  cursorY: number;
}>();

const emit = defineEmits<{
  'command-executed': [command: string];
  'update-line': [line: string];
}>();

const commandsStore = useCommandsStore();
const { 
  suggestions, 
  selectedIndex, 
  showSuggestions,
  handleKeyDown: commandKeyHandler,
  selectSuggestion: selectCommandSuggestion,
  executeCommand
} = useCommands(props.instanceId);

// Calculate suggestion popup position
const suggestionStyle = computed(() => {
  if (!props.terminal) return {};
  
  // Get terminal dimensions
  const charWidth = 9; // Approximate character width
  const lineHeight = 17; // Approximate line height
  
  // Calculate position based on cursor
  const left = props.cursorX * charWidth;
  const top = (props.cursorY + 1) * lineHeight;
  
  return {
    left: `${left}px`,
    top: `${top}px`
  };
});

// Watch for line changes to detect slash commands
watch(() => props.currentLine, (line) => {
  if (line.startsWith('/')) {
    commandsStore.updateSuggestions(line);
    showSuggestions.value = true;
  } else {
    showSuggestions.value = false;
  }
});

// Handle suggestion selection
const selectSuggestion = (index: number) => {
  selectCommandSuggestion(index);
  const suggestion = suggestions.value[index];
  if (suggestion) {
    // Update terminal line with selected command
    const newLine = suggestion.fullCommand + ' ';
    emit('update-line', newLine);
  }
};

// Handle command execution
const handleCommandExecution = async (command: string) => {
  if (command.startsWith('/')) {
    const success = await executeCommand(command);
    if (success) {
      emit('command-executed', command);
      // Clear the current line in terminal
      emit('update-line', '');
    }
    return success;
  }
  return false;
};

// Export methods for parent to call
defineExpose({
  handleCommandExecution,
  handleKeyDown: commandKeyHandler,
  isCommand: computed(() => props.currentLine.startsWith('/'))
});
</script>

<style scoped>
.terminal-command-handler {
  position: relative;
}

.command-suggestions {
  position: absolute;
  background: #252526;
  border: 1px solid #454545;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
  min-width: 300px;
  max-width: 500px;
  max-height: 200px;
  overflow-y: auto;
  z-index: 1000;
}

.suggestion-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  cursor: pointer;
  font-size: 12px;
  transition: background-color 0.1s;
}

.suggestion-item:hover {
  background: #2d2d30;
}

.suggestion-item.selected {
  background: #094771;
}

.command-name {
  font-weight: 500;
  color: #cccccc;
  font-family: 'Consolas', 'Monaco', monospace;
}

.command-desc {
  color: #858585;
  margin-left: auto;
  font-size: 11px;
}

/* Transitions */
.suggestions-enter-active,
.suggestions-leave-active {
  transition: opacity 0.15s, transform 0.15s;
}

.suggestions-enter-from {
  opacity: 0;
  transform: translateY(-8px);
}

.suggestions-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>