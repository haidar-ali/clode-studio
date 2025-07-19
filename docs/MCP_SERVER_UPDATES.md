# MCP Server Updates Summary

## Changes Made Based on Official MCP Servers List

### 1. Updated Servers

#### GitHub MCP Server
- **Changed from**: npm package `@modelcontextprotocol/server-github`
- **Changed to**: Docker-based `ghcr.io/github/github-mcp-server:latest`
- **Reason**: GitHub moved their MCP server to their own repository and it's no longer available as an npm package
- **Requirements**: Added "Docker Desktop must be installed and running"

#### Stripe MCP Server
- **Changed from**: `@modelcontextprotocol/server-stripe`
- **Changed to**: `@stripe/mcp`
- **Reason**: Stripe has their official MCP server under their own npm namespace

#### Fetch Server
- **Changed from**: npm package `@modelcontextprotocol/server-fetch`
- **Changed to**: Python package `mcp-server-fetch`
- **Reason**: The fetch server is Python-based, not TypeScript
- **Requirements**: Added "Python 3.8+ required"

### 2. Added New Servers

#### GitLab
- Official MCP server for GitLab integration
- Package: `@modelcontextprotocol/server-gitlab`
- Requires: `GITLAB_TOKEN` and `GITLAB_URL`

#### Google Maps
- Location services and mapping capabilities
- Package: `@modelcontextprotocol/server-google-maps`
- Requires: `GOOGLE_MAPS_API_KEY`

#### Zapier
- Connect to 8,000+ apps via HTTP transport
- Type: HTTP (not stdio)
- URL: `https://api.zapier.com/mcp/v1`
- Requires: Zapier account and API key

#### Supabase
- Database and backend services
- Package: `supabase-mcp` (community maintained)
- Requires: `SUPABASE_URL` and `SUPABASE_ANON_KEY`

### 3. Removed Servers

#### Time & Date Server
- Removed because it has been archived by modelcontextprotocol
- Added comment: "server-time has been archived by modelcontextprotocol"

### 4. Added Requirements

Added requirements field to servers that need external dependencies:
- **Docker**: Docker Desktop must be installed and running
- **Kubernetes**: kubectl must be installed and configured
- **Git**: Git must be installed, Must be run in a Git repository
- **Python Runner**: Python 3.8+ must be installed, uv package manager required
- **Jupyter**: Jupyter must be installed
- **PostgreSQL**: PostgreSQL database must be accessible
- **MySQL**: MySQL/MariaDB database must be accessible
- **MongoDB**: MongoDB database must be accessible
- **Redis**: Redis server must be running and accessible
- **Puppeteer**: Chrome or Chromium browser
- **Fetch**: Python 3.8+ required

### 5. UI Enhancements

- Added requirements section in the modal with orange warning styling
- Added requirements badge (alert icon) on server cards that have requirements
- Added tooltips showing requirements when hovering over server cards
- Fixed environment variable input for sensitive data

### 6. Technical Fixes

- Fixed npx command handling using `--` separator to prevent argument parsing issues
- Environment variables are now placed before the command in the CLI
- Proper serialization of config objects for Electron IPC

## Current Server Count

- **Development Tools**: 8 servers
- **Cloud & Infrastructure**: 5 servers
- **Data & APIs**: 12 servers
- **Communication & Productivity**: 6 servers
- **Web & Automation**: 6 servers
- **Utilities**: 3 servers
- **Remote Services**: 7 servers

**Total**: 47 MCP servers available for quick installation