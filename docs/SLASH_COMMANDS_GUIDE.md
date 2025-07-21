# Slash Commands Guide

## Overview

Clode Studio provides both built-in slash commands and a visual Command Studio for creating custom commands. Commands enhance your workflow by providing quick access to common actions and custom prompts.

## Built-in Commands

### File Commands
- `/open [file]` - Open a file in the editor (aliases: `/o`, `/edit`)
- `/save` - Save the current file (alias: `/s`)
- `/close` - Close the current file
- `/find <pattern>` - Search in files (aliases: `/search`, `/grep`)

### Task Management
- `/task <description>` - Create a new task (aliases: `/todo`, `/t`)
- `/tasks` - Show all tasks (alias: `/todos`)

### Context Management
- `/context` - Show context usage (alias: `/ctx`)
- `/optimize` - Optimize context usage
- `/checkpoint [name]` - Create a context checkpoint (alias: `/cp`)

### Knowledge Base
- `/knowledge [query]` - Search knowledge base (aliases: `/kb`, `/know`)
- `/knowledge-add <title>` - Add new knowledge entry (alias: `/kb-add`)

### Claude Management
- `/claude [name]` - Create new Claude instance (alias: `/new`)
- `/personality <name>` - Set Claude personality (alias: `/p`)
- `/session` - Resume a previous session (alias: `/resume`)
- `/think [level]` - Set thinking level: normal, more, hard, ultra

### System Commands
- `/memory` - Edit CLAUDE.md memory files (aliases: `/mem`, `/claude.md`)
- `/mcp` - Show MCP connections
- `/commands` - Open command studio (aliases: `/cmd`, `/slash`)
- `/help` - Show available commands (aliases: `/?`, `/h`)
- `/clear` - Clear terminal/chat (alias: `/cls`)
- `/reload` - Reload the application

### Workspace
- `/workspace` - Switch workspace (alias: `/ws`)

## Custom Commands

### Command Studio

Access the Command Studio:
1. Click the **Commands** tab in the bottom panel
2. Or use `/commands` in Claude
3. Or press **Cmd/Ctrl + Shift + C** (coming soon)

### Creating Custom Commands

#### 1. Basic Command
```yaml
name: review
description: Review code for best practices
argument-hint: <file or directory>
---
Review the code in {{ args }} and provide feedback on:
1. Code quality and best practices
2. Potential bugs or issues
3. Performance considerations
```

#### 2. Command with Tools
```yaml
name: test
description: Generate tests for code
allowed-tools:
  - read_file
  - write_file
---
Generate comprehensive unit tests for {{ args }}.
Use the appropriate testing framework.
```

#### 3. Command with Bash Execution
```yaml
name: status
description: Show git and project status
---
!git status --short
!npm list --depth=0

Analyze the above status and suggest next steps.
```

#### 4. Command with File Inclusion
```yaml
name: review-pr
description: Review pull request changes
---
@.git/COMMIT_EDITMSG
!git diff --cached

Review these changes for the pull request.
```

### Command Syntax

#### Placeholders
- `{{ args }}` - All arguments passed to the command
- `{{ arg1 }}`, `{{ arg2 }}` - Individual arguments
- `$1`, `$2` - Alternative syntax for arguments

#### Special Operators
- `!command` - Execute bash command and include output
- `@file.txt` - Include contents of a file
- `{{ VAR }}` - Environment variable substitution

### File Organization

Commands are stored in:
- **Project**: `.claude/commands/` in your project
- **Personal**: `~/.claude/commands/` in home directory

#### Categories via Subdirectories
```
.claude/commands/
├── dev/
│   ├── review.md
│   └── test.md
├── git/
│   ├── commit.md
│   └── pr.md
└── docs/
    └── generate.md
```

Use commands with categories: `/git/commit`, `/dev/review`

## Advanced Examples

