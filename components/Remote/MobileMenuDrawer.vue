<template>
  <Teleport to="body">
    <!-- Backdrop -->
    <Transition name="fade">
      <div 
        v-if="show" 
        class="menu-backdrop" 
        @click="$emit('close')"
      />
    </Transition>
    
    <!-- Drawer -->
    <Transition name="slide">
      <div v-if="show" class="menu-drawer">
        <div class="drawer-header">
          <h2>Clode Studio</h2>
          <button @click="$emit('close')" class="close-btn">
            <Icon name="mdi:close" />
          </button>
        </div>
        
        <nav class="drawer-nav">
          <button 
            v-for="item in menuItems" 
            :key="item.id"
            :class="['menu-item', { active: activePanel === item.id }]"
            @click="selectPanel(item.id)"
          >
            <Icon :name="item.icon" class="menu-icon" />
            <span>{{ item.label }}</span>
          </button>
        </nav>
        
        <div class="drawer-footer">
          <div class="connection-info">
            <ConnectionStatus />
          </div>
          <button @click="disconnect" class="disconnect-btn">
            <Icon name="mdi:logout" />
            <span>Disconnect</span>
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { useRemoteConnection } from '~/composables/useRemoteConnection';
import ConnectionStatus from '~/components/Layout/ConnectionStatus.vue';

interface MenuItem {
  id: string;
  label: string;
  icon: string;
}

const props = defineProps<{
  show: boolean;
  menuItems: MenuItem[];
  activePanel: string;
}>();

const emit = defineEmits<{
  close: [];
  'select-panel': [id: string];
}>();

const { disconnect } = useRemoteConnection();

function selectPanel(id: string) {
  emit('select-panel', id);
  emit('close');
}
</script>

<style scoped>
.menu-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(2px);
  z-index: 1000;
}

.menu-drawer {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  width: 280px;
  max-width: 85vw;
  background: #0a0b0d;
  box-shadow: 2px 0 24px rgba(0, 0, 0, 0.4);
  z-index: 1001;
  display: flex;
  flex-direction: column;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
}

.drawer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.drawer-header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
}

.close-btn {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  padding: 8px;
  border-radius: 6px;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.9);
}

.drawer-nav {
  flex: 1;
  padding: 12px 0;
  overflow-y: auto;
}

.menu-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 20px;
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  transition: all 0.2s;
  font-size: 15px;
  font-weight: 500;
  text-align: left;
}

.menu-item:hover {
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.9);
}

.menu-item.active {
  background: rgba(92, 160, 242, 0.1);
  color: #5CA0F2;
  position: relative;
}

.menu-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: #5CA0F2;
}

.menu-icon {
  font-size: 24px;
  opacity: 0.9;
}

.drawer-footer {
  padding: 16px 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.connection-info {
  margin-bottom: 12px;
}

.disconnect-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 16px;
  background: rgba(205, 49, 49, 0.1);
  border: 1px solid rgba(205, 49, 49, 0.3);
  color: #cd3131;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  font-weight: 500;
}

.disconnect-btn:hover {
  background: rgba(205, 49, 49, 0.2);
  transform: translateY(-1px);
}

/* Transitions */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.slide-enter-active,
.slide-leave-active {
  transition: transform 0.3s ease;
}

.slide-enter-from,
.slide-leave-to {
  transform: translateX(-100%);
}
</style>