<template>
  <div class="chat-input-container">
    <div class="input-wrapper">
      <textarea
        ref="textarea"
        v-model="inputValue"
        :disabled="disabled"
        :placeholder="placeholder"
        class="chat-input"
        @keydown="handleKeydown"
        @input="adjustHeight"
        rows="1"
      ></textarea>
      <button
        @click="submit"
        :disabled="disabled || !inputValue.trim()"
        class="send-button"
        title="Send message (Ctrl+Enter)"
      >
        <Icon name="mdi:send" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue';

const props = defineProps<{
  modelValue: string;
  disabled?: boolean;
  placeholder?: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
  'submit': [];
}>();

const textarea = ref<HTMLTextAreaElement>();

const inputValue = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
});

const placeholder = computed(() => 
  props.placeholder || (props.disabled ? 'Claude is not connected...' : 'Type a message.')
);

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Enter') {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      submit();
    } else if (!event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }
};

const submit = () => {
  if (!props.disabled && inputValue.value.trim()) {
    emit('submit');
  }
};

const adjustHeight = async () => {
  await nextTick();
  if (textarea.value) {
    textarea.value.style.height = 'auto';
    const scrollHeight = textarea.value.scrollHeight;
    const maxHeight = 120; // Max 6 lines approximately
    textarea.value.style.height = Math.min(scrollHeight, maxHeight) + 'px';
  }
};

// Reset height when input is cleared
watch(() => props.modelValue, (newValue) => {
  if (!newValue) {
    adjustHeight();
  }
});
</script>

<style scoped>
.chat-input-container {
  padding: 16px;
  background: #252526;
  border-top: 1px solid #181818;
}

.input-wrapper {
  display: flex;
  gap: 8px;
  align-items: flex-end;
}

.chat-input {
  flex: 1;
  background: #3c3c3c;
  border: 1px solid #6c6c6c;
  border-radius: 4px;
  padding: 8px 12px;
  color: #d4d4d4;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.4;
  resize: none;
  min-height: 36px;
  max-height: 120px;
  overflow-y: auto;
}

.chat-input:focus {
  outline: none;
  border-color: #007acc;
  box-shadow: 0 0 0 1px #007acc;
}

.chat-input:disabled {
  background: #2d2d30;
  color: #858585;
  cursor: not-allowed;
}

.chat-input::placeholder {
  color: #858585;
}

.send-button {
  background: #007acc;
  border: none;
  border-radius: 4px;
  padding: 8px 12px;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s;
  min-width: 36px;
  height: 36px;
}

.send-button:hover:not(:disabled) {
  background: #005a9e;
}

.send-button:disabled {
  background: #3e3e42;
  color: #858585;
  cursor: not-allowed;
}
</style>