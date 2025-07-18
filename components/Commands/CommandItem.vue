<template>
  <div 
    class="command-item"
    :class="{ selected: isSelected }"
    @click="$emit('click')"
  >
    <div class="command-icon" v-if="command.icon">
      <Icon :name="command.icon" size="16" />
    </div>
    <div class="command-info">
      <div class="command-name">
        <span class="slash">/</span>{{ command.name }}
        <span v-if="command.aliases && command.aliases.length > 0" class="aliases">
          ({{ command.aliases.map(a => `/${a}`).join(', ') }})
        </span>
      </div>
      <div class="command-description">{{ command.description }}</div>
    </div>
    <div v-if="command.shortcut" class="command-shortcut">
      <kbd>{{ formatShortcut(command.shortcut) }}</kbd>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { SlashCommand } from '~/stores/commands';

defineProps<{
  command: SlashCommand;
  isSelected: boolean;
}>();

defineEmits<{
  click: [];
}>();

const formatShortcut = (shortcut: string) => {
  // Convert Cmd to ⌘ on Mac, Ctrl on others
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  return shortcut
    .replace(/Cmd/g, isMac ? '⌘' : 'Ctrl')
    .replace(/\+/g, ' ');
};
</script>

<style scoped>
.command-item {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  cursor: pointer;
  border-radius: 4px;
  transition: background-color 0.1s;
  gap: 12px;
}

.command-item:hover {
  background: #2d2d30;
}

.command-item.selected {
  background: #094771;
}

.command-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #858585;
  width: 20px;
  flex-shrink: 0;
}

.command-item.selected .command-icon {
  color: #cccccc;
}

.command-info {
  flex: 1;
  min-width: 0;
}

.command-name {
  font-size: 13px;
  font-weight: 500;
  color: #cccccc;
  display: flex;
  align-items: center;
  gap: 6px;
}

.slash {
  color: #858585;
  font-weight: normal;
}

.aliases {
  font-size: 11px;
  color: #858585;
  font-weight: normal;
}

.command-description {
  font-size: 12px;
  color: #858585;
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.command-item.selected .command-description {
  color: #b8b8b8;
}

.command-shortcut {
  margin-left: auto;
  flex-shrink: 0;
}

.command-shortcut kbd {
  background: #2d2d30;
  border: 1px solid #454545;
  border-radius: 3px;
  padding: 2px 6px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace;
  font-size: 11px;
  color: #858585;
}

.command-item.selected .command-shortcut kbd {
  background: #1e4976;
  border-color: #2e5980;
  color: #cccccc;
}
</style>