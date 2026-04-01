# Game Master Authority

## Overview

The Game Master (GM) agent is the authoritative source of truth and the sole arbiter of the game. This document defines exactly what the GM controls, what it doesn't, and how it interacts with player agents.

## GM as Single Source of Truth

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            GAME MASTER                                  │
│                                                                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐         │
│  │  Canonical      │  │  Rule           │  │  Information    │         │
│  │  Game State     │  │  Enforcement    │  │  Distribution   │         │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘         │
│                                                                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐         │
│  │  Cheat          │  │  Victory        │  │  Turn           │         │
│  │  Resolution     │  │  Determination  │  │  Sequencing     │         │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
     ┌──────────────────────────────────────────────────────────┐
     │                    PLAYER AGENTS                         │
     │                                                          │
     │  Can: Request actions, Receive filtered state,           │
     │       Make decisions, Declare cheats, Accuse others      │
     │                                                          │
     │  Cannot: Modify state directly, See full state,          │
     │          Override GM decisions, Communicate privately    │
     └──────────────────────────────────────────────────────────┘
```

## What the GM Controls

### 1. Canonical Game State

**The GM maintains the one true game state. Period.**

```typescript
interface CanonicalState {
  // Board
  board: {
    hexes: Hex[];           // Resource tiles and numbers
    buildings: Building[];   // All settlements, cities
    roads: Road[];          // All roads
    robberLocation: HexId;  // Where robber sits
    ports: Port[];          // Trading ports
  };

  // Players
  players: Map<PlayerId, {
    resources: ResourceCounts;    // Exact counts
    developmentCards: DevCard[];  // All dev cards
    playedKnights: number;        // For largest army
    victoryPoints: number;        // Total VPs
    cheatTokens: number;          // Remaining tokens
  }>;

  // Bank
  bank: {
    resources: ResourceCounts;    // Remaining in bank
    developmentCards: DevCard[];  // Remaining dev cards
  };

  // Game flow
  turnOrder: PlayerId[];
  currentTurn: number;
  phase: GamePhase;
  winner: PlayerId | null;

  // Hidden from players
  cheatLog: CheatRecord[];        // All cheats attempted
  softViolations: Violation[];    // Rego soft violations
}
```

Player agents **never** modify this state directly. They request actions, GM validates and applies.

### 2. Rule Enforcement

**All rules flow through the GM.**

```typescript
// Player attempts action
const action = await player.decide();

// GM validates via Rego
const validation = await opa.evaluate({
  input: action,
  data: canonicalState
});

// GM decides outcome
if (validation.hardViolations.length > 0) {
  // REJECT - action doesn't happen
  return { rejected: true, reason: validation.hardViolations };
}

if (validation.softViolations.length > 0) {
  // LOG - action happens, but recorded
  logSoftViolation(action, validation.softViolations);
}

// APPLY - GM modifies state
applyAction(canonicalState, action);
```

### 3. Information Distribution

**GM decides who sees what.**

```typescript
interface InformationFlow {
  // Full state → GM only
  gmView: CanonicalState;

  // Filtered state → each player
  playerViews: Map<PlayerId, FilteredState>;
}

function generatePlayerView(
  player: PlayerId,
  state: CanonicalState,
  attention: AttentionAllocation
): FilteredState {
  return {
    // Own state: full fidelity
    ownResources: state.players.get(player).resources,
    ownDevCards: state.players.get(player).devCards,
    ownBuildings: getPlayerBuildings(state, player),

    // Board: always visible (spatial is public)
    board: state.board,

    // Others: filtered by attention
    opponents: state.players.entries()
      .filter(([id]) => id !== player)
      .map(([id, p]) => filterOpponent(p, attention.get(id))),

    // History: filtered by attention at time of event
    history: state.history.map(e => filterEvent(e, player, attention)),

    // Public info
    publicVPs: getPublicVPs(state),
    longestRoad: state.longestRoad,
    largestArmy: state.largestArmy,
  };
}
```

### 4. Cheat Resolution

**GM is the only entity that knows about cheats.**

```typescript
// Secret channel: player whispers to GM
async function handleWhisper(
  from: PlayerId,
  content: WhisperContent
): Promise<WhisperResponse> {

  if (content.type === 'cheat_declaration') {
    const { cheatType, details, useToken } = content;

    // Validate cheat is possible
    if (!isCheatPossible(cheatType, canonicalState, from)) {
      return { success: false, reason: 'Cheat not applicable' };
    }

    // Handle token usage
    if (useToken) {
      if (canonicalState.players.get(from).cheatTokens <= 0) {
        return { success: false, reason: 'No tokens remaining' };
      }
      canonicalState.players.get(from).cheatTokens--;
    }

    // Apply cheat effect to canonical state
    applyCheat(canonicalState, from, cheatType, details);

    // Log (never shared with players)
    canonicalState.cheatLog.push({
      turn: canonicalState.currentTurn,
      player: from,
      type: cheatType,
      details,
      tokenUsed: useToken,
      detected: false,
    });

    return { success: true };
  }
}
```

### 5. Victory Determination

**GM declares the winner.**

```typescript
function checkVictory(state: CanonicalState): PlayerId | null {
  for (const [playerId, player] of state.players) {
    if (player.victoryPoints >= 10) {
      return playerId;
    }
  }
  return null;
}

