# Popular MCP Servers for Claude Code IDE

This document lists the popular MCP servers integrated into the Claude Code IDE's quick-add feature. The IDE now includes 50+ popular MCP servers across 7 categories, including both local (stdio) and remote (SSE/HTTP) servers.

## Development Tools

### Filesystem
- **Description**: Read, write, and manage files
- **Type**: stdio
- **Install**: `npx -y @modelcontextprotocol/server-filesystem`
- **Use Case**: File operations, project management

### GitHub
- **Description**: Manage repos, issues, and PRs
- **Type**: stdio
- **Install**: `npm install -g @modelcontextprotocol/server-github`
- **Requires**: `GITHUB_TOKEN` environment variable
- **Use Case**: Repository management, CI/CD integration

### Git
- **Description**: Git operations and history
- **Type**: stdio
- **Install**: `npm install -g @modelcontextprotocol/server-git`
- **Use Case**: Version control operations

### Sequential Thinking
- **Description**: Break down complex problems
- **Type**: stdio
- **Install**: `npm install -g @modelcontextprotocol/server-sequential-thinking`
- **Use Case**: Architecture design, complex problem solving

### Python Runner
- **Description**: Execute Python code safely
- **Type**: stdio
- **Install**: `pip install mcp-run-python`
- **Use Case**: Running Python scripts in sandbox

### Memory
- **Description**: Persistent knowledge graph memory
- **Type**: stdio
- **Install**: `npx -y @modelcontextprotocol/server-memory`
- **Use Case**: Long-term context retention

### Everything
- **Description**: Reference server with all features
- **Type**: stdio
- **Install**: `npx -y @modelcontextprotocol/server-everything`
- **Use Case**: Testing MCP capabilities

### Jupyter
- **Description**: Execute Jupyter notebooks
- **Type**: stdio
- **Install**: `npm install -g @modelcontextprotocol/server-jupyter`
- **Use Case**: Interactive computing

## Cloud & Infrastructure

