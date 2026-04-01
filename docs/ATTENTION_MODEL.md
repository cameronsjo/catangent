# Attention Model

## Overview

The attention model implements bounded rationality for game agents. Each agent has limited cognitive resources (attention) that must be allocated strategically across opponents and board regions. This creates natural information asymmetry without explicit fog-of-war mechanics.

## Core Concept

```
Total Attention Budget: 1.0 per turn
Allocation Targets: Other players + Board regions
Perception Fidelity: f(attention_allocated)
```

Each turn, before receiving the game state update, agents must declare how they're distributing their attention. This allocation determines what they perceive and remember.

## Attention Allocation

### Interface

```typescript
interface AttentionAllocation {
  playerId: PlayerId;
  turn: number;

  // Must sum to ≤ 1.0
  allocations: {
    players: Map<PlayerId, number>;    // 0.0 to 1.0 each
    board?: number;                     // Optional board focus
  };
}

// Example allocation
const allocation: AttentionAllocation = {
  playerId: 'claude',
  turn: 5,
  allocations: {
    players: new Map([
      ['gpt4', 0.4],      // Watching GPT-4 closely
      ['gemini', 0.2],    // Some attention on Gemini
      ['llama', 0.1],     // Peripheral awareness of Llama
      ['mistral', 0.1],   // Peripheral awareness of Mistral
    ]),
    board: 0.2,           // General board awareness
  }
};
// Total: 0.4 + 0.2 + 0.1 + 0.1 + 0.2 = 1.0 ✓
```

### Allocation Strategies

**Focused Surveillance**
```
One player: 0.8
Others: 0.05 each
```
Good for: Suspecting a specific cheater, tracking a leader

**Balanced Awareness**
```
Each player: 0.2
Board: 0.2
```
Good for: General game awareness, no specific threats

**Defensive Obscurity**
```
Board: 0.8
Players: 0.05 each
```
Good for: When you're cheating and don't want to know who's watching

## Fidelity Levels

### Perception Scale

| Attention | Level Name | What You Perceive |
|-----------|------------|-------------------|
| 0.0 | None | Nothing about this player |
| 0.1 | Minimal | "Did stuff" (action count only) |
| 0.2 | Vague | Action types without details |
| 0.3 | Partial | "Built something", "Traded with someone" |
| 0.4 | Moderate | Action types + vague targets |
| 0.5 | Standard | Most actions, vague quantities |
| 0.6 | Good | Actions with approximate details |
| 0.7 | Clear | Full actions, approximate resource flow |
| 0.8 | Sharp | Full actions, resource counts ±1 |
| 0.9 | Precise | Nearly everything, minor gaps |
| 1.0 | Perfect | Exact counts, perfect recall |

### Example Filtering

