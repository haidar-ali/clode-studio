# Knowledge Base System Guide

## Overview

The Claude Code IDE Knowledge Base is an intelligent documentation system that allows you to create, organize, and maintain project-specific knowledge that Claude can reference during your coding sessions.

## Features

### 1. Markdown-Based Documentation
- Write documentation in Markdown with YAML frontmatter
- Organize entries by categories (Architecture, API, Patterns, Troubleshooting, Notes)
- Add tags for easy searching and filtering
- Set priority levels (high, medium, low)
- Link related files from your project

### 2. Intelligent Editor Integration
- **Autocomplete Support**:
  - `#` - Suggests existing tags
  - `[[` - Cross-references to other knowledge entries
  - `@` - Insert templates (coming soon)
- Syntax highlighting for Markdown
- Live preview of formatted content

### 3. Full-Text Search
- Powered by Lunr.js for fast client-side search
- Search across titles, content, tags, and categories
- Filter by tags or categories
- Weighted search (titles and tags have higher priority)

### 4. Seamless IDE Integration
- Double-click entry titles to edit inline
- Automatic switching to Full IDE mode for editing
- Metadata bar shows when editing knowledge files
- Changes reflect immediately in the knowledge panel

## Getting Started

### Creating Your First Entry

1. Click the **Knowledge** tab in the bottom panel
2. Click the **New** button
3. Enter a title and start writing your documentation
4. Add metadata:
   - **Category**: Choose from predefined categories
   - **Tags**: Add relevant tags for searchability
   - **Priority**: Set importance level
   - **Related Files**: Link to relevant project files

### File Storage

Knowledge entries are stored in:
- **Project**: `.claude/knowledge/` in your project root
- **Personal**: `~/.claude/knowledge/` in your home directory

### Using Knowledge in Claude Sessions

Claude automatically has access to your knowledge base and can:
- Search for relevant information when answering questions
- Reference documentation you've written
- Understand project-specific patterns and conventions
- Use your troubleshooting guides when debugging

### Best Practices

1. **Keep Entries Focused**: One topic per entry
2. **Use Descriptive Titles**: Make them searchable
3. **Tag Liberally**: More tags = better discoverability
4. **Update Regularly**: Keep documentation current
5. **Link Related Content**: Use `[[entry-name]]` syntax
6. **Document Decisions**: Record why, not just what

### Example Entry

```markdown
---
title: API Authentication Flow
category: architecture
tags: [auth, security, api, jwt]
priority: high
relatedFiles: 
  - /src/auth/middleware.ts
  - /src/auth/jwt-service.ts
---

# API Authentication Flow

Our API uses JWT-based authentication with refresh tokens.

## Flow Overview

1. User logs in with credentials
2. Server validates and returns access + refresh tokens
3. Access token expires after 15 minutes
4. Refresh token used to get new access token

## Implementation Details

[[JWT Service]] handles token generation and validation.

See `middleware.ts` for request authentication logic.
```

### Keyboard Shortcuts

- **Cmd/Ctrl + N**: Create new entry (when knowledge panel is focused)
- **Cmd/Ctrl + K**: Focus search
- **Double-click**: Edit entry title inline
- **Escape**: Cancel editing

### Tips

- Use the knowledge base for information Claude should "remember" between sessions
- Document error solutions as you encounter them
- Create entries for complex business logic
- Add architecture decisions and their rationale
- Include code examples in your entries

## Advanced Features

### Categories with Subdirectories

Organize complex knowledge bases using subdirectories:
```
.claude/knowledge/
├── api/
│   ├── authentication.md
│   └── endpoints.md
├── frontend/
│   ├── components.md
│   └── state-management.md
└── deployment/
    └── docker-setup.md
```

### Cross-References

Link between entries using double brackets:
- `[[Authentication Flow]]` - Links to another entry
- `[[api/endpoints]]` - Links to entry in subdirectory

### Templates (Coming Soon)

Create reusable templates with `@template-name` syntax for common documentation patterns.

## Integration with Claude

The knowledge base enhances Claude's understanding by:
- Providing project-specific context
- Reducing need to re-explain concepts
- Maintaining consistency across sessions
- Documenting decisions and rationale
- Creating a searchable project memory

Claude can query the knowledge base when you ask questions, making responses more accurate and project-specific.