import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import Redis from 'ioredis';
import { customAlphabet } from 'nanoid';
import jwt from 'jsonwebtoken';
import cors from 'cors';
import fetch from 'node-fetch';
import { HttpProxy } from './http-proxy.js';

const app = express();
const httpServer = createServer(app);

// Configure
const PORT = process.env.PORT || 3790;
const REDIS_URL = process.env.REDIS_URL;
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';
const DOMAIN = process.env.DOMAIN || 'relay.clode.studio';

// Use Redis if available, otherwise use in-memory storage
let redis = null;
let memoryStore = new Map();

if (REDIS_URL && REDIS_URL !== 'none') {
  try {
    redis = new Redis(REDIS_URL);
    redis.on('error', (err) => {
      console.error('Redis connection error:', err);
      console.log('Falling back to in-memory storage');
      redis = null;
    });
    console.log('Using Redis for session storage');
  } catch (err) {
    console.log('Redis not available, using in-memory storage');
  }
} else {
  console.log('Using in-memory storage (no Redis configured)');
}

// Middleware
app.use(cors());
app.use(express.json());

// Extract session ID from subdomain
app.use((req, res, next) => {
  const host = req.get('host');
  if (host) {
    // Extract subdomain (session ID) from host
    // Format: sessionid.relay.clode.studio
    const parts = host.split('.');
    if (parts.length >= 3) {
      // Check if first part looks like a session ID (6 uppercase alphanumeric)
      const potentialSession = parts[0].toUpperCase();
      if (/^[A-Z0-9]{6}$/.test(potentialSession)) {
        req.sessionId = potentialSession;
        // Only log non-asset requests to reduce noise
        const isAsset = req.url && (req.url.includes('/_nuxt/') || req.url.includes('/node_modules/'));
        if (!isAsset && req.url !== '/favicon.ico') {
          console.log(`[Relay] Session ${req.sessionId}: ${req.method} ${req.url}`);
        }
      }
    }
  }
  next();
});

// Generate readable session IDs
const generateId = customAlphabet('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 6);

// Socket.IO setup with optimized settings for Vite dev server
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: true,
    credentials: true
  },
  path: '/socket.io/', // Explicit path for Socket.IO
  transports: ['websocket', 'polling'],
  perMessageDeflate: {
    threshold: 1024,
    zlibDeflateOptions: { level: 6 }
  },
  // Increase limits for Vite's many concurrent requests
  maxHttpBufferSize: 10e6, // 10 MB
  pingTimeout: 60000, // 60 seconds
  pingInterval: 25000, // 25 seconds
  upgradeTimeout: 30000, // 30 seconds
  // Allow more concurrent connections
  httpCompression: {
    threshold: 1024
  }
});

// Connection management
class ConnectionManager {
  constructor() {
    this.desktops = new Map();
    this.clients = new Map();
    this.sessions = new Map();
    this.httpProxy = new HttpProxy();
  }

  async registerDesktop(socket, auth) {
    const sessionId = generateId();
    // Use subdomain-based URL
    const sessionUrl = `https://${sessionId.toLowerCase()}.${DOMAIN}`;
    
    const desktopInfo = {
      sessionId,
      socketId: socket.id,
      deviceId: auth.deviceId,
      url: sessionUrl,
      createdAt: Date.now()
    };
    
    // Store in Redis or memory
    if (redis) {
      await redis.setex(
        `desktop:${sessionId}`,
        3600,
        JSON.stringify(desktopInfo)
      );
    } else {
      memoryStore.set(`desktop:${sessionId}`, {
        data: desktopInfo,
        expires: Date.now() + 3600000 // 1 hour
      });
    }
    
    this.desktops.set(socket.id, desktopInfo);
    this.sessions.set(sessionId, socket.id);
    
    socket.join(`desktop:${sessionId}`);
    
    // Set up HTTP proxy handlers for this desktop
    this.httpProxy.setupDesktopHandlers(socket, sessionId);
    
    // Generate auth token
    const token = jwt.sign(
      { sessionId, exp: Math.floor(Date.now() / 1000) + 3600 },
      JWT_SECRET
    );
    
    socket.emit('registered', {
      sessionId,
      url: sessionUrl,
      token,
      connectUrl: `${sessionUrl}?token=${token}`
    });
    
    console.log(`Desktop registered: ${sessionId} from ${auth.deviceId}`);
    
    return desktopInfo;
  }

  async connectClient(clientSocket, sessionId, auth) {
    let desktopData;
    
    if (redis) {
      desktopData = await redis.get(`desktop:${sessionId}`);
    } else {
      const stored = memoryStore.get(`desktop:${sessionId}`);
      if (stored && stored.expires > Date.now()) {
        desktopData = JSON.stringify(stored.data);
      }
    }
    
    if (!desktopData) {
      throw new Error('Session not found or expired');
    }
    
    const desktop = JSON.parse(desktopData);
    const desktopSocket = io.sockets.sockets.get(desktop.socketId);
    
    if (!desktopSocket || !desktopSocket.connected) {
      throw new Error('Desktop is offline');
    }
    
    // Set up bidirectional relay
    this.setupRelay(clientSocket, desktopSocket, sessionId);
    
    console.log(`Client connected to session: ${sessionId}`);
    
    return { success: true };
  }

