<template>
  <div class="codex-terminal-tabs">
    <div class="tabs-header">
      <div class="tabs-container">
        <div
          v-for="instance in instances"
          :key="instance.id"
          :class="['tab', { active: instance.id === activeInstanceId }]"
          :style="instance.color ? { borderTopColor: instance.color, borderTopWidth: '4px', backgroundColor: instance.color + '10' } : {}"
          @click="setActiveInstance(instance.id)"
        >
          <span class="tab-name" @dblclick.stop="startEditName(instance)">{{ instance.name }}</span>
          <div class="tab-status" :class="`status-${instance.status}`"></div>
          <button v-if="instances.length > 1" @click.stop="removeInstance(instance.id)" class="tab-close" title="Close terminal">
            <Icon name="mdi:close" size="14" />
          </button>
        </div>
        <button @click="createNewInstance" class="tab-add" title="New Codex terminal">
          <Icon name="mdi:plus" size="16" />
        </button>
      </div>
    </div>

    <div class="terminals-container">
      <CodexTerminalTab
        v-for="instance in instances"
        :key="instance.id"
        v-show="instance.id === activeInstanceId"
        :instance="instance"
        @status-change="(status, pid) => updateInstanceStatus(instance.id, status, pid)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, nextTick, onMounted, onUnmounted } from 'vue';
import { useCodexInstancesStore } from '~/stores/codex-instances';
import CodexTerminalTab from './CodexTerminalTab.vue';

interface Props {
  instanceGroup?: string;
  worktreePath?: string;
}
const props = defineProps<Props>();

const instancesStore = useCodexInstancesStore();

const instances = computed(() => {
  const all = instancesStore.instancesList;
  if (props.worktreePath) {
    return all.filter(i => i.workingDirectory === props.worktreePath);
  }
  return all;
});

const activeInstanceId = computed(() => {
  if (props.worktreePath) {
    const worktreeActive = instancesStore.activeInstanceByWorktree.get(props.worktreePath);
    if (worktreeActive && instances.value.some(inst => inst.id === worktreeActive)) return worktreeActive;
    if (instances.value.length > 0) return instances.value[0].id;
  }
  return instancesStore.activeInstanceId;
});

const setActiveInstance = (id: string) => instancesStore.setActiveInstance(id);

const createNewInstance = async () => {
  const count = instances.value.length + 1;
  const name = `Codex ${count}`;
  await instancesStore.createInstance(name, props.worktreePath);
};

const removeInstance = async (id: string) => {
  if (confirm('Are you sure you want to close this Codex terminal?')) {
    await instancesStore.removeInstance(id);
  }
};

const updateInstanceStatus = (id: string, status: any, pid?: number) => {
  instancesStore.updateInstanceStatus(id, status, pid);
};

// Simple name editing via prompt for minimal UI
const startEditName = async (instance: any) => {
  const newName = prompt('Rename tab', instance.name);
  if (newName && newName.trim() && newName !== instance.name) {
    await instancesStore.updateInstanceName(instance.id, newName.trim());
  }
};

onMounted(async () => {
  if (typeof window !== 'undefined') {
    await instancesStore.init();
    if (props.worktreePath && instances.value.length === 0) {
      await instancesStore.createInstance('Codex 1', props.worktreePath);
    }
    if (props.worktreePath && activeInstanceId.value && instances.value.length > 0) {
      instancesStore.setActiveInstance(activeInstanceId.value);
    }
  }
});

onUnmounted(() => {});
</script>

<style scoped>
.codex-terminal-tabs { display: flex; flex-direction: column; height: 100%; background: #1e1e1e; }
.tabs-header { display: flex; justify-content: space-between; align-items: center; background: #2d2d30; border-bottom: 1px solid #181818; padding: 0 8px; min-height: 38px; }
.tabs-container { display: flex; align-items: center; gap: 1px; flex: 1; overflow-x: auto; overflow-y: hidden; scrollbar-width: thin; }
.tabs-container::-webkit-scrollbar { height: 3px; }
.tabs-container::-webkit-scrollbar-thumb { background: #505050; border-radius: 3px; }
.tab { display: flex; align-items: center; gap: 6px; padding: 6px 12px; background: #2d2d30; border: 1px solid transparent; border-top: 4px solid transparent; border-bottom: none; cursor: pointer; user-select: none; transition: all 0.2s; position: relative; white-space: nowrap; font-size: 13px; }
.tab:hover { background: #383838; }
.tab.active { background: #1e1e1e; border-color: #181818; border-bottom-color: #1e1e1e; position: relative; }
.tab-name { max-width: 120px; overflow: hidden; text-overflow: ellipsis; cursor: text; }
.tab-status { width: 6px; height: 6px; border-radius: 50%; margin-left: 4px; }
.status-connected { background: #0dbc79; }
.status-connecting { background: #e5e510; animation: pulse 1.5s ease-in-out infinite; }
.status-disconnected { background: #666; }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3}}
.tab-close { display:flex; align-items:center; justify-content:center; background:none; border:none; color:#999; cursor:pointer; padding:2px; margin-left:4px; border-radius:3px; opacity:0; transition:all .2s; }
.tab:hover .tab-close { opacity: 1; }
.tab-close:hover { background:#505050; color:#fff; }
.tab-add { display:flex; align-items:center; justify-content:center; background:none; border:none; color:#999; cursor:pointer; padding:6px 8px; border-radius:3px; transition:all .2s; }
.tab-add:hover { background:#383838; color:#fff; }
.terminals-container { flex: 1; position: relative; overflow: hidden; }
</style>