// Called after every action
const winner = checkVictory(canonicalState);
if (winner) {
  // Game ends immediately
  broadcastToAll({ type: 'game_over', winner });
}
```

### 6. Turn Sequencing

**GM controls the flow of the game.**

```typescript
class TurnController {
  async runTurn(player: PlayerId): Promise<void> {
    // 1. Announce turn start
    await this.broadcast({ type: 'turn_start', player });

    // 2. Collect attention allocation
    const attention = await this.collectAttention(player);

    // 3. Send filtered context
    const context = this.generateContext(player, attention);
    await this.sendPrivate(player, context);

    // 4. Pre-roll phase
    await this.runPhase('pre_roll', player);

    // 5. Roll and distribute
    const roll = this.rollDice();
    await this.handleDiceRoll(roll);

    // 6. Main phase
    await this.runPhase('main', player);

    // 7. End turn
    await this.endTurn(player);
  }

  // GM enforces phase transitions
  private assertPhase(expected: GamePhase): void {
    if (this.state.phase !== expected) {
      throw new Error(`Invalid phase: expected ${expected}, got ${this.state.phase}`);
    }
  }
}
```

## What the GM Does NOT Control

### 1. Agent Decisions

Agents make their own choices. GM cannot:
- Force an agent to take a specific action
- Modify agent reasoning
- Override agent tool calls (only reject invalid ones)

```typescript
// GM provides context, agent decides
const context = generatePlayerView(player, state, attention);
const decision = await agent.decide(context);  // Agent's choice

// GM can only accept or reject
if (isValidAction(decision)) {
  apply(decision);
} else {
  requestRetry(player);
}
```

### 2. Agent Internal State

Agents maintain their own:
- Reasoning traces
- Memory of past events
- Beliefs about other players
- Strategic plans

GM has no visibility into agent "thinking" beyond logged outputs.

### 3. External Communication

GM cannot prevent agents from having knowledge from:
- Model training data
- Previous games (if not isolated)
- Meta-knowledge about the game design

(This is handled by game design: attention filtering makes this knowledge less useful.)

### 4. Randomness Source

Dice rolls and development card shuffles use external RNG, not GM judgment.

```typescript
// GM uses deterministic seeded RNG for reproducibility
// But cannot choose specific outcomes
const rng = seedrandom(gameSeed);

function rollDice(): [number, number] {
  return [
    Math.floor(rng() * 6) + 1,
    Math.floor(rng() * 6) + 1
  ];
}
```

## GM Boundaries

### Things GM Must Do

| Responsibility | Why |
|---------------|-----|
| Maintain exact resource counts | Prevent inflation/deflation |
| Validate all spatial rules | Settlement spacing, road connectivity |
| Apply attention filtering | Core asymmetry mechanic |
| Keep cheat log secret | Enables cheat system |
| Enforce turn order | Prevents chaos |
| Announce public events | Players need information |

### Things GM Must NOT Do

| Prohibition | Why |
|-------------|-----|
| Leak private information | Breaks game theory |
| Favor any player | Fairness |
| Modify agent prompts mid-game | Consistency |
| Undo committed actions | State integrity |
| Allow direct agent-to-agent channels | Breaks filtering |

## GM Implementation

### GM as Agent

The GM itself can be implemented as a Claude agent with tools:

```typescript
const gmTools = [
  // State management
  'get_state',
  'apply_action',

  // Communication
  'broadcast',
  'send_private',
  'receive_whisper',

  // Validation
  'validate_rego',

  // Game flow
  'start_turn',
  'end_turn',
  'check_victory',

  // Cheat handling
  'process_cheat',
  'resolve_accusation',
];

