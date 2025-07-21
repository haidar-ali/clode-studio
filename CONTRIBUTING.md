# Contributing to Clode Studio

First off, thank you for considering contributing to Clode Studio! It's people like you that make Clode Studio such a great tool for the Claude Code community.

## Code of Conduct

By participating in this project, you are expected to uphold our simple code of conduct:
- Be respectful and inclusive
- Welcome newcomers and help them get started
- Focus on what is best for the community
- Show empathy towards other community members

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates. When you create a bug report, include as many details as possible:

- **Use a clear and descriptive title**
- **Describe the exact steps to reproduce the problem**
- **Provide specific examples**
- **Describe the behavior you observed and expected**
- **Include screenshots if possible**
- **Include your environment details**:
  - OS and version
  - Node.js version
  - Claude Code CLI version
  - Clode Studio version

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion:

- **Use a clear and descriptive title**
- **Provide a detailed description of the proposed feature**
- **Explain why this enhancement would be useful**
- **Consider the scope and impact on existing features**

### Pull Requests

1. **Fork the repo** and create your branch from `main`
2. **Name your branch** descriptively: `feature/amazing-feature` or `fix/specific-bug`
3. **Make your changes**:
   - Add tests if applicable
   - Update documentation
   - Ensure the code follows the existing style
4. **Test thoroughly**:
   - Test in all layout modes (Full IDE, Kanban+Claude, Kanban Only)
   - Test with multiple Claude instances
   - Verify no regressions in existing features
5. **Commit your changes**:
   - Use clear, descriptive commit messages
   - Reference issues when applicable: `Fixes #123`
6. **Push to your fork** and submit a pull request
7. **PR description** should:
   - Describe what changes you've made
   - Explain why you've made them
   - Reference any related issues

## Development Setup

### Prerequisites

- Node.js 20+ (22.x LTS recommended)
- Git
- Claude Code CLI installed globally
- A GitHub account

### Local Development

```bash
# Clone your fork
git clone https://github.com/your-username/clode-studio.git
cd clode-studio

# Add upstream remote
git remote add upstream https://github.com/haidar-ali/clode-studio.git

# Install dependencies
npm install

# Compile Electron TypeScript
npm run electron:compile

# Start development
npm run electron:dev
```

### Development Workflow

1. **Stay updated with upstream**:
   ```bash
   git fetch upstream
   git checkout main
   git merge upstream/main
   ```

2. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature
   ```

3. **Make changes and test**:
   ```bash
   # Run in dev mode
   npm run electron:dev
   
   # Run type checking
   npm run typecheck
   
   # Run linting
   npm run lint
   ```

4. **Commit and push**:
   ```bash
   git add .
   git commit -m "feat: add amazing feature"
   git push origin feature/your-feature
   ```

## Coding Standards

### TypeScript

- Use TypeScript for all new code
- Avoid `any` types when possible
- Define interfaces for component props
- Use proper typing for Electron IPC

### Vue 3 Composition API

- Use `<script setup>` syntax for components
- Organize composables in `/composables`
- Keep components small and focused
- Use Pinia for state management

### File Organization

```
clode-studio/
├── components/       # Vue components
│   ├── editor/      # Editor-related components
│   ├── kanban/      # Kanban board components
│   └── terminal/    # Terminal components
├── stores/          # Pinia stores
├── composables/     # Vue composables
├── electron/        # Electron main process
├── utils/           # Utility functions
└── types/           # TypeScript type definitions
```

### Naming Conventions

- **Components**: PascalCase (e.g., `TaskBoard.vue`)
- **Composables**: camelCase with 'use' prefix (e.g., `useClaudeInstance.ts`)
- **Stores**: camelCase with 'Store' suffix (e.g., `claudeStore.ts`)
- **Files**: kebab-case for non-components (e.g., `file-utils.ts`)

### Best Practices

1. **Error Handling**:
   - Always handle errors gracefully
   - Provide meaningful error messages
   - Log errors appropriately

2. **Performance**:
   - Avoid unnecessary re-renders
   - Use `computed` and `watch` efficiently
   - Clean up event listeners and intervals

3. **Electron Security**:
   - Use contextBridge for IPC
   - Validate all inputs from renderer
   - Avoid using `nodeIntegration: true`

4. **Testing**:
   - Write tests for new features
   - Ensure existing tests pass
   - Test edge cases

## Documentation

- Update README.md if adding new features
- Add JSDoc comments for complex functions
- Update user guides in `/docs` when changing functionality
- Include examples for new features

## Questions?

Feel free to:
- Open an issue for questions
- Start a discussion in GitHub Discussions
- Reach out to maintainers

## Recognition

Contributors will be recognized in:
- The README.md acknowledgments section
- Release notes
- The contributors graph

Thank you for contributing to Clode Studio! 🎉