# Multi-Agent Orchestration System for Clode Studio

## Overview

A production-ready multi-agent orchestration system that integrates Claude Code as the primary Developer agent within Clode Studio. The system features intelligent provider routing, isolated execution environments, comprehensive monitoring, and automatic cost control.

## Key Features

### 🤖 Multi-Agent Architecture
- **Task Master**: Orchestrates overall execution and agent handoffs
- **Architect**: Designs system architecture and high-level solutions  
- **Developer** (Claude Code): Implements code changes with SDK/CLI dual-mode execution
- **QA**: Tests and validates implementations
- **KB Builder**: Extracts and documents learned patterns

### 🔄 Intelligent Provider Routing
- **Multi-provider support**: Anthropic (Claude) and OpenAI (GPT) with easy extensibility
- **Deterministic fallback**: Automatic failover with exclusion tracking
- **Cost optimization**: Smart routing based on budget and capabilities
- **Rate limiting**: Token (TPM) and request (RPM) dual limiters
- **Circuit breakers**: Prevents cascade failures

### 🏗️ Safe Execution Environment
- **Git worktrees**: Isolated branches for each agent execution
- **Atomic operations**: JSON-safe state persistence with checksums
- **Rollback support**: Stash and snapshot capabilities
- **Process isolation**: No global state mutations

### 📊 Monitoring & Observability
- **OpenTelemetry integration**: Full metrics and tracing support
- **Cost tracking**: Real-time budget enforcement
- **Alert system**: Threshold-based notifications
- **Route decisions**: Complete audit trail

### 💾 State Management
- **Pipeline State Machine**: Manages execution flow with pause/resume
- **Idempotent operations**: Cached outputs prevent duplicate work
- **Approval gates**: Human-in-the-loop for critical decisions
- **Error recovery**: Automatic retry with exponential backoff

## Installation

```bash
# Install dependencies
npm install zod js-yaml execa fs-extra diff @anthropic-ai/sdk openai

# Set up environment variables
export ANTHROPIC_API_KEY="your-anthropic-key"
export OPENAI_API_KEY="your-openai-key"

# Optional: OpenTelemetry endpoint
export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4318"
```

## Configuration

Edit `.claude/agents/config/providers.yaml`:

```yaml
routing:
  default:
    type: byAgent
    map:
      developer:
        provider: anthropic
        model: claude-code
      qa:
        provider: openai
        model: gpt-4-turbo

limits:
  perProvider:
    anthropic:
      rpm: 300
      tpm: 500000
      dailyBudgetUSD: 50
```

## Usage

### Basic Task Processing

```typescript
import { AgentOrchestrationSystem } from './agents';

const orchestrator = new AgentOrchestrationSystem('/path/to/workspace');
await orchestrator.initialize();

const task = {
  id: 'task-123',
  title: 'Implement user authentication',
  description: 'Add JWT-based auth to the API',
  priority: 'high'
};

const result = await orchestrator.processTask(task, {
  maxCost: 5.00,  // Maximum $5 for this task
  skipApprovals: false,
  agents: ['architect', 'developer', 'qa'] // Specific agents to run
});

console.log(`Task completed: ${result.status}`);
console.log(`Total cost: $${result.metrics.totalCost}`);
```

### Developer Agent Direct Execution

```typescript
const devRequest = {
  planStepId: 'step-1',
  objective: 'Add user registration endpoint',
  repoSummary: 'Express.js API with PostgreSQL',
  targetFiles: ['src/routes/auth.ts', 'src/models/user.ts'],
  constraints: ['Use bcrypt for passwords', 'Include email validation'],
  tests: [{
    command: 'npm test -- auth.test.ts',
    successRegex: 'All tests passed'
  }]
};

const result = await orchestrator.executeAgent('developer', devRequest);
console.log('Changes:', result.patch);
console.log('Test results:', result.testRun);
```

### Pipeline Management

```typescript
// Get system status
const status = await orchestrator.getStatus();
console.log(`Active pipelines: ${status.pipelines.length}`);
console.log(`Daily budget remaining: $${status.budget.daily.remaining}`);

// Resume a paused pipeline
await orchestrator.resumePipeline('pipeline-task-123-abc');

// Approve a waiting pipeline
await orchestrator.approvePipeline('pipeline-task-456-def', true, 'Looks good');
```

## Architecture

```
┌──────────────────────────────────────────────┐
│             Task Input                       │
└────────────────┬─────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────┐
│          Pipeline State Machine              │
│  • Manages execution flow                    │
│  • Persists state atomically                 │
│  • Handles retries and failures              │
└────────────────┬─────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────┐
│            LLM Router                        │
│  • Selects provider/model                    │
│  • Enforces rate limits                      │
│  • Manages fallbacks                         │
└────────────────┬─────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────┐
│         Agent Execution                      │
│  ┌─────────────────────────────┐            │
│  │  Developer (Claude Code)     │            │
│  │  • SDK or CLI mode           │            │
│  │  • Isolated worktree         │            │
│  │  • Tool support              │            │
│  └─────────────────────────────┘            │
└────────────────┬─────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────┐
│          Monitoring & Snapshots              │
│  • OpenTelemetry metrics                     │
│  • Cost tracking                             │
│  • Output snapshots                          │
└──────────────────────────────────────────────┘
```

## File Structure

```
/agents/
  /orchestrator/
    pipeline-state-machine.ts   # State management
    router.ts                    # Provider routing
    rate-limiter.ts             # Token/request limiting
    circuit-breaker.ts          # Failure protection
    
  /providers/
    types.ts                    # Common interfaces
    registry.ts                 # Provider management
    anthropic.ts                # Claude integration
    openai.ts                   # GPT integration
    
  /developer/
    claude-code-executor.ts     # Developer agent implementation
    /prompts/
      developer.system.md       # System prompts
      
  /worktrees/
    manager.ts                  # Git worktree management
    
  index.ts                      # Main entry point
  
/.claude/agents/config/
  providers.yaml                # Provider configuration
```

## Production Considerations

### Security
- API keys stored in environment variables
- Path validation prevents directory traversal
- Worktree isolation prevents main branch corruption
- Secret redaction in snapshots

### Performance
- Token estimation with caching
- Parallel agent execution support
- Efficient state persistence
- Circuit breakers prevent API hammering

### Cost Control
- Daily and per-execution budget limits
- Real-time cost tracking
- Automatic routing to cheaper models
- Alert system for budget warnings

### Reliability
- Automatic retries with exponential backoff
- Deterministic fallback providers
- State recovery from snapshots
- Graceful degradation

## Development Status

### ✅ Completed
- Core orchestration system
- Provider abstraction layer
- Pipeline state machine
- LLM router with fallback
- Worktree manager
- Configuration system
- Claude Code executor (SDK/CLI)

### 🚧 In Progress
- OpenTelemetry monitoring
- Context budgeter
- Agent snapshot service
- Knowledge validation workflow

### 📋 Planned
- UI components
- Test suite
- Performance optimizations
- Additional provider support

## Testing

```bash
# Run unit tests
npm test agents/

# Run integration tests
npm run test:integration

# Test provider connectivity
npm run test:providers
```

## Troubleshooting

### Common Issues

**Provider validation fails**
- Check API keys are set correctly
- Verify network connectivity
- Ensure sufficient API credits

**Budget exceeded errors**
- Check daily limits in config
- Review cost tracking with `getStatus()`
- Adjust routing policies

**Worktree conflicts**
- Run cleanup: `orchestrator.shutdown()`
- Check for locked worktrees
- Verify Git repository state

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for development guidelines.

## License

Part of Clode Studio - see main project license.