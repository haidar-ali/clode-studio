# Claude Code IDE

A powerful, modern IDE specifically designed for developers using Claude Code CLI. This IDE provides a comprehensive graphical interface around the Claude Code CLI tool, solving context loss issues in long coding sessions through intelligent features like persistent knowledge base, multi-instance support, visual task management, and context optimization.

## ✨ Key Features

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

### 💡 Context Enhancement
- Visual context meter and optimization
- Smart checkpointing system
- Lightweight context injection
- Memory management (CLAUDE.md)
- Context-aware file operations

### 🎨 Flexible Layout System
- **Full IDE Mode**: Complete development environment
- **Kanban + Claude Mode**: Task-focused with AI assistance
- **Kanban Only Mode**: Pure project management
- Resizable panels with persistence
- Multi-monitor friendly

## 🚀 Technology Stack

### Core Technologies
- **Nuxt 3** - Vue framework with excellent DX
- **Vue 3** - Reactive UI with Composition API  
- **Electron** - Cross-platform desktop application
- **TypeScript** - Type safety throughout
- **Node.js 22.x LTS** - Runtime environment

### Editor & UI
- **CodeMirror 6** - Advanced code editing
- **XTerm.js** - Terminal emulation
- **Splitpanes** - Flexible layouts
- **Pinia** - State management
- **gray-matter** - Frontmatter parsing

### Integration
- **Node-PTY** - Pseudo terminal for Claude
- **Ripgrep** - Fast file searching
- **Lunr.js** - Client-side search
- **File System Watchers** - Real-time updates
- **JSON-RPC** - MCP protocol communication

## 📸 Screenshots

### Full IDE Mode
Complete development environment with all tools integrated:
- Multi-instance Claude terminals
- File explorer and editor
- Knowledge base and task management
- MCP connections and hooks

### Kanban + Claude Mode (75/25 split)
Perfect for project management with AI assistance:
- Large Kanban board for task tracking
- Claude terminal for AI-powered insights
- Clean, focused interface

### Kanban Only Mode
Pure task management experience:
- Full-screen Kanban board
- Ideal for project managers
- Works alongside external IDEs

## 🛠️ Installation

### Prerequisites

- **Node.js 20+** (LTS recommended)
- **Claude Code CLI** installed and configured
- **Git** for cloning the repository
- **Ripgrep** (optional, for faster search)

### Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/claude-code-ide-vue.git
   cd claude-code-ide-vue
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Compile Electron TypeScript files**
   ```bash
   npm run electron:compile
   ```

5. **Start the application**
   ```bash
   npm run electron:dev
   ```

6. **Build for production**
   ```bash
   npm run dist
   ```

## ⚙️ Configuration

### Environment Variables

Create a `.env` file:

```env
# Application
APP_NAME=Claude Code IDE
DEFAULT_WORKSPACE_PATH=/path/to/default/workspace

# Development
NUXT_PUBLIC_API_BASE=http://localhost:3000
CLAUDE_DEBUG=false
```

### Claude Code CLI Setup

Ensure Claude Code CLI is installed:

```bash
# Install Claude Code CLI
npm install -g claude-code

# Verify installation
claude --version
```

## 🎯 How to Use

### Getting Started

1. **Launch the application**
2. **Select workspace** using the folder button
3. **Choose layout mode** (Full IDE, Kanban+Claude, Kanban Only)
4. **Start coding** with Claude assistance!

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

## 📚 Documentation

Comprehensive guides available in `/docs`:
- [Knowledge Base Guide](docs/KNOWLEDGE_BASE_GUIDE.md)
- [Multi-Instance Guide](docs/MULTI_INSTANCE_GUIDE.md)
- [Hooks User Guide](docs/HOOKS_USER_GUIDE.md)
- [Slash Commands Guide](docs/SLASH_COMMANDS_GUIDE.md)
- [MCP Troubleshooting](docs/MCP_TROUBLESHOOTING.md)

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
- Environment variable protection

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

- [ ] Plugin system for extensions
- [ ] Collaborative features
- [ ] Cloud sync for settings
- [ ] Mobile companion app
- [ ] Voice commands
- [ ] AI-powered code review
- [ ] Integrated debugging
- [ ] Performance profiling

---

**Built with ❤️ for the Claude Code community**

For questions, issues, or contributions, please visit our [GitHub repository](https://github.com/yourusername/claude-code-ide-vue).