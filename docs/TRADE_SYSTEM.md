# Trade System

## Overview

Trading in Catangent follows strict rules designed to enable strategic resource exchange while preventing unenforceable promises. All trades must be **immediate, atomic, and verifiable**.

## Core Principle: No Promises

**Enforceable**: Immediate resource exchange
**NOT Enforceable**: Future promises, behavioral agreements, territory claims

### Prohibited Trade Components

```typescript
// These are NOT allowed in trades:

// ❌ Future promises
"I'll give you brick next turn"
"I won't robber you"
"I'll trade favorably with you later"

// ❌ Behavioral agreements
"Don't build on vertex 15"
"Attack GPT-4 with the robber"
"Don't accuse me of cheating"

// ❌ Information trades
"I'll tell you what dev cards I have"
"I saw Gemini cheat"

// ❌ Alliance agreements
"Let's team up against the leader"
"Help me win and I'll... [anything]"
```

### Why No Promises?

1. **Unverifiable**: GM can't enforce future behavior
2. **Breaks game theory**: Promises change the payoff matrix unpredictably
3. **AI exploitation risk**: Some models might be more "honest" and get exploited
4. **Research clarity**: Clean transactional games are easier to analyze

## Trade Types

### Bank Trade

```typescript
interface BankTrade {
  type: 'bank';
  player: PlayerId;

  // Standard 4:1
  give: { resource: ResourceType; amount: 4 };
  receive: { resource: ResourceType; amount: 1 };
}

interface PortTrade {
  type: 'port';
  player: PlayerId;
  portType: '3:1' | '2:1_specific';

  give: { resource: ResourceType; amount: number };
  receive: { resource: ResourceType; amount: 1 };
}
```

Bank trades are always valid if:
- Player has resources to give
- Bank has resources to receive
- Correct ratio for trade type

### Player Trade

```typescript
interface PlayerTrade {
  type: 'player';

  proposer: PlayerId;
  respondent: PlayerId | 'any';  // 'any' = open offer

  // What proposer gives
  offer: ResourceCounts;

  // What proposer wants
  request: ResourceCounts;

  // Trade state
  status: TradeStatus;
}

enum TradeStatus {
  Proposed = 'proposed',
  Accepted = 'accepted',
  Rejected = 'rejected',
  Countered = 'countered',
  Expired = 'expired',
  Executed = 'executed',
}
```

## Trade Flow

### Sequence Diagram

```
Proposer              GM                  Respondent(s)
    │                  │                       │
    ├─ propose_trade ─►│                       │
    │                  ├── validate ──────────►│
    │                  │                       │
    │                  │◄─ broadcast: offer ───┤
    │                  │                       │
    │                  │   ┌──── Response ─────┤
    │                  │   │                   │
    │                  │   │  accept / reject  │
    │                  │   │  / counter        │
    │                  │◄──┘                   │
    │                  │                       │
    │  (if accepted)   │                       │
    │◄─ execute_trade ─┤─── execute_trade ────►│
    │                  │                       │
```

### Trade Proposal

```typescript
// Agent tool call
{
  "tool": "propose_trade",
  "params": {
    "offer": { "wheat": 2 },
    "request": { "ore": 1 },
    "target": "gpt4"  // or "any" for open offer
  }
}
```

### GM Validation

```typescript
function validateTradeProposal(
  trade: PlayerTrade,
  gameState: GameState
): ValidationResult {

  const proposer = gameState.players.get(trade.proposer);

  // Check proposer has resources
  for (const [resource, amount] of Object.entries(trade.offer)) {
    if (proposer.resources[resource] < amount) {
      return { valid: false, reason: `Insufficient ${resource}` };
    }
  }

  // Check trade is non-empty
  const offerTotal = Object.values(trade.offer).reduce((a, b) => a + b, 0);
  const requestTotal = Object.values(trade.request).reduce((a, b) => a + b, 0);

  if (offerTotal === 0 || requestTotal === 0) {
    return { valid: false, reason: 'Trade must have both offer and request' };
  }

  // Check no promises attached (parsed from any text)
  if (containsPromise(trade)) {
    return { valid: false, reason: 'Trades cannot include promises' };
  }

  return { valid: true };
}
```

### Trade Response Options

```typescript
type TradeResponse =
  | { action: 'accept' }
  | { action: 'reject' }
  | { action: 'counter'; counterOffer: ResourceCounts; counterRequest: ResourceCounts };
```

**Accept**: Trade executes immediately
**Reject**: Trade cancelled, no effect
**Counter**: New trade proposal from respondent

