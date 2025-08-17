# Task Management Instructions for Claude

## Overview
This project uses a hierarchical task management system with Epics, Stories, and Tasks. All work should be tracked in TASKS.md using the formats described below.

## Hierarchy Structure

### Epic → Story → Task
```
Epic (High-level business feature)
  └── Story (User-facing capability)
       └── Task (Technical implementation unit)
```

## Epic Structure

An **Epic** represents a large feature or business initiative that spans multiple sprints.

### Epic Fields:
- **Title**: Descriptive name of the epic
- **Status**: backlog | ready | in_progress | blocked | review | done | cancelled
- **Priority**: low | normal | high | critical
- **Business Value**: Clear statement of business benefit
- **Acceptance Criteria**: List of measurable success criteria
- **Stories**: Child stories that implement the epic

### Epic Example:
```markdown
### User Authentication System
- **Status**: in_progress
- **Priority**: critical
- **Business Value**: Enable secure user access and personalized experiences
- **Acceptance Criteria**:
  - Users can register with email/password
  - Users can log in and maintain sessions
  - Password reset functionality available
  - Session management is secure
```

## Story Structure

A **Story** represents a user-facing feature within an epic, typically completable in one sprint.

### Story Fields:
- **Title**: Feature name from user perspective
- **Status**: backlog | ready | in_progress | blocked | review | done | cancelled
- **Priority**: low | normal | high | critical
- **User Story**: "As a [user], I want [feature], so that [benefit]"
- **Acceptance Criteria**: Specific testable requirements
- **Dependencies**: Other stories that must complete first
- **Tasks**: Technical tasks to implement the story

### Story Example:
```markdown
#### User Registration
- **Status**: ready
- **Priority**: high
- **User Story**: As a new user, I want to create an account, so that I can access personalized features
- **Acceptance Criteria**:
  - Email validation implemented
  - Password strength requirements enforced
  - Confirmation email sent
  - Duplicate email prevention
- **Dependencies**: Database schema setup
- **Tasks**: 5 tasks
```

## Task Structure

A **Task** is a specific technical work item, typically completable in hours or a day.

### Required Task Fields:
- **Content**: The task description
- **Status**: backlog | pending | in_progress | completed
- **Priority**: high | medium | low
- **Assignee**: Claude | User | Both
- **Type**: feature | bugfix | refactor | documentation | research

### Optional Task Fields:
- **ID**: Custom identifier (e.g., AUTH-001)
- **Epic**: Parent epic reference
- **Story**: Parent story reference
- **Description**: Additional context
- **Dependencies**: Task IDs that must complete first
- **Estimated Effort**: Story points or hours
- **Resources**: Linked files, knowledge, commands, etc.

## TASKS.md Format

```markdown
# Project Tasks

*This file is synced with Clode Studio and supports Epic/Story/Task hierarchy.*
*Last updated: [timestamp]*

## Epics (2)

### User Authentication System
- **Status**: in_progress
- **Priority**: critical
- **Business Value**: Enable secure user access
- **Acceptance Criteria**:
  - Users can register and login
  - Sessions are secure
  - Password reset available

#### Stories:
- **User Registration** (ready)
  - User Story: As a new user, I want to create an account
  - Tasks: 5
- **User Login** (in_progress)
  - User Story: As a user, I want to log in securely
  - Tasks: 3

### Payment Processing
- **Status**: backlog
- **Priority**: high
- **Business Value**: Enable monetization
...

## Backlog (8)

- [ ] **Design database schema**
  - ID: DB-001
  - Epic: User Authentication System
  - Story: User Registration
  - Assignee: Claude
  - Type: feature
  - Priority: high
  - Description: Create user table with necessary fields
  - Dependencies: None
  - Resources: File: docs/db-design.md

## To Do (5)

- [ ] **Implement email validation**
  - ID: AUTH-002
  - Epic: User Authentication System
  - Story: User Registration
  - Assignee: Claude
  - Type: feature
  - Priority: high
  - Dependencies: DB-001
  - Resources: File: src/validators.ts

## In Progress (2)

- [ ] **Create login form component** ⏳
  - ID: UI-003
  - Epic: User Authentication System
  - Story: User Login
  - Assignee: Claude
  - Type: feature
  - Priority: high
  - Description: Building React login form with validation

## Completed (12)

- [x] ~~Setup project structure~~
  - ~~ID: INIT-001~~
  - ~~Assignee: Claude~~
  - ~~Type: feature~~
  - ~~Priority: high~~
```

