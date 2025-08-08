// HTTP-over-WebSocket proxy implementation
import { EventEmitter } from 'events';

export class HttpProxy extends EventEmitter {
  constructor() {
    super();
    this.pendingRequests = new Map();
  }

  // Handle incoming HTTP request and forward through WebSocket
  async handleHttpRequest(req, res, desktopSocket, sessionId) {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Get the full URL path
    const fullUrl = req.originalUrl || req.baseUrl + req.url || req.url;
    
    // Log request for debugging (but throttle for assets)
    const isAsset = fullUrl && (fullUrl.includes('/_nuxt/') || fullUrl.includes('/node_modules/'));
    if (!isAsset) {
      console.log(`[HttpProxy] Forwarding ${req.method} ${fullUrl} to desktop`);
    }
    
    // Prepare request data
    const requestData = {
      id: requestId,
      method: req.method,
      url: fullUrl,
      headers: req.headers,
      // Body will be sent separately if exists
    };

    // Store response object and metadata for later
    this.pendingRequests.set(requestId, { 
      res, 
      timestamp: Date.now(),
      originalUrl: fullUrl,
      sessionId,
      isAsset
    });

    // Clean up old pending requests less frequently to reduce overhead
    if (Math.random() < 0.1) { // Clean up 10% of the time
      this.cleanupPendingRequests();
    }

    // Handle request body if present
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      // Check if body was already parsed by Express middleware
      if (req.body) {
        // Body was already parsed by express.json() middleware
        requestData.body = Buffer.from(JSON.stringify(req.body)).toString('base64');
        this.sendRequest(desktopSocket, requestData);
      } else {
        // Body not parsed yet, read it manually
        const chunks = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', () => {
          requestData.body = Buffer.concat(chunks).toString('base64');
          this.sendRequest(desktopSocket, requestData);
        });
      }
    } else {
      this.sendRequest(desktopSocket, requestData);
    }

    // Set longer timeout for assets, shorter for main requests
    const timeout = isAsset ? 60000 : 30000; // 60s for assets, 30s for pages
    setTimeout(() => {
      if (this.pendingRequests.has(requestId)) {
        const pending = this.pendingRequests.get(requestId);
        if (pending && !pending.res.headersSent) {
          pending.res.status(504).send('Gateway Timeout - Desktop not responding');
        }
        this.pendingRequests.delete(requestId);
      }
    }, timeout);
  }

  sendRequest(desktopSocket, requestData) {
    desktopSocket.emit('http:request', requestData);
  }

  // Handle response from desktop
  handleHttpResponse(responseData, sessionId) {
    const { id, status, headers, body } = responseData;
    const pending = this.pendingRequests.get(id);
    
    if (!pending) {
      console.warn(`No pending request found for ${id}`);
      return;
    }

    const { res } = pending;
    
    // Don't send response if already sent
    if (res.headersSent) {
      this.pendingRequests.delete(id);
      return;
    }

    // Set status
    res.status(status || 200);

    // Set headers
    if (headers) {
      Object.entries(headers).forEach(([key, value]) => {
        // Skip some headers that Express handles
        if (key.toLowerCase() !== 'content-encoding' && 
            key.toLowerCase() !== 'transfer-encoding') {
          res.set(key, value);
        }
      });
    }

    // Send body
    if (body) {
      // Body is base64 encoded - just decode and send
      // No path rewriting needed with subdomain routing!
      const buffer = Buffer.from(body, 'base64');
      res.send(buffer);
    } else {
      res.end();
    }

    // Clean up
    this.pendingRequests.delete(id);
  }

  cleanupPendingRequests() {
    const now = Date.now();
    const timeout = 30000; // 30 seconds
    
    for (const [id, pending] of this.pendingRequests.entries()) {
      if (now - pending.timestamp > timeout) {
        if (!pending.res.headersSent) {
          pending.res.status(504).send('Gateway Timeout');
        }
        this.pendingRequests.delete(id);
      }
    }
  }

  // Set up desktop socket handlers
  setupDesktopHandlers(desktopSocket, sessionId) {
    desktopSocket.on('http:response', (responseData) => {
      // Get sessionId from pending request
      const pending = this.pendingRequests.get(responseData.id);
      const sid = pending ? pending.sessionId : sessionId;
      this.handleHttpResponse(responseData, sid);
    });

    desktopSocket.on('disconnect', () => {
      // Clean up all pending requests for this desktop
      for (const [id, pending] of this.pendingRequests.entries()) {
        if (!pending.res.headersSent) {
          pending.res.status(503).send('Desktop disconnected');
        }
        this.pendingRequests.delete(id);
      }
    });
  }
}

export default HttpProxy;