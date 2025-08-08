import { computed, readonly } from 'vue';
import { useWindowSize } from '@vueuse/core';

export function useResponsive() {
  const { width, height } = useWindowSize();
  
  const breakpoints = {
    phone: 768,
    tablet: 1024,
    desktop: 1280
  };
  
  const isPhone = computed(() => width.value < breakpoints.phone);
  const isTablet = computed(() => 
    width.value >= breakpoints.phone && width.value < breakpoints.tablet
  );
  const isDesktop = computed(() => width.value >= breakpoints.tablet);
  const isMobile = computed(() => width.value < breakpoints.tablet);
  
  const deviceClass = computed(() => {
    if (isPhone.value) return 'phone';
    if (isTablet.value) return 'tablet';
    return 'desktop';
  });
  
  const orientation = computed(() => 
    width.value > height.value ? 'landscape' : 'portrait'
  );
  
  return {
    width: readonly(width),
    height: readonly(height),
    isPhone: readonly(isPhone),
    isTablet: readonly(isTablet),
    isDesktop: readonly(isDesktop),
    isMobile: readonly(isMobile),
    deviceClass: readonly(deviceClass),
    orientation: readonly(orientation),
    breakpoints
  };
}