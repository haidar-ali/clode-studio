# Task Management Instructions for Claude

## Overview
This project uses a structured task management system. All tasks should be tracked in the TASKS.md file using the format described below.

## Task Structure

Each task in TASKS.md should include the following metadata:

### Required Fields:
- **Content**: The task description
- **Status**: backlog | pending | in_progress | completed
- **Priority**: high | medium | low
- **Assignee**: Claude | User | Both
- **Type**: feature | bugfix | refactor | documentation | research

### Optional Fields:
- **ID**: A custom identifier for easy reference (e.g., TASK-001, AUTH-42)
- **Description**: Additional context or details about the task
- **Resources**: Linked resources including:
  - Files: Source files relevant to the task
  - Tasks: Related or dependent tasks (by ID)
  - Knowledge: Documentation or reference materials
  - Hooks: Relevant automation scripts
  - MCP: Tools or servers needed
  - Commands: CLI commands or scripts

## TASKS.md Format

```markdown
# Project Tasks

*This file is synced with Clode Studio and Claude's native TodoWrite system.*  
*Last updated: [timestamp]*

## Backlog ([count])

- [ ] **[Task Content]**
  - ID: FEAT-001
  - Assignee: Claude
  - Type: feature
  - Priority: low
  - Description: Future enhancement to consider
  - Resources: Task: AUTH-01, File: src/config.ts

## To Do ([count])

- [ ] **[Task Content]**
  - ID: API-003
  - Assignee: Claude
  - Type: feature
  - Priority: high
  - Description: Brief description of what needs to be done
  - Resources: File: src/api/users.ts, Task: AUTH-01, knowledge: API Guidelines

## In Progress ([count])

- [ ] **[Task Content]** ⏳
  - ID: BUG-007
  - Assignee: Claude
  - Type: bugfix
  - Priority: high
  - Description: Currently working on fixing the login validation
  - Resources: File: src/auth/login.ts, File: src/utils/validator.ts

## Completed ([count])

- [x] ~~[Task Content]~~
  - ~~ID: AUTH-01~~
  - ~~Assignee: Claude~~
  - ~~Type: feature~~
  - ~~Priority: medium~~
  - ~~Description: Implemented user authentication~~
  - ~~Resources: File: src/auth/*, File: src/middleware/auth.ts~~
```

## Important Rules for Claude

### 1. Task Creation
- **ALWAYS** create tasks in TASKS.md when you use TodoWrite
- Include all required metadata (assignee, type, priority)
- Consider adding an ID for easy reference in resources
- Add helpful descriptions for future reference
- Link relevant resources (files, other tasks, knowledge, etc.)

### 2. Task Updates
- Move tasks between sections as you work on them:
  - Ideas & future work → Keep in "Backlog"
  - Ready to work → Move to "To Do"
  - Start work → Move to "In Progress" with ⏳ emoji
  - Complete work → Move to "Completed" with strikethrough
- Update the task counts in section headers
- Keep descriptions updated with progress

### 3. Task Types
- **feature**: New functionality or enhancements
- **bugfix**: Fixing errors or issues
- **refactor**: Code improvements without changing functionality
- **documentation**: Updates to docs, comments, or README files
- **research**: Investigation or exploration tasks

### 4. Priority Guidelines
- **high**: Critical tasks, blockers, or urgent fixes
- **medium**: Important but not blocking other work
- **low**: Nice-to-have improvements or optimizations

### 5. Assignee Guidelines
- **Claude**: Tasks you will handle autonomously
- **User**: Tasks requiring user input or decisions
- **Both**: Collaborative tasks needing both parties

### 6. Resource Linking
- **Files**: Use relative paths from project root
- **Tasks**: Reference by ID (e.g., Task: AUTH-01)
- **Knowledge**: Reference by title or category
- **MCP/Commands**: Reference by name
- Tasks can link to other tasks as dependencies or related work

## Best Practices

1. **Be Specific**: Write clear, actionable task descriptions
2. **Track Progress**: Update status as soon as you start or finish
3. **Group Related**: Keep similar tasks together
4. **Clean Regularly**: Archive very old completed tasks periodically
5. **Communicate**: Note blockers or issues in descriptions

## Integration with IDE

The Clode Studio will:
- Automatically detect changes to TASKS.md
- Update the visual Kanban board in real-time
- Allow drag-and-drop task management
- Sync bidirectionally with your TodoWrite system

## Example Task Creation

When asked to implement a new feature:
```
User: "Add a search functionality to the user list"

Claude should create in TASKS.md:
- [ ] **Add search functionality to user list**
  - ID: FEAT-023
  - Assignee: Claude
  - Type: feature
  - Priority: medium
  - Description: Implement real-time search filtering for the user list component
  - Resources: File: src/components/UserList.tsx, File: src/hooks/useSearch.ts, Task: UI-001
```

Remember: Good task management helps maintain project clarity and progress visibility!