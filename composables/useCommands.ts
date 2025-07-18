import { ref, computed, watch } from 'vue';
import { useCommandsStore } from '~/stores/commands';

export interface CommandSuggestion {
  command: string;
  description: string;
  icon?: string;
  category: string;
  fullCommand: string;
}

export function useCommands(instanceId?: string) {
  const commandsStore = useCommandsStore();
  const inputValue = ref('');
  const showSuggestions = ref(false);
  const selectedIndex = ref(0);

  // Check if current input is a command
  const isCommand = computed(() => inputValue.value.startsWith('/'));

  // Parse command and arguments
  const parsedCommand = computed(() => {
    if (!isCommand.value) return null;
    
    const trimmed = inputValue.value.trim();
    const [cmdName, ...args] = trimmed.slice(1).split(' ');
    
    return {
      name: cmdName,
      args,
      raw: trimmed
    };
  });

  // Get command suggestions
  const suggestions = computed((): CommandSuggestion[] => {
    if (!isCommand.value) return [];
    
    return commandsStore.suggestions.map(cmd => ({
      command: cmd.name,
      description: cmd.description,
      icon: cmd.icon,
      category: cmd.category,
      fullCommand: `/${cmd.name}`
    }));
  });

  // Watch for input changes to update suggestions
  watch(inputValue, (value) => {
    if (value.startsWith('/')) {
      commandsStore.updateSuggestions(value);
      showSuggestions.value = true;
      selectedIndex.value = 0;
    } else {
      showSuggestions.value = false;
    }
  });

  // Execute command
  const executeCommand = async (commandString?: string) => {
    const toExecute = commandString || inputValue.value;
    
    if (!toExecute.startsWith('/')) {
      return false;
    }

    const success = await commandsStore.executeCommand(toExecute, instanceId);
    
    if (success) {
      inputValue.value = '';
      showSuggestions.value = false;
    }
    
    return success;
  };

  // Handle keyboard navigation
  const handleKeyDown = (event: KeyboardEvent) => {
    if (!showSuggestions.value || suggestions.value.length === 0) {
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        selectedIndex.value = (selectedIndex.value + 1) % suggestions.value.length;
        break;
        
      case 'ArrowUp':
        event.preventDefault();
        selectedIndex.value = selectedIndex.value === 0 
          ? suggestions.value.length - 1 
          : selectedIndex.value - 1;
        break;
        
      case 'Tab':
        event.preventDefault();
        if (suggestions.value[selectedIndex.value]) {
          inputValue.value = suggestions.value[selectedIndex.value].fullCommand + ' ';
        }
        break;
        
      case 'Enter':
        if (event.ctrlKey || event.metaKey) {
          // Execute selected suggestion
          event.preventDefault();
          if (suggestions.value[selectedIndex.value]) {
            executeCommand(suggestions.value[selectedIndex.value].fullCommand);
          }
        }
        break;
        
      case 'Escape':
        event.preventDefault();
        showSuggestions.value = false;
        break;
    }
  };

  // Select suggestion
  const selectSuggestion = (index: number) => {
    selectedIndex.value = index;
    const suggestion = suggestions.value[index];
    if (suggestion) {
      inputValue.value = suggestion.fullCommand + ' ';
    }
  };

  // Get command help
  const getCommandHelp = (commandName: string) => {
    const command = commandsStore.commands.get(commandName) || 
                   commandsStore.customCommands.get(commandName);
    
    if (!command) return null;

    return {
      name: command.name,
      description: command.description,
      aliases: command.aliases,
      parameters: command.parameters,
      shortcut: command.shortcut
    };
  };

  // Check if command exists
  const commandExists = (commandName: string): boolean => {
    return commandsStore.commands.has(commandName) || 
           commandsStore.customCommands.has(commandName);
  };

  return {
    // State
    inputValue,
    showSuggestions,
    selectedIndex,
    
    // Computed
    isCommand,
    parsedCommand,
    suggestions,
    
    // Methods
    executeCommand,
    handleKeyDown,
    selectSuggestion,
    getCommandHelp,
    commandExists,
    
    // Store access
    recentCommands: computed(() => commandsStore.recentCommands),
    commandsByCategory: computed(() => commandsStore.commandsByCategory)
  };
}