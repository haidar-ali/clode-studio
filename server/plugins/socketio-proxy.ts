import { createProxyMiddleware } from 'http-proxy-middleware';

export default defineNitroPlugin((nitroApp) => {
  // Only set up proxy in production/preview mode
  if (process.env.NODE_ENV === 'development') {
    return;
  }

  const proxy = createProxyMiddleware({
    target: 'http://localhost:3789',
    changeOrigin: true,
    ws: true,
    logLevel: 'warn', // Reduce log level to warn
    // Handle WebSocket upgrade
    onProxyReqWs: (proxyReq, req, socket, options, head) => {
      console.log(`[Socket.IO Proxy] WebSocket upgrade for ${req.url}`);
      // Ensure proper headers for WebSocket
      proxyReq.setHeader('Origin', 'http://localhost:3789');
    },
    onProxyReq: (proxyReq, req, res) => {
      // Only log non-polling requests to reduce noise
      if (!req.url?.includes('transport=polling')) {
        console.log(`[Socket.IO Proxy] ${req.method} ${req.url}`);
      }
    },
    onError: (err, req, res) => {
      console.error('[Socket.IO Proxy] Error:', err.message);
      if (res.writeHead && !res.headersSent) {
        res.writeHead(500, {
          'Content-Type': 'text/plain',
        });
      }
      res.end('Socket.IO proxy error');
    }
  });

  // Add the proxy as middleware
  nitroApp.hooks.hook('request', async (event) => {
    if (event.node.req.url?.startsWith('/socket.io')) {
      return new Promise((resolve, reject) => {
        proxy(event.node.req, event.node.res, (err) => {
          if (err) {
            console.error('[Socket.IO Proxy] Middleware error:', err);
            reject(err);
          } else {
            resolve(undefined);
          }
        });
      });
    }
  });
});