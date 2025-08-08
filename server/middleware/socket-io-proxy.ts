// Middleware to proxy Socket.IO requests to port 3789
// This runs before Nuxt's route handling

export default defineEventHandler(async (event) => {
  // Only handle socket.io requests
  if (!event.node.req.url?.startsWith('/socket.io/')) {
    return;
  }

  // Only proxy in hybrid mode
  if (process.env.CLODE_MODE !== 'hybrid') {
    return;
  }

  const url = event.node.req.url;
  const targetUrl = `http://localhost:3789${url}`;

  console.log('[Socket.IO Proxy] Proxying:', event.node.req.method, url);

  try {
    // Read body for POST requests
    let body: any = undefined;
    if (event.node.req.method === 'POST') {
      const chunks: Buffer[] = [];
      for await (const chunk of event.node.req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      body = Buffer.concat(chunks);
    }

    // Forward headers
    const headers: HeadersInit = {};
    for (const [key, value] of Object.entries(event.node.req.headers)) {
      if (key.toLowerCase() !== 'host' && key.toLowerCase() !== 'content-length') {
        headers[key] = Array.isArray(value) ? value[0] : value as string;
      }
    }

    // Add content-length for POST requests with body
    if (body) {
      headers['content-length'] = body.length.toString();
    }

    // Make request to Socket.IO server
    const response = await fetch(targetUrl, {
      method: event.node.req.method || 'GET',
      headers,
      body
    });

    // Set response status
    event.node.res.statusCode = response.status;

    // Copy response headers
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() !== 'content-encoding' && 
          key.toLowerCase() !== 'transfer-encoding' &&
          key.toLowerCase() !== 'content-length') {
        event.node.res.setHeader(key, value);
      }
    });

    // Send response body
    const responseData = await response.arrayBuffer();
    const buffer = Buffer.from(responseData);
    event.node.res.setHeader('content-length', buffer.length.toString());
    event.node.res.end(buffer);

    // Mark as handled so Nuxt doesn't process it further
    event._handled = true;

  } catch (error: any) {
    console.error('[Socket.IO Proxy] Error:', error);
    event.node.res.statusCode = 502;
    event.node.res.end('Proxy error');
    event._handled = true;
  }
});