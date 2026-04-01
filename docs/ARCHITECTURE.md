# System Architecture

## Overview

Catangent is a multi-agent game system with asymmetric information flow. The architecture separates concerns into distinct layers: orchestration, agent execution, game logic, and policy validation.

## Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Orchestration Layer                            │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      Game Master Agent                           │   │
│  │  - Turn sequencing          - State management                   │   │
│  │  - Broadcast generation     - Cheat resolution                   │   │
│  │  - Whisper handling         - Victory detection                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                            Agent Layer                                   │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────┐ │
│  │  Claude   │  │   GPT-4   │  │  Gemini   │  │   Llama   │  │Mistral│ │
│  │  Agent    │  │   Agent   │  │  Agent    │  │   Agent   │  │ Agent │ │
│  └───────────┘  └───────────┘  └───────────┘  └───────────┘  └───────┘ │
│        │              │              │              │             │     │
│        └──────────────┴──────────────┴──────────────┴─────────────┘     │
│                                    │                                     │
│                            OpenRouter API                                │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           Game Logic Layer                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │    Board    │  │  Resources  │  │   Actions   │  │   Trades    │    │
│  │    State    │  │   Manager   │  │   Handler   │  │   Engine    │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          Validation Layer                                │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      OPA/Rego Engine                             │   │
│  │  ┌─────────────────┐              ┌─────────────────┐           │   │
│  │  │   HARD Rules    │              │   SOFT Rules    │           │   │
│  │  │  (Auto-reject)  │              │  (Log & Allow)  │           │   │
│  │  └─────────────────┘              └─────────────────┘           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

## Game Master Agent

The Game Master (GM) is the authoritative source of truth and orchestrates all game flow.

### Responsibilities

1. **State Management**
   - Maintains canonical game state
   - Tracks all player resources, buildings, cards
   - Records complete action history

2. **Turn Sequencing**
   - Manages turn order
   - Enforces phase transitions (roll → trade → build → end)
   - Handles special phases (setup, robber, etc.)

3. **Information Distribution**
   - Generates public broadcast messages
   - Applies attention-based filtering per agent
   - Handles private whispers (cheat declarations)

4. **Cheat Resolution**
   - Receives secret cheat declarations
   - Processes accusations
   - Applies cheat outcomes (success/caught)

### GM State Schema

```typescript
interface GameMasterState {
  // Canonical game state
  board: BoardState;
  players: Map<PlayerId, PlayerState>;
  turnOrder: PlayerId[];
  currentTurn: number;
  phase: GamePhase;

  // History (GM has perfect recall)
  actionLog: Action[];
  tradeLog: Trade[];
  cheatLog: CheatRecord[];  // Secret, never broadcast

  // Attention tracking
  attentionAllocations: Map<PlayerId, AttentionAllocation>;
}

interface PlayerState {
  resources: ResourceCounts;
  buildings: Building[];
  developmentCards: DevCard[];
  victoryPoints: number;
  cheatTokens: number;
  pendingCheats: PendingCheat[];
}
```

## Player Agents

Each player agent runs as an independent process with its own LLM backend.

### Agent Interface

```typescript
interface PlayerAgent {
  // Identity
  id: PlayerId;
  model: 'claude' | 'gpt-4' | 'gemini' | 'llama' | 'mistral';

  // State (agent's view, not canonical)
  perceivedState: PerceivedState;
  privateState: PrivateState;

  // Actions
  decideTurn(context: TurnContext): Promise<TurnDecision>;
  allocateAttention(): Promise<AttentionAllocation>;
  respondToTrade(offer: TradeOffer): Promise<TradeResponse>;
  considerAccusation(): Promise<Accusation | null>;
}

interface TurnDecision {
  actions: GameAction[];
  cheats?: CheatDeclaration[];  // Whispered to GM
}
```

### Agent Context Window

Each agent receives a filtered view of the game:

```typescript
interface TurnContext {
  // Always available
  ownResources: ResourceCounts;
  ownBuildings: Building[];
  ownDevCards: DevCard[];
  boardState: BoardState;  // Public, always visible

  // Attention-filtered
  recentActions: FilteredAction[];     // Per-player attention
  opponentInfo: FilteredOpponentInfo[]; // Per-player attention

  // Meta
  turnNumber: number;
  victoryPointStandings: VPStandings;  // Public
}
```

