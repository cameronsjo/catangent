# Rego Policies

## Overview

Open Policy Agent (OPA) with Rego provides the rule validation layer for Catangent. The system uses a two-tier approach:

- **HARD Rules**: Automatically reject invalid actions
- **SOFT Rules**: Log potential violations but allow the action

This design enables cheating mechanics while maintaining game integrity for geometric/spatial rules.

## OPA Integration

### Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Action    │────▶│   OPA       │────▶│   Result    │
│   Request   │     │   Engine    │     │   Decision  │
└─────────────┘     └─────────────┘     └─────────────┘
                          │
                          │ loads
                          ▼
                    ┌─────────────┐
                    │   Rego      │
                    │   Policies  │
                    └─────────────┘
```

### Integration Options

**1. OPA Server (Sidecar)**
```typescript
// HTTP-based policy evaluation
async function evaluateAction(action: GameAction): Promise<PolicyResult> {
  const response = await fetch('http://localhost:8181/v1/data/catan/decision', {
    method: 'POST',
    body: JSON.stringify({ input: action }),
  });
  return response.json();
}
```

**2. OPA WASM (Embedded)**
```typescript
import { loadPolicy } from '@open-policy-agent/opa-wasm';

const policy = await loadPolicy(wasmBuffer);

function evaluateAction(action: GameAction): PolicyResult {
  const result = policy.evaluate({ input: action });
  return result[0].result;
}
```

## Policy Structure

### File Organization

```
src/policies/
├── catan.rego           # Main policy bundle
├── hard/
│   ├── spatial.rego     # Settlement/road placement
│   ├── resources.rego   # Resource sufficiency
│   └── turn.rego        # Turn order and phase
└── soft/
    ├── actions.rego     # Action count limits
    ├── resources.rego   # Resource anomalies
    └── dev_cards.rego   # Dev card rules
```

### Main Policy File

```rego
# catan.rego
package catan

import data.catan.hard.spatial
import data.catan.hard.resources
import data.catan.hard.turn
import data.catan.soft.actions
import data.catan.soft.resources as soft_resources
import data.catan.soft.dev_cards

# Main decision
default decision = {"allowed": true, "hard_violations": [], "soft_violations": []}

decision = result {
    hard := array.concat(
        array.concat(spatial.deny, resources.deny),
        turn.deny
    )
    soft := array.concat(
        array.concat(actions.soft_violation, soft_resources.soft_violation),
        dev_cards.soft_violation
    )

    result := {
        "allowed": count(hard) == 0,
        "hard_violations": hard,
        "soft_violations": soft
    }
}
```

## HARD Rules

### Spatial Rules

```rego
# hard/spatial.rego
package catan.hard.spatial

# Settlement must be at least 2 edges from any existing settlement/city
deny[msg] {
    input.action == "build_settlement"
    existing := data.board.buildings[_]
    existing.type != "road"
    distance := vertex_distance(input.vertex, existing.vertex)
    distance < 2
    msg := sprintf("Settlement at %s violates distance rule (too close to %s at %s)",
                   [input.vertex, existing.type, existing.vertex])
}

# Settlement must be on valid vertex (exists, unoccupied)
deny[msg] {
    input.action == "build_settlement"
    not valid_vertex(input.vertex)
    msg := sprintf("Invalid vertex: %s", [input.vertex])
}

deny[msg] {
    input.action == "build_settlement"
    occupied_vertex(input.vertex)
    msg := sprintf("Vertex %s already occupied", [input.vertex])
}

# Road must connect to player's network
deny[msg] {
    input.action == "build_road"
    not connects_to_network(input.edge, input.player)
    msg := sprintf("Road at %s does not connect to %s's network",
                   [input.edge, input.player])
}

# Road must be on valid edge (exists, unoccupied)
deny[msg] {
    input.action == "build_road"
    not valid_edge(input.edge)
    msg := sprintf("Invalid edge: %s", [input.edge])
}

deny[msg] {
    input.action == "build_road"
    occupied_edge(input.edge)
    msg := sprintf("Edge %s already has a road", [input.edge])
}

# City must upgrade existing settlement
deny[msg] {
    input.action == "build_city"
    not player_settlement_at(input.player, input.vertex)
    msg := sprintf("No settlement to upgrade at %s", [input.vertex])
}

