# Clode Studio Environment Variables

## Quick Reference

```bash
# Start with relay server (hybrid mode)
CLODE_MODE=hybrid npm run electron:dev

# Use custom relay server
RELAY_URL=wss://my-relay.example.com CLODE_MODE=hybrid npm run electron:dev

# Debug Claude operations
CLAUDE_DEBUG=true npm run electron:dev

# Custom server configuration
CLODE_SERVER_PORT=8080 CLODE_AUTH_REQUIRED=true npm run electron:dev
```

## All Environment Variables

### Mode Configuration

| Variable | Default | Description | Example |
|----------|---------|-------------|---------|
| `CLODE_MODE` | `desktop` | Application mode: `desktop`, `hybrid`, or `remote` | `CLODE_MODE=hybrid` |
| `APP_MODE` | - | Legacy alias for CLODE_MODE | `APP_MODE=hybrid` |

### Relay/Tunnel Configuration

| Variable | Default | Description | Example |
|----------|---------|-------------|---------|
| `RELAY_TYPE` | `CLODE` | Tunnel type: `CLODE`, `CLOUDFLARE`, `CUSTOM`, `NONE` | `RELAY_TYPE=CLOUDFLARE` |
| `RELAY_URL` | `wss://relay.clode.studio` | Custom relay server URL (used with CLODE type) | `RELAY_URL=wss://my.relay.com` |
| `USE_RELAY` | - | Legacy, replaced by RELAY_TYPE | `USE_RELAY=true` (same as `RELAY_TYPE=CLODE`) |

### Server Configuration

| Variable | Default | Description | Example |
|----------|---------|-------------|---------|
| `CLODE_SERVER_PORT` | `3789` | Remote server port | `CLODE_SERVER_PORT=8080` |
| `CLODE_SERVER_HOST` | `0.0.0.0` | Server bind address | `CLODE_SERVER_HOST=127.0.0.1` |
| `CLODE_PORT` | `3789` | Alternative port variable | `CLODE_PORT=8080` |
| `CLODE_MAX_CONNECTIONS` | `10` | Max remote connections | `CLODE_MAX_CONNECTIONS=50` |
| `CLODE_AUTH_REQUIRED` | `false` | Require authentication | `CLODE_AUTH_REQUIRED=true` |

### Debug & Development

| Variable | Default | Description | Example |
|----------|---------|-------------|---------|
| `CLAUDE_DEBUG` | `false` | Enable Claude CLI debug mode | `CLAUDE_DEBUG=true` |
| `NODE_ENV` | `development` | Node environment | `NODE_ENV=production` |

## Relay/Tunnel Types

### RELAY_TYPE Options

1. **`CLODE` (Default)**
   - Uses Clode's managed relay server
   - Automatic subdomain generation
   - No configuration needed
   - Works with custom RELAY_URL if provided

2. **`CLOUDFLARE`**
   - Uses Cloudflare Tunnel (cloudflared)
   - Requires cloudflared installed
   - Generates .trycloudflare.com URLs
   - No account needed for quick tunnels

3. **`CUSTOM`**
   - User provides their own tunnel
   - Displays helpful commands for tunnelmole, localtunnel, ngrok, serveo, bore
   - Tunnel should expose port 3000 (UI), not 3789 (remote server)
   - Full control over tunnel configuration

4. **`NONE`**
   - Local network access only
   - No external tunnel or relay
   - Lowest resource usage
   - Good for LAN-only setups

## Usage Examples

### 1. Basic Desktop Mode (Default)
```bash
npm run electron:dev
```

### 2. Hybrid Mode with Clode Relay (Default)
```bash
CLODE_MODE=hybrid npm run electron:dev
```

### 3. Hybrid Mode with Custom Clode Relay Server
```bash
RELAY_TYPE=CLODE RELAY_URL=wss://my-relay.example.com CLODE_MODE=hybrid npm run electron:dev
```

### 4. Hybrid Mode with Cloudflare Tunnel
```bash
RELAY_TYPE=CLOUDFLARE CLODE_MODE=hybrid npm run electron:dev
```

