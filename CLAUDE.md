# Catangent - Multi-Agent Settlers of Catan

## Project Overview

This is a multi-agent AI research project implementing Settlers of Catan with 5 competing LLM agents and sophisticated game mechanics including attention-based information asymmetry, cheating detection, and policy-based move validation.

## Quick Start

```bash
# Install dependencies
pnpm install

# Run the game master
pnpm run gm

# Run tests
pnpm test
```

## Architecture Summary

- **5 Player Agents**: Claude, GPT-4, Gemini, Llama, Mistral (via OpenRouter)
- **1 Game Master Agent**: Maintains authoritative game state, filters information
- **OPA/Rego Engine**: Two-tier rule validation (HARD blocks, SOFT logs)

## Key Concepts

### Attention Model
Each agent has 1.0 attention per turn distributed across players/board. Attention allocation determines perception fidelity:
- `0.0` = nothing perceived
- `0.3` = partial info ("built something")
- `0.7` = full actions, approximate resources
- `1.0` = perfect recall

### Information Asymmetry
- **Public Broadcast**: Sent to all agents, filtered by individual attention
- **Private Context**: Per-agent state, resource cards, development cards
- **Secret Whisper**: Agent-to-GM only for cheat declarations

### Cheat Mechanic
- 2 guaranteed cheat tokens per player
- Undeclared cheats risk detection
- Correct accusations = +1 VP for accuser
- Wrong accusations = accuser loses turn

## Directory Structure

```
catangent/
├── src/
│   ├── agents/          # LLM agent implementations
│   ├── gm/              # Game Master logic
│   ├── game/            # Core game state & rules
│   ├── attention/       # Attention model & filtering
│   ├── cheats/          # Cheat system & detection
│   └── policies/        # Rego policy files
├── docs/                # Detailed documentation
├── tests/               # Test suites
└── config/              # Agent & game configuration
```

## Key Files

- `src/gm/game-master.ts` - Game Master agent orchestration
- `src/agents/base-agent.ts` - Base agent interface
- `src/attention/filter.ts` - Attention-based info filtering
- `src/policies/catan.rego` - OPA/Rego validation rules

## Documentation

### Core Systems
- `docs/ARCHITECTURE.md` - Full system architecture
- `docs/ROADMAP.md` - Implementation phases
- `docs/GM_AUTHORITY.md` - What the Game Master controls

### Game Mechanics
- `docs/ATTENTION_MODEL.md` - Perception and filtering
- `docs/CHEAT_SYSTEM.md` - Cheating and detection
- `docs/TRADE_SYSTEM.md` - Resource exchange (no promises!)
- `docs/REGO_POLICIES.md` - OPA rule validation

### Agent Design
- `docs/AGENT_PROTOCOLS.md` - Message formats and flow
- `docs/AGENT_REASONING.md` - Thinking, planning, playback

## Development Commands

```bash
pnpm run dev          # Development mode with hot reload
pnpm run build        # Build for production
pnpm run test         # Run test suite
pnpm run lint         # Lint codebase
pnpm run opa:test     # Test Rego policies
```

## Agent SDK Integration

Uses Claude Agent SDK for agent orchestration. Each player agent runs as an independent process with:
- Tool definitions for game actions
- Structured output for move declarations
- Context management for attention-filtered state

## Testing Focus Areas

1. **Summarization**: Can agents compress game history?
2. **Theory of Mind**: Do agents model other agents' knowledge?
3. **State Tracking**: Accurate resource/board tracking under noise?
4. **Attention Allocation**: Strategic attention distribution?
5. **Deception Detection**: Identifying cheaters from behavior?
6. **Risk Calibration**: Appropriate cheat/accuse decisions?

## Contributing

See `docs/CONTRIBUTING.md` for development guidelines.
