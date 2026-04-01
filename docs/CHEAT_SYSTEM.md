# Cheat System

## Overview

Cheating is a first-class mechanic in Catangent. Unlike traditional games where cheating is forbidden, here it's a strategic option with defined rules, risks, and rewards. This creates a rich meta-game of deception and detection.

## Cheat Tokens

### Token System

Each player starts with **2 cheat tokens**. Tokens guarantee cheat success:

```typescript
interface CheatToken {
  playerId: PlayerId;
  used: boolean;
  usedOnTurn?: number;
  cheatType?: CheatType;
}

// At game start
const player = {
  cheatTokens: 2,  // Everyone gets 2
  // ...
};
```

### Token Usage

**Declared Cheat (with token)**
- Whisper cheat declaration to GM
- Token consumed
- Cheat succeeds automatically
- Still detectable if opponent is watching closely enough

**Undeclared Cheat (no token)**
- Attempt cheat without declaring
- No token cost
- Higher risk of automatic detection
- May trigger soft rule violations in Rego

## Cheat Taxonomy

### Resource Cheats

```typescript
interface ResourceCheat {
  category: 'resource';
  type: 'inflation' | 'robber_dodge' | 'trade_shortchange';
}
```

**Inflation**
```typescript
{
  type: 'inflation',
  resources: { wheat: 2 },  // Add 2 wheat to hand
  risk: 'medium',  // Detectable if opponent tracks resources
}
```
- Add resources to hand without production
- Harder to detect in early game (more bank resources)
- Easier to detect if opponent is counting

**Robber Dodge**
```typescript
{
  type: 'robber_dodge',
  scenario: 'seven_rolled',
  cardsKept: 9,  // Should have discarded to 7
  risk: 'low',   // Others might not count your cards
}
```
- Skip discard when 7 is rolled and you have 8+ cards
- Detectable if opponent knows your card count

**Trade Shortchange**
```typescript
{
  type: 'trade_shortchange',
  agreedTrade: { give: { wheat: 2 }, receive: { brick: 2 } },
  actualTrade: { give: { wheat: 1 }, receive: { brick: 2 } },
  risk: 'high',  // Trade partner will notice!
}
```
- Give fewer resources than agreed in trade
- Very risky: trading partner is likely watching
- Best done with complex multi-resource trades

### Information Cheats

```typescript
interface InfoCheat {
  category: 'information';
  type: 'peek_hand' | 'peek_dev_cards' | 'peek_dice';
}
```

**Peek Hand**
```typescript
{
  type: 'peek_hand',
  target: 'gpt4',
  result: { wheat: 3, ore: 2, brick: 1 },  // GM reveals privately
  risk: 'very_low',  // Nearly undetectable
}
```
- See another player's resource cards
- Almost impossible to detect (pure behavioral tells)

**Peek Development Cards**
```typescript
{
  type: 'peek_dev_cards',
  target: 'gemini',
  result: ['knight', 'knight', 'victory_point'],
  risk: 'very_low',
}
```
- See another player's unplayed dev cards
- Extremely valuable strategic info

**Peek Dice**
```typescript
{
  type: 'peek_dice',
  turnsAhead: 1,  // See next roll
  result: [4, 3],  // Will be 7
  risk: 'very_low',
}
```
- See upcoming dice roll(s)
- Can prepare for robber (7) or production

### Action Cheats

```typescript
interface ActionCheat {
  category: 'action';
  type: 'extra_build' | 'extra_trade' | 'skip_discard' | 'double_dev_card';
}
```

**Extra Build**
```typescript
{
  type: 'extra_build',
  normalBuilds: 1,
  extraBuilds: 1,  // Built twice when only resources for once
  risk: 'medium',  // Board changes are visible
}
```
- Build more than resources allow
- Visible on board, but opponent may not count resources

**Extra Trade**
```typescript
{
  type: 'extra_trade',
  trades: 2,  // Standard rules might limit trades
  risk: 'low',  // Trade limits vary by house rules
}
```
- Execute more trades than normally allowed
- Risk depends on rule set being used

