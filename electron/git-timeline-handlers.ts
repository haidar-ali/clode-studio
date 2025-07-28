import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { GitTimelineService } from './git-timeline-service.js';
import { TimelineFilter } from './types/git-timeline';

// Store service instances per workspace
const timelineServices = new Map<string, GitTimelineService>();

// Track if handlers have been registered
let handlersRegistered = false;

/**
 * Get or create a timeline service for a workspace
 */
function getTimelineService(workspacePath: string): GitTimelineService {
  if (!timelineServices.has(workspacePath)) {
    timelineServices.set(workspacePath, new GitTimelineService(workspacePath));
  }
  return timelineServices.get(workspacePath)!;
}

/**
 * Set up git timeline IPC handlers
 */
export function setupGitTimelineHandlers() {
  // Only register handlers once
  if (handlersRegistered) {
    return;
  }
  handlersRegistered = true;

  // Get timeline data
  ipcMain.handle('git-timeline:getData', async (
    event: IpcMainInvokeEvent,
    workspacePath: string,
    filter?: TimelineFilter
  ) => {
    try {
    
      const service = getTimelineService(workspacePath);
      const data = await service.getTimelineData(filter);
      
      // Double-check serialization
      try {
        JSON.stringify(data);
      } catch (serializeError) {
        console.error('[git-timeline-handlers] Data not serializable:', serializeError);
        console.error('[git-timeline-handlers] Data structure:', data);
        return { 
          success: false, 
          error: 'Failed to serialize timeline data' 
        };
      }
      
      return { success: true, data };
    } catch (error) {
      console.error('[git-timeline-handlers] Error in getData:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  });

  // Get commit details
  ipcMain.handle('git-timeline:getCommitDetails', async (
    event: IpcMainInvokeEvent,
    workspacePath: string,
    hash: string
  ) => {
    try {
      const service = getTimelineService(workspacePath);
      const commit = await service.getCommitDetails(hash);
      return { success: true, commit };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  });

  // Clear cache
  ipcMain.handle('git-timeline:clearCache', async (
    event: IpcMainInvokeEvent,
    workspacePath: string
  ) => {
    try {
      const service = getTimelineService(workspacePath);
      service.clearCache();
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  });

  // Checkout branch
  ipcMain.handle('git-timeline:checkoutBranch', async (
    event: IpcMainInvokeEvent,
    workspacePath: string,
    branchName: string
  ) => {
    try {
      const service = getTimelineService(workspacePath);
      // Use the git instance from the service
      const git = (service as any).git;
      await git.checkout(branchName);
      
      // Clear cache after branch switch
      service.clearCache();
      
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  });

  // Create new branch
  ipcMain.handle('git-timeline:createBranch', async (
    event: IpcMainInvokeEvent,
    workspacePath: string,
    branchName: string,
    startPoint?: string
  ) => {
    try {
      const service = getTimelineService(workspacePath);
      const git = (service as any).git;
      
      if (startPoint) {
        await git.checkoutBranch(branchName, startPoint);
      } else {
        await git.checkoutLocalBranch(branchName);
      }
      
      // Clear cache after branch creation
      service.clearCache();
      
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  });
}

/**
 * Clean up timeline service for a workspace
 */
export function cleanupGitTimelineService(workspacePath: string) {
  timelineServices.delete(workspacePath);
}

/**
 * Remove all git timeline handlers (for app shutdown)
 */
export function removeGitTimelineHandlers() {
  if (handlersRegistered) {
    ipcMain.removeHandler('git-timeline:getData');
    ipcMain.removeHandler('git-timeline:getCommitDetails');
    ipcMain.removeHandler('git-timeline:clearCache');
    ipcMain.removeHandler('git-timeline:checkoutBranch');
    ipcMain.removeHandler('git-timeline:createBranch');
    handlersRegistered = false;
  }
}