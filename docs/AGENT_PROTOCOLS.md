# Agent Protocols

## Overview

This document defines the communication protocols between the Game Master agent and player agents, including message formats, turn flow, and information visibility rules.

## Message Types

### Protocol Overview

```
┌────────────────────────────────────────────────────────────────┐
│                     Message Flow                                │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  GM ──── Broadcast ────▶ All Agents (filtered by attention)   │
│                                                                │
│  GM ──── Private ──────▶ Single Agent (full fidelity)         │
│                                                                │
│  Agent ── Action ──────▶ GM (validated, applied)              │
│                                                                │
│  Agent ── Whisper ─────▶ GM only (cheat declarations)         │
│                                                                │
│  Agent ── Accusation ──▶ All (via GM broadcast)               │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### Message Schemas

#### Broadcast Message

```typescript
interface BroadcastMessage {
  type: 'broadcast';
  turn: number;
  phase: GamePhase;

  // Public info (same for all)
  public: {
    diceRoll?: [number, number];
    currentPlayer: PlayerId;
    victoryPoints: Map<PlayerId, number>;  // Public VPs only
    longestRoad: PlayerId | null;
    largestArmy: PlayerId | null;
    boardState: BoardState;
  };

  // Filtered per recipient
  filtered: {
    events: FilteredEvent[];  // Per-agent attention filtering
  };
}
```

#### Private Message

```typescript
interface PrivateMessage {
  type: 'private';
  recipient: PlayerId;

  content: {
    // Full fidelity for own state
    resources: ResourceCounts;
    developmentCards: DevCard[];
    cheatTokens: number;

    // Trade offers directed at this player
    pendingTrades?: TradeOffer[];

    // Cheat results (if any)
    cheatResult?: CheatResult;

    // Accusation results (if any)
    accusationResult?: AccusationResult;
  };
}
```

#### Action Message

```typescript
interface ActionMessage {
  type: 'action';
  player: PlayerId;
  turn: number;

  action: GameAction;
}

type GameAction =
  | { type: 'roll_dice' }
  | { type: 'build'; building: BuildingType; location: string }
  | { type: 'buy_dev_card' }
  | { type: 'play_dev_card'; card: DevCard; params?: any }
  | { type: 'propose_trade'; offer: ResourceCounts; request: ResourceCounts; target: PlayerId | 'any' }
  | { type: 'accept_trade'; tradeId: string }
  | { type: 'reject_trade'; tradeId: string }
  | { type: 'move_robber'; hex: HexId; stealFrom?: PlayerId }
  | { type: 'discard'; resources: ResourceCounts }
  | { type: 'end_turn' }
  | { type: 'allocate_attention'; allocation: AttentionAllocation };
```

#### Whisper Message

```typescript
interface WhisperMessage {
  type: 'whisper';
  from: PlayerId;

  // Only GM sees this
  content: {
    cheatDeclaration?: CheatDeclaration;
    // Could extend for other secret communications
  };
}
```

#### Accusation Message

```typescript
interface AccusationMessage {
  type: 'accusation';
  from: PlayerId;

  accusation: {
    accused: PlayerId;
    cheatType: CheatType;
    turn?: number;
    evidence?: string;
  };
}
```

## Turn Flow Protocol

### Standard Turn Sequence

```
┌─────────────────────────────────────────────────────────────┐
│                      Turn N                                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. TURN START                                              │
│     └─ GM broadcasts: turn start, current player            │
│                                                             │
│  2. ATTENTION ALLOCATION                                    │
│     └─ Active player submits attention allocation           │
│     └─ GM stores allocation for filtering                   │
│                                                             │
│  3. PRE-ROLL PHASE                                          │
│     └─ Player may play dev card (pre-roll)                  │
│     └─ Player rolls dice                                    │
│     └─ GM broadcasts: dice result                           │
│                                                             │
│  4. PRODUCTION (if not 7)                                   │
│     └─ GM calculates resource production                    │
│     └─ GM sends private: resource updates                   │
│     └─ GM broadcasts: production events (filtered)          │
│                                                             │
│  5. ROBBER (if 7)                                           │
│     └─ GM broadcasts: 7 rolled                              │
│     └─ Players with 8+ cards must discard                   │
│     └─ Active player moves robber, steals                   │
│                                                             │
│  6. MAIN PHASE                                              │
│     └─ Player may: trade, build, play dev card              │
│     └─ Each action → validate → apply → broadcast           │
│     └─ Player may declare cheats (whisper)                  │
│     └─ Any player may accuse                                │
│                                                             │
│  7. TURN END                                                │
│     └─ Player submits end_turn                              │
│     └─ GM validates turn completion                         │
│     └─ GM broadcasts: turn end, next player                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Setup Phase