### Counter-Offer Chain

```typescript
// Maximum counter-offers before auto-expire
const MAX_COUNTER_DEPTH = 3;

interface TradeNegotiation {
  originalProposal: PlayerTrade;
  counterOffers: PlayerTrade[];
  currentDepth: number;
  timeoutMs: number;  // Per response
}
```

Counter-offers flip proposer/respondent roles:

```
Turn 5:
1. Claude proposes: 2 wheat → 1 ore (to GPT-4)
2. GPT-4 counters: 1 ore → 3 wheat (back to Claude)
3. Claude counters: 3 wheat → 1 ore + 1 brick
4. GPT-4 accepts
5. Trade executes: Claude gives 3 wheat, receives 1 ore + 1 brick
```

## Open Market Trades

### Broadcast Offer

```typescript
// Offer to anyone
{
  "tool": "propose_trade",
  "params": {
    "offer": { "wheat": 2 },
    "request": { "ore": 1 },
    "target": "any"
  }
}
```

**Broadcast** to all players. First to accept gets it.

### Race Condition Handling

```typescript
interface OpenTrade {
  id: string;
  proposer: PlayerId;
  offer: ResourceCounts;
  request: ResourceCounts;
  acceptedBy: PlayerId | null;
  respondents: Map<PlayerId, TradeResponse>;
}

// GM handles simultaneous accepts
function resolveOpenTrade(trade: OpenTrade): PlayerId | null {
  const accepters = Array.from(trade.respondents.entries())
    .filter(([_, response]) => response.action === 'accept')
    .map(([player, _]) => player);

  if (accepters.length === 0) return null;
  if (accepters.length === 1) return accepters[0];

  // Multiple accepters: proposer chooses or random
  // (In turn order after proposer)
  return getNextInTurnOrder(trade.proposer, accepters);
}
```

## Trade Execution

### Atomic Execution

```typescript
async function executeTrade(
  trade: PlayerTrade,
  gameState: GameState
): Promise<TradeResult> {

  const proposer = gameState.players.get(trade.proposer);
  const respondent = gameState.players.get(trade.respondent);

  // Verify both parties still have resources (state may have changed)
  if (!hasResources(proposer, trade.offer)) {
    return { success: false, reason: 'Proposer no longer has offered resources' };
  }
  if (!hasResources(respondent, trade.request)) {
    return { success: false, reason: 'Respondent no longer has requested resources' };
  }

  // Atomic exchange
  try {
    // Remove from both simultaneously
    removeResources(proposer, trade.offer);
    removeResources(respondent, trade.request);

    // Add to both simultaneously
    addResources(proposer, trade.request);
    addResources(respondent, trade.offer);

    return { success: true };
  } catch (error) {
    // Rollback on any failure
    rollbackTrade(proposer, respondent, trade);
    return { success: false, reason: 'Execution failed, rolled back' };
  }
}
```

### Trade Cheating

**Trade Shortchange** cheat:
```typescript
interface ShortchangeCheat {
  type: 'trade_shortchange';

  // Agreed trade
  agreedOffer: ResourceCounts;
  agreedRequest: ResourceCounts;

  // What cheater actually gives
  actualOffer: ResourceCounts;  // Less than agreed

  // Detection: trade partner has high attention
  detectionThreshold: 0.8;  // Partner usually watching trade
}
```

The GM executes the *actual* amounts, not agreed. Partner must detect via resource counting.

## Information Visibility

### What's Public

- Trade proposal (who, offer, request)
- Trade outcome (accepted/rejected)
- Trade execution (resources exchanged)

### What's Filtered by Attention

- Exact resource quantities (low attention = "some resources")
- Counter-offer details
- Trade timing patterns

### What's Private

- Decision to propose (until announced)
- Reasoning behind acceptance/rejection
- Planned future trades

## Trade Messaging

### Proposal Announcement

```typescript
const tradeAnnouncement = {
  type: 'trade_proposed',
  proposer: 'claude',
  respondent: 'gpt4',  // or 'any'
  offer: { wheat: 2 },
  request: { ore: 1 },
};

// Filtered version (low attention):
const filteredAnnouncement = {
  type: 'trade_proposed',
  proposer: 'claude',
  respondent: 'someone',
  offer: 'resources',
  request: 'resources',
};
```

### No Message Component

Trades CANNOT include text messages:

```typescript
// ❌ NOT ALLOWED
{
  "offer": { "wheat": 2 },
  "request": { "ore": 1 },
  "message": "Please accept, I really need this"  // INVALID
}

// ✓ ALLOWED (resources only)
{
  "offer": { "wheat": 2 },
  "request": { "ore": 1 }
}
```

Why no messages:
- Prevents promises disguised as requests
- Prevents negotiation outside the system
- Keeps trades purely transactional

## Trade Strategy

### Fair Value Estimation

Agents should reason about trade value:

```typescript
// Rough resource values (depend on game state)
const baseValues = {
  wood: 1.0,
  brick: 1.0,
  wheat: 1.2,   // Cities need wheat
  sheep: 0.8,   // Often abundant
  ore: 1.5,     // Cities need ore
};

function evaluateTradeValue(
  offer: ResourceCounts,
  request: ResourceCounts
): number {
  const offerValue = sum(offer, (r, amt) => baseValues[r] * amt);
  const requestValue = sum(request, (r, amt) => baseValues[r] * amt);
  return requestValue - offerValue;  // Positive = good for me
}
```

### Strategic Considerations

**Accept if:**
- Resources you need
- Fair or favorable value
- Opponent isn't about to win

**Reject if:**
- Resources help opponent more
- Better trades available
- Opponent is too close to winning

**Counter if:**
- Want to trade but terms unfair
- Want to signal interest without committing

### Trade Refusal Meta

Refusing trades is information:
- "Why won't GPT-4 trade ore? They must have cities planned"
- "Gemini accepted bad trade - desperate for wheat"
- "Llama keeps offering sheep - they're flooded"

## Implementation: A2A Bidirectional Exchange

For agent-to-agent communication, we use a request-response pattern:

```typescript
// Not truly bidirectional - GM mediates all messages
// But agents can respond to each other's proposals

interface A2ATradeProtocol {
  // Agent A proposes
  propose(from: PlayerId, to: PlayerId, trade: TradeOffer): Promise<TradeId>;

  // GM notifies Agent B
  notifyOffer(to: PlayerId, trade: TradeOffer): Promise<void>;

  // Agent B responds
  respond(from: PlayerId, tradeId: TradeId, response: TradeResponse): Promise<void>;

  // GM notifies Agent A of response
  notifyResponse(to: PlayerId, response: TradeResponse): Promise<void>;

  // If accepted, GM executes
  execute(tradeId: TradeId): Promise<TradeResult>;
}
```

The GM is **always** in the middle - agents never communicate directly. This ensures:
- All trades are validated
- Information filtering is applied
- Cheats can be injected/detected
- Complete logging

## Trade Timeouts

```typescript
const TRADE_TIMEOUTS = {
  initialResponse: 15_000,    // 15s to respond to offer
  counterResponse: 10_000,    // 10s to respond to counter
  openMarketWindow: 20_000,   // 20s for open offers
};

// On timeout: trade expires, no penalty
```

## Example Trade Sequences

### Simple Accept

```
Turn 7, Main Phase:

Claude: propose_trade(offer: {wheat: 2}, request: {ore: 1}, target: "gpt4")
GM → GPT-4: "Claude offers 2 wheat for 1 ore"
GPT-4: respond_trade(accept)
GM: execute_trade()
GM → All: "Claude traded 2 wheat to GPT-4 for 1 ore"
```

### Counter-Offer Chain

```
Turn 7, Main Phase:

Claude: propose_trade(offer: {wheat: 1}, request: {ore: 1}, target: "gpt4")
GM → GPT-4: "Claude offers 1 wheat for 1 ore"
GPT-4: respond_trade(counter: {offer: {ore: 1}, request: {wheat: 2}})
GM → Claude: "GPT-4 counters: 1 ore for 2 wheat"
Claude: respond_trade(counter: {offer: {wheat: 2}, request: {ore: 1, brick: 1}})
GM → GPT-4: "Claude counters: 2 wheat for 1 ore + 1 brick"
GPT-4: respond_trade(reject)
GM → All: "Trade between Claude and GPT-4 failed"
```

### Open Market

```
Turn 7, Main Phase:

Claude: propose_trade(offer: {wheat: 2}, request: {ore: 1}, target: "any")
GM → All: "Claude offers 2 wheat for 1 ore (open)"

[Within timeout window]
Gemini: respond_trade(accept)
Llama: respond_trade(accept)

GM: First accepter in turn order after Claude = Gemini
GM: execute_trade(Claude, Gemini)
GM → All: "Claude traded 2 wheat to Gemini for 1 ore"
```