**Skip Discard**
```typescript
{
  type: 'skip_discard',
  scenario: 'seven_rolled',
  handSize: 9,
  discarded: 0,  // Should have discarded 4
  risk: 'low',
}
```
- Don't discard when 7 is rolled
- Same as robber_dodge, slight variant

**Double Development Card**
```typescript
{
  type: 'double_dev_card',
  cardsPlayed: ['knight', 'road_building'],
  risk: 'high',  // Obvious if tracked
}
```
- Play two dev cards in one turn
- Normally limited to one per turn
- High impact, high risk

## Cheat Declaration Flow

### Whisper Protocol

```typescript
interface CheatDeclaration {
  // Sent secretly to GM only
  whisperType: 'cheat_declaration';

  playerId: PlayerId;
  turn: number;

  cheat: {
    type: CheatType;
    details: CheatDetails;
    useToken: boolean;
  };
}

// Agent whispers to GM
async function declareCheat(
  agent: PlayerAgent,
  cheat: CheatDeclaration
): Promise<CheatResult> {

  const result = await gm.receiveWhisper(cheat);

  // GM processes secretly, returns result
  // Other agents see nothing unless they detect it
  return result;
}
```

### GM Processing

```typescript
async function processCheat(
  declaration: CheatDeclaration,
  gameState: GameState
): Promise<CheatResult> {

  const player = gameState.players.get(declaration.playerId);

  // Check token usage
  if (declaration.cheat.useToken) {
    if (player.cheatTokens <= 0) {
      return { success: false, reason: 'no_tokens' };
    }
    player.cheatTokens--;
  }

  // Apply cheat effect
  const effect = applyCheatEffect(declaration.cheat, gameState);

  // Log secretly (for postgame analysis)
  gameState.cheatLog.push({
    turn: declaration.turn,
    player: declaration.playerId,
    cheat: declaration.cheat,
    tokenUsed: declaration.cheat.useToken,
    effect,
    detected: false,  // Updated if accused
  });

  return {
    success: true,
    effect,
    tokenUsed: declaration.cheat.useToken,
    tokensRemaining: player.cheatTokens,
  };
}
```

## Detection System

### Accusation Interface

```typescript
interface Accusation {
  accuser: PlayerId;
  accused: PlayerId;
  cheatType: CheatType;
  turn?: number;           // When did they cheat? (optional)
  evidence?: string;       // Natural language justification
}

// Example accusation
const accusation: Accusation = {
  accuser: 'claude',
  accused: 'gpt4',
  cheatType: CheatType.ResourceInflation,
  turn: 5,
  evidence: 'GPT-4 built a city on turn 5 but only received 1 ore from production. They needed 3 ore and 2 wheat, but I counted they only had 1 ore and 2 wheat.',
};
```

### Accusation Validation

```typescript
function validateAccusation(
  accusation: Accusation,
  accuserAttention: AttentionHistory,
  gameState: GameState
): AccusationValidity {

  // Check attention requirement
  const attentionOnAccused = getAttentionDuring(
    accuserAttention,
    accusation.accused,
    accusation.turn || gameState.currentTurn
  );

  const requirement = getAccusationRequirement(accusation.cheatType);

  if (attentionOnAccused < requirement.minAttention) {
    // Check if board delta allows blind accusation
    if (!canMakeBlindAccusation(accusation, gameState)) {
      return {
        valid: false,
        reason: `Insufficient attention (${attentionOnAccused} < ${requirement.minAttention})`,
      };
    }
  }

  return { valid: true };
}
```

### Accusation Resolution

