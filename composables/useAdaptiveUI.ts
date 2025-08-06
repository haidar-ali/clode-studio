/**
 * Adaptive UI Composable for Remote Mode
 * Provides responsive behavior based on device type and screen size
 */

import { ref, computed, onMounted, onUnmounted } from 'vue';

export function useAdaptiveUI() {
  // Screen size tracking
  const screenWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1024);
  const screenHeight = ref(typeof window !== 'undefined' ? window.innerHeight : 768);
  
  // Device type detection (only in browser/remote mode)
  const isTouchDevice = ref(false);
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : '';
  
  // Check if running in desktop Electron app
  const isElectronApp = computed(() => {
    return typeof window !== 'undefined' && !!window.electronAPI;
  });
  
  // Only apply adaptive behavior in remote mode (no electronAPI)
  const isRemoteMode = computed(() => !isElectronApp.value);
  
  // Device type detection
  const isMobile = computed(() => {
    if (!isRemoteMode.value) return false; // Desktop always returns false
    return screenWidth.value < 768 || /mobile|android|iphone/i.test(userAgent);
  });
  
  const isTablet = computed(() => {
    if (!isRemoteMode.value) return false; // Desktop always returns false
    return screenWidth.value >= 768 && screenWidth.value < 1024 && isTouchDevice.value;
  });
  
  const isDesktop = computed(() => {
    if (!isRemoteMode.value) return true; // Electron app is always desktop
    return screenWidth.value >= 1024 && !isTouchDevice.value;
  });
  
  // Breakpoints (Tailwind-compatible)
  const breakpoint = computed(() => {
    if (!isRemoteMode.value) return 'xl'; // Desktop always xl
    
    if (screenWidth.value < 640) return 'xs';  // Mobile
    if (screenWidth.value < 768) return 'sm';  // Large mobile
    if (screenWidth.value < 1024) return 'md'; // Tablet
    if (screenWidth.value < 1280) return 'lg'; // Small desktop
    return 'xl'; // Large desktop
  });
  
  // Orientation
  const isLandscape = computed(() => screenWidth.value > screenHeight.value);
  const isPortrait = computed(() => !isLandscape.value);
  
  // Layout suggestions based on device
  const layoutMode = computed(() => {
    if (!isRemoteMode.value) return 'desktop'; // Electron always desktop layout
    
    if (isMobile.value) return 'mobile';
    if (isTablet.value) return 'tablet';
    return 'desktop';
  });
  
  // Sidebar behavior
  const sidebarBehavior = computed(() => {
    if (!isRemoteMode.value) return 'static'; // Desktop always static
    
    if (isMobile.value) return 'overlay';  // Overlay on mobile
    if (isTablet.value) return 'collapsible'; // Collapsible on tablet
    return 'static'; // Static on desktop
  });
  
  // Component density
  const componentDensity = computed(() => {
    if (!isRemoteMode.value) return 'comfortable'; // Desktop comfortable
    
    if (isMobile.value) return 'compact';
    return 'comfortable';
  });
  
  // Update screen dimensions
  const updateDimensions = () => {
    if (typeof window !== 'undefined') {
      screenWidth.value = window.innerWidth;
      screenHeight.value = window.innerHeight;
    }
  };
  
  // Detect touch capability
  const detectTouch = () => {
    if (typeof window !== 'undefined') {
      isTouchDevice.value = 
        'ontouchstart' in window ||
        navigator.maxTouchPoints > 0 ||
        /iPad|iPhone|iPod|Android/i.test(userAgent);
    }
  };
  
  // Setup listeners
  onMounted(() => {
    if (typeof window !== 'undefined') {
      detectTouch();
      updateDimensions();
      window.addEventListener('resize', updateDimensions);
      window.addEventListener('orientationchange', updateDimensions);
    }
  });
  
  onUnmounted(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', updateDimensions);
      window.removeEventListener('orientationchange', updateDimensions);
    }
  });
  
  return {
    // Core states
    isRemoteMode,
    isElectronApp,
    
    // Device types
    isMobile,
    isTablet,
    isDesktop,
    isTouchDevice,
    
    // Screen info
    screenWidth,
    screenHeight,
    breakpoint,
    
    // Orientation
    isLandscape,
    isPortrait,
    
    // Layout helpers
    layoutMode,
    sidebarBehavior,
    componentDensity,
    
    // Utility classes
    adaptiveClasses: computed(() => ({
      'is-mobile': isMobile.value,
      'is-tablet': isTablet.value,
      'is-desktop': isDesktop.value,
      'is-touch': isTouchDevice.value,
      'is-remote': isRemoteMode.value,
      'is-landscape': isLandscape.value,
      'is-portrait': isPortrait.value,
      [`breakpoint-${breakpoint.value}`]: true,
      [`layout-${layoutMode.value}`]: true
    }))
  };
}