# Helper functions
vertex_distance(v1, v2) = dist {
    # Calculate graph distance on hex grid
    # Implementation depends on coordinate system
    dist := abs(v1.x - v2.x) + abs(v1.y - v2.y)  # Simplified
}

connects_to_network(edge, player) {
    # Edge connects to player's existing road
    existing := data.board.roads[_]
    existing.player == player
    shares_vertex(edge, existing.edge)
}

connects_to_network(edge, player) {
    # Edge connects to player's settlement/city
    building := data.board.buildings[_]
    building.player == player
    building.type != "road"
    edge_touches_vertex(edge, building.vertex)
}
```

### Resource Rules

```rego
# hard/resources.rego
package catan.hard.resources

# Building costs
building_costs = {
    "road": {"wood": 1, "brick": 1},
    "settlement": {"wood": 1, "brick": 1, "wheat": 1, "sheep": 1},
    "city": {"wheat": 2, "ore": 3},
    "dev_card": {"wheat": 1, "sheep": 1, "ore": 1}
}

# Must have resources for building
deny[msg] {
    input.action == "build"
    cost := building_costs[input.building_type]
    player_resources := data.players[input.player].resources
    resource_type := cost[_]
    player_resources[resource_type] < cost[resource_type]
    msg := sprintf("Insufficient %s for %s (have %d, need %d)",
                   [resource_type, input.building_type,
                    player_resources[resource_type], cost[resource_type]])
}

# Cannot trade more than you have
deny[msg] {
    input.action == "trade"
    offer := input.offer
    player_resources := data.players[input.player].resources
    resource_type := offer[_]
    offer[resource_type] > 0
    player_resources[resource_type] < offer[resource_type]
    msg := sprintf("Cannot offer %d %s (only have %d)",
                   [offer[resource_type], resource_type,
                    player_resources[resource_type]])
}
```

### Turn Rules

```rego
# hard/turn.rego
package catan.hard.turn

# Must be your turn
deny[msg] {
    input.player != data.game.current_player
    msg := sprintf("Not %s's turn (current player: %s)",
                   [input.player, data.game.current_player])
}

# Must be in correct phase for action
deny[msg] {
    input.action == "build"
    data.game.phase != "main"
    msg := sprintf("Cannot build during %s phase", [data.game.phase])
}

deny[msg] {
    input.action == "roll_dice"
    data.game.phase != "pre_roll"
    msg := "Already rolled this turn"
}

deny[msg] {
    input.action == "trade"
    data.game.phase == "pre_roll"
    msg := "Must roll before trading"
}

# Setup phase rules
deny[msg] {
    data.game.phase == "setup"
    input.action == "build_settlement"
    count_player_settlements(input.player) >= 2
    msg := "Already placed 2 settlements in setup"
}
```

## SOFT Rules

### Action Anomalies

```rego
# soft/actions.rego
package catan.soft.actions

# Multiple builds might indicate extra_build cheat
soft_violation[msg] {
    input.action == "build"
    count(data.this_turn.builds) > 0
    msg := sprintf("Multiple builds in turn %d (count: %d)",
                   [data.game.turn, count(data.this_turn.builds) + 1])
}

# Too many trades might indicate extra_trade cheat
soft_violation[msg] {
    input.action == "trade"
    count(data.this_turn.trades) >= 3
    msg := sprintf("Many trades in turn %d (count: %d)",
                   [data.game.turn, count(data.this_turn.trades) + 1])
}
```

### Resource Anomalies

```rego
# soft/resources.rego
package catan.soft.resources

# Resources increased without production
soft_violation[msg] {
    input.action == "end_turn"
    player := input.player
    start_total := sum_resources(data.turn_start.players[player].resources)
    current_total := sum_resources(data.players[player].resources)
    received := data.this_turn.resources_received[player]
    spent := data.this_turn.resources_spent[player]
    expected := start_total + received - spent
    current_total > expected
    diff := current_total - expected
    msg := sprintf("%s has %d more resources than expected", [player, diff])
}

# Didn't discard on 7 when should have
soft_violation[msg] {
    input.action == "end_turn"
    data.this_turn.dice_roll == 7
    player := data.players[_]
    data.turn_start.players[player.id].hand_size > 7
    not data.this_turn.discarded[player.id]
    msg := sprintf("%s did not discard after 7 (had %d cards)",
                   [player.id, data.turn_start.players[player.id].hand_size])
}

sum_resources(resources) = total {
    total := sum([v | v := resources[_]])
}
```

### Development Card Rules

```rego
# soft/dev_cards.rego
package catan.soft.dev_cards

