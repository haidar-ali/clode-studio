// HTTP request handler for relay client
// Handles HTTP-over-WebSocket requests from relay server
import http from 'http';
export class HttpHandler {
    localPort;
    localHost;
    constructor(localPort = 3000, localHost = 'localhost') {
        this.localPort = localPort;
        this.localHost = localHost;
    }
    // Set up handlers on the relay socket
    setupHandlers(relaySocket) {
        relaySocket.on('http:request', async (requestData) => {
            try {
                const response = await this.handleHttpRequest(requestData);
                relaySocket.emit('http:response', response);
            }
            catch (error) {
                console.error('[HttpHandler] Request failed:', error);
                relaySocket.emit('http:response', {
                    id: requestData.id,
                    status: 502,
                    headers: { 'content-type': 'text/plain' },
                    body: Buffer.from('Bad Gateway').toString('base64')
                });
            }
        });
    }
    async handleHttpRequest(requestData) {
        return new Promise((resolve, reject) => {
            const { id, method, url, headers, body } = requestData;
            // Only log non-asset requests to reduce noise
            const isAsset = url.includes('/_nuxt/') || url.includes('/node_modules/');
            if (!isAsset) {
            }
            // Prepare request options
            const options = {
                hostname: this.localHost,
                port: this.localPort,
                path: url,
                method: method,
                headers: { ...headers },
                // Increase agent settings for better concurrency
                agent: new http.Agent({
                    keepAlive: true,
                    keepAliveMsecs: 1000,
                    maxSockets: 50, // Allow more concurrent connections
                    maxFreeSockets: 10
                })
            };
            // Remove problematic headers
            delete options.headers['host'];
            delete options.headers['connection'];
            // Create request
            const req = http.request(options, (res) => {
                const chunks = [];
                res.on('data', (chunk) => {
                    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
                });
                res.on('end', () => {
                    const responseBuffer = Buffer.concat(chunks);
                    resolve({
                        id,
                        status: res.statusCode,
                        headers: res.headers,
                        body: responseBuffer.toString('base64')
                    });
                });
            });
            req.on('error', (error) => {
                console.error(`[HttpHandler] Error proxying request:`, error);
                reject(error);
            });
            // Add body if present
            if (body) {
                req.write(Buffer.from(body, 'base64'));
            }
            req.end();
        });
    }
}
export default HttpHandler;
