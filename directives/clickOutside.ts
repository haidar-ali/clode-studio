import type { DirectiveBinding } from 'vue';

interface ClickOutsideElement extends HTMLElement {
  __clickOutside__?: (event: MouseEvent) => void;
}

export const vClickOutside = {
  mounted(el: ClickOutsideElement, binding: DirectiveBinding) {
    el.__clickOutside__ = (event: MouseEvent) => {
      if (!(el === event.target || el.contains(event.target as Node))) {
        binding.value(event);
      }
    };
    
    document.addEventListener('click', el.__clickOutside__);
  },
  
  unmounted(el: ClickOutsideElement) {
    if (el.__clickOutside__) {
      document.removeEventListener('click', el.__clickOutside__);
      delete el.__clickOutside__;
    }
  }
};