## Information Flow

### Message Types

| Type | Direction | Visibility | Purpose |
|------|-----------|------------|---------|
| Broadcast | GM → All | Filtered by attention | Game events |
| Private | GM → One | Full fidelity | Own state, trade offers |
| Whisper | One → GM | GM only | Cheat declarations |
| Accusation | One → All | Public | Cheat accusations |

### Attention Filtering Pipeline

```
                 Raw Event
                     │
                     ▼
           ┌─────────────────┐
           │  Event Type?    │
           └─────────────────┘
                     │
        ┌────────────┼────────────┐
        │            │            │
        ▼            ▼            ▼
    Spatial      Resource      Action
    (Public)     (Hidden)      (Mixed)
        │            │            │
        │            ▼            ▼
        │    ┌─────────────┐    ┌─────────────┐
        │    │  Attention  │    │  Attention  │
        │    │  Threshold  │    │  Threshold  │
        │    └─────────────┘    └─────────────┘
        │            │            │
        │      ┌─────┴─────┐      │
        │      │           │      │
        │      ▼           ▼      │
        │   Filter      Fuzz     │
        │   Out         Details  │
        │      │           │      │
        └──────┴─────┬─────┴──────┘
                     │
                     ▼
             Filtered Event
```

## Validation Layer

### OPA Integration

```typescript
interface PolicyEngine {
  // Validate before applying action
  validateAction(
    action: GameAction,
    state: GameState
  ): Promise<ValidationResult>;
}

interface ValidationResult {
  allowed: boolean;
  hardViolations: Violation[];    // Blocks action
  softViolations: Violation[];    // Logs, allows action
}
```

### Rule Categories

**HARD Rules** (Auto-reject)
- Settlement spacing (2+ edges away)
- Road connectivity (must connect to own network)
- Resource sufficiency (can't spend what you don't have)
- Turn order (can't act out of turn)

**SOFT Rules** (Log, potential cheat)
- Multiple builds per turn
- Extra resources appearing
- Dev card played twice
- Robber not moved after 7

## State Synchronization

### Eventual Consistency Model

The GM maintains authoritative state. Agent perceived states may lag or diverge due to:
- Attention filtering
- Successful cheats (hidden state modifications)
- Inference errors by agents

```
GM State (authoritative)
    │
    ├── Agent 1 Perceived State (filtered)
    │       └── May believe incorrect resource counts
    │
    ├── Agent 2 Perceived State (filtered)
    │       └── May have missed actions
    │
    └── Agent N Perceived State (filtered)
            └── May not know about cheat
```

### Reconciliation

Agents must infer true state from:
1. Their own actions (known)
2. Attention-filtered observations
3. Board state changes (always visible)
4. Victory point announcements
5. Behavioral patterns (meta-gaming)

## Process Model

```
┌────────────────────────────────────────────────────────────────┐
│                        Main Process                             │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   Game Master Agent                       │  │
│  │              (Claude Agent SDK runtime)                   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                  │
│              ┌───────────────┼───────────────┐                 │
│              │               │               │                 │
│              ▼               ▼               ▼                 │
│  ┌─────────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │  Agent Process  │  │   Agent     │  │   Agent     │        │
│  │  (via OpenRouter)│  │  Process   │  │  Process    │  ...   │
│  └─────────────────┘  └─────────────┘  └─────────────┘        │
└────────────────────────────────────────────────────────────────┘
```

Each agent call is a separate API request to OpenRouter, which routes to the appropriate model provider.

## Error Handling

### Agent Timeout
- 30-second timeout per agent turn decision
- On timeout: random valid action selected
- Logged for analysis

### Invalid Action
- HARD violation: action rejected, agent must retry (max 3)
- After 3 failures: turn skipped

### API Failures
- Exponential backoff retry (2s, 4s, 8s, 16s)
- After 4 failures: agent plays predetermined safe strategy

## Extensibility Points

1. **New Agents**: Implement `PlayerAgent` interface, add to roster
2. **New Rules**: Add Rego policies, categorize as HARD/SOFT
3. **New Cheats**: Add to taxonomy, update detection logic
4. **New Metrics**: Hook into action log for analysis
