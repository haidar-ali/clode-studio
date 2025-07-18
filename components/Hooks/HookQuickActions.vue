<template>
  <div class="hook-quick-actions">
    <h3>Claude Code Hooks</h3>
    <p class="description">
      Hooks are shell commands that run at specific points in Claude's workflow.
    </p>

    <div class="quick-templates">
      <h4>Quick Templates</h4>
      <div class="template-grid">
        <div
          v-for="template in hookTemplates"
          :key="template.id"
          class="template-card"
          @click="applyTemplate(template)"
        >
          <Icon :name="template.icon" size="20" />
          <h5>{{ template.name }}</h5>
          <p>{{ template.description }}</p>
        </div>
      </div>
    </div>

    <div class="active-hooks">
      <h4>Active Hooks</h4>
      <div v-if="activeHooks.length === 0" class="no-hooks">
        No hooks configured. Click a template above to get started.
      </div>
      <div v-else class="hook-list">
        <div
          v-for="hook in activeHooks"
          :key="hook.id"
          class="hook-item"
        >
          <div class="hook-header">
            <span class="hook-event">{{ hook.event }}</span>
            <span class="hook-matcher">{{ hook.matcher || 'all tools' }}</span>
            <button
              class="toggle-button"
              :class="{ disabled: hook.disabled }"
              @click="toggleHook(hook)"
              :title="hook.disabled ? 'Enable' : 'Disable'"
            >
              <Icon :name="hook.disabled ? 'mdi:toggle-switch-off' : 'mdi:toggle-switch'" size="16" />
            </button>
            <button
              class="delete-button"
              @click="deleteHook(hook)"
              title="Delete"
            >
              <Icon name="mdi:delete" size="16" />
            </button>
          </div>
          <code class="hook-command">{{ hook.command }}</code>
        </div>
      </div>
    </div>

    <div class="hook-actions">
      <button @click="openHookEditor" class="action-button primary">
        <Icon name="mdi:plus" size="16" />
        Create Custom Hook
      </button>
      <button @click="testHooks" class="action-button">
        <Icon name="mdi:play" size="16" />
        Test Hooks
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';

interface HookTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  event: string;
  matcher: string;
  command: string;
}

interface ActiveHook {
  id: string;
  event: string;
  matcher: string;
  command: string;
  disabled?: boolean;
}

const activeHooks = ref<ActiveHook[]>([]);

const hookTemplates: HookTemplate[] = [
  {
    id: 'auto-format',
    name: 'Auto-format on Save',
    description: 'Run prettier when files are edited',
    icon: 'mdi:format-paint',
    event: 'PostToolUse',
    matcher: 'Edit',
    command: 'prettier --write "$FILE_PATH" 2>/dev/null || true'
  },
  {
    id: 'block-env',
    name: 'Block .env Edits',
    description: 'Prevent editing environment files',
    icon: 'mdi:shield-lock',
    event: 'PreToolUse',
    matcher: 'Edit',
    command: 'if [[ "$FILE_PATH" == *.env* ]]; then echo "BLOCKED: Cannot edit .env files" >&2; exit 1; fi'
  },
  {
    id: 'notify',
    name: 'Desktop Notifications',
    description: 'Get notified when Claude needs input',
    icon: 'mdi:bell',
    event: 'Notification',
    matcher: '',
    command: 'osascript -e \'display notification "Claude needs your input" with title "Claude Code"\' 2>/dev/null || notify-send "Claude Code" "Claude needs your input" 2>/dev/null || true'
  },
  {
    id: 'log-commands',
    name: 'Log Shell Commands',
    description: 'Keep track of all commands run',
    icon: 'mdi:console',
    event: 'PreToolUse',
    matcher: 'Bash',
    command: 'echo "[$(date)] $COMMAND" >> ~/.claude/command.log'
  },
  {
    id: 'test-after-edit',
    name: 'Run Tests After Edit',
    description: 'Automatically run tests when test files change',
    icon: 'mdi:test-tube',
    event: 'PostToolUse',
    matcher: 'Edit',
    command: 'if [[ "$FILE_PATH" == *.test.* ]] || [[ "$FILE_PATH" == *.spec.* ]]; then npm test -- "$FILE_PATH" 2>/dev/null || true; fi'
  },
  {
    id: 'git-stage',
    name: 'Auto-stage Changes',
    description: 'Automatically stage edited files',
    icon: 'mdi:git',
    event: 'PostToolUse',
    matcher: 'Edit',
    command: 'git add "$FILE_PATH" 2>/dev/null || true'
  }
];

