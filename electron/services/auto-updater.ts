import { app, dialog, BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as path from 'path';

export class AutoUpdaterService {
  private mainWindow: BrowserWindow | null = null;
  private updateCheckInterval: NodeJS.Timeout | null = null;
  private isUpdating = false;

  constructor() {
    // Configure auto-updater
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    
    // Set update feed URL
    if (process.env.NODE_ENV === 'production') {
      autoUpdater.setFeedURL({
        provider: 'github',
        owner: 'haidar-ali',
        repo: 'clode-studio',
        private: false
      });
    }

    this.setupEventHandlers();
  }

  setMainWindow(window: BrowserWindow) {
    this.mainWindow = window;
  }

  private setupEventHandlers() {
    // Checking for update
    autoUpdater.on('checking-for-update', () => {
      this.sendStatusToWindow('checking-for-update');
    });

    // Update available
    autoUpdater.on('update-available', (info) => {
      this.sendStatusToWindow('update-available', info);
      
      // Show dialog to user
      dialog.showMessageBox(this.mainWindow!, {
        type: 'info',
        title: 'Update Available',
        message: `A new version ${info.version} is available. Would you like to download it now?`,
        detail: 'The update will be installed automatically when you quit the app.',
        buttons: ['Download', 'Later'],
        defaultId: 0
      }).then((result) => {
        if (result.response === 0) {
          autoUpdater.downloadUpdate();
        }
      });
    });

    // No update available
    autoUpdater.on('update-not-available', (info) => {
      this.sendStatusToWindow('update-not-available', info);
    });

    // Error in auto-updater
    autoUpdater.on('error', (err) => {
      this.sendStatusToWindow('error', err.message);
      console.error('Auto-updater error:', err);
    });

    // Download progress
    autoUpdater.on('download-progress', (progressObj) => {
      this.sendStatusToWindow('download-progress', progressObj);
      
      // Update window title with progress
      if (this.mainWindow) {
        const percent = Math.round(progressObj.percent);
        this.mainWindow.setTitle(`Clode Studio - Downloading update... ${percent}%`);
      }
    });

    // Update downloaded
    autoUpdater.on('update-downloaded', (info) => {
      this.sendStatusToWindow('update-downloaded', info);
      
      // Reset window title
      if (this.mainWindow) {
        this.mainWindow.setTitle('Clode Studio');
      }

      // Show dialog to user
      dialog.showMessageBox(this.mainWindow!, {
        type: 'info',
        title: 'Update Ready',
        message: 'Update downloaded successfully.',
        detail: `Version ${info.version} has been downloaded and will be installed on quit. Would you like to restart now?`,
        buttons: ['Restart Now', 'Later'],
        defaultId: 0
      }).then((result) => {
        if (result.response === 0) {
          autoUpdater.quitAndInstall();
        }
      });
    });
  }

  private sendStatusToWindow(status: string, data?: any) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('auto-updater', { status, data });
    }
  }

  checkForUpdates(silent = false) {
    if (this.isUpdating) return;
    
    this.isUpdating = true;
    
    if (!silent) {
      this.sendStatusToWindow('checking-for-update');
    }

    autoUpdater.checkForUpdatesAndNotify()
      .catch((err) => {
        console.error('Error checking for updates:', err);
        if (!silent) {
          dialog.showErrorBox('Update Check Failed', 
            'Unable to check for updates. Please check your internet connection.');
        }
      })
      .finally(() => {
        this.isUpdating = false;
      });
  }

  startAutoCheck(intervalMinutes = 60) {
    // Check on startup
    setTimeout(() => {
      this.checkForUpdates(true);
    }, 5000); // Wait 5 seconds after app start

    // Check periodically
    this.updateCheckInterval = setInterval(() => {
      this.checkForUpdates(true);
    }, intervalMinutes * 60 * 1000);
  }

  stopAutoCheck() {
    if (this.updateCheckInterval) {
      clearInterval(this.updateCheckInterval);
      this.updateCheckInterval = null;
    }
  }

  // Method to configure update channel (stable, beta, alpha)
  setUpdateChannel(channel: 'stable' | 'beta' | 'alpha') {
    const allowPrerelease = channel !== 'stable';
    autoUpdater.allowPrerelease = allowPrerelease;
    
    // Store preference
    if (this.mainWindow) {
      this.mainWindow.webContents.send('auto-updater', { 
        status: 'channel-changed', 
        data: channel 
      });
    }
  }

  // Get current version
  getCurrentVersion(): string {
    return app.getVersion();
  }

  // Check if running in development
  isDevelopment(): boolean {
    return process.env.NODE_ENV !== 'production' && !app.isPackaged;
  }
}

// Export singleton instance
export const autoUpdaterService = new AutoUpdaterService();