## Workflow Rules for Claude

### 1. Epic Creation
- Create epics for major features requiring multiple stories
- Include clear business value and acceptance criteria
- Break down into manageable stories immediately
- Track overall progress through story completion

### 2. Story Management
- Create stories that deliver user value
- Write clear user stories in standard format
- Define specific, testable acceptance criteria
- Identify dependencies between stories
- Decompose into concrete technical tasks

### 3. Task Creation Rules
- **ALWAYS** link tasks to their parent story/epic when applicable
- Include all required metadata (assignee, type, priority)
- Add dependencies for proper sequencing
- Estimate effort when possible
- Link relevant resources

### 4. Status Progression

#### Epic Status Flow:
```
backlog → ready → in_progress → review → done
                      ↓
                   blocked
```

#### Task Status Flow:
```
backlog → pending → in_progress → completed
```

### 5. Priority Guidelines

#### Epic/Story Priority:
- **critical**: Core functionality, blockers
- **high**: Important features, next sprint
- **normal**: Standard features
- **low**: Nice-to-have, future consideration

#### Task Priority:
- **high**: Blocking other work, urgent
- **medium**: Important but not blocking
- **low**: Optimizations, nice-to-haves

### 6. Dependency Management
- Explicitly list task/story dependencies
- Ensure dependencies complete before starting
- Update dependency chains when requirements change
- Alert on circular dependencies

### 7. Agent Integration
When using the Agent Orchestration system:
- Epics automatically create pipelines
- Stories map to agent sequences
- Tasks trigger specific agent actions
- Progress syncs bidirectionally

## Best Practices

### Epic Management
1. Keep epics focused on single business objective
2. Limit to 3-5 stories per epic
3. Review and update acceptance criteria regularly
4. Close epics when all stories complete

### Story Breakdown
1. Stories should be completable in one sprint
2. Each story delivers user value independently
3. Acceptance criteria must be testable
4. Include non-functional requirements

### Task Execution
1. One task in progress at a time
2. Update status immediately when starting/completing
3. Log blockers in description
4. Link actual files modified

### Hierarchy Benefits
- **Visibility**: See how tasks contribute to larger goals
- **Planning**: Better effort estimation and scheduling
- **Tracking**: Monitor progress at multiple levels
- **Context**: Understand why work is being done

## Integration with Clode Studio

The IDE automatically:
- Syncs epic/story/task hierarchy
- Updates Kanban board with relationships
- Connects to Agent Orchestration for execution
- Tracks progress across all levels
- Generates reports and metrics

## Example: Creating a New Feature

```markdown
User: "Add a shopping cart feature to the e-commerce site"

Claude should create:

### Epic: Shopping Cart System
- **Status**: ready
- **Priority**: high
- **Business Value**: Enable users to purchase multiple items
- **Acceptance Criteria**:
  - Users can add/remove items
  - Cart persists across sessions
  - Checkout process works

#### Story: Add to Cart
- **User Story**: As a shopper, I want to add items to my cart
- **Tasks**:
  - [ ] **Create cart data model** (ID: CART-001)
  - [ ] **Implement add to cart API** (ID: CART-002)
  - [ ] **Build add to cart UI button** (ID: CART-003)

#### Story: Cart Management
- **User Story**: As a shopper, I want to view and modify my cart
...
```

## Reporting and Metrics

Track at each level:
- **Epic**: Overall feature progress, story completion rate
- **Story**: Task burndown, acceptance criteria met
- **Task**: Time to completion, blocker frequency

## Tips for Success

1. **Think hierarchically**: Start with business value (epic), break into user value (stories), then technical work (tasks)
2. **Maintain relationships**: Always link tasks to stories and epics
3. **Update regularly**: Keep status current across all levels
4. **Communicate blockers**: Note impediments immediately
5. **Celebrate completion**: Mark done at all levels when complete

Remember: Good task hierarchy provides clarity on what to build, why it matters, and how pieces connect!