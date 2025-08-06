/**
 * Bridge to communicate with desktop Electron process
 * This allows server API endpoints to get data from the desktop app
 */
import { app } from 'electron';

// Global store for desktop data that can be accessed by server API endpoints
export const desktopData = {
  workspace: {
    path: null as string | null,
    name: null as string | null,
    type: 'normal' as string
  },
  features: {
    hooks: [] as any[],
    mcp: { servers: [] as any[] },
    commands: {
      projectCommands: [] as any[],
      personalCommands: [] as any[]
    }
  }
};

// Function to update workspace data (called from Electron main process)
export function updateWorkspaceData(data: typeof desktopData.workspace) {
  desktopData.workspace = data;
}

// Function to update features data (called from Electron main process)
export function updateFeaturesData(data: typeof desktopData.features) {
  desktopData.features = data;
}

// Check if we're running in Electron
export function isElectron(): boolean {
  return typeof process !== 'undefined' && 
         process.versions && 
         process.versions.electron !== undefined;
}