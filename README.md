# Catangent

**Multi-Agent Settlers of Catan with Information Asymmetry and Strategic Deception**

A research project exploring multi-agent coordination, theory of mind, and strategic deception through a modified Settlers of Catan implementation featuring 5 competing LLM agents.

## The Experiment

What happens when you put Claude, GPT-4, Gemini, Llama, and Mistral at a Catan table—and let them cheat?

This project implements:
- **Attention-based perception**: Agents must allocate limited attention across opponents
- **Information asymmetry**: Each agent sees a different filtered view of the game
- **Legitimate cheating**: A formal cheat system with detection and accusation mechanics
- **Policy-based validation**: OPA/Rego for two-tier rule enforcement

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Game Master Agent                       │
│  - Authoritative state    - Broadcast filtering              │
│  - Move validation        - Cheat resolution                 │
└─────────────────────────────────────────────────────────────┘
          │                    │                    │
          ▼                    ▼                    ▼
    ┌──────────┐        ┌──────────┐        ┌──────────┐
    │  Claude  │        │  GPT-4   │        │  Gemini  │
    │  Agent   │◄──────►│  Agent   │◄──────►│  Agent   │
    └──────────┘        └──────────┘        └──────────┘
          │                    │                    │
          ▼                    ▼                    ▼
    ┌──────────┐        ┌──────────┐
    │  Llama   │◄──────►│ Mistral  │
    │  Agent   │        │  Agent   │
    └──────────┘        └──────────┘

    ◄────────► Public broadcast (attention-filtered)
         │     Private whisper (GM only)
```

## Attention Model

Each agent has **1.0 attention units** per turn to distribute across players and board regions:

| Attention | Perception Level |
|-----------|------------------|
| 0.0 | Nothing (Snapchat mode) |
| 0.1 | "Did stuff" (action count only) |
| 0.3 | Partial ("built something", "traded with someone") |
| 0.5 | Most actions, vague quantities |
| 0.7 | Full actions, approximate resource flow |
| 1.0 | Perfect recall, exact counts |

Strategic implications:
- Watch someone closely → catch their cheats
- Spread attention thin → general awareness, miss details
- Cheat when opponents' attention is elsewhere

## Cheat System

### Token Types
- **2 Declared Tokens**: Whisper to GM, guaranteed success
- **Undeclared Attempts**: No token cost, risk detection

### Cheat Taxonomy

| Category | Examples |
|----------|----------|
| **Resource** | Inflation, robber dodge, trade shortchange |
| **Information** | Peek hand, peek dev cards, peek dice |
| **Action** | Extra build, extra trade, skip discard, double dev card |

### Payoffs
- Successful undetected cheat → free advantage
- Correct accusation → +1 VP for accuser
- Wrong accusation → accuser loses turn
- Caught cheating → lose turn

## Rego Two-Tier Validation

```rego
# HARD rules - Auto-reject, no exceptions
deny[msg] {
    input.action == "build_settlement"
    not valid_settlement_spacing(input.location)
    msg := "Settlement too close to existing settlement"
}

# SOFT rules - Log but don't block (potential cheats)
soft_violation[msg] {
    input.action == "build"
    already_built_this_turn
    msg := "Multiple builds in single turn"
}
```

## Research Questions

1. **Summarization**: Can agents maintain accurate compressed game history?
2. **Theory of Mind**: Do agents model what other agents know?
3. **State Tracking**: How well do agents track state under perceptual noise?
4. **Attention Strategy**: What attention patterns emerge?
5. **Deception Detection**: Can agents identify cheaters from behavioral patterns?
6. **Risk Calibration**: Do agents appropriately calibrate cheat/accuse decisions?

## Getting Started

```bash
# Clone and install
git clone https://github.com/your-org/catangent.git
cd catangent
pnpm install

# Configure API keys
cp .env.example .env
# Add OPENROUTER_API_KEY, ANTHROPIC_API_KEY

# Run a game
pnpm run game
```

## Documentation

### Core Systems
- [Architecture](docs/ARCHITECTURE.md) - System design deep dive
- [Roadmap](docs/ROADMAP.md) - Implementation phases
- [GM Authority](docs/GM_AUTHORITY.md) - What the Game Master controls

### Game Mechanics
- [Attention Model](docs/ATTENTION_MODEL.md) - Perception mechanics
- [Cheat System](docs/CHEAT_SYSTEM.md) - Deception mechanics
- [Trade System](docs/TRADE_SYSTEM.md) - Resource exchange (no promises!)
- [Rego Policies](docs/REGO_POLICIES.md) - Rule validation

### Agent Design
- [Agent Protocols](docs/AGENT_PROTOCOLS.md) - Communication spec
- [Agent Reasoning](docs/AGENT_REASONING.md) - Thinking, planning, playback

## Tech Stack

- **Runtime**: Node.js + TypeScript
- **Agent SDK**: Claude Agent SDK
- **LLM Router**: OpenRouter
- **Policy Engine**: Open Policy Agent (OPA)
- **Testing**: Vitest

## License

MIT - See [LICENSE](LICENSE)
