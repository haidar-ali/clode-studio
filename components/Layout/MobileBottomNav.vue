<template>
  <div class="mobile-bottom-nav">
    <button 
      v-for="item in mainNavItems"
      :key="item.id"
      :class="{ active: activeTab === item.id }"
      @click="handleNavClick(item.id)"
      class="nav-item"
    >
      <Icon :name="item.icon" size="20" />
      <span>{{ item.label }}</span>
    </button>
    
    <!-- More Menu Overlay -->
    <Teleport to="body">
      <div v-if="showMoreMenu" class="more-menu-overlay" @click="showMoreMenu = false">
        <div class="more-menu" @click.stop>
          <div class="more-menu-header">
            <span>More Options</span>
            <button @click="showMoreMenu = false" class="close-btn">
              <Icon name="mdi:close" size="20" />
            </button>
          </div>
          <div class="more-menu-items">
            <button
              v-for="item in moreNavItems"
              :key="item.id"
              :class="{ active: activeTab === item.id }"
              @click="selectMoreItem(item.id)"
              class="more-menu-item"
            >
              <Icon :name="item.icon" size="20" />
              <span>{{ item.label }}</span>
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

interface Props {
  activeTab: string;
}

defineProps<Props>();
const emit = defineEmits<{
  change: [tab: string]
}>();

const showMoreMenu = ref(false);

const mainNavItems = [
  { id: 'explorer-editor', label: 'Code', icon: 'mdi:code-braces' },
  { id: 'terminal', label: 'Terminal', icon: 'mdi:console' },
  { id: 'claude', label: 'Claude', icon: 'simple-icons:anthropic' },
  { id: 'tasks', label: 'Tasks', icon: 'mdi:checkbox-marked-circle' },
  { id: 'more', label: 'More', icon: 'mdi:dots-horizontal' }
];

const moreNavItems = [
  { id: 'source-control', label: 'Git', icon: 'mdi:git' },
  { id: 'knowledge', label: 'Knowledge', icon: 'mdi:book-open-page-variant' },
  { id: 'context', label: 'Context', icon: 'mdi:brain' },
  { id: 'prompts', label: 'Prompts', icon: 'mdi:lightning-bolt' },
  { id: 'snapshots', label: 'Snapshots', icon: 'mdi:camera' },
  { id: 'worktrees', label: 'Worktrees', icon: 'mdi:file-tree' }
];

const handleNavClick = (id: string) => {
  if (id === 'more') {
    showMoreMenu.value = true;
  } else {
    emit('change', id);
  }
};

const selectMoreItem = (id: string) => {
  emit('change', id);
  showMoreMenu.value = false;
};
</script>

<style scoped>
.mobile-bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 56px;
  background: #252526;
  border-top: 1px solid #3e3e42;
  display: flex;
  justify-content: space-around;
  align-items: center;
  z-index: 100;
  padding: 0 8px;
}

.nav-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  background: none;
  border: none;
  color: #858585;
  padding: 8px 4px;
  cursor: pointer;
  transition: color 0.2s;
  font-size: 10px;
}

.nav-item:active {
  transform: scale(0.95);
}

.nav-item.active {
  color: #007acc;
}

.nav-item span {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 60px;
}
.more-menu-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  z-index: 999;
  display: flex;
  align-items: flex-end;
  animation: fadeIn 0.2s;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.more-menu {
  width: 100%;
  background: #2d2d30;
  border-top-left-radius: 12px;
  border-top-right-radius: 12px;
  padding-bottom: env(safe-area-inset-bottom, 20px);
  animation: slideUp 0.3s ease-out;
}

@keyframes slideUp {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}

.more-menu-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid #3e3e42;
  color: #cccccc;
  font-weight: 500;
}

.close-btn {
  background: none;
  border: none;
  color: #858585;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.more-menu-items {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  padding: 16px;
}

.more-menu-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  background: #252526;
  border: 1px solid #3e3e42;
  border-radius: 8px;
  padding: 16px 8px;
  color: #858585;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 11px;
}

.more-menu-item:active {
  transform: scale(0.95);
}

.more-menu-item.active {
  background: #007acc;
  color: #ffffff;
  border-color: #007acc;
}

.more-menu-item:hover:not(.active) {
  background: rgba(255, 255, 255, 0.05);
  color: #cccccc;
}
</style>