# Multiple dev cards played in one turn
soft_violation[msg] {
    input.action == "play_dev_card"
    count(data.this_turn.dev_cards_played) > 0
    msg := sprintf("Multiple dev cards played in turn %d", [data.game.turn])
}

# Playing dev card bought this turn
soft_violation[msg] {
    input.action == "play_dev_card"
    input.card_id in data.this_turn.dev_cards_bought
    msg := "Dev card played same turn as purchased"
}

# Knight played without moving robber
soft_violation[msg] {
    input.action == "end_turn"
    "knight" in data.this_turn.dev_cards_played
    not data.this_turn.robber_moved
    msg := "Knight played but robber not moved"
}
```

## Input Schema

### Action Input

```typescript
interface PolicyInput {
  // The action being validated
  action: string;
  player: string;

  // Action-specific fields
  vertex?: string;
  edge?: string;
  building_type?: string;
  offer?: ResourceCounts;
  request?: ResourceCounts;
  trade_partner?: string;
  card_id?: string;

  // Context (loaded as data.*)
  // - data.board: current board state
  // - data.players: all player states
  // - data.game: game phase, turn, etc.
  // - data.this_turn: actions taken this turn
  // - data.turn_start: state at turn start
}
```

### Data Loading

```typescript
async function loadPolicyData(gameState: GameState): Promise<OpaData> {
  return {
    board: {
      buildings: gameState.board.buildings,
      roads: gameState.board.roads,
      hexes: gameState.board.hexes,
    },
    players: Object.fromEntries(
      gameState.players.entries().map(([id, p]) => [id, {
        resources: p.resources,
        buildings: p.buildings.length,
        dev_cards: p.devCards.length,
      }])
    ),
    game: {
      phase: gameState.phase,
      turn: gameState.turnNumber,
      current_player: gameState.currentPlayer,
    },
    this_turn: {
      builds: gameState.currentTurnActions.filter(a => a.type === 'build'),
      trades: gameState.currentTurnActions.filter(a => a.type === 'trade'),
      dev_cards_played: gameState.currentTurnActions
        .filter(a => a.type === 'play_dev_card')
        .map(a => a.card),
      dice_roll: gameState.diceRoll,
      robber_moved: gameState.robberMovedThisTurn,
      resources_received: gameState.resourcesReceivedThisTurn,
      resources_spent: gameState.resourcesSpentThisTurn,
      discarded: gameState.discardedThisTurn,
    },
    turn_start: gameState.stateAtTurnStart,
  };
}
```

## Testing Policies

### Unit Tests

```rego
# spatial_test.rego
package catan.hard.spatial_test

import data.catan.hard.spatial

# Test settlement distance rule
test_settlement_too_close {
    spatial.deny["Settlement at v1 violates distance rule"] with input as {
        "action": "build_settlement",
        "vertex": "v1",
        "player": "claude"
    } with data.board.buildings as [
        {"type": "settlement", "vertex": "v2", "player": "gpt4"}
    ]
}

test_settlement_valid_distance {
    count(spatial.deny) == 0 with input as {
        "action": "build_settlement",
        "vertex": "v1",
        "player": "claude"
    } with data.board.buildings as [
        {"type": "settlement", "vertex": "v10", "player": "gpt4"}
    ]
}
```

### Running Tests

```bash
# Test all policies
opa test src/policies/ -v

# Test specific package
opa test src/policies/hard/spatial.rego src/policies/hard/spatial_test.rego

# Coverage
opa test src/policies/ --coverage
```

## Cheat Detection via Soft Rules

Soft violations are key to cheat detection. The system:

1. Logs all soft violations with timestamps
2. Makes logs available to GM for analysis
3. Can trigger investigation by GM

```typescript
interface SoftViolationLog {
  turn: number;
  player: PlayerId;
  action: GameAction;
  violations: string[];
  timestamp: Date;
}

// GM can query for suspicious patterns
function findSuspiciousPlayers(logs: SoftViolationLog[]): SuspicionReport[] {
  const byPlayer = groupBy(logs, 'player');

  return Object.entries(byPlayer)
    .map(([player, violations]) => ({
      player,
      violationCount: violations.length,
      patterns: detectPatterns(violations),
      suspicionScore: calculateSuspicion(violations),
    }))
    .filter(r => r.suspicionScore > 0.5);
}
```