**Original Event** (GM's view):
```
Player GPT-4 traded 2 wheat + 1 ore to Gemini for 3 brick
```

**Filtered by Attention**:

| Attention on GPT-4 | What Claude Sees |
|-------------------|------------------|
| 0.0 | (nothing) |
| 0.1 | "GPT-4 did 1 thing" |
| 0.3 | "GPT-4 traded with someone" |
| 0.5 | "GPT-4 traded with Gemini" |
| 0.7 | "GPT-4 traded wheat and ore to Gemini for brick" |
| 1.0 | "GPT-4 traded 2 wheat + 1 ore to Gemini for 3 brick" |

## Filtering Implementation

### Event Categories

```typescript
enum EventCategory {
  Spatial = 'spatial',       // Building placement (always visible on board)
  Resource = 'resource',     // Resource changes (hidden by default)
  Trade = 'trade',           // Trade transactions (mixed visibility)
  Development = 'development', // Dev card actions (mostly hidden)
  Robber = 'robber',         // Robber movement (spatial + resource)
}
```

### Filtering Rules

```typescript
function filterEvent(
  event: GameEvent,
  observerAttention: number,
  eventCategory: EventCategory
): FilteredEvent | null {

  // Spatial events are always visible (but details may be fuzzy)
  if (eventCategory === EventCategory.Spatial) {
    return {
      ...event,
      details: observerAttention >= 0.3 ? event.details : 'built something'
    };
  }

  // Resource events require high attention
  if (eventCategory === EventCategory.Resource) {
    if (observerAttention < 0.5) return null;
    if (observerAttention < 0.8) {
      return { ...event, quantities: 'some' };
    }
    return event;
  }

  // Trade events scale with attention
  if (eventCategory === EventCategory.Trade) {
    if (observerAttention < 0.2) return null;
    if (observerAttention < 0.4) {
      return { type: 'trade', parties: 'unknown' };
    }
    if (observerAttention < 0.6) {
      return { type: 'trade', parties: event.parties, resources: 'unknown' };
    }
    if (observerAttention < 0.8) {
      return { ...event, quantities: fuzzyQuantities(event.quantities) };
    }
    return event;
  }

  // Development cards are very hard to track
  if (eventCategory === EventCategory.Development) {
    if (observerAttention < 0.7) return null;
    if (observerAttention < 0.9) {
      return { type: 'dev_card', action: 'played something' };
    }
    return event;
  }
}
```

### Quantity Fuzzing

```typescript
function fuzzyQuantity(actual: number, attention: number): string | number {
  if (attention >= 0.95) return actual;
  if (attention >= 0.85) return actual + randomInt(-1, 1);  // ±1
  if (attention >= 0.7) {
    if (actual <= 2) return 'a few';
    if (actual <= 5) return 'some';
    return 'many';
  }
  return 'unknown';
}
```

## Attention and Accusations

### Accusation Requirements

To make an accusation, you must have had sufficient attention on the accused player:

```typescript
interface AccusationRequirement {
  cheatType: CheatType;
  minAttention: number;
  orCondition?: 'board_delta';  // Can also detect from board changes
}

const accusationRequirements: AccusationRequirement[] = [
  // Resource cheats: need to track their resources
  { cheatType: CheatType.ResourceInflation, minAttention: 0.7 },
  { cheatType: CheatType.RobberDodge, minAttention: 0.6 },
  { cheatType: CheatType.TradeShortchange, minAttention: 0.8 },

  // Info cheats: very hard to detect
  { cheatType: CheatType.PeekHand, minAttention: 0.9 },
  { cheatType: CheatType.PeekDevCards, minAttention: 0.9 },
  { cheatType: CheatType.PeekDice, minAttention: 0.9 },

  // Action cheats: can sometimes see from board
  { cheatType: CheatType.ExtraBuild, minAttention: 0.5, orCondition: 'board_delta' },
  { cheatType: CheatType.ExtraTrade, minAttention: 0.6 },
  { cheatType: CheatType.SkipDiscard, minAttention: 0.5 },
  { cheatType: CheatType.DoubleDevCard, minAttention: 0.7 },
];
```

### Blind Accusations

You can always make a "blind" accusation based on board state changes:

```typescript
// Board shows new settlement where there shouldn't be enough resources
// Even with 0.0 attention, you can accuse if the math doesn't add up
function canMakeBlindAccusation(
  accused: PlayerId,
  cheatType: CheatType,
  boardEvidence: BoardDelta
): boolean {
  // Spatial changes are always visible
  if (boardEvidence.newBuildings.length > 0) {
    // Check if resources could support this
    const minResourcesNeeded = calculateMinResources(boardEvidence.newBuildings);
    const maxPossibleResources = estimateMaxResources(accused);

    return minResourcesNeeded > maxPossibleResources;
  }
  return false;
}
```

## Strategic Implications

### For Cheaters

1. **Watch the watchers**: Allocate some attention to see who's focused on you
2. **Time your cheats**: Wait for turns where opponents are distracted
3. **Use big moments**: Robber, large trades = attention sinks
4. **Coordinate distractions**: Make noise to split opponent attention

### For Detectives

1. **Focus on leaders**: They have most to gain from cheating
2. **Track resource math**: Builds require resources, count backwards
3. **Notice behavioral shifts**: Sudden aggression might indicate information cheats
4. **Coordinate coverage**: Implicitly divide attention with allies

### Attention Meta-Game

```
Turn 5: Claude allocates 0.6 attention to GPT-4

GPT-4 notices Claude is watching closely (if GPT-4 allocated attention to Claude)

GPT-4 decides NOT to cheat this turn

Turn 6: Claude spreads attention across all players (0.25 each)

GPT-4 notices Claude's attention dropped

GPT-4 considers this a good time to cheat
```

## Context Window Management

### Building Agent Context

Each turn, the GM builds a context window for each agent:

```typescript
function buildAgentContext(
  agent: PlayerId,
  gameState: GameState,
  attention: AttentionAllocation,
  recentHistory: GameEvent[]
): AgentContext {

  return {
    // Always full fidelity for self
    ownState: {
      resources: gameState.players.get(agent).resources,
      buildings: gameState.players.get(agent).buildings,
      devCards: gameState.players.get(agent).devCards,
      cheatTokens: gameState.players.get(agent).cheatTokens,
    },

    // Board is always visible (spatial info)
    boardState: gameState.board,

    // Filtered view of other players
    opponents: Array.from(gameState.players.entries())
      .filter(([id]) => id !== agent)
      .map(([id, state]) => ({
        id,
        attention: attention.allocations.players.get(id) || 0,
        perceivedState: filterPlayerState(state, attention.allocations.players.get(id) || 0),
      })),

    // Filtered recent history
    recentEvents: recentHistory
      .map(event => filterEventForAgent(event, agent, attention))
      .filter(e => e !== null),

    // Public info
    victoryPoints: getPublicVPs(gameState),
    longestRoad: gameState.longestRoad,
    largestArmy: gameState.largestArmy,
  };
}
```

### Memory Decay

Events from previous turns may decay based on attention at the time:

```typescript
function getHistoricalMemory(
  agent: PlayerId,
  turnsAgo: number,
  attentionAtTime: number
): MemoryFidelity {
  // Base decay: 0.9^turnsAgo
  const decayFactor = Math.pow(0.9, turnsAgo);

  // Combine with original attention
  const effectiveFidelity = attentionAtTime * decayFactor;

  return {
    fidelity: effectiveFidelity,
    canRecall: effectiveFidelity > 0.2,
    isAccurate: effectiveFidelity > 0.6,
  };
}
```

## Implementation Notes

### Attention Declaration Timing

```
1. Turn starts
2. GM announces dice roll, resource production
3. Active player declares attention allocation for THIS turn
4. Active player receives filtered context
5. Active player takes actions
6. Other players receive filtered broadcasts based on THEIR allocations
7. Turn ends
```

### Validation

```typescript
function validateAttention(allocation: AttentionAllocation): ValidationResult {
  const total = Array.from(allocation.allocations.players.values())
    .reduce((sum, v) => sum + v, 0) + (allocation.allocations.board || 0);

  if (total > 1.0) {
    return { valid: false, error: `Attention sum ${total} exceeds 1.0` };
  }

  for (const [player, value] of allocation.allocations.players) {
    if (value < 0 || value > 1) {
      return { valid: false, error: `Invalid attention ${value} for ${player}` };
    }
  }

  return { valid: true };
}
```
