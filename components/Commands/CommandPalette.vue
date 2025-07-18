<template>
  <Teleport to="body">
    <Transition name="command-palette">
      <div v-if="isOpen" class="command-palette-overlay" @click="close">
        <div class="command-palette-container" @click.stop>
          <div class="command-palette-header">
            <input
              ref="commandInput"
              v-model="searchQuery"
              type="text"
              class="command-input"
              placeholder="Type a command or search..."
              @keydown="handleKeyDown"
              @input="handleInput"
            />
            <button class="close-button" @click="close">
              <Icon name="mdi:close" size="20" />
            </button>
          </div>
          
          <div class="command-palette-content">
            <!-- Recent commands -->
            <div v-if="!searchQuery && recentCommands.length > 0" class="command-section">
              <h3 class="section-title">Recent</h3>
              <div class="command-list">
                <CommandItem
                  v-for="cmd in recentCommandsWithDetails"
                  :key="cmd.name"
                  :command="cmd"
                  :is-selected="false"
                  @click="executeCommand(cmd.name)"
                />
              </div>
            </div>

            <!-- Search results or all commands -->
            <div v-if="searchQuery || !recentCommands.length" class="command-section">
              <h3 class="section-title">
                {{ searchQuery ? 'Search Results' : 'All Commands' }}
              </h3>
              
              <div v-if="groupedCommands.size === 0" class="no-results">
                No commands found matching "{{ searchQuery }}"
              </div>
              
              <div v-for="[category, commands] in groupedCommands" :key="category" class="category-group">
                <h4 class="category-title">{{ formatCategory(category) }}</h4>
                <div class="command-list">
                  <CommandItem
                    v-for="(cmd, index) in commands"
                    :key="cmd.name"
                    :command="cmd"
                    :is-selected="selectedIndex === getGlobalIndex(category, index)"
                    @click="executeCommand(cmd.name)"
                    @mouseenter="selectedIndex = getGlobalIndex(category, index)"
                  />
                </div>
              </div>
            </div>

            <!-- Command preview -->
            <div v-if="selectedCommand" class="command-preview">
              <h4>{{ selectedCommand.name }}</h4>
              <p>{{ selectedCommand.description }}</p>
              
              <div v-if="selectedCommand.aliases && selectedCommand.aliases.length > 0" class="aliases">
                <span class="label">Aliases:</span>
                <span v-for="alias in selectedCommand.aliases" :key="alias" class="alias">
                  /{{ alias }}
                </span>
              </div>
              
              <div v-if="selectedCommand.parameters && selectedCommand.parameters.length > 0" class="parameters">
                <span class="label">Parameters:</span>
                <div v-for="param in selectedCommand.parameters" :key="param.name" class="parameter">
                  <span class="param-name">{{ param.name }}</span>
                  <span class="param-required">{{ param.required ? '(required)' : '(optional)' }}</span>
                  <span class="param-desc">- {{ param.description }}</span>
                </div>
              </div>
              
              <div v-if="selectedCommand.shortcut" class="shortcut">
                <span class="label">Shortcut:</span>
                <kbd>{{ selectedCommand.shortcut }}</kbd>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useCommandsStore } from '~/stores/commands';
import type { SlashCommand } from '~/stores/commands';
import CommandItem from './CommandItem.vue';

const props = defineProps<{
  isOpen: boolean;
  instanceId?: string;
}>();

const emit = defineEmits<{
  close: [];
  execute: [command: string];
}>();

const commandsStore = useCommandsStore();
const commandInput = ref<HTMLInputElement>();
const searchQuery = ref('');
const selectedIndex = ref(0);

// Flatten all commands for navigation
const flatCommands = computed(() => {
  const commands: SlashCommand[] = [];
  groupedCommands.value.forEach(cmds => {
    commands.push(...cmds);
  });
  return commands;
});

// Get selected command details
const selectedCommand = computed(() => {
  return flatCommands.value[selectedIndex.value] || null;
});

// Recent commands with full details
const recentCommandsWithDetails = computed(() => {
  return commandsStore.recentCommands
    .map(name => commandsStore.commands.get(name) || commandsStore.customCommands.get(name))
    .filter(Boolean) as SlashCommand[];
});

// Filter and group commands
const groupedCommands = computed(() => {
  const query = searchQuery.value.toLowerCase().replace('/', '');
  
  let filtered = commandsStore.allCommands;
  
  if (query) {
    filtered = filtered.filter(cmd => {
      const nameMatch = cmd.name.toLowerCase().includes(query);
      const descMatch = cmd.description.toLowerCase().includes(query);
      const aliasMatch = cmd.aliases?.some(a => a.toLowerCase().includes(query));
      const categoryMatch = cmd.category.toLowerCase().includes(query);
      
      return nameMatch || descMatch || aliasMatch || categoryMatch;
    });
  }
  
  // Group by category
  const grouped = new Map<string, SlashCommand[]>();
  filtered.forEach(cmd => {
    if (!grouped.has(cmd.category)) {
      grouped.set(cmd.category, []);
    }
    grouped.get(cmd.category)!.push(cmd);
  });
  
  return grouped;
});

// Get global index for a command in a category
const getGlobalIndex = (category: string, localIndex: number) => {
  let globalIndex = 0;
  for (const [cat, commands] of groupedCommands.value) {
    if (cat === category) {
      return globalIndex + localIndex;
    }
    globalIndex += commands.length;
  }
  return 0;
};

// Format category name
const formatCategory = (category: string) => {
  return category.charAt(0).toUpperCase() + category.slice(1);
};