  setupRelay(clientSocket, desktopSocket, sessionId) {
    const clientId = clientSocket.id;
    const desktopId = desktopSocket.id;
    
    // Store mappings
    this.clients.set(clientId, desktopId);
    this.clients.set(desktopId, clientId);
    
    // Join session room
    clientSocket.join(`session:${sessionId}`);
    
    // Track pending requests for callback preservation
    const pendingRequests = new Map();
    let requestCounter = 0;
    
    // Forward events from client to desktop
    clientSocket.onAny((event, ...args) => {
      if (!event.startsWith('$') && !event.startsWith('relay:') && !event.startsWith('bridge:')) {
        console.log(`[Relay] Client→Desktop: ${event}`);
        
        // Check if last argument is a callback (Socket.IO acknowledgment)
        const lastArg = args[args.length - 1];
        if (typeof lastArg === 'function') {
          // This is a request with callback - use bridge pattern
          const callback = args.pop();
          const requestId = `${clientId}-${++requestCounter}`;
          
          // Store the callback
          pendingRequests.set(requestId, callback);
          
          // Send as bridge:request to desktop
          desktopSocket.emit('bridge:request', {
            requestId,
            event,
            args
          });
          
          // Clean up after timeout (30 seconds)
          setTimeout(() => {
            if (pendingRequests.has(requestId)) {
              const cb = pendingRequests.get(requestId);
              pendingRequests.delete(requestId);
              cb({ error: 'Request timeout' });
            }
          }, 30000);
        } else {
          // Regular event without callback
          desktopSocket.emit(event, ...args);
        }
      }
    });
    
    // Handle bridge responses from desktop
    // Store the handler so we can remove it later
    const bridgeResponseHandler = (data) => {
      const { requestId, response } = data;
      console.log(`[Relay] Desktop response for request ${requestId}`);
      
      if (pendingRequests.has(requestId)) {
        const callback = pendingRequests.get(requestId);
        pendingRequests.delete(requestId);
        callback(response);
      }
    };
    
    // Remove any existing bridge:response listeners from this desktop socket
    // This prevents accumulation when clients reconnect
    desktopSocket.removeAllListeners('bridge:response');
    
    desktopSocket.on('bridge:response', bridgeResponseHandler);
    
    // Forward regular events from desktop to client
    const forwardToClient = (event, ...args) => {
      if (!event.startsWith('$') && !event.startsWith('relay:') && !event.startsWith('bridge:')) {
        console.log(`[Relay] Desktop→Client: ${event}`);
        clientSocket.emit(event, ...args);
      }
    };
    
    // Listen for desktop events
    desktopSocket.onAny(forwardToClient);
    
    // Cleanup on disconnect
    const cleanup = () => {
      this.clients.delete(clientId);
      this.clients.delete(desktopId);
      clientSocket.leave(`session:${sessionId}`);
      
      // Safely remove listeners if they exist
      if (forwardToClient && desktopSocket) {
        try {
          desktopSocket.offAny(forwardToClient);
        } catch (err) {
          console.warn('[Relay] Error removing forwardToClient listener:', err.message);
        }
      }
      
      if (desktopSocket) {
        try {
          // Remove the specific handler we added
          desktopSocket.off('bridge:response', bridgeResponseHandler);
        } catch (err) {
          console.warn('[Relay] Error removing bridge:response listener:', err.message);
        }
      }
      
      // Clear any pending requests
      for (const [requestId, callback] of pendingRequests) {
        if (typeof callback === 'function') {
          callback({ error: 'Connection closed' });
        }
      }
      pendingRequests.clear();
    };
    
    clientSocket.once('disconnect', cleanup);
  }
}

const manager = new ConnectionManager();

