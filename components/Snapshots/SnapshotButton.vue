<template>
  <div class="snapshot-button">
    <button
      @click="handleQuickCapture"
      :disabled="isCapturing"
      class="capture-btn"
      :class="{ capturing: isCapturing }"
      title="Capture snapshot (Cmd+Shift+S)"
    >
      <Icon name="camera" v-if="!isCapturing" />
      <Icon name="loader" v-else class="animate-spin" />
      <span class="btn-text">{{ isCapturing ? 'Capturing...' : 'Snapshot' }}</span>
    </button>
    
    <div class="snapshot-info" v-if="lastSnapshotTime">
      <span class="last-snapshot">
        Last: {{ formatTime(lastSnapshotTime) }}
      </span>
    </div>
    
    <!-- Quick actions dropdown -->
    <div class="quick-actions" v-if="showQuickActions">
      <button
        @click="showSnapshotList = true"
        class="action-btn"
        title="Browse snapshots"
      >
        <Icon name="list" />
      </button>
      <button
        @click="toggleAutoSnapshots"
        class="action-btn"
        :class="{ active: config.enableAutoSnapshots }"
        :title="`Auto-snapshots ${config.enableAutoSnapshots ? 'ON' : 'OFF'}`"
      >
        <Icon name="clock" />
      </button>
    </div>
    
    <!-- Snapshot captured notification -->
    <Transition name="fade">
      <div v-if="showNotification" class="snapshot-notification">
        <Icon name="check-circle" class="success-icon" />
        <span>Snapshot captured!</span>
      </div>
    </Transition>
    
    <!-- Snapshot list modal -->
    <SnapshotModal v-model="showSnapshotList" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useSnapshotsStore } from '~/stores/snapshots';
import { formatDistanceToNow } from 'date-fns';
import SnapshotModal from './SnapshotModal.vue';

const snapshotsStore = useSnapshotsStore();

const isCapturing = computed(() => snapshotsStore.isCapturing);
const lastSnapshotTime = computed(() => snapshotsStore.lastSnapshotTime);
const config = computed(() => snapshotsStore.config);

const showQuickActions = ref(false);
const showSnapshotList = ref(false);
const showNotification = ref(false);

async function handleQuickCapture() {
  const snapshot = await snapshotsStore.captureSnapshot();
  if (snapshot) {
    showNotification.value = true;
    setTimeout(() => {
      showNotification.value = false;
    }, 2000);
  }
}

function toggleAutoSnapshots() {
  snapshotsStore.config.enableAutoSnapshots = !snapshotsStore.config.enableAutoSnapshots;
  if (snapshotsStore.config.enableAutoSnapshots) {
    snapshotsStore.startAutoSnapshots();
  } else {
    snapshotsStore.stopAutoSnapshots();
  }
}

function formatTime(date: Date | null) {
  if (!date) return 'Never';
  return formatDistanceToNow(date, { addSuffix: true });
}

// Keyboard shortcut
function handleKeyboard(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'S') {
    e.preventDefault();
    handleQuickCapture();
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeyboard);
  // Load only snapshots for current branch by default
  snapshotsStore.loadSnapshots(false);
  if (config.value.enableAutoSnapshots) {
    snapshotsStore.startAutoSnapshots();
  }
});

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyboard);
  snapshotsStore.stopAutoSnapshots();
});
</script>

<style scoped>
.snapshot-button {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 100%;
}

.capture-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: transparent;
  border: none;
  border-radius: 2px;
  color: white;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
  height: 18px;
}

.capture-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.capture-btn:active {
  background: rgba(255, 255, 255, 0.2);
}

.capture-btn.capturing {
  opacity: 0.7;
  cursor: not-allowed;
}

.capture-btn svg {
  width: 14px;
  height: 14px;
}

.btn-text {
  font-weight: 500;
  white-space: nowrap;
}

.snapshot-info {
  display: flex;
  align-items: center;
  gap: 8px;
  color: rgba(255, 255, 255, 0.8);
  font-size: 11px;
}

.last-snapshot {
  opacity: 0.7;
}

.quick-actions {
  display: flex;
  gap: 4px;
  margin-left: 8px;
  padding-left: 8px;
  border-left: 1px solid rgba(255, 255, 255, 0.2);
}

.action-btn {
  padding: 2px 6px;
  background: transparent;
  border: none;
  border-radius: 2px;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  transition: all 0.2s;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.action-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

.action-btn.active {
  color: #a5f3fc;
  background: rgba(165, 243, 252, 0.1);
}

.action-btn svg {
  width: 14px;
  height: 14px;
}

.snapshot-notification {
  position: fixed;
  top: 20px;
  right: 20px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: #1a1a1a;
  border: 1px solid #10b981;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 1000;
}

.success-icon {
  color: #10b981;
  font-size: 18px;
}

.fade-enter-active,
.fade-leave-active {
  transition: all 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 768px) {
  .btn-text {
    display: none;
  }
  
  .snapshot-info {
    display: none;
  }
}
</style>