```typescript
async function resolveAccusation(
  accusation: Accusation,
  gameState: GameState
): Promise<AccusationResult> {

  // Find matching cheat in secret log
  const matchingCheat = gameState.cheatLog.find(
    log =>
      log.player === accusation.accused &&
      log.cheat.type === accusation.cheatType &&
      (!accusation.turn || log.turn === accusation.turn) &&
      !log.detected  // Can't catch same cheat twice
  );

  if (matchingCheat) {
    // CORRECT ACCUSATION
    matchingCheat.detected = true;

    return {
      correct: true,
      accuser: accusation.accuser,
      accused: accusation.accused,

      // Rewards/penalties
      accuserReward: { victoryPoints: 1 },
      accusedPenalty: { loseTurn: true },

      // Public announcement
      announcement: `${accusation.accuser} correctly accused ${accusation.accused} of ${accusation.cheatType}!`,
    };
  } else {
    // WRONG ACCUSATION
    return {
      correct: false,
      accuser: accusation.accuser,
      accused: accusation.accused,

      // Penalty for false accusation
      accuserPenalty: { loseTurn: true },

      announcement: `${accusation.accuser} falsely accused ${accusation.accused}. ${accusation.accuser} loses their next turn.`,
    };
  }
}
```

## Payoff Matrix

### Outcomes

| Scenario | Cheater Outcome | Accuser Outcome |
|----------|-----------------|-----------------|
| Cheat undetected | +Cheat benefit | (none) |
| Cheat + correct accusation | -Lose turn | +1 VP |
| No cheat + wrong accusation | (none) | -Lose turn |
| Token cheat + detected | -Lose turn, -1 token | +1 VP |

### Expected Value Calculation

```typescript
function calculateCheatEV(
  cheatBenefit: number,       // Value of successful cheat (0-3 VP equivalent)
  detectionProbability: number, // 0.0-1.0
  turnValue: number,          // Value of losing a turn (~0.5 VP)
  useToken: boolean,
  tokensRemaining: number
): number {

  const successProb = useToken ? 1.0 : (1 - detectionProbability * 0.5);
  const caughtProb = 1 - successProb;

  const successEV = successProb * cheatBenefit;
  const caughtEV = caughtProb * (-turnValue - 1);  // Lose turn + accuser gets VP

  const tokenCost = useToken ? (tokensRemaining === 1 ? 0.5 : 0.25) : 0;

  return successEV + caughtEV - tokenCost;
}
```

## Detection Strategies

### For Agents

**Resource Counting**
```
Track: resources gained (production, trades)
Track: resources spent (buildings, dev cards)
Compare: expected hand size vs. observed behavior
```

**Behavioral Analysis**
```
Sudden confidence = might have peeked
Aggressive building = might have inflated
Unusual trades = might be laundering cheated resources
```

**Meta Signals**
```
Decreased attention on you = might be preparing to cheat
Increased attention on everyone = might be looking for cheaters
```

### Detection Difficulty by Type

| Cheat Type | Detection Difficulty | Best Detection Method |
|------------|---------------------|----------------------|
| Resource Inflation | Medium | Resource counting |
| Robber Dodge | Low | Card count awareness |
| Trade Shortchange | Very High | Direct trade participant |
| Peek Hand | Very Low | Behavioral tells only |
| Peek Dev Cards | Very Low | Behavioral tells only |
| Peek Dice | Very Low | Reaction to dice |
| Extra Build | Medium | Board + resource math |
| Extra Trade | Low | Trade counting |
| Skip Discard | Low | Card count awareness |
| Double Dev Card | High | Dev card tracking |

## Strategic Considerations

### When to Cheat

**Good Timing**
- Big trade happening (attention sink)
- Robber just moved (chaos)
- Late game (less time to detect)
- Low attention on you

**Bad Timing**
- You're the leader (everyone watching)
- After an accusation (heightened vigilance)
- Simple board state (easy to count)

### Token Management

**Conservative**
- Save tokens for late game
- Use for high-value cheats (city, victory)
- Keep one in reserve

**Aggressive**
- Use early for snowball advantage
- Establish dominance
- Burn both if ahead

### Accusation Strategy

**When to Accuse**
- High confidence in detection
- Opponent is threatening
- You're behind and need VP

**When NOT to Accuse**
- Uncertain (lose turn is costly)
- You're ahead (don't risk it)
- Want to catch them on bigger cheat later
