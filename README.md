# Clode IDE + KANBAN

A modern, lightweight IDE specifically designed for developers using Claude Code CLI. This IDE provides a beautiful graphical interface around the Claude Code CLI tool, solving context loss issues in long coding sessions through persistent project knowledge, task management, and visual context tracking.

## ✨ Features

- **🖥️ Three Layout Modes**: Full IDE, Kanban+Claude, and Kanban-only modes for different workflows
- **📋 Visual Task Management**: Integrated Kanban board with drag-and-drop functionality
- **🤖 Claude Integration**: Seamless Claude Code CLI integration with interactive terminal
- **📁 Smart File Management**: File explorer with context menus, search, and file operations
- **🔍 Global Search & Replace**: Powerful search across all project files with regex support
- **💾 Persistent State**: Project settings and tasks persist across sessions
- **⚡ Performance**: Fast startup and smooth interactions built with modern web technologies

## 🚀 Technology Stack

### Core Technologies
- **Nuxt 3** - Vue framework with excellent developer experience
- **Vue 3** - Reactive UI framework with Composition API
- **Electron** - Cross-platform desktop application framework
- **TypeScript** - Type safety throughout the application
- **Node.js** - Runtime environment

### Editor & UI
- **CodeMirror 6** - Modern code editor with syntax highlighting
- **Splitpanes** - Resizable panel layouts
- **XTerm.js** - Terminal emulator for Claude integration
- **Pinia** - State management
- **Node-PTY** - Pseudo terminal for Claude CLI communication

### Additional Features
- **Ripgrep** - Fast file searching (with Node.js fallback)
- **File System Watchers** - Real-time file change detection
- **Drag & Drop** - Intuitive task management
- **Icon System** - Material Design Icons

## 📸 Layout Modes

### Full IDE Mode
*[Screenshot placeholder - Full IDE with file tree, editor, Claude terminal, and Kanban board]*

Complete development environment with all tools integrated:
- File explorer and editor
- Claude terminal integration
- Task management board
- Global search and replace

### Kanban + Claude Mode (75/25 split)
*[Screenshot placeholder - Kanban board on left, Claude terminal on right]*

Perfect for project management with AI assistance:
- Kanban board for task tracking
- Claude terminal for AI-powered insights
- Clean, focused interface

### Kanban Only Mode
*[Screenshot placeholder - Full-screen Kanban board]*

Pure task management experience:
- Full-screen Kanban board
- Ideal for project managers
- Works great alongside external IDEs

## 🛠️ Installation

### Prerequisites

- **Node.js 20+** (LTS recommended)
- **Claude Code CLI** installed and configured
- **Git** for cloning the repository

### Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/clode-ide-kanban.git
   cd clode-ide-kanban
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

5. **Start the application in development mode**
   ```bash
   npm run electron:dev
   ```

6. **Build for production**
   ```bash
   npm run build
   npm run electron:build
   ```

## ⚙️ Configuration

### Environment Variables

Copy `.env.example` to `.env` and configure:

```env
# Claude CLI Configuration
CLAUDE_CLI_PATH=/path/to/claude
NODE_BIN_PATH=/path/to/node/bin

# Application Settings
DEFAULT_WORKSPACE_PATH=/path/to/default/workspace
APP_NAME=Clode IDE + KANBAN
```

### Claude Code CLI Setup

Ensure Claude Code CLI is installed and accessible:

```bash
# Install Claude Code CLI (if not already installed)
npm install -g @anthropic/claude-code

# Verify installation
claude --version
```

## 🎯 How to Use

### Getting Started

1. **Launch the application**
2. **Select your layout mode** using the mode selector at the top
3. **Choose a workspace** by clicking "Select Workspace"
4. **Start coding** with integrated Claude assistance!

### Layout Modes

- **Switch modes** using the buttons in the top-right corner
- **Resize panels** by dragging the split dividers
- **Settings persist** automatically across sessions

### Task Management

- **Create tasks** by clicking the "+" button or right-clicking columns
- **Drag and drop** to move tasks between columns (To Do, In Progress, Done)
- **Edit tasks** by clicking on them
- **Auto-sync** with TASKS.md file in your project

### Claude Integration

- **Start Claude** by clicking the play button in the Claude terminal
- **Interactive chat** directly in the terminal
- **Workspace context** - Claude knows about your current project
- **Auto-restart** when switching workspaces

### File Management

- **Right-click** files/folders for context menu options
- **Create, rename, delete** files and folders
- **Global search** with Cmd+Shift+F (or Ctrl+Shift+F)
- **Search and replace** across all project files

## 🔧 Development

### Project Structure

```
clode-ide-claude-code-ide-vue/
├── components/           # Vue components
│   ├── Editor/          # Code editor components
│   ├── FileExplorer/    # File tree and management
│   ├── Kanban/          # Task management board
│   ├── Layout/          # Application layouts
│   ├── Search/          # Global search functionality
│   └── Terminal/        # Claude terminal integration
├── electron/            # Electron main process
├── stores/              # Pinia state management
├── composables/         # Vue composables
└── shared/              # Shared types and utilities
```

### Available Scripts

```bash
# Development
npm run electron:compile # Compile TypeScript files for Electron
npm run electron:dev     # Start Electron application in development mode
npm run dev              # Start Nuxt dev server only (for web development)

# Building
npm run build            # Build Nuxt application
npm run electron:build   # Build Electron app for distribution
npm run dist             # Full build pipeline (generate + compile + build)

# Type checking
npm run typecheck        # Run TypeScript checks

# Linting
npm run lint             # Run ESLint
npm run lint:fix         # Fix linting issues
```

### Key Features Implementation

- **Layout Management**: `stores/layout.ts` handles mode switching
- **Task Persistence**: Tasks sync with `TASKS.md` in project root
- **File Operations**: Full CRUD operations with confirmation dialogs
- **Search Integration**: Ripgrep with Node.js fallback for compatibility
- **Terminal Management**: PTY-based Claude CLI integration

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

### Development Guidelines

- Use **TypeScript** for all new code
- Follow **Vue 3 Composition API** patterns
- Add **proper error handling** for all operations
- Include **console logging** for debugging
- Test in **all three layout modes**

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Anthropic** for Claude Code CLI
- **Vue.js team** for the amazing framework
- **Electron team** for cross-platform desktop apps
- **CodeMirror** for the excellent editor component
- **All contributors** who help improve this project

## 🐛 Troubleshooting

### Common Issues

**Claude CLI not found**
- Ensure Claude Code CLI is installed globally
- Check that the path in `.env` is correct
- Verify `claude --version` works in terminal

**Terminal sizing issues**
- Try resizing the window slightly
- Restart Claude terminal using the stop/start buttons
- Check browser console for resize debugging logs

**File operations not working**
- Ensure proper file permissions in workspace
- Check that the workspace path is accessible
- Restart the application if file watchers stop working

**Search not working**
- Install `ripgrep` for faster search: `brew install ripgrep` (macOS)
- Node.js fallback will be used if ripgrep is not available
- Ensure workspace is selected before searching

---

**Made with ❤️ for the Claude Code community**

