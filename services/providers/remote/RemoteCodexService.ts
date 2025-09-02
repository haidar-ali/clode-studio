import type { Socket } from 'socket.io-client';

export class RemoteCodexService {
  constructor(private getSocket: () => Socket | null) {}

  private async request<T, R>(event: string, payload: T): Promise<R> {
    const socket = this.getSocket();
    if (!socket) throw new Error('Socket not initialized');
    if (!socket.connected) throw new Error('Not connected to remote server');
    return new Promise((resolve, reject) => {
      const req = { id: `req-${Date.now()}-${Math.random()}`, payload } as any;
      const timeout = setTimeout(() => reject(new Error(`Timeout for ${event}`)), 30000);
      socket.emit(event, req, (res: any) => {
        clearTimeout(timeout);
        if (res && res.success) resolve(res.data); else reject(new Error(res?.error?.message || `Failed ${event}`));
      });
    });
  }

  async spawn(instanceId: string, workingDirectory: string, instanceName?: string): Promise<{ pid: number }> {
    const data = await this.request<any, any>('codex:spawn', { instanceId, workingDirectory, instanceName });
    return { pid: data?.pid || -1 };
  }

  async send(instanceId: string, data: string): Promise<void> {
    await this.request('codex:send', { instanceId, data });
  }

  async stop(instanceId: string): Promise<void> {
    await this.request('codex:stop', { instanceId });
  }

  async resize(instanceId: string, cols: number, rows: number): Promise<void> {
    await this.request('codex:resize', { instanceId, cols, rows });
  }

  onOutput(instanceId: string, callback: (data: string) => void): () => void {
    const socket = this.getSocket();
    if (!socket) return () => {};
    const handler = (event: any) => {
      if (event?.instanceId === instanceId) callback(event.data);
    };
    socket.on('codex:output', handler);
    return () => socket.off('codex:output', handler);
  }

  async getDesktopInstances(): Promise<any[]> {
    return await this.request<void, any[]>('codex:getInstances', undefined as any);
  }

  async createInstance(name: string, cwd?: string): Promise<{ id: string }> {
    const data = await this.request<any, any>('codex:createInstance', { name, workingDirectory: cwd });
    return { id: data?.id };
  }

  async getCodexBuffer(instanceId: string): Promise<string | null> {
    try {
      const result = await this.request<{ instanceId: string }, { buffer?: string }>('codex:getBuffer', { instanceId });
      return result?.buffer || null;
    } catch (error) {
      console.error('[RemoteCodexService] Failed to get buffer:', error);
      return null;
    }
  }

  async configureTerminal(instanceId: string, cols: number, rows: number): Promise<void> {
    try {
      await this.request('codex:configureTerminal', { instanceId, cols, rows });
    } catch (error) {
      console.error('[RemoteCodexService] Failed to configure terminal:', error);
    }
  }

  onError(instanceId: string, callback: (error: string) => void): () => void {
    const socket = this.getSocket();
    if (!socket) return () => {};
    const handler = (event: any) => {
      if (event?.instanceId === instanceId && event?.error) {
        callback(event.error);
      }
    };
    socket.on('codex:error', handler);
    return () => socket.off('codex:error', handler);
  }

  onExit(instanceId: string, callback: (code: number | null) => void): () => void {
    const socket = this.getSocket();
    if (!socket) return () => {};
    const handler = (event: any) => {
      if (event?.instanceId === instanceId) {
        callback(event.code ?? null);
      }
    };
    socket.on('codex:exit', handler);
    return () => socket.off('codex:exit', handler);
  }

  async listDesktopInstances(): Promise<any[]> {
    // Alias for getDesktopInstances to match Claude service pattern
    return this.getDesktopInstances();
  }
}