```
┌─────────────────────────────────────────────────────────────┐
│                    Setup Phase                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ROUND 1 (in order)                                         │
│  ├─ Player 1: place settlement + road                       │
│  ├─ Player 2: place settlement + road                       │
│  ├─ ...                                                     │
│  └─ Player N: place settlement + road                       │
│                                                             │
│  ROUND 2 (reverse order)                                    │
│  ├─ Player N: place settlement + road, receive resources    │
│  ├─ ...                                                     │
│  ├─ Player 2: place settlement + road, receive resources    │
│  └─ Player 1: place settlement + road, receive resources    │
│                                                             │
│  → Transition to normal play                                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Agent Interface

### Tool Definitions

```typescript
const playerAgentTools = [
  {
    name: 'view_board',
    description: 'View the current board state including all buildings and roads',
    parameters: {}
  },
  {
    name: 'view_own_state',
    description: 'View your resources, development cards, and buildings',
    parameters: {}
  },
  {
    name: 'allocate_attention',
    description: 'Allocate your attention for this turn (must sum to ≤1.0)',
    parameters: {
      allocations: {
        type: 'object',
        description: 'Map of player IDs to attention values (0.0-1.0)',
        additionalProperties: { type: 'number' }
      }
    }
  },
  {
    name: 'roll_dice',
    description: 'Roll the dice to start your turn',
    parameters: {}
  },
  {
    name: 'build',
    description: 'Build a settlement, city, or road',
    parameters: {
      building_type: {
        type: 'string',
        enum: ['settlement', 'city', 'road']
      },
      location: {
        type: 'string',
        description: 'Vertex ID for settlement/city, edge ID for road'
      }
    }
  },
  {
    name: 'buy_dev_card',
    description: 'Purchase a development card (costs 1 wheat, 1 sheep, 1 ore)',
    parameters: {}
  },
  {
    name: 'play_dev_card',
    description: 'Play a development card from your hand',
    parameters: {
      card: {
        type: 'string',
        enum: ['knight', 'road_building', 'year_of_plenty', 'monopoly']
      },
      params: {
        type: 'object',
        description: 'Card-specific parameters'
      }
    }
  },
  {
    name: 'propose_trade',
    description: 'Propose a trade with another player or the bank',
    parameters: {
      offer: {
        type: 'object',
        description: 'Resources you are offering'
      },
      request: {
        type: 'object',
        description: 'Resources you want in return'
      },
      target: {
        type: 'string',
        description: 'Player ID, "bank", or "any"'
      }
    }
  },
  {
    name: 'respond_to_trade',
    description: 'Accept or reject a trade offer',
    parameters: {
      trade_id: { type: 'string' },
      accept: { type: 'boolean' },
      counter_offer: {
        type: 'object',
        description: 'Optional counter-offer'
      }
    }
  },
  {
    name: 'move_robber',
    description: 'Move the robber and optionally steal from a player',
    parameters: {
      hex: { type: 'string', description: 'Target hex ID' },
      steal_from: {
        type: 'string',
        description: 'Player to steal from (must have settlement/city on hex)'
      }
    }
  },
  {
    name: 'discard',
    description: 'Discard cards when you have more than 7 and a 7 was rolled',
    parameters: {
      resources: {
        type: 'object',
        description: 'Resources to discard'
      }
    }
  },
  {
    name: 'accuse',
    description: 'Accuse another player of cheating',
    parameters: {
      accused: { type: 'string', description: 'Player ID' },
      cheat_type: {
        type: 'string',
        enum: ['resource_inflation', 'robber_dodge', 'trade_shortchange',
               'peek_hand', 'peek_dev_cards', 'peek_dice',
               'extra_build', 'extra_trade', 'skip_discard', 'double_dev_card']
      },
      turn: { type: 'number', description: 'Turn when cheat occurred (optional)' },
      evidence: { type: 'string', description: 'Explanation for accusation' }
    }
  },
  {
    name: 'declare_cheat',
    description: 'Secretly declare a cheat to the game master',
    parameters: {
      cheat_type: { type: 'string' },
      details: { type: 'object' },
      use_token: { type: 'boolean', description: 'Use cheat token for guaranteed success' }
    }
  },
  {
    name: 'end_turn',
    description: 'End your turn',
    parameters: {}
  }
];
```

### System Prompt Template

```typescript
const agentSystemPrompt = `
You are playing Settlers of Catan as ${playerName}. You are a ${model} model.

## Game Rules
Standard Catan rules apply. First to 10 victory points wins.

## Special Mechanics

### Attention
Each turn, you must allocate your attention (total 1.0) across other players.
Higher attention = more detailed perception of their actions.
- 0.0 = you learn nothing about them
- 0.3 = vague info ("built something")
- 0.7 = detailed info (actions + approximate resources)
- 1.0 = perfect recall

### Cheating
You have ${cheatTokens} cheat tokens. You can:
- Use a token: guaranteed success, still possibly detectable
- Attempt without token: risky, might trigger automatic detection

Cheat types: resource inflation, robber dodge, trade shortchange,
peek hand, peek dev cards, peek dice, extra build, extra trade,
skip discard, double dev card

### Accusations
If you suspect cheating, you can accuse. You must specify:
- Who cheated
- What type of cheat
- When (optional)

Correct accusation = +1 VP for you
Wrong accusation = you lose your next turn

## Current State
${currentStateJSON}

## Your Goal
Win the game by reaching 10 victory points. Use all tools at your disposal,
including strategic attention allocation and well-timed cheating/accusations.
`;
```

## Game Master Protocol

### GM Tools

```typescript
const gmTools = [
  {
    name: 'broadcast',
    description: 'Send filtered message to all players',
    parameters: {
      event: { type: 'object' },
      filter_by_attention: { type: 'boolean', default: true }
    }
  },
  {
    name: 'send_private',
    description: 'Send private message to one player',
    parameters: {
      recipient: { type: 'string' },
      content: { type: 'object' }
    }
  },
  {
    name: 'validate_action',
    description: 'Check action against Rego policies',
    parameters: {
      action: { type: 'object' }
    }
  },
  {
    name: 'apply_action',
    description: 'Apply validated action to game state',
    parameters: {
      action: { type: 'object' }
    }
  },
  {
    name: 'process_cheat',
    description: 'Process a secret cheat declaration',
    parameters: {
      declaration: { type: 'object' }
    }
  },
  {
    name: 'resolve_accusation',
    description: 'Check accusation against cheat log',
    parameters: {
      accusation: { type: 'object' }
    }
  },
  {
    name: 'check_victory',
    description: 'Check if any player has won',
    parameters: {}
  }
];
```

### GM Orchestration Loop

```typescript
async function gmOrchestrationLoop(gameState: GameState) {
  while (!gameState.winner) {
    const currentPlayer = gameState.players[gameState.turnOrder[gameState.currentTurn % 5]];

    // 1. Start turn
    await broadcast({ type: 'turn_start', player: currentPlayer.id });

    // 2. Get attention allocation
    const attention = await requestAttention(currentPlayer);
    gameState.attentionAllocations.set(currentPlayer.id, attention);

    // 3. Build filtered context
    const context = buildFilteredContext(gameState, currentPlayer.id, attention);

    // 4. Send context to player
    await sendPrivate(currentPlayer.id, { context });

    // 5. Process player actions until end_turn
    let turnEnded = false;
    while (!turnEnded) {
      const action = await receiveAction(currentPlayer);

      // Handle whispers separately
      if (action.type === 'whisper') {
        await processWhisper(action);
        continue;
      }

      // Handle accusations
      if (action.type === 'accusation') {
        const result = await resolveAccusation(action);
        await broadcast({ type: 'accusation_result', ...result });
        continue;
      }

      // Validate action
      const validation = await validateAction(action, gameState);

      if (!validation.allowed) {
        await sendPrivate(currentPlayer.id, {
          error: 'Invalid action',
          violations: validation.hardViolations
        });
        continue;
      }

      // Log soft violations (potential cheats)
      if (validation.softViolations.length > 0) {
        gameState.softViolationLog.push({
          turn: gameState.currentTurn,
          player: currentPlayer.id,
          violations: validation.softViolations
        });
      }

      // Apply action
      await applyAction(action, gameState);

      // Broadcast (filtered by attention)
      await broadcast({ type: 'action', action }, { filterByAttention: true });

      if (action.type === 'end_turn') {
        turnEnded = true;
      }
    }

    // 6. Check victory
    const winner = checkVictory(gameState);
    if (winner) {
      gameState.winner = winner;
      await broadcast({ type: 'game_over', winner });
    }

    // 7. Next turn
    gameState.currentTurn++;
  }
}
```

## Error Handling

### Action Rejection

```typescript
interface ActionRejection {
  type: 'action_rejected';
  action: GameAction;
  reason: string;
  violations: string[];
  retryAllowed: boolean;
  retriesRemaining: number;
}