// Load active hooks
const loadHooks = async () => {
  try {
    // This would load from Claude's hook configuration
    const result = await window.electronAPI.claude.getHooks();
    if (result.success && result.hooks) {
      activeHooks.value = result.hooks;
    }
  } catch (error) {
    console.error('Failed to load hooks:', error);
  }
};

// Apply template
const applyTemplate = async (template: HookTemplate) => {
  const newHook = {
    event: template.event,
    matcher: template.matcher,
    command: template.command,
    disabled: false
  };

  try {
    const result = await window.electronAPI.claude.addHook(newHook);
    if (result.success) {
      // Reload hooks to get the server-assigned ID
      await loadHooks();
    }
  } catch (error) {
    console.error('Failed to add hook:', error);
  }
};

// Toggle hook
const toggleHook = async (hook: ActiveHook) => {
  hook.disabled = !hook.disabled;
  try {
    // Clone the hook to avoid serialization issues
    const hookData = {
      id: hook.id,
      event: hook.event,
      matcher: hook.matcher,
      command: hook.command,
      disabled: hook.disabled
    };
    await window.electronAPI.claude.updateHook(hook.id, hookData);
  } catch (error) {
    console.error('Failed to update hook:', error);
    // Revert on error
    hook.disabled = !hook.disabled;
  }
};

// Delete hook
const deleteHook = async (hook: ActiveHook) => {
  if (!confirm('Delete this hook?')) return;

  try {
    const result = await window.electronAPI.claude.deleteHook(hook.id);
    if (result.success) {
      const index = activeHooks.value.findIndex(h => h.id === hook.id);
      if (index !== -1) {
        activeHooks.value.splice(index, 1);
      }
    }
  } catch (error) {
    console.error('Failed to delete hook:', error);
  }
};

// Open hook editor (placeholder for now)
const openHookEditor = () => {
  // In the future, this could open a more advanced hook editor
  // For now, we'll just show a message
  alert('Advanced hook editor coming soon! Use the template buttons above for now.');
};

// Test hooks
const testHooks = () => {
  window.dispatchEvent(new CustomEvent('test-hooks'));
};

onMounted(() => {
  loadHooks();
});
</script>

<style scoped>
.hook-quick-actions {
  padding: 16px;
  height: 100%;
  overflow-y: auto;
}

.hook-quick-actions h3 {
  font-size: 18px;
  font-weight: 500;
  margin: 0 0 8px;
}

.description {
  color: #858585;
  font-size: 13px;
  margin: 0 0 20px;
}

.quick-templates {
  margin-bottom: 24px;
}

.quick-templates h4 {
  font-size: 14px;
  font-weight: 500;
  margin: 0 0 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #858585;
}

.template-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
}

.template-card {
  background: #252526;
  border: 1px solid #454545;
  border-radius: 6px;
  padding: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.template-card:hover {
  background: #2d2d30;
  border-color: #007acc;
  transform: translateY(-1px);
}

.template-card h5 {
  font-size: 13px;
  font-weight: 500;
  margin: 6px 0 4px;
}

.template-card p {
  font-size: 11px;
  color: #858585;
  margin: 0;
  line-height: 1.4;
}

.active-hooks {
  margin-bottom: 20px;
}

.active-hooks h4 {
  font-size: 14px;
  font-weight: 500;
  margin: 0 0 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #858585;
}

.no-hooks {
  color: #858585;
  font-style: italic;
  text-align: center;
  padding: 24px;
  background: #252526;
  border-radius: 6px;
  border: 1px dashed #454545;
}

.hook-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.hook-item {
  background: #252526;
  border: 1px solid #454545;
  border-radius: 6px;
  padding: 12px;
}

.hook-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.hook-event {
  background: #007acc;
  color: white;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
}

.hook-matcher {
  color: #858585;
  font-size: 12px;
  flex: 1;
}

.toggle-button,
.delete-button {
  background: none;
  border: none;
  color: #858585;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s;
}

.toggle-button:hover,
.delete-button:hover {
  background: #3e3e42;
  color: #cccccc;
}

.toggle-button.disabled {
  color: #f48771;
}

.hook-command {
  display: block;
  background: #1e1e1e;
  padding: 8px;
  border-radius: 4px;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
  color: #cccccc;
  overflow-x: auto;
}

.hook-actions {
  display: flex;
  gap: 8px;
  margin-top: 20px;
}

.action-button {
  background: #2d2d30;
  border: 1px solid #454545;
  color: #cccccc;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s;
}

.action-button:hover {
  background: #3e3e42;
  border-color: #5a5a5a;
}

.action-button.primary {
  background: #007acc;
  border-color: #007acc;
  color: white;
}

.action-button.primary:hover {
  background: #005a9e;
  border-color: #005a9e;
}
</style>