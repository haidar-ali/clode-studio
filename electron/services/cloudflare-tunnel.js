import { spawn } from 'child_process';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { bin: cloudflareBin } = require('cloudflared');
export class CloudflareTunnel {
    process = null;
    url = null;
    status = 'stopped';
    error = null;
    onStatusChange;
    constructor() { }
    updateStatus(status, error) {
        this.status = status;
        this.error = error || null;
        if (this.onStatusChange) {
            this.onStatusChange({
                url: this.url || '',
                status,
                error
            });
        }
    }
    onStatusUpdated(callback) {
        this.onStatusChange = callback;
    }
    async start() {
        if (this.process) {
            return this.getInfo();
        }
        try {
            console.log('🚀 Starting Cloudflare tunnel...');
            this.updateStatus('starting');
            // Use the cloudflared binary from npm package
            this.process = spawn(cloudflareBin, [
                'tunnel',
                '--url', 'http://localhost:3000'
            ], {
                stdio: ['pipe', 'pipe', 'pipe']
            });
            // Parse URL from output
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    this.stop();
                    const error = 'Tunnel startup timeout (30s)';
                    this.updateStatus('error', error);
                    reject(new Error(error));
                }, 30000);
                const checkForUrl = (data) => {
                    const output = data.toString();
                    // Look for tunnel URL in output
                    const urlMatch = output.match(/https:\/\/[\w-]+\.trycloudflare\.com/);
                    if (urlMatch && !this.url) {
                        clearTimeout(timeout);
                        this.url = urlMatch[0];
                        this.updateStatus('ready');
                        console.log('✅ Tunnel ready:', this.url);
                        resolve(this.getInfo());
                    }
                };
                this.process.stdout?.on('data', (data) => {
                    const output = data.toString();
                    console.log('[Cloudflare] ', output);
                    checkForUrl(data);
                });
                this.process.stderr?.on('data', (data) => {
                    console.error('[Cloudflare Error]', data.toString());
                    checkForUrl(data); // Also check stderr since cloudflared outputs URL there
                });
                this.process.on('error', (error) => {
                    clearTimeout(timeout);
                    console.error('❌ Tunnel process error:', error);
                    this.updateStatus('error', error.message);
                    reject(error);
                });
                this.process.on('exit', (code, signal) => {
                    clearTimeout(timeout);
                    console.log(`🔌 Tunnel process exited: code=${code}, signal=${signal}`);
                    this.cleanup();
                    if (code !== 0 && this.status !== 'stopped') {
                        const error = `Process exited with code ${code}`;
                        this.updateStatus('error', error);
                        reject(new Error(error));
                    }
                });
            });
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error('❌ Failed to start tunnel:', error);
            this.updateStatus('error', errorMessage);
            throw error;
        }
    }
    stop() {
        if (this.process) {
            console.log('🔌 Stopping Cloudflare tunnel...');
            this.process.kill('SIGTERM');
            // Force kill after 5 seconds
            setTimeout(() => {
                if (this.process && !this.process.killed) {
                    this.process.kill('SIGKILL');
                }
            }, 5000);
        }
        this.cleanup();
    }
    cleanup() {
        this.process = null;
        this.url = null;
        this.updateStatus('stopped');
    }
    getInfo() {
        return {
            url: this.url || '',
            status: this.status,
            error: this.error || undefined
        };
    }
    isRunning() {
        return this.status === 'ready' || this.status === 'starting';
    }
    getUrl() {
        return this.url;
    }
}