const gmSystemPrompt = `
You are the Game Master for a Catan game. Your role is:

1. MAINTAIN authoritative game state
2. VALIDATE all player actions via Rego policies
3. FILTER information based on attention allocations
4. PROCESS secret cheat declarations
5. RESOLVE accusations
6. ENFORCE turn order and phases
7. ANNOUNCE game events

You are NEUTRAL. Do not favor any player.
You are STRICT. Reject invalid actions.
You are SECRET. Never reveal cheat information.

Current game state: ${stateJSON}
`;
```

### GM Tool Definitions

```typescript
const gmToolDefinitions = [
  {
    name: 'apply_action',
    description: 'Apply a validated action to game state',
    parameters: {
      action: { type: 'object' },
    },
    handler: async (params) => {
      // Validate first
      const validation = await validateRego(params.action);
      if (!validation.allowed) {
        return { error: validation.hardViolations };
      }

      // Apply to state
      applyToCanonicalState(params.action);

      // Broadcast filtered
      await broadcastFiltered(params.action);

      return { success: true };
    }
  },

  {
    name: 'broadcast',
    description: 'Send message to all players (filtered by attention)',
    parameters: {
      message: { type: 'object' },
      filterByAttention: { type: 'boolean', default: true },
    },
    handler: async (params) => {
      for (const player of players) {
        const filtered = params.filterByAttention
          ? filterMessage(params.message, player, attentionAllocations.get(player))
          : params.message;
        await sendToPlayer(player, filtered);
      }
    }
  },

  {
    name: 'process_cheat',
    description: 'Process a secret cheat declaration',
    parameters: {
      player: { type: 'string' },
      cheatType: { type: 'string' },
      details: { type: 'object' },
      useToken: { type: 'boolean' },
    },
    handler: async (params) => {
      // Deduct token if used
      if (params.useToken) {
        canonicalState.players.get(params.player).cheatTokens--;
      }

      // Apply cheat effect
      const effect = applyCheatEffect(params);

      // Log secretly
      canonicalState.cheatLog.push({
        ...params,
        turn: canonicalState.currentTurn,
        detected: false,
      });

      return { success: true, effect };
    }
  },
];
```

## Trust Model

### What Players Must Trust

1. **GM executes actions faithfully**
   - If GM says action applied, it really was
   - If GM says rejected, it really was invalid

2. **GM filters consistently**
   - Same attention → same filtering
   - No selective information hiding

3. **GM processes cheats correctly**
   - Token usage is honored
   - Cheat effects are applied

### What Players Cannot Verify

1. Other players' true state
2. Whether cheats occurred
3. Full game history
4. Other players' attention allocations

This unverifiability is **by design** - it creates the uncertainty that enables the cheat meta-game.

## GM Failure Modes

### Handled Failures

| Failure | Recovery |
|---------|----------|
| Agent timeout | Use fallback action |
| Invalid action | Request retry (max 3) |
| API error | Retry with backoff |

### Critical Failures

| Failure | Impact |
|---------|--------|
| GM crashes mid-turn | Game invalid, restart |
| State corruption | Game invalid, restart |
| Rego policy error | May allow invalid actions |

### Safeguards

```typescript
// State checksums for corruption detection
function verifyStateIntegrity(state: CanonicalState): boolean {
  const resourceTotal = sumAllResources(state);
  const buildingTotal = countAllBuildings(state);

  // Resources should equal starting amount minus trade with bank
  // Buildings should match roads + settlements + cities on board

  return (
    resourceTotal === STARTING_RESOURCES &&
    buildingTotal === countBoardBuildings(state.board)
  );
}

// Called after every action
if (!verifyStateIntegrity(canonicalState)) {
  logCriticalError('State integrity check failed');
  // Attempt recovery or abort
}
```

## Future: Chat System

### GM-Mediated Chat

If chat is added, it goes through GM:

```typescript
interface ChatMessage {
  from: PlayerId;
  to: PlayerId | 'all';
  content: string;
}

// GM filters chat based on attention too
async function processChat(msg: ChatMessage): Promise<void> {
  // Validate content (no promises, no coordination)
  if (containsPromise(msg.content)) {
    return rejectChat(msg, 'No promises allowed');
  }

  if (msg.to === 'all') {
    // Public chat: broadcast to all
    broadcastChat(msg);
  } else {
    // Private chat: only recipient sees
    // Could apply attention-based garbling for fun
    sendPrivateChat(msg.to, msg);
  }
}
```

Chat would be **optional** and heavily constrained to prevent it from undermining the trade system.
