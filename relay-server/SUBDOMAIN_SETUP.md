# Subdomain-Based Relay Setup Guide

## Overview
The relay server now uses subdomain-based routing instead of path-based routing. This provides cleaner URLs and eliminates all path rewriting issues with Vite/Nuxt development server.

### Old Format (path-based):
```
https://relay.clode.studio/remote/EYSDKB
```

### New Format (subdomain-based):
```
https://eysdkb.relay.clode.studio
```

## DNS Configuration Required

### 1. Add Wildcard DNS Record
You need to configure a wildcard subdomain that points all subdomains to your relay server.

#### For Cloudflare (Recommended):
1. Log into Cloudflare dashboard
2. Go to DNS settings for `clode.studio`
3. Add a new record:
   - Type: `CNAME`
   - Name: `*.relay`
   - Target: `relay-server-cool-pine-6226.fly.dev`
   - Proxy status: **Proxied** (orange cloud ON)
   - TTL: Auto

#### For Other DNS Providers:
Add a wildcard A or CNAME record:
```
*.relay.clode.studio → Your relay server IP or hostname
```

### 2. SSL Certificate Configuration

#### Required DNS Records for Fly.io (Current Setup)

Add these DNS records to your domain provider:

**Option 1: A and AAAA records (Recommended)**
```
A    *.relay.clode.studio → 66.241.125.87
AAAA *.relay.clode.studio → 2a09:8280:1::8d:bdd8:0
```

**Option 2: CNAME record**
```
CNAME *.relay.clode.studio → e05xx01.relay-server-cool-pine-6226.fly.dev
```

**Required for wildcard certificate validation:**
```
CNAME _acme-challenge.relay.clode.studio → relay.clode.studio.e05xx01.flydns.net
```

This ACME challenge record is needed for Let's Encrypt to validate ownership and issue the wildcard certificate.

#### Alternative: Cloudflare Proxy
If using Cloudflare with proxy enabled (orange cloud), SSL is handled automatically and you only need:
```
CNAME *.relay → relay-server-cool-pine-6226.fly.dev (Proxied)
```

## How It Works

1. **Desktop Registration**: 
   - Desktop connects to `wss://relay.clode.studio`
   - Receives session ID (e.g., `EYSDKB`)
   - Gets URL: `https://eysdkb.relay.clode.studio`

2. **Remote Access**:
   - User visits `https://eysdkb.relay.clode.studio`
   - DNS resolves to relay server
   - Relay extracts `EYSDKB` from subdomain
   - Proxies all requests to desktop unchanged

3. **Benefits**:
   - No path rewriting needed
   - Vite/Nuxt works without modification
   - WebSocket connections work normally
   - Hot Module Replacement works
   - All assets load correctly

## Testing

### 1. Check DNS Resolution
```bash
# Test wildcard DNS
dig test123.relay.clode.studio
nslookup abc456.relay.clode.studio
```

### 2. Test with curl
```bash
# Should return "Session not found" (DNS working)
curl https://test123.relay.clode.studio

# With real session ID (replace XXXXXX)
curl https://xxxxxx.relay.clode.studio
```

### 3. Browser Test
1. Register desktop and get session ID
2. Visit the subdomain URL
3. All assets should load without 404 errors

## Troubleshooting

### DNS Not Resolving
- Wait 5-10 minutes for DNS propagation
- Clear DNS cache: `sudo dscacheutil -flushcache` (macOS)
- Try different DNS server: `nslookup domain 8.8.8.8`

### SSL Certificate Errors
- Ensure wildcard certificate covers `*.relay.clode.studio`
- Check certificate validity: `openssl s_client -connect test.relay.clode.studio:443`

### Session Not Found
- Verify desktop is connected to relay
- Check session ID is correct (case-insensitive)
- Ensure relay server is running

## Migration from Path-Based URLs

If you have existing path-based URLs saved:
- Old: `https://relay.clode.studio/remote/EYSDKB`
- New: `https://eysdkb.relay.clode.studio`

The session ID is now the subdomain (lowercase).

## Security Considerations

1. **Session IDs**: 6-character random alphanumeric, case-insensitive
2. **Authentication**: Still requires device token and pairing code
3. **HTTPS**: Always use SSL/TLS for production
4. **Firewall**: Only expose ports 80/443 publicly

## Next Steps

1. Configure DNS wildcard record
2. Set up SSL certificate
3. Test subdomain resolution
4. Update any saved URLs to new format