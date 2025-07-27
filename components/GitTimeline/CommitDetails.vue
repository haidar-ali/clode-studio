<template>
  <div class="commit-details-panel h-full flex flex-col">
    <!-- Header -->
    <div class="p-4 border-b">
      <div class="flex items-start justify-between">
        <div class="flex-1">
          <h4 class="font-mono text-sm opacity-60">{{ commit.abbrevHash }}</h4>
          <h3 class="text-lg font-semibold mt-1">{{ commit.subject }}</h3>
        </div>
        <button 
          class="btn btn-sm btn-ghost btn-circle"
          @click="$emit('close')"
        >
          <Icon name="mdi:close" class="w-5 h-5" />
        </button>
      </div>
    </div>

    <!-- Commit info -->
    <div class="p-4 space-y-4">
      <!-- Author -->
      <div>
        <div class="text-sm opacity-60 mb-1">Author</div>
        <div class="flex items-center gap-2">
          <div class="avatar placeholder">
            <div class="bg-primary text-primary-content rounded-full w-8">
              <span class="text-xs">{{ getInitials(commit.author.name) }}</span>
            </div>
          </div>
          <div>
            <div class="text-sm font-medium">{{ commit.author.name }}</div>
            <div class="text-xs opacity-60">{{ formatDate(commit.author.timestamp) }}</div>
          </div>
        </div>
      </div>

      <!-- Branch/Tags -->
      <div v-if="commit.refs.length > 0">
        <div class="text-sm opacity-60 mb-1">References</div>
        <div class="flex flex-wrap gap-2">
          <span 
            v-for="ref in commit.refs" 
            :key="ref"
            class="badge badge-sm"
            :class="{
              'badge-primary': ref.includes('HEAD'),
              'badge-secondary': ref.startsWith('tag:'),
              'badge-accent': !ref.includes('HEAD') && !ref.startsWith('tag:')
            }"
          >
            <Icon 
              :name="ref.startsWith('tag:') ? 'mdi:tag' : 'mdi:source-branch'" 
              class="w-3 h-3 mr-1" 
            />
            {{ ref.replace('tag:', '') }}
          </span>
        </div>
      </div>

      <!-- Commit message body -->
      <div v-if="commit.body">
        <div class="text-sm opacity-60 mb-1">Description</div>
        <pre class="text-sm whitespace-pre-wrap font-mono bg-base-200 p-3 rounded">{{ commit.body }}</pre>
      </div>

      <!-- Parents -->
      <div v-if="commit.parents.length > 0">
        <div class="text-sm opacity-60 mb-1">Parents</div>
        <div class="space-y-1">
          <div 
            v-for="parent in commit.parents" 
            :key="parent"
            class="font-mono text-sm opacity-80"
          >
            {{ parent.substring(0, 7) }}
          </div>
        </div>
      </div>
    </div>

    <!-- File changes -->
    <div v-if="commit.files" class="flex-1 border-t">
      <div class="p-4">
        <div class="text-sm opacity-60 mb-2">
          Files changed ({{ totalFiles }})
        </div>
        
        <!-- Stats summary -->
        <div class="flex gap-4 text-sm mb-3">
          <span class="text-success">
            <Icon name="mdi:plus" class="w-4 h-4 inline" />
            {{ commit.files.added.length }} added
          </span>
          <span class="text-warning">
            <Icon name="mdi:pencil" class="w-4 h-4 inline" />
            {{ commit.files.modified.length }} modified
          </span>
          <span class="text-error">
            <Icon name="mdi:minus" class="w-4 h-4 inline" />
            {{ commit.files.deleted.length }} deleted
          </span>
        </div>

        <!-- File list -->
        <div class="space-y-1 max-h-64 overflow-y-auto">
          <!-- Added files -->
          <div 
            v-for="file in commit.files.added" 
            :key="`add-${file}`"
            class="flex items-center gap-2 text-sm py-1"
          >
            <Icon name="mdi:plus-circle" class="w-4 h-4 text-success" />
            <span class="font-mono">{{ file }}</span>
          </div>

          <!-- Modified files -->
          <div 
            v-for="file in commit.files.modified" 
            :key="`mod-${file}`"
            class="flex items-center gap-2 text-sm py-1"
          >
            <Icon name="mdi:circle-edit-outline" class="w-4 h-4 text-warning" />
            <span class="font-mono">{{ file }}</span>
          </div>

          <!-- Deleted files -->
          <div 
            v-for="file in commit.files.deleted" 
            :key="`del-${file}`"
            class="flex items-center gap-2 text-sm py-1"
          >
            <Icon name="mdi:minus-circle" class="w-4 h-4 text-error" />
            <span class="font-mono line-through opacity-60">{{ file }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Actions -->
    <div class="p-4 border-t">
      <div class="flex gap-2">
        <button class="btn btn-sm btn-primary flex-1">
          <Icon name="mdi:source-branch" class="w-4 h-4" />
          Create Branch Here
        </button>
        <button class="btn btn-sm btn-ghost">
          <Icon name="mdi:content-copy" class="w-4 h-4" />
          Copy Hash
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { GitTimelineCommit } from '~/utils/git-timeline-types';

const props = defineProps<{
  commit: GitTimelineCommit;
}>();

const emit = defineEmits<{
  close: [];
}>();

const totalFiles = computed(() => {
  if (!props.commit.files) return 0;
  return props.commit.files.added.length + 
         props.commit.files.modified.length + 
         props.commit.files.deleted.length;
});

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString();
  } else if (diffDays < 7) {
    return date.toLocaleDateString(undefined, { weekday: 'short', hour: 'numeric', minute: 'numeric' });
  } else {
    return date.toLocaleDateString();
  }
}
</script>

<style scoped>
.commit-details-panel {
  @apply bg-base-100;
}
</style>