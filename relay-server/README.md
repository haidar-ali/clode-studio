# Clode Relay Server

A high-performance relay server for Clode Studio that enables instant remote access with automatic URL generation.

## Features

- 🚀 **Instant URL Generation** - Desktop clients get a unique URL immediately
- 🔄 **Smart Routing** - Automatic P2P upgrade when possible
- 🔒 **Secure** - JWT authentication and device verification
- 📊 **Scalable** - Redis-backed for multi-server deployment
- 🌍 **Global** - Deploy anywhere, works everywhere
- 🏠 **Self-Hostable** - Run on your own infrastructure

## Quick Start

### Option 1: Use Our Hosted Relay (Easiest)

Simply set the relay URL in your Clode Studio:

```bash
export RELAY_URL=wss://relay.clode.studio
CLODE_MODE=hybrid npm run electron:dev
```

### Option 2: Self-Host with Docker

```bash
# Clone and enter directory
git clone <repo>
cd relay-server

# Run deployment script
chmod +x deploy.sh
./deploy.sh

# Choose option 1 for local Docker deployment
```

### Option 3: Deploy to Cloud

```bash
# Deploy to Fly.io (free tier)
flyctl launch --name my-clode-relay
flyctl deploy

# Deploy to Railway
railway up

# Deploy to Heroku
heroku create my-clode-relay
git push heroku main
```

## Configuration

### DNS Requirements (IMPORTANT!)

**The relay server requires wildcard DNS to work properly:**

You need `*.yourdomain.com` or `*.relay.yourdomain.com` pointing to your relay server.

Example DNS configurations:
- `*.relay.clode.studio` → Your relay server IP
- `*.app.yourdomain.com` → Your relay server hostname

Without wildcard DNS, the subdomain-based routing won't work!

See [SUBDOMAIN_SETUP.md](SUBDOMAIN_SETUP.md) for detailed DNS configuration instructions.

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 3790 |
| `REDIS_URL` | Redis connection URL | redis://localhost:6379 |
| `JWT_SECRET` | Secret for JWT signing | (required) |
| `DOMAIN` | Your domain name (without wildcard) | localhost:3000 |

### Example `.env` File

```env
PORT=3790
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secret-key-here
DOMAIN=relay.yourdomain.com  # Will use *.relay.yourdomain.com for sessions
```

## Architecture

```
Desktop App ←→ Relay Server ←→ Mobile/Web Client
                     ↓
                  Redis
              (Session Store)
```

### How It Works

1. **Desktop Registration**
   - Desktop connects to relay server (`wss://relay.yourdomain.com`)
   - Relay generates unique 6-character session ID (e.g., `ABC123`)
   - Returns subdomain URL like `https://abc123.relay.yourdomain.com`

2. **Client Connection**
   - Client accesses the subdomain URL
   - DNS wildcard resolves `*.relay.yourdomain.com` to relay server
   - Relay extracts session ID from subdomain
   - Validates session and establishes WebSocket bridge
   - All HTTP requests and WebSocket events forwarded bidirectionally

3. **Why Subdomains?**
   - Clean URLs without path prefixes
   - No URL rewriting needed
   - Vite/Nuxt hot reload works perfectly
   - Assets load without modification
   - Each session is isolated by subdomain

## API Endpoints

### REST API

- `GET /health` - Health check
- `GET /api/session/:sessionId` - Get session info

### WebSocket Events

**Desktop → Relay:**
- `auth: { role: 'desktop', deviceId }` - Register desktop

**Client → Relay:**
- `auth: { sessionId, token }` - Connect to session

**Relay → Desktop:**
- `registered: { sessionId, url, token }` - Registration success

## Performance

- **Latency**: 20-50ms through relay
- **Throughput**: 10-50 Mbps per connection
- **Concurrent Sessions**: 10,000+ per server
- **WebSocket Connections**: 100,000+ with proper tuning

## Security

### Authentication
- JWT tokens for session validation
- Device ID verification
- Optional pairing codes

### Network Security
- TLS/SSL encryption required
- Rate limiting built-in
- DDoS protection via Cloudflare (optional)

### Best Practices
1. Always use HTTPS in production
2. Rotate JWT secrets regularly
3. Monitor for unusual activity
4. Use Redis AUTH in production

## Deployment

### Docker Compose (Recommended)

```bash
docker-compose up -d
```

### Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: clode-relay
spec:
  replicas: 3
  selector:
    matchLabels:
      app: clode-relay
  template:
    metadata:
      labels:
        app: clode-relay
    spec:
      containers:
      - name: relay
        image: clode/relay:latest
        ports:
        - containerPort: 3790
        env:
        - name: REDIS_URL
          value: redis://redis-service:6379
```

### Systemd Service

```ini
[Unit]
Description=Clode Relay Server
After=network.target

[Service]
Type=simple
User=clode
WorkingDirectory=/opt/clode-relay
ExecStart=/usr/bin/node index.js
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

## Scaling

### Horizontal Scaling

Use Redis pub/sub for multi-server deployment:

```javascript
// Automatically handled when REDIS_URL is set
const redis = new Redis(process.env.REDIS_URL);
```

### Load Balancing

Nginx configuration for multiple relay servers:

```nginx
upstream relay_cluster {
    least_conn;
    server relay1:3790;
    server relay2:3790;
    server relay3:3790;
}
```

## Monitoring

### Health Checks

```bash
curl https://relay.domain.com/health
```

Response:
```json
{
  "status": "healthy",
  "desktops": 42,
  "clients": 38,
  "uptime": 3600
}
```

### Metrics (Prometheus)

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'clode-relay'
    static_configs:
      - targets: ['relay:3790']
```

## Troubleshooting

### Common Issues

**Desktop can't connect:**
- Check firewall rules for port 3790
- Verify RELAY_URL is correct
- Check JWT_SECRET matches

**Client gets "Session not found":**
- Session may have expired (1 hour TTL)
- Desktop may be offline
- Redis might be down

**High latency:**
- Consider deploying relay closer to users
- Enable WebSocket compression
- Check network congestion

### Debug Mode

```bash
DEBUG=* node index.js
```

## Development

### Local Development

```bash
npm install
npm run dev
```

### Testing

```bash
npm test
npm run test:e2e
```

### Building

```bash
docker build -t clode-relay .
```

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

MIT

## Support

- GitHub Issues: [Report bugs](https://github.com/clode/relay/issues)
- Discord: [Join community](https://discord.gg/clode)
- Email: support@clode.studio