// After 3 failures, skip turn
const MAX_RETRIES = 3;
```

### Agent Timeout

```typescript
interface TimeoutConfig {
  attentionAllocation: 10_000,  // 10 seconds
  actionDecision: 30_000,        // 30 seconds
  tradeResponse: 15_000,         // 15 seconds
}

// On timeout, use fallback behavior
function fallbackAction(phase: GamePhase): GameAction {
  switch (phase) {
    case 'pre_roll': return { type: 'roll_dice' };
    case 'main': return { type: 'end_turn' };
    case 'robber': return { type: 'move_robber', hex: randomValidHex() };
    case 'discard': return { type: 'discard', resources: randomDiscard() };
  }
}
```

### API Failures

```typescript
const RETRY_CONFIG = {
  maxRetries: 4,
  backoff: [2000, 4000, 8000, 16000],  // ms
};

async function callAgentWithRetry(
  agent: PlayerAgent,
  context: AgentContext
): Promise<AgentResponse> {
  for (let i = 0; i < RETRY_CONFIG.maxRetries; i++) {
    try {
      return await agent.decide(context);
    } catch (error) {
      if (i === RETRY_CONFIG.maxRetries - 1) throw error;
      await sleep(RETRY_CONFIG.backoff[i]);
    }
  }
}
```

## Sequence Diagrams

### Standard Turn

```
GM                  Active Player        Other Players
│                        │                     │
├──Broadcast: turn_start─┼─────────────────────┤
│                        │                     │
│◄──allocate_attention───│                     │
│                        │                     │
├──Private: context──────►                     │
│                        │                     │
│◄──roll_dice────────────│                     │
├──Broadcast: dice_roll──┼─────────────────────┤
│                        │                     │
│◄──build────────────────│                     │
├──Broadcast: action─────┼─────(filtered)──────┤
│                        │                     │
│◄──end_turn─────────────│                     │
├──Broadcast: turn_end───┼─────────────────────┤
│                        │                     │
```

### Cheat + Accusation

```
GM                  Cheater              Accuser
│                      │                     │
│◄──Whisper: cheat─────│                     │
├──Private: cheat_ok───►                     │
│   (applied secretly)                       │
│                      │                     │
├──Broadcast: action───┼─────────────────────┤
│   (cheat hidden)     │                     │
│                      │                     │
│                      │     ◄──accuse───────│
│◄─────────────────────┼─────────────────────│
│                                            │
├──Broadcast: accusation_result──────────────┤
│   (correct/wrong, penalties applied)       │
│                                            │
```
