// This file ensures TypeScript recognizes the window.electronAPI global
export {};

declare global {
  interface Window {
    electronAPI: import('../electron/preload').ElectronAPI;
  }
}