// Handle keyboard navigation
const handleKeyDown = (event: KeyboardEvent) => {
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault();
      selectedIndex.value = (selectedIndex.value + 1) % flatCommands.value.length;
      break;
      
    case 'ArrowUp':
      event.preventDefault();
      selectedIndex.value = selectedIndex.value === 0 
        ? flatCommands.value.length - 1 
        : selectedIndex.value - 1;
      break;
      
    case 'Enter':
      event.preventDefault();
      if (selectedCommand.value) {
        executeCommand(selectedCommand.value.name);
      } else if (searchQuery.value.startsWith('/')) {
        // Try to execute as raw command
        executeRawCommand();
      }
      break;
      
    case 'Escape':
      event.preventDefault();
      close();
      break;
  }
};

// Handle input
const handleInput = () => {
  selectedIndex.value = 0;
};

// Execute command
const executeCommand = async (commandName: string) => {
  const fullCommand = `/${commandName}`;
  await commandsStore.executeCommand(fullCommand, props.instanceId);
  emit('execute', fullCommand);
  close();
};

// Execute raw command from input
const executeRawCommand = async () => {
  if (searchQuery.value.startsWith('/')) {
    await commandsStore.executeCommand(searchQuery.value, props.instanceId);
    emit('execute', searchQuery.value);
    close();
  }
};

// Close palette
const close = () => {
  searchQuery.value = '';
  selectedIndex.value = 0;
  emit('close');
};

// Focus input when opened
watch(() => props.isOpen, (isOpen) => {
  if (isOpen) {
    selectedIndex.value = 0;
    searchQuery.value = '/';
    setTimeout(() => {
      commandInput.value?.focus();
      commandInput.value?.select();
    }, 100);
  }
});

// Global keyboard shortcut
const handleGlobalKeyDown = (event: KeyboardEvent) => {
  // Cmd/Ctrl + K to open command palette
  if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
    event.preventDefault();
    event.stopPropagation();
    if (!props.isOpen) {
      commandsStore.openCommandPalette();
    } else {
      close();
    }
  }
};

onMounted(async () => {
  // Ensure commands are initialized
  if (commandsStore.allCommands.length === 0) {
    await commandsStore.initialize();
  }
  
  document.addEventListener('keydown', handleGlobalKeyDown);
});

onUnmounted(() => {
  document.removeEventListener('keydown', handleGlobalKeyDown);
});
</script>

<style scoped>
.command-palette-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 10vh;
  z-index: 999999; /* Ensure it's above everything */
}

.command-palette-container {
  background: #1e1e1e;
  border: 1px solid #454545;
  border-radius: 8px;
  width: 90%;
  max-width: 700px;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.command-palette-header {
  display: flex;
  align-items: center;
  padding: 0;
  border-bottom: 1px solid #454545;
}

.command-input {
  flex: 1;
  background: transparent;
  border: none;
  color: #cccccc;
  font-size: 16px;
  padding: 16px;
  outline: none;
  font-family: inherit;
}

.command-input::placeholder {
  color: #858585;
}

.close-button {
  background: none;
  border: none;
  color: #858585;
  cursor: pointer;
  padding: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s;
}

.close-button:hover {
  color: #cccccc;
}

.command-palette-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.command-section {
  margin-bottom: 16px;
}

.section-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  color: #858585;
  margin: 8px 8px 4px;
  letter-spacing: 0.5px;
}

.category-group {
  margin-bottom: 12px;
}

.category-title {
  font-size: 12px;
  font-weight: 500;
  color: #cccccc;
  margin: 8px 8px 4px;
  text-transform: capitalize;
}

.command-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.no-results {
  text-align: center;
  color: #858585;
  padding: 32px;
  font-style: italic;
}

.command-preview {
  border-top: 1px solid #454545;
  padding: 16px;
  background: #252526;
  margin-top: 8px;
}

.command-preview h4 {
  font-size: 14px;
  font-weight: 600;
  color: #cccccc;
  margin: 0 0 4px;
}

.command-preview p {
  font-size: 13px;
  color: #858585;
  margin: 0 0 12px;
}

.aliases,
.parameters,
.shortcut {
  margin-bottom: 8px;
  font-size: 12px;
}

.label {
  color: #858585;
  font-weight: 600;
  margin-right: 8px;
}

.alias {
  background: #2d2d30;
  padding: 2px 6px;
  border-radius: 4px;
  margin-right: 4px;
  color: #cccccc;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 11px;
}

.parameter {
  margin-left: 16px;
  margin-top: 4px;
  color: #cccccc;
}

.param-name {
  font-weight: 600;
  margin-right: 4px;
}

.param-required {
  color: #f48771;
  font-size: 11px;
  margin-right: 4px;
}

.param-desc {
  color: #858585;
}

kbd {
  background: #2d2d30;
  border: 1px solid #454545;
  border-radius: 4px;
  padding: 2px 8px;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
  color: #cccccc;
}

/* Transitions */
.command-palette-enter-active,
.command-palette-leave-active {
  transition: opacity 0.2s;
}

.command-palette-enter-from,
.command-palette-leave-to {
  opacity: 0;
}

.command-palette-enter-active .command-palette-container,
.command-palette-leave-active .command-palette-container {
  transition: transform 0.2s, opacity 0.2s;
}

.command-palette-enter-from .command-palette-container {
  transform: translateY(-20px);
  opacity: 0;
}

.command-palette-leave-to .command-palette-container {
  transform: translateY(-20px);
  opacity: 0;
}
</style>