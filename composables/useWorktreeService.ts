import { remoteConnection } from '~/services/remote-client/RemoteConnectionSingleton';

/**
 * Worktree service that works in both desktop and remote modes
 */
export function useWorktreeService() {
  const isRemoteMode = !window.electronAPI;

  /**
   * List all worktrees
   */
  async function list(): Promise<any> {
    if (isRemoteMode) {
      if (!remoteConnection.isConnected()) {
        throw new Error('Remote connection not available');
      }
      
      const socket = remoteConnection.getSocket();
      if (!socket) {
        throw new Error('Socket not available');
      }
      
      return new Promise((resolve, reject) => {
        const request = {
          id: `req-${Date.now()}`,
          payload: {}
        };
        
        socket.emit('worktree:list', request, (response: any) => {
          if (response.success) {
            resolve(response.data);
          } else {
            reject(new Error(response.error || 'Request failed'));
          }
        });
      });
    } else {
      return window.electronAPI.worktree.list();
    }
  }

  /**
   * Get all worktree sessions
   */
  async function sessions(): Promise<any> {
    if (isRemoteMode) {
      if (!remoteConnection.isConnected()) {
        throw new Error('Remote connection not available');
      }
      
      const socket = remoteConnection.getSocket();
      if (!socket) {
        throw new Error('Socket not available');
      }
      
      return new Promise((resolve, reject) => {
        const request = {
          id: `req-${Date.now()}`,
          payload: {}
        };
        
        socket.emit('worktree:sessions', request, (response: any) => {
          if (response.success) {
            resolve(response.data);
          } else {
            reject(new Error(response.error || 'Request failed'));
          }
        });
      });
    } else {
      return window.electronAPI.worktree.sessions();
    }
  }

  /**
   * Switch to a worktree
   */
  async function switchWorktree(worktreePath: string): Promise<any> {
    if (isRemoteMode) {
      if (!remoteConnection.isConnected()) {
        throw new Error('Remote connection not available');
      }
      
      const socket = remoteConnection.getSocket();
      if (!socket) {
        throw new Error('Socket not available');
      }
      
      return new Promise((resolve, reject) => {
        const request = {
          id: `req-${Date.now()}`,
          payload: { worktreePath }
        };
        
        socket.emit('worktree:switch', request, (response: any) => {
          if (response.success) {
            resolve(response.data);
          } else {
            reject(new Error(response.error || 'Request failed'));
          }
        });
      });
    } else {
      return window.electronAPI.worktree.switch(worktreePath);
    }
  }

  /**
   * Remove a worktree
   */
  async function remove(worktreePath: string, force: boolean = false): Promise<any> {
    if (isRemoteMode) {
      if (!remoteConnection.isConnected()) {
        throw new Error('Remote connection not available');
      }
      
      const socket = remoteConnection.getSocket();
      if (!socket) {
        throw new Error('Socket not available');
      }
      
      return new Promise((resolve, reject) => {
        const request = {
          id: `req-${Date.now()}`,
          payload: { worktreePath, force }
        };
        
        socket.emit('worktree:remove', request, (response: any) => {
          if (response.success) {
            resolve(response.data);
          } else {
            reject(new Error(response.error || 'Request failed'));
          }
        });
      });
    } else {
      return window.electronAPI.worktree.remove(worktreePath, force);
    }
  }

  /**
   * Lock or unlock a worktree
   */
  async function lock(worktreePath: string, lock: boolean): Promise<any> {
    if (isRemoteMode) {
      if (!remoteConnection.isConnected()) {
        throw new Error('Remote connection not available');
      }
      
      const socket = remoteConnection.getSocket();
      if (!socket) {
        throw new Error('Socket not available');
      }
      
      return new Promise((resolve, reject) => {
        const request = {
          id: `req-${Date.now()}`,
          payload: { worktreePath, lock }
        };
        
        socket.emit('worktree:lock', request, (response: any) => {
          if (response.success) {
            resolve(response.data);
          } else {
            reject(new Error(response.error || 'Request failed'));
          }
        });
      });
    } else {
      return window.electronAPI.worktree.lock(worktreePath, lock);
    }
  }

  /**
   * Compare two worktrees
   */
  async function compare(path1: string, path2: string): Promise<any> {
    if (isRemoteMode) {
      if (!remoteConnection.isConnected()) {
        throw new Error('Remote connection not available');
      }
      
      const socket = remoteConnection.getSocket();
      if (!socket) {
        throw new Error('Socket not available');
      }
      
      return new Promise((resolve, reject) => {
        const request = {
          id: `req-${Date.now()}`,
          payload: { path1, path2 }
        };
        
        socket.emit('worktree:compare', request, (response: any) => {
          if (response.success) {
            resolve(response.data);
          } else {
            reject(new Error(response.error || 'Request failed'));
          }
        });
      });
    } else {
      return window.electronAPI.worktree.compare(path1, path2);
    }
  }

  /**
   * Create a worktree session
   */
  async function createSession(sessionData: any): Promise<any> {
    if (isRemoteMode) {
      if (!remoteConnection.isConnected()) {
        throw new Error('Remote connection not available');
      }
      
      const socket = remoteConnection.getSocket();
      if (!socket) {
        throw new Error('Socket not available');
      }
      
      return new Promise((resolve, reject) => {
        const request = {
          id: `req-${Date.now()}`,
          payload: { sessionData }
        };
        
        socket.emit('worktree:createSession', request, (response: any) => {
          if (response.success) {
            resolve(response.data);
          } else {
            reject(new Error(response.error || 'Request failed'));
          }
        });
      });
    } else {
      return window.electronAPI.worktree.createSession(sessionData);
    }
  }

  /**
   * Delete a worktree session
   */
  async function deleteSession(sessionId: string): Promise<any> {
    if (isRemoteMode) {
      if (!remoteConnection.isConnected()) {
        throw new Error('Remote connection not available');
      }
      
      const socket = remoteConnection.getSocket();
      if (!socket) {
        throw new Error('Socket not available');
      }
      
      return new Promise((resolve, reject) => {
        const request = {
          id: `req-${Date.now()}`,
          payload: { sessionId }
        };
        
        socket.emit('worktree:deleteSession', request, (response: any) => {
          if (response.success) {
            resolve(response.data);
          } else {
            reject(new Error(response.error || 'Request failed'));
          }
        });
      });
    } else {
      return window.electronAPI.worktree.deleteSession(sessionId);
    }
  }

  return {
    list,
    sessions,
    switch: switchWorktree,
    remove,
    lock,
    compare,
    createSession,
    deleteSession
  };
}