### 1. Smart Commit Command
```yaml
name: commit
description: Create a smart git commit
allowed-tools:
  - run_bash_command
---
!git diff --cached
!git status --short

Based on the changes above, create a conventional commit message.
Then use run_bash_command to commit with that message.
```

### 2. API Documentation Generator
```yaml
name: api-docs
description: Generate API documentation
argument-hint: <controller-file>
allowed-tools:
  - read_file
  - write_file
---
Read {{ args }} and generate OpenAPI documentation.
Consider:
- All endpoints
- Request/response schemas
- Authentication requirements
- Error responses

Save the documentation to docs/api/{{ arg1 }}.yml
```

### 3. Refactoring Assistant
```yaml
name: refactor
description: Suggest refactoring improvements
argument-hint: <file>
allowed-tools:
  - read_file
---
Analyze {{ args }} for refactoring opportunities:

1. Code smells
2. Design pattern applications
3. Performance improvements
4. Testability enhancements

Provide specific before/after examples.
```

### 4. Security Audit
```yaml
name: security
description: Security audit for code
allowed-tools:
  - read_file
  - search_files
---
!grep -r "password\|secret\|key\|token" . --include="*.js" --include="*.ts"

Perform a security audit:
1. Check for exposed secrets
2. SQL injection vulnerabilities
3. XSS possibilities
4. Authentication bypasses
5. Dependency vulnerabilities
```

## Best Practices

### Naming Conventions
- Use lowercase with hyphens: `generate-docs`
- Be descriptive but concise
- Use categories for organization
- Avoid conflicts with built-in commands

### Writing Templates
1. Start with clear instructions
2. Use markdown formatting
3. Specify expected output format
4. Include examples when helpful
5. List edge cases to consider

### Tool Permissions
- Only request needed tools
- Be specific about file access
- Consider read-only vs write access
- Document why tools are needed

### Performance
- Avoid expensive bash commands
- Cache results when possible
- Use specific file paths
- Limit search scopes

## Command Discovery

### Listing Commands
- Type `/` to see suggestions
- Use `/help` for full list
- Check Command Studio for visual browser
- Project commands override personal ones

### Search and Filter
In Command Studio:
- Search by name or description
- Filter by category
- View by source (project/personal)
- See allowed tools at a glance

## Sharing Commands

### Export/Import
1. Commands are just markdown files
2. Share via git repositories
3. Copy to `.claude/commands/`
4. Maintain in version control

### Team Commands
1. Store in project's `.claude/commands/`
2. Commit to repository
3. Document in README
4. Use categories for organization

## Troubleshooting

### Command Not Found
1. Check spelling and case
2. Verify file exists in commands directory
3. Ensure `.md` extension
4. Check for category prefix

### Command Not Working
1. Test in Command Studio
2. Verify placeholder syntax
3. Check tool permissions
4. Test bash commands separately

### Performance Issues
1. Simplify complex commands
2. Reduce file operations
3. Optimize bash commands
4. Use specific file paths

## Tips and Tricks

### 1. Command Aliases
Create shorter versions:
```yaml
name: gp
description: Git pull and update
---
!git pull
!npm install
Update complete. Check for any conflicts.
```

### 2. Interactive Commands
Ask for clarification:
```yaml
name: create
description: Create a new component
---
What type of component would you like to create?
1. React functional component
2. Vue composition component
3. Web component

Please specify any props or features needed.
```

### 3. Chained Commands
Combine multiple operations:
```yaml
name: deploy
description: Full deployment process
---
!npm test
!npm run build
!git status

If all tests pass and build succeeds, 
guide me through deployment steps.
```

### 4. Context-Aware Commands
Use current context:
```yaml
name: explain
description: Explain current context
---
Based on our current conversation and the files
we've been working with, provide a summary of:
1. What we're trying to accomplish
2. Progress so far
3. Next steps
```

Remember: Custom commands are powerful tools for encoding your workflow. Start simple and evolve them as you discover patterns in your work!