// Add middleware to log all Socket.IO connection attempts
io.use((socket, next) => {
  console.log('[Socket.IO] Connection attempt from:', socket.handshake.address, 'Auth:', socket.handshake.auth);
  next();
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  const auth = socket.handshake.auth;
  const { role, sessionId } = auth;
  
  console.log('[Socket.IO] New connection - Role:', role, 'SessionId:', sessionId, 'Auth:', auth);
  
  if (role === 'desktop') {
    // Desktop registering
    manager.registerDesktop(socket, auth)
      .then(info => {
        // Keep session alive
        const keepAlive = setInterval(async () => {
          if (redis) {
            await redis.expire(`desktop:${info.sessionId}`, 3600);
          } else {
            // Refresh memory store expiry
            const stored = memoryStore.get(`desktop:${info.sessionId}`);
            if (stored) {
              stored.expires = Date.now() + 3600000;
            }
          }
        }, 300000);
        
        socket.once('disconnect', () => {
          clearInterval(keepAlive);
          manager.desktops.delete(socket.id);
          manager.sessions.delete(info.sessionId);
          if (redis) {
            redis.del(`desktop:${info.sessionId}`);
          } else {
            memoryStore.delete(`desktop:${info.sessionId}`);
          }
          console.log(`Desktop disconnected: ${info.sessionId}`);
        });
      })
      .catch(err => {
        console.error('Desktop registration failed:', err);
        socket.emit('error', err.message);
        socket.disconnect();
      });
      
  } else if (role === 'client' && sessionId) {
    // Client connecting to session via relay
    console.log(`Client connecting to session ${sessionId}`);
    manager.connectClient(socket, sessionId, auth)
      .then(() => {
        socket.emit('connected', { success: true });
      })
      .catch(err => {
        console.error('Client connection failed:', err);
        socket.emit('error', err.message);
        socket.disconnect();
      });
  } else if (sessionId) {
    // Legacy: Client connecting without explicit role
    console.log(`Legacy client connecting to session ${sessionId}`);
    manager.connectClient(socket, sessionId, auth)
      .then(() => {
        socket.emit('connected', { success: true });
      })
      .catch(err => {
        console.error('Client connection failed:', err);
        socket.emit('error', err.message);
        socket.disconnect();
      });
  } else {
    socket.emit('error', 'Invalid connection parameters');
    socket.disconnect();
  }
});

// Main HTTP proxy handler - now works for ALL requests when subdomain is detected
app.use('*', async (req, res, next) => {
  // Check if we have a session ID from subdomain
  if (!req.sessionId) {
    // Not a session subdomain, continue to other routes
    return next();
  }
  
  const sessionId = req.sessionId;
  
  // When using app.use('*'), the full path is in req.params[0]
  // But we need to include query parameters from req.url
  if (req.params && req.params[0]) {
    // req.params[0] has the path, req.url may have query params
    const queryIndex = req.url.indexOf('?');
    if (queryIndex !== -1) {
      // Append query string from req.url
      req.originalUrl = req.params[0] + req.url.substring(queryIndex);
    } else {
      req.originalUrl = req.params[0];
    }
  } else if (!req.originalUrl) {
    req.originalUrl = req.url;
  }
  
  // First check Redis/memory store for the desktop info
  let desktopData;
  if (redis) {
    desktopData = await redis.get(`desktop:${sessionId}`);
  } else {
    const stored = memoryStore.get(`desktop:${sessionId}`);
    if (stored && stored.expires > Date.now()) {
      desktopData = JSON.stringify(stored.data);
    }
  }
  
  if (!desktopData) {
    console.log(`[Relay] Session ${sessionId} not found in storage`);
    return res.status(404).send(`Session ${sessionId} not found`);
  }
  
  const desktop = JSON.parse(desktopData);
  const desktopSocketId = desktop.socketId;
  
  // Check if the desktop socket is on THIS instance
  const desktopSocket = io.sockets.sockets.get(desktopSocketId);
  if (!desktopSocket || !desktopSocket.connected) {
    // Desktop might be connected to a different instance
    console.log(`[Relay] Desktop for session ${sessionId} is on a different instance or offline`);
    return res.status(503).send('Desktop is connected to a different relay instance. Try refreshing.');
  }
  
  // No path manipulation needed! Just proxy as-is
  // Already logged in middleware, so skip logging here
  manager.httpProxy.handleHttpRequest(req, res, desktopSocket, sessionId);
});

// REST API endpoints
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    desktops: manager.desktops.size,
    clients: manager.clients.size / 2,
    uptime: process.uptime()
  });
});

app.get('/api/session/:sessionId', async (req, res) => {
  let data;
  
  if (redis) {
    data = await redis.get(`desktop:${req.params.sessionId}`);
  } else {
    const stored = memoryStore.get(`desktop:${req.params.sessionId}`);
    if (stored && stored.expires > Date.now()) {
      data = JSON.stringify(stored.data);
    }
  }
  
  if (data) {
    const desktop = JSON.parse(data);
    res.json({
      active: true,
      created: desktop.createdAt,
      url: desktop.url
    });
  } else {
    res.status(404).json({ error: 'Session not found' });
  }
});

// Clean up expired sessions periodically (for memory store)
if (!redis) {
  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of memoryStore.entries()) {
      if (value.expires && value.expires < now) {
        memoryStore.delete(key);
      }
    }
  }, 60000); // Every minute
}

// Start server
httpServer.listen(PORT, () => {
  console.log(`Clode Relay Server running on port ${PORT}`);
  console.log(`Domain: ${DOMAIN}`);
  console.log(`Storage: ${redis ? 'Redis' : 'In-memory'}`);
});