### 5. Hybrid Mode with Custom Tunnel (tunnelmole/localtunnel/ngrok)
```bash
# Start Clode with custom tunnel mode
RELAY_TYPE=CUSTOM CLODE_MODE=hybrid npm run electron:dev

# In another terminal, start your tunnel on port 3000:
# BORE
bore local 3000 --to bore.pub
# TUNNELMOLE
npx tunnelmole@latest 3000
# LOCALTUNNEL
npx localtunnel --port 3000
# NGROK
ngrok http 3000
# SERVEO.NET
ssh -R 80:localhost:3000 serveo.net
# LOCALHOST.run
ssh -R 80:localhost:3000 localhost.run
```

### 6. Local Network Only (No Tunnel)
```bash
RELAY_TYPE=NONE CLODE_MODE=hybrid npm run electron:dev
```

### 7. Development with Debug Output
```bash
CLAUDE_DEBUG=true RELAY_TYPE=CLODE CLODE_MODE=hybrid npm run electron:dev
```

### 8. Custom Server Configuration
```bash
CLODE_SERVER_PORT=8080 \
CLODE_SERVER_HOST=127.0.0.1 \
CLODE_AUTH_REQUIRED=true \
CLODE_MAX_CONNECTIONS=20 \
RELAY_TYPE=CLODE \
CLODE_MODE=hybrid \
npm run electron:dev
```

### 9. Production Build
```bash
NODE_ENV=production npm run electron:build
```

## Mode Descriptions

### Desktop Mode (`CLODE_MODE=desktop`)
- Default mode
- No remote access
- Minimal resource usage
- Best for local development

### Hybrid Mode (`CLODE_MODE=hybrid`)
- Desktop + remote access
- Starts remote server on port 3789
- Connects to relay server for tunneling
- Generates QR codes for mobile access
- Best for teams and remote work

### Remote Mode (`CLODE_MODE=remote`)
- Remote-only mode (experimental)
- No desktop UI
- Server-only operation
- Best for headless servers

## Security Considerations

1. **Authentication**: Set `CLODE_AUTH_REQUIRED=true` in production
2. **Bind Address**: Use `CLODE_SERVER_HOST=127.0.0.1` to restrict to localhost
3. **Max Connections**: Limit with `CLODE_MAX_CONNECTIONS` to prevent abuse
4. **Custom Relay**: Use `RELAY_URL` for private relay servers

## Troubleshooting

### Relay Connection Issues
```bash
# Check relay URL is accessible
curl https://relay.clode.studio/health

# Use custom relay if default is blocked
RELAY_URL=wss://backup.relay.com CLODE_MODE=hybrid npm run electron:dev
```

### Port Conflicts
```bash
# Change default port if 3789 is in use
CLODE_SERVER_PORT=8080 npm run electron:dev
```

### Debug Claude Issues
```bash
# Enable debug output
CLAUDE_DEBUG=true npm run electron:dev
```

## Advanced Configuration

### Docker Deployment
```dockerfile
ENV CLODE_MODE=hybrid \
    CLODE_SERVER_PORT=3789 \
    CLODE_AUTH_REQUIRED=true \
    RELAY_URL=wss://relay.clode.studio
```

### Systemd Service
```ini
[Service]
Environment="CLODE_MODE=hybrid"
Environment="CLODE_SERVER_PORT=3789"
Environment="CLODE_AUTH_REQUIRED=true"
Environment="RELAY_URL=wss://relay.clode.studio"
```

### PM2 Configuration
```json
{
  "apps": [{
    "name": "clode-studio",
    "script": "npm",
    "args": "run electron:dev",
    "env": {
      "CLODE_MODE": "hybrid",
      "CLODE_SERVER_PORT": "3789",
      "CLODE_AUTH_REQUIRED": "true",
      "RELAY_URL": "wss://relay.clode.studio"
    }
  }]
}
```

## Related Files

- `electron/services/mode-config.ts` - Mode configuration logic
- `electron/services/relay-client.ts` - Relay connection handling
- `.env.example` - Example environment file
- `install.sh` - Installation script with defaults
- `scripts/expose.sh` - Remote exposure helper

## Notes

- Environment variables override default settings
- Some variables may be deprecated (e.g., `USE_RELAY`)
- Variables are case-sensitive
- Boolean values use string `"true"` or `"false"`