### AWS
- **Description**: Manage AWS resources
- **Type**: stdio
- **Install**: `npm install -g @modelcontextprotocol/server-aws`
- **Requires**: AWS credentials (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`)
- **Use Case**: Cloud resource management

### Cloudflare
- **Description**: Deploy and manage Cloudflare resources
- **Type**: stdio
- **Install**: `npm install -g @modelcontextprotocol/server-cloudflare`
- **Requires**: `CLOUDFLARE_API_TOKEN`
- **Use Case**: Edge computing, CDN management

### Docker
- **Description**: Manage containers and images
- **Type**: stdio
- **Install**: `npm install -g @modelcontextprotocol/server-docker`
- **Use Case**: Container management, docker-compose

### Kubernetes
- **Description**: Manage K8s clusters
- **Type**: stdio
- **Install**: `npm install -g @modelcontextprotocol/server-kubernetes`
- **Use Case**: Container orchestration

### Google Cloud
- **Description**: Manage GCP resources
- **Type**: stdio
- **Install**: `npm install -g @modelcontextprotocol/server-gcp`
- **Requires**: `GOOGLE_APPLICATION_CREDENTIALS`
- **Use Case**: Google Cloud Platform management

## Data & APIs

### PostgreSQL
- **Description**: Query and manage PostgreSQL
- **Type**: stdio
- **Install**: `npm install -g @modelcontextprotocol/server-postgres`
- **Requires**: `DATABASE_URL`
- **Use Case**: Database operations

### SQLite
- **Description**: Local SQLite database access
- **Type**: stdio
- **Install**: `npm install -g @modelcontextprotocol/server-sqlite`
- **Use Case**: Local database operations

### MySQL
- **Description**: Query and manage MySQL
- **Type**: stdio
- **Install**: `npm install -g @modelcontextprotocol/server-mysql`
- **Requires**: `MYSQL_CONNECTION_STRING`
- **Use Case**: MySQL/MariaDB operations

### MongoDB
- **Description**: NoSQL database operations
- **Type**: stdio
- **Install**: `npm install -g @modelcontextprotocol/server-mongodb`
- **Requires**: `MONGODB_URI`
- **Use Case**: Document database management

### Redis
- **Description**: Key-value store operations
- **Type**: stdio
- **Install**: `npm install -g @modelcontextprotocol/server-redis`
- **Requires**: `REDIS_URL`
- **Use Case**: Caching, pub/sub

### BigQuery
- **Description**: Google BigQuery analytics
- **Type**: stdio
- **Install**: `npm install -g @modelcontextprotocol/server-bigquery`
- **Requires**: `GOOGLE_APPLICATION_CREDENTIALS`
- **Use Case**: Big data analytics

### Brave Search
- **Description**: Privacy-focused web search
- **Type**: stdio
- **Install**: `npm install -g @modelcontextprotocol/server-brave-search`
- **Requires**: `BRAVE_API_KEY`
- **Use Case**: Web search with privacy

### Apollo GraphQL
- **Description**: Connect GraphQL APIs
- **Type**: stdio
- **Install**: `npm install -g @modelcontextprotocol/server-apollo`
- **Use Case**: GraphQL API integration

### Stripe
- **Description**: Payment processing API
- **Type**: stdio
- **Install**: `npm install -g @modelcontextprotocol/server-stripe`
- **Requires**: `STRIPE_API_KEY`
- **Use Case**: Payment processing, subscriptions

## Communication & Productivity

### Slack
- **Description**: Read and send Slack messages
- **Type**: stdio
- **Install**: `npm install -g @modelcontextprotocol/server-slack`
- **Requires**: `SLACK_TOKEN`
- **Use Case**: Team communication

### Notion
- **Description**: Manage Notion pages and databases
- **Type**: stdio
- **Install**: `npm install -g @modelcontextprotocol/server-notion`
- **Requires**: `NOTION_API_KEY`
- **Use Case**: Knowledge management

### Linear
- **Description**: Manage issues and projects
- **Type**: stdio
- **Install**: `npm install -g @modelcontextprotocol/server-linear`
- **Requires**: `LINEAR_API_KEY`
- **Use Case**: Project management

### Discord
- **Description**: Discord bot operations
- **Type**: stdio
- **Install**: `npm install -g @modelcontextprotocol/server-discord`
- **Requires**: `DISCORD_BOT_TOKEN`
- **Use Case**: Community management

### Twilio
- **Description**: SMS and voice messaging
- **Type**: stdio
- **Install**: `npm install -g @modelcontextprotocol/server-twilio`
- **Requires**: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`
- **Use Case**: SMS, voice calls

### Google Drive
- **Description**: Access Google Drive files
- **Type**: stdio
- **Install**: `npm install -g @modelcontextprotocol/server-google-drive`
- **Requires**: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`
- **Use Case**: Cloud storage

## Web & Automation

### Puppeteer
- **Description**: Browser automation
- **Type**: stdio
- **Install**: `npx -y @modelcontextprotocol/server-puppeteer`
- **Use Case**: Web scraping, testing

### Fetch
- **Description**: Web content fetching
- **Type**: stdio
- **Install**: `npx -y @modelcontextprotocol/server-fetch`
- **Use Case**: Optimized web content retrieval

### Playwright
- **Description**: Cross-browser automation
- **Type**: stdio
- **Install**: `npm install -g @modelcontextprotocol/server-playwright`
- **Use Case**: Multi-browser testing

### Browser Control
- **Description**: Control your local browser
- **Type**: stdio
- **Install**: `npm install -g @modelcontextprotocol/server-browser`
- **Use Case**: Local browser automation

## Utilities

### Calculator
- **Description**: Precise numerical calculations
- **Type**: stdio
- **Install**: `npm install -g @modelcontextprotocol/server-calculator`
- **Use Case**: Complex calculations

### Time & Date
- **Description**: Time zone and date operations
- **Type**: stdio
- **Install**: `npm install -g @modelcontextprotocol/server-time`
- **Use Case**: Time zone conversions, scheduling

### Weather
- **Description**: Get weather information
- **Type**: stdio
- **Install**: `npm install -g @modelcontextprotocol/server-weather`
- **Requires**: `OPENWEATHER_API_KEY`
- **Use Case**: Weather data

### PDF Tools
- **Description**: Read and manipulate PDFs
- **Type**: stdio
- **Install**: `npm install -g @modelcontextprotocol/server-pdf`
- **Use Case**: PDF processing

## Remote Services (SSE/HTTP)

These servers are hosted remotely and don't require local installation. They use SSE (Server-Sent Events) or HTTP transport protocols.

### Context7 (SSE)
- **Description**: Real-time library documentation
- **Type**: sse
- **Endpoint**: `https://mcp.context7.com/sse`
- **Use Case**: Get up-to-date documentation for any library
- **Note**: No installation required - hosted service

### Context7 (HTTP)
- **Description**: Library docs via streamable HTTP
- **Type**: http
- **Endpoint**: `https://mcp.context7.com/mcp`
- **Use Case**: Modern HTTP version with better performance
- **Note**: Uses new streamable HTTP transport

### Context7 Community
- **Description**: Alternative Context7 endpoint
- **Type**: sse
- **Endpoint**: `https://context7.liam.sh/sse`
- **Use Case**: Community-hosted documentation service

### Cloudflare MCP Template
- **Description**: Deploy your own remote MCP
- **Type**: http
- **Example**: `https://your-worker.workers.dev/mcp`
- **Requires**: Custom deployment, API key
- **Use Case**: Host your own MCP server on Cloudflare

### Azure Container Apps MCP
- **Description**: Azure-hosted MCP template
- **Type**: sse
- **Example**: `https://your-mcp.azurecontainerapps.io/sse`
- **Requires**: Azure deployment, API key
- **Use Case**: Enterprise MCP hosting

### APISIX MCP Bridge
- **Description**: API Gateway for MCP servers
- **Type**: sse
- **Use Case**: Convert stdio servers to HTTP/SSE
- **Features**: Authentication, rate limiting

### Custom Remote MCP
- **Description**: Connect to any remote MCP
- **Type**: http or sse
- **Use Case**: Connect to custom MCP endpoints

## Transport Types

### stdio (Standard Input/Output)
- Local servers that run on your machine
- Require installation via npm, pip, etc.
- Direct process communication

### SSE (Server-Sent Events)
- Remote servers accessed over HTTP
- Real-time streaming capabilities
- Being deprecated in favor of streamable HTTP

### HTTP (Streamable HTTP)
- Modern remote server protocol
- Stateless connections
- Better performance and compatibility

## Additional Resources

- [Awesome MCP Servers](https://github.com/wong2/awesome-mcp-servers)
- [Official MCP Servers](https://github.com/modelcontextprotocol/servers)
- [MCP Documentation](https://modelcontextprotocol.io)
- [Context7 Documentation](https://github.com/upstash/context7)

## Notes

1. Some servers require API keys or authentication tokens
2. Local servers (stdio) require Node.js/npm installed (v18.x or higher)
3. Remote servers (SSE/HTTP) work immediately without installation
4. For workspace-specific installations, consider using npx instead of global installs
5. The Claude Code IDE automatically handles the configuration when you add servers through the Quick Add interface
6. SSE transport is being deprecated in favor of streamable HTTP as of late 2024
7. Remote servers may require authentication headers in their configuration