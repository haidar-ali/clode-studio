# Clode Studio

A modular, AI-first IDE built specifically for developers using Claude Code CLI. This IDE reimagines the traditional development environment with a flexible 3-dock system that lets you customize your workspace exactly how you need it. Built around the Claude Code CLI tool, it solves context loss issues in long coding sessions through intelligent features like persistent knowledge base, multi-instance support, visual task management, and context optimization.

![clode](https://media.discordapp.net/attachments/1066049576257204224/1400552837225648338/Screenshot_2025-07-31_at_2.55.25_PM.png?ex=688d0df9&is=688bbc79&hm=06b70ed50bafb28ae48c03fd90023bcfe3f17d9874ae4dc3c85fb7822e00f6b0&=&format=webp&quality=lossless&width=1184&height=794)

## 🎨 What Makes Clode Studio Different?

Unlike traditional IDEs with fixed layouts, Clode Studio introduces a revolutionary **3-dock modular system** that adapts to your workflow:

- **🔧 Modular Everything**: Every feature is a draggable module
- **🎯 AI-First Design**: Claude AI is deeply integrated, not an afterthought
- **🚀 Workflow Flexibility**: Switch between coding, planning, and research modes instantly
- **💾 State Preservation**: Your layout and context persist across sessions
- **⚡ Performance Focus**: Lazy-loaded modules keep everything fast

## ✨ Key Features

### 🎯 Modular 3-Dock System
- **Left Dock**: Primary workspace (Explorer + Editor by default)
- **Right Dock**: AI assistance (Claude instances by default)
- **Bottom Dock**: Utilities and terminals
- Drag & drop modules between docks
- Create your perfect workspace layout
- State preservation across sessions

### 🤖 Multi-Instance Claude Support
- Run multiple Claude instances simultaneously
- Each instance maintains independent context
- 9 specialized personalities (Frontend, Backend, Architect, etc.)
- Instance-specific working directories
- Visual status indicators

### 📚 Intelligent Knowledge Base
- Create and maintain project-specific documentation
- Full-text search with Lunr.js
- Markdown editor with YAML frontmatter
- Auto-complete for tags and cross-references
- Seamless integration with Claude's context

### 🎯 Advanced Task Management
- Visual Kanban board with drag-and-drop
- Automatic sync with TASKS.md
- Claude can read and update tasks
- Task context preservation
- Project-specific task persistence

### 🔧 MCP (Model Context Protocol) Integration
- Visual MCP server management
- Quick-add popular servers
- Custom server configuration
- Real-time connection status
- 47+ pre-configured popular servers

### 🪝 Powerful Hooks System
- Automate actions based on Claude's activities
- Pre/Post tool use hooks
- Notification and stop event handlers
- Visual hook manager with testing
- Instance-aware hook execution

### ⚡ Slash Command Studio
- Visual editor for custom Claude commands
- Browse project and personal commands
- Template with placeholders support
- Tool permission management
- Live preview and testing

### 🎨 Prompt Studio
- Build and manage complex prompts with templates
- Template library
- Sub-agent designer
- Resource management

### 💡 Context Enhancement
- Visual context meter and optimization
- Smart checkpointing system
- Lightweight context injection
- Memory management (CLAUDE.md)
- Context-aware file operations

### 📸 Snapshots & Checkpoints
- **Quick Snapshots**: Capture project state instantly with one click
- **Scheduled Snapshots**: Automatic snapshots at configured intervals
- **Visual Comparison**: Built-in diff viewer to compare any two snapshots
- **Selective Restore**: Restore specific files or entire project state
- **Smart Storage**: Only tracks changed files to save space
- **Git Integration**: Works alongside Git without conflicts
- **Metadata Tracking**: Tags, descriptions, and timestamps for each snapshot

### 🌳 Git Worktrees & Sessions
- **Isolated Development**: Create separate working directories for features
- **Multi-Instance Support**: Each worktree maintains its own Claude instances
- **Session Management**: Track work contexts with metadata and tags
- **Worktree Comparison**: Visual diff viewer to compare code between worktrees
- **Quick Switching**: One-click switch preserves all Claude instances
- **Automatic Setup**: Claude configuration copied to each worktree
- **State Preservation**: All worktree states maintained during operations

### 🎨 Flexible Layout System
- **Modular Design**: Place any module in any dock
- **Smart Defaults**: Optimized starting layout
- **Drag & Drop**: Reorganize modules on the fly
- **Split Views**: Multiple modules in right dock
- **State Persistence**: Your layout is always remembered
- **Activity Bar**: Quick module switching
- **Resizable panels**: Fine-tune your workspace
- **Multi-monitor friendly**: Scales to any screen size

### 🤖 AI-Powered Code Intelligence
- **Ghost Text AI**: Inline code suggestions that appear as you type (like GitHub Copilot)
- **Smart Autocomplete**: Multi-provider completion system (LSP, Claude AI, local cache)
- **Code Generation**: AI-powered code generation with visual loading indicators
- **Intelligent Context**: AI understands your project structure and coding patterns
- **Manual Trigger**: Press Cmd/Ctrl+G to request AI suggestions on demand

### ⚡ Language Server Protocol (LSP) Integration
- **Real-time Diagnostics**: Instant error and warning detection
- **Hover Information**: Type info, documentation, and signatures on hover
- **Smart Completions**: Context-aware code completions
- **Multi-language Support**: TypeScript, JavaScript, Python, Rust, Go, Vue, and more
- **Auto-fix Suggestions**: Quick fixes for common issues
- **Go to Definition**: Navigate code intelligently
- **Find References**: Locate all usages across your project

### 🌐 Remote Access & Relay Server
- **Hybrid Mode**: Access your desktop Clode Studio from any device
- **Relay Server**: Built-in HTTP-over-WebSocket tunneling (like ngrok/Cloudflare Tunnel)
- **Subdomain Routing**: Each desktop gets a unique subdomain (e.g., `abc123.relay.clode.studio`)
- **Device Authentication**: Secure token-based authentication with pairing codes
- **QR Code Connection**: Scan to instantly connect mobile devices
- **Local Network Access**: Direct connection when on the same network
- **Custom Relay Support**: Deploy your own relay server for privacy
- **Real-time Synchronization**: Changes sync instantly between desktop and remote
- **Mobile-Optimized UI**: Touch-friendly interface for phones and tablets

### ⌨️ Keyboard Shortcuts
- **Cmd/Ctrl+P**: Open prompt/command palette
- **Cmd/Ctrl+G**: Trigger AI ghost text manually
- **Cmd/Ctrl+Space**: Trigger code completion
- **Tab**: Accept ghost text suggestion
- **Escape**: Dismiss suggestions
- **Cmd/Ctrl+Shift+H**: Open Hook Manager
- **Cmd/Ctrl+Enter**: Execute in modals
- **Alt+/**: Alternative completion trigger

## 🚀 Technology Stack

### Core Technologies
- **Nuxt 3** - Vue framework with excellent DX
- **Vue 3** - Reactive UI with Composition API  
- **Electron** - Cross-platform desktop application
- **TypeScript** - Type safety throughout
- **Node.js 22.x LTS** - Runtime environment

### Editor & UI
- **CodeMirror 6** - Advanced code editing with LSP support
- **XTerm.js** - Terminal emulation
- **Splitpanes** - Flexible layouts
- **Pinia** - State management
- **Chart.js** - Data visualization and analytics
- **gray-matter** - Frontmatter parsing
- **@formkit/drag-and-drop** - Enhanced drag & drop
- **VueUse** - Collection of Vue utilities
- **Naive UI** - UI component library

### Integration & Advanced Features
- **Node-PTY** - Pseudo terminal for Claude
- **Ripgrep** - Fast file searching
- **Lunr.js** - Client-side search
- **File System Watchers** - Real-time updates
- **JSON-RPC** - MCP protocol communication
- **Simple-git** - Git worktree management
- **Isomorphic-git** - Browser-based git operations
- **@marimo-team/codemirror-languageserver** - LSP integration
- **CodeMirror Language Service** - Enhanced language support
- **Electron Store** - Persistent settings storage
- **Archiver & Tar** - Compression and archiving
- **Diff** - Advanced file comparison
- **istextorbinary** - File type detection
- **mime-types** - MIME type identification
- **mitt** - Event bus for component communication

## 📸 Screenshots

### Modular Workspace
The flexible 3-dock system adapts to your workflow:
- **Development Mode**: Editor in left dock, Claude in right, terminal below
- **Task Management**: Kanban in left, Claude in right, context below
- **Research Mode**: Knowledge base in left, Claude + Prompts split in right
- **Source Control**: Git in left, Claude in right, worktrees below

### Available Modules
Drag and drop these modules between docks:
- **Explorer + Editor**: Combined file browser and code editor
- **Claude AI**: Multi-instance AI assistant terminals
- **Tasks**: Visual Kanban board synced with TASKS.md
- **Knowledge**: Project documentation and notes
- **Terminal**: System command line interface
- **Source Control**: Git operations and timeline
- **Worktrees**: Git worktree management
- **Snapshots**: Project state capture and restore
- **Context**: Context usage visualization
- **Prompts**: AI prompt builder and templates

## 🛠️ Installation

### Quick Install (Recommended)

**One-line install:**
```bash
curl -sSL https://get.clode.studio | bash
# or
curl -sSL https://raw.githubusercontent.com/haidar-ali/clode-studio/main/install.sh | bash
```

This will:
- Check prerequisites (Node.js 20+, Git)
- Install Clode Studio in `~/.clode-studio`
- Create launch commands
- Set up configuration

**After installation:**
```bash
# Start in desktop mode (default)
clode-studio

# Start with remote access enabled
clode-studio --hybrid
```

### Manual Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/haidar-ali/clode-studio.git
   cd clode-studio
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Compile TypeScript**
   ```bash
   npm run electron:compile
   ```

4. **Start the application**
   ```bash
   # Desktop mode (development with hot reload)
   npm run electron:dev
   
   # Hybrid mode (desktop + remote) with hot reload - HIGH BANDWIDTH
   CLODE_MODE=hybrid npm run electron:dev
   
   # Hybrid mode with optimized production build - LOW BANDWIDTH (Recommended for remote)
   CLODE_MODE=hybrid npm run electron:remote
   
   # Hybrid mode with custom relay server
   RELAY_TYPE=CLODE RELAY_URL=wss://your-relay.example.com CLODE_MODE=hybrid npm run electron:remote
   
   # Hybrid mode with Cloudflare tunnel
   RELAY_TYPE=CLOUDFLARE CLODE_MODE=hybrid npm run electron:remote
   
   # Hybrid mode with your own tunnel (ngrok, serveo, etc.)
   RELAY_TYPE=CUSTOM CLODE_MODE=hybrid npm run electron:remote
   ```

### Prerequisites

- **Node.js 20+** (installed automatically on macOS)
- **Git** (installed automatically on macOS)
- **Claude Code CLI** (optional, for enhanced features)
- **Ripgrep** (optional, for faster search)

## ⚙️ Configuration

### Claude Code CLI Setup

Ensure Claude Code CLI is installed:

```bash
# Install Claude Code CLI
npm install -g claude-code

# Verify installation
claude --version
```

### Remote Access Setup

Clode Studio offers multiple options for remote access via the `RELAY_TYPE` environment variable.

#### Optimized Remote Mode (Recommended)

For remote access, use the optimized production build to save 70-80% bandwidth:

```bash
# Auto-detect if rebuild needed (recommended)
RELAY_TYPE=CLODE CLODE_MODE=hybrid npm run electron:remote

# Force rebuild before running
RELAY_TYPE=CLODE CLODE_MODE=hybrid npm run electron:build

# Use existing build (fastest startup)
RELAY_TYPE=CLODE CLODE_MODE=hybrid npm run electron:preview

# Development mode with hot reload (high bandwidth)
RELAY_TYPE=CLODE CLODE_MODE=hybrid npm run electron:dev
```

**Benefits of optimized mode:**
- 70-80% bandwidth reduction
- No hot reload overhead
- Minified and compressed assets
- Faster loading times
- Auto-detects when rebuild is needed

#### Remote Access Options

#### Option 1: Clode Relay (Default)

```bash
# Uses relay.clode.studio automatically
CLODE_MODE=hybrid npm run electron:dev

# Or with a custom relay server
RELAY_TYPE=CLODE RELAY_URL=wss://your-relay.example.com CLODE_MODE=hybrid npm run electron:dev

# The app will:
# 1. Connect to relay server
# 2. Get a unique subdomain (e.g., abc123.relay.clode.studio)
# 3. Generate QR code and connection URL
```

#### Option 2: Cloudflare Tunnel

```bash
# Uses Cloudflare's quick tunnel (no account needed)
RELAY_TYPE=CLOUDFLARE CLODE_MODE=hybrid npm run electron:dev

# Generates a .trycloudflare.com URL
# Requires cloudflared installed on your system
```

#### Option 3: Custom Tunnel (tunnelmole, localtunnel, ngrok, etc.)

```bash
# Start Clode Studio
RELAY_TYPE=CUSTOM CLODE_MODE=hybrid npm run electron:dev

# In another terminal, start your preferred tunnel on port 3000:
npx tunnelmole@latest 3000
# OR
npx localtunnel --port 3000
# OR
ngrok http 3000
# OR
ssh -R 80:localhost:3000 serveo.net
```

#### Option 4: Local Network Only

```bash
# No external access, LAN only
RELAY_TYPE=NONE CLODE_MODE=hybrid npm run electron:dev
```

#### How the Relay Works

The relay server provides HTTP-over-WebSocket tunneling, similar to ngrok or Cloudflare Tunnel:

1. **Desktop connects** to relay server via WebSocket
2. **Relay assigns** unique subdomain based on connection ID
3. **Remote devices** access via `https://[subdomain].relay.clode.studio`
4. **Relay forwards** HTTP requests through WebSocket to desktop
5. **Desktop processes** requests and sends responses back
6. **Authentication** handled locally by desktop (tokens never leave your machine)

**Technical Details:**
- Uses wildcard DNS (`*.relay.clode.studio`) for subdomain routing
- Each desktop connection gets a unique 6-character subdomain
- HTTP requests are serialized and sent through WebSocket frames
- Supports streaming responses for large files
- Handles binary data and all HTTP methods
- No data is stored on relay server (pure passthrough)

#### Security Features

- **Token-based auth**: Each device gets a unique token
- **Pairing codes**: Easy manual entry for devices without QR scanning
- **Local validation**: Desktop validates all tokens locally
- **Automatic expiry**: Tokens expire after configured time
- **Instant revocation**: Remove device access immediately from desktop

## 🎯 How to Use

### Getting Started

1. **Launch the application**
2. **Select workspace** using the folder button
3. **Customize your layout** by dragging modules between docks
4. **Start coding** with Claude assistance!

### Quick Layout Tips

- **For Development**: Keep Editor in left, Claude in right, Terminal below
- **For Planning**: Move Tasks to left dock, keep Claude accessible in right
- **For Research**: Put Knowledge in left, split Claude + Prompts in right
- **Need Space?**: Hide right sidebar with the toggle, minimize bottom dock
- **Reset Layout**: Settings → Reset Layout to restore defaults

### Multi-Instance Claude

1. Click **+** to create new instance
2. Name your instance (e.g., "Frontend", "API")
3. Select personality from dropdown
4. Each instance maintains separate context

### Knowledge Base

1. Click **Knowledge** tab
2. Create entries with **New** button
3. Use markdown with frontmatter for metadata
4. Double-click titles to edit inline
5. Claude automatically accesses your knowledge

### Custom Slash Commands

1. Open **Commands** tab
2. Browse existing commands
3. Create new with visual editor
4. Test commands before saving
5. Use in any Claude instance

### Prompt Engineering

1. Open **Prompt Studio** tab or press **Cmd/Ctrl+P**
2. Build complex prompts with templates
3. Design sub-agents for specialized tasks
4. Manage prompt resources
5. Save to template library

### AI Code Intelligence

1. **Ghost Text**
   - Automatically appears as you type after a short delay
   - Press **Tab** to accept suggestions
   - Press **Escape** to dismiss
   - Press **Cmd/Ctrl+G** to manually trigger
   - Configure delay in Autocomplete Settings

2. **Smart Autocomplete**
   - Press **Cmd/Ctrl+Space** for dropdown completions
   - Multiple providers: LSP, Claude AI, and local cache
   - Real-time filtering as you type
   - Provider indicators show source

3. **Code Generation**
   - Press **Cmd/Ctrl+P** for quick prompt
   - Describe what you want to generate
   - AI loading indicator shows progress
   - Diff view shows changes by default
   - Accept or reject generated code

### Hooks Automation

1. Press **Cmd/Ctrl + Shift + H** for Hook Manager
2. Add hooks for tool events
3. Test with simulated events
4. Enable/disable as needed

### MCP Servers

1. Click **MCP** tab
2. Browse popular servers
3. Quick-add with one click
4. Configure custom servers
5. Monitor connection status

### Snapshots & Checkpoints

1. **Creating Snapshots**
   - Click camera icon for instant snapshot
   - Schedule automatic snapshots (hourly/daily)
   - Add tags and descriptions
   - Smart storage only saves changed files

2. **Comparing Snapshots**
   - Select any two snapshots to compare
   - Visual diff viewer shows all changes
   - File-by-file comparison available
   - Export differences as patches

3. **Restoring from Snapshots**
   - Browse snapshot contents visually
   - Restore entire project or specific files
   - Preview changes before applying
   - Non-destructive restore options

### Git Worktrees & Sessions

1. **Creating a Worktree**
   - Click the **+** button in the Worktree panel
   - Enter branch name (new or existing)
   - Optionally provide session name and description
   - Claude settings automatically copied to new worktree
   - All Claude instances preserved during creation

2. **Managing Sessions**
   - Each worktree can have an associated session
   - Sessions track metadata, descriptions, and tags
   - Visual indicators show active worktree
   - Lock worktrees to prevent accidental deletion

3. **Switching Worktrees**
   - Click "Switch" on any worktree card
   - All Claude instances maintain their state
   - File explorer updates to new directory
   - Terminal sessions preserved across switches

4. **Comparing Worktrees**
   - Click compare button between any two worktrees
   - Visual diff viewer shows code differences
   - See files added/removed/modified
   - Apply changes from one worktree to another

### Customizing Your Workspace

1. **Moving Modules**
   - Drag module tabs between docks
   - Right-click tabs for quick actions
   - Some modules have preferred docks (e.g., Claude prefers right dock)

2. **Split Views**
   - Right dock supports split view mode
   - Show two modules simultaneously
   - Perfect for Claude + Knowledge or Claude + Prompts

3. **Minimizing Panels**
   - Bottom dock can be minimized
   - Right sidebar can be hidden
   - Activity bar can be collapsed
   - More space for your code when needed

4. **Workspace Presets**
   - Development: Editor + Claude + Terminal
   - Planning: Tasks + Claude + Knowledge
   - Research: Knowledge + Claude + Context
   - DevOps: Terminal + Claude + Worktrees

## 🔧 Advanced Features

### Personality System
- **Full Stack**: General development
- **Frontend/Backend**: Specialized roles
- **Architect**: System design focus
- **Plumber**: DevOps and systems
- **Theorist**: Algorithms and theory
- **Pedagogue**: Teaching mode
- **Jester**: Creative problem-solving

### Context Optimization
- Visual context usage meter
- Checkpoint creation and restoration
- Smart file inclusion
- Context pruning suggestions
- Memory file integration

### Task Integration
- Automatic TASKS.md synchronization
- Drag-and-drop between columns
- Claude can read/update tasks
- Visual progress tracking
- Markdown-based persistence

### Search & Replace
- Global project search
- Regex support
- Multi-file replace
- Search history
- Ripgrep integration
- Minimum 3-character search requirement

### Language Server Features
- **Error Detection**: Real-time syntax and semantic errors
- **Quick Fixes**: Auto-fix common issues
- **Refactoring**: Smart rename, extract method
- **Code Navigation**: Go to definition, find references
- **Documentation**: Inline documentation on hover
- **Type Information**: See types without leaving editor
- **Multi-Language**: Support for 15+ programming languages

### Snapshot Management
- **Instant Capture**: One-click project state snapshots
- **Scheduled Backups**: Automatic snapshots at intervals
- **Smart Storage**: Only changed files tracked
- **Visual Comparison**: Built-in diff viewer
- **Selective Restore**: File-level or full restore
- **Git Compatible**: Works alongside version control

### Worktree Management
- **Isolated Feature Development**: Each feature in its own directory
- **Zero-Conflict Switching**: No stashing or committing required
- **Session Tracking**: Remember why each worktree was created
- **Automatic Configuration**: .claude settings copied to each worktree
- **Branch Protection**: Lock worktrees to prevent accidental deletion
- **Visual Comparison**: Compare code between worktrees
- **State Preservation**: Claude instances maintained across operations

## 📚 Documentation

Comprehensive guides available in `/docs`:
- [Knowledge Base Guide](docs/KNOWLEDGE_BASE_GUIDE.md)
- [Multi-Instance Guide](docs/MULTI_INSTANCE_GUIDE.md)
- [Hooks User Guide](docs/HOOKS_USER_GUIDE.md)
- [Slash Commands Guide](docs/SLASH_COMMANDS_GUIDE.md)
- [MCP Troubleshooting](docs/MCP_TROUBLESHOOTING.md)

## 🏗️ Architecture

### Modular Design Philosophy

Clode Studio is built on a modular architecture where each feature is a self-contained module that can be placed in any of the three docks:

- **Left Dock**: Primary workspace (typically editor, file explorer, or tasks)
- **Right Dock**: Secondary tools (Claude AI, knowledge base, prompts)
- **Bottom Dock**: Supporting utilities (terminal, logs, output)

### Module System

Each module is:
- **Self-contained**: Complete functionality in one component
- **State-preserving**: Maintains state when moved between docks
- **Lazy-loaded**: Only loaded when needed for performance
- **Draggable**: Can be repositioned via drag & drop
- **Configurable**: Has its own settings and preferences

### Benefits of Modular Architecture

1. **Flexibility**: Arrange your workspace exactly how you want
2. **Performance**: Only load the modules you need
3. **Scalability**: Easy to add new modules without affecting others
4. **Maintainability**: Each module can be developed independently
5. **Customization**: Create workspace layouts for different workflows

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open Pull Request

### Development Guidelines

- Use **TypeScript** for type safety
- Follow **Vue 3 Composition API** patterns
- Add **proper error handling**
- Test in **all layout modes**
- Update **documentation** for new features

### Available Scripts

```bash
# Development
npm run electron:compile. # Compile Electron app
npm run electron:dev      # Start Electron app in dev mode
npm run dev              # Start Nuxt dev server only

# Building
npm run build            # Build Nuxt application
npm run electron:build   # Build Electron distributables
npm run dist            # Complete build pipeline

# Code Quality
npm run typecheck       # TypeScript type checking
npm run lint           # ESLint checking
npm run lint:fix       # Auto-fix linting issues
```

## 🐛 Troubleshooting

### Common Issues

**Claude not starting**
- Verify Claude Code CLI is installed
- Check terminal for error messages
- Ensure proper permissions

**Knowledge base not loading**
- Check `.claude/knowledge/` directory exists
- Verify file permissions
- Restart the application

**MCP connection failed**
- Verify server URL/command
- Check firewall settings
- Review server logs

**Search not working**
- Install ripgrep: `brew install ripgrep` (macOS)
- Falls back to Node.js search if unavailable
- Minimum 3 characters required to search

**Worktree issues**
- Ensure Git repository is initialized
- Check Git version (2.17+ required for worktrees)
- Verify branch names don't contain spaces
- Remove locks with force option if needed

## 📈 Performance Tips

- Close unused Claude instances
- Use checkpoint system for long sessions
- Enable context optimization
- Limit file watchers in large projects
- Use specific personalities for tasks

## 🔒 Security

- All data stored locally
- No external API calls (except MCP)
- Secure IPC communication
- Sandboxed file operations

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 📝 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Anthropic** for Claude and Claude Code CLI
- **Vue.js Team** for the amazing framework
- **Electron Team** for desktop capabilities
- **CodeMirror** for the editor component
- **MCP Community** for server ecosystem
- **All Contributors** who improve this project

## 🚧 Roadmap

### Recently Completed ✅
- [x] Modular 3-dock architecture
- [x] Drag & drop module system
- [x] Multi-instance Claude support
- [x] Git worktree integration
- [x] Snapshot system
- [x] Knowledge base with search

### Recently Added 🎉
- [x] AI Ghost Text (inline code suggestions)
- [x] Smart Autocomplete with multiple providers
- [x] Language Server Protocol (LSP) integration
- [x] Real-time error detection and quick fixes
- [x] Code generation with AI loading indicators
- [x] Advanced keyboard shortcuts system
- [x] Enhanced diff view with merge capabilities
- [x] Relay Server with subdomain-based routing
- [x] HTTP-over-WebSocket tunneling for remote access
- [x] Token-based device authentication
- [x] QR code connection for mobile devices

### Coming Soon
- [ ] Custom module development API
- [ ] Workspace layout presets
- [ ] Module marketplace
- [ ] Collaborative features
- [ ] Cloud sync for settings
- [ ] Voice commands
- [ ] AI-powered code review
- [ ] Integrated debugging
- [ ] Performance profiling
- [ ] Mobile companion app
- [ ] Extended language server support
- [ ] AI model selection for ghost text
- [ ] Code formatting integration
- [ ] Git conflict resolution AI

---

**Built with ❤️ for the Claude Code community**

For questions, issues, or contributions, please visit our [GitHub repository](https://github.com/haidar-ali/clode-studio).
