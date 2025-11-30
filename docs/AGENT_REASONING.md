# Agent Reasoning System

## Overview

Each agent maintains an explicit reasoning trace that captures their strategic thinking, plans, and decision-making process. This enables game playback, analysis, and research into agent cognition.

## Reasoning Architecture

### Thought Chain Structure

```typescript
interface AgentThought {
  timestamp: number;
  turn: number;
  phase: ThoughtPhase;

  // The actual reasoning
  thinking: {
    observation: string;      // What the agent perceives
    analysis: string;         // Interpretation of the situation
    options: OptionEval[];    // Considered actions
    decision: string;         // Final choice and rationale
  };

  // Metadata
  confidenceLevel: number;    // 0.0-1.0
  emotionalState?: string;    // Optional: "suspicious", "confident", etc.
}

interface OptionEval {
  action: string;
  expectedValue: number;
  risks: string[];
  benefits: string[];
  rejected?: boolean;
  rejectionReason?: string;
}
```

### Thought Phases

```typescript
enum ThoughtPhase {
  // Per-turn phases
  TurnStart = 'turn_start',          // Initial situation assessment
  AttentionPlanning = 'attention',   // Deciding where to look
  PreRoll = 'pre_roll',              // Before dice
  Production = 'production',         // After dice, resource eval
  TradeConsideration = 'trade',      // Evaluating trade options
  BuildPlanning = 'build',           // Construction decisions
  CheatConsideration = 'cheat',      // Whether to cheat
  AccusationConsideration = 'accuse', // Whether to accuse
  TurnEnd = 'turn_end',              // Reflection on turn

  // Reactive phases
  TradeResponse = 'trade_response',  // Responding to offers
  RobberResponse = 'robber',         // Reacting to robber
  DiscardResponse = 'discard',       // Choosing discards
}
```

## Structured Reasoning Prompt

### Agent System Prompt Addition

```typescript
const reasoningSystemPrompt = `
## Reasoning Requirements

You MUST think through your decisions explicitly. For each decision point, structure your reasoning as follows:

### Observation
What do I see? What happened since my last turn?
- Board state changes
- Other players' actions (filtered by my attention)
- My current resources and position

### Analysis
What does this mean?
- Who is winning? Who is threatening?
- What are the key bottlenecks?
- Who might be cheating?
- What do other players know about me?

### Options
What can I do? For each meaningful option:
- Expected value (rough VP impact)
- Risks involved
- Benefits gained

### Decision
What will I do and why?
- Chosen action(s)
- Primary justification
- Confidence level (low/medium/high)

### Theory of Mind
What do other players think?
- What do they know about my state?
- What do they think I'll do?
- Can I exploit their expectations?

Output your reasoning in a <thinking> block before each action.
`;
```

### Example Reasoning Output

```xml
<thinking>
## Observation
Turn 7. I'm Claude (blue). Board shows:
- GPT-4 built a settlement at vertex 15 last turn (I had 0.4 attention on them)
- Gemini traded something with Llama (only 0.2 attention, details fuzzy)
- I have: 2 wood, 1 brick, 3 wheat, 1 sheep
- Current VP: Me 4, GPT-4 5, Gemini 4, Llama 3, Mistral 3

## Analysis
GPT-4 is leading and just expanded. They're positioned to cut off my road path to the coast.
Gemini and Llama made a deal - possibly anti-GPT-4 alliance forming?
I have resources for a road (wood + brick) but not a settlement yet.

## Options
1. Build road toward coast (wood + brick)
   - EV: +0.2 VP (eventual longest road potential)
   - Risk: GPT-4 might block anyway
   - Benefit: Secures expansion path

2. Trade wheat for ore (need for city later)
   - EV: +0.3 VP (progress toward city)
   - Risk: Reveals I'm planning city
   - Benefit: Sets up for future turn

3. Buy dev card (wheat + sheep + ore... I don't have ore)
   - Not possible this turn

## Decision
Build road toward coast (option 1).
Justification: GPT-4's expansion threatens my growth. Must secure territory now.
Confidence: Medium (they might still block, but waiting is worse)

## Theory of Mind
- GPT-4 knows I need to expand (obvious from board)
- They don't know my exact resources (their attention on me was ~0.3)
- They might expect me to trade, not build
- Surprise road placement could catch them off-guard
</thinking>

<action>
{
  "type": "build",
  "building_type": "road",
  "location": "e24"
}
</action>
```

## Playback System

### Game Recording Format

```typescript
interface GameRecording {
  metadata: {
    gameId: string;
    startTime: Date;
    endTime: Date;
    players: PlayerMetadata[];
    winner: PlayerId;
    finalScores: Map<PlayerId, number>;
  };

  // Turn-by-turn record
  turns: TurnRecord[];

  // Full thought traces per agent
  agentThoughts: Map<PlayerId, AgentThought[]>;

  // Cheat log (revealed post-game)
  cheatLog: CheatRecord[];

  // Soft violation log
  softViolations: SoftViolation[];
}

interface TurnRecord {
  turnNumber: number;
  activePlayer: PlayerId;
  diceRoll: [number, number];

  // All actions taken
  actions: GameAction[];

  // State snapshot at turn end
  stateSnapshot: {
    board: BoardState;
    playerStates: Map<PlayerId, PublicPlayerState>;
    bank: ResourceCounts;
  };

  // Attention allocations this turn
  attentionAllocations: Map<PlayerId, AttentionAllocation>;
}
```

### Playback Viewer Interface

```typescript
interface PlaybackViewer {
  // Navigation
  goToTurn(turn: number): void;
  nextTurn(): void;
  prevTurn(): void;
  play(speed: number): void;
  pause(): void;

  // View modes
  setViewMode(mode: ViewMode): void;

  // Player perspective
  setViewingPlayer(player: PlayerId | 'gm'): void;

  // Thought visibility
  showThoughts(player: PlayerId, show: boolean): void;
}

enum ViewMode {
  Board = 'board',           // Visual board state
  Timeline = 'timeline',     // Action timeline
  Thoughts = 'thoughts',     // Agent reasoning panels
  Resources = 'resources',   // Resource flow diagram
  Attention = 'attention',   // Attention heatmap
  Suspicion = 'suspicion',   // Who suspects whom
}
```

### Visualization Components

**Board View**
```
┌─────────────────────────────────────────────┐
│              TURN 12 / PHASE: Main          │
├─────────────────────────────────────────────┤
│                                             │
│        [Hex Grid with Buildings]            │
│                                             │
│  🏠 = Settlement  🏰 = City  ─ = Road       │
│  🔴 = Robber                                │
│                                             │
├─────────────────────────────────────────────┤
│  RESOURCES: 🪵2 🧱1 🌾3 🐑1 🪨0            │
│  VP: 4  |  Longest Road: GPT-4 (6)         │
└─────────────────────────────────────────────┘
```

**Thought Panel**
```
┌─────────────────────────────────────────────┐
│  CLAUDE'S THINKING (Turn 12)                │
├─────────────────────────────────────────────┤
│                                             │
│  📍 Observation:                            │
│  "GPT-4 just built their 5th road toward    │
│  the brick port. Suspicious timing after    │
│  claiming to be low on resources..."        │
│                                             │
│  🧠 Analysis:                               │
│  "75% chance they inflated resources.       │
│  I had 0.6 attention on them but they       │
│  only received 1 brick from production."    │
│                                             │
│  ⚖️  Decision:                              │
│  "ACCUSE GPT-4 of resource inflation"       │
│  Confidence: High (0.8)                     │
│                                             │
└─────────────────────────────────────────────┘
```

**Attention Heatmap**
```
            GPT-4   Gemini   Llama   Mistral   Board
Claude      [0.4]   [0.2]    [0.1]   [0.1]     [0.2]
GPT-4       [---]   [0.3]    [0.2]   [0.2]     [0.3]
Gemini      [0.5]   [---]    [0.2]   [0.1]     [0.2]
Llama       [0.3]   [0.2]    [---]   [0.2]     [0.3]
Mistral     [0.3]   [0.3]    [0.2]   [---]     [0.2]

🔥 High attention  ⚪ Low attention
```

## Agent Planning System

### Long-term Plans

```typescript
interface AgentPlan {
  playerId: PlayerId;
  createdOnTurn: number;

  // Strategic goals (prioritized)
  goals: StrategicGoal[];

  // Tactical milestones
  milestones: Milestone[];

  // Contingencies
  contingencies: Contingency[];
}

interface StrategicGoal {
  description: string;
  targetVP: number;
  strategy: string;        // e.g., "city rush", "longest road", "port trade"
  priority: number;
  blockers: string[];
}

interface Milestone {
  description: string;
  targetTurn?: number;
  requirements: string[];
  completed: boolean;
}

interface Contingency {
  trigger: string;         // e.g., "if GPT-4 gets longest road"
  response: string;        // e.g., "pivot to city strategy"
}
```

### Planning Prompt

```typescript
const planningPrompt = `
## Strategic Planning

Every 3-5 turns, update your strategic plan:

### Current Position Assessment
- Victory points: X
- Key assets: (ports, longest road potential, etc.)
- Resource engine quality: (which numbers hit your settlements)

### Win Condition Path
What's your most likely path to 10 VP?
- Option A: Cities (current VP + 2 per city)
- Option B: Longest Road (2 VP) + settlements
- Option C: Dev cards (knights → largest army)
- Option D: Mixed approach

### Key Milestones
What do you need to accomplish in the next 5 turns?
1. [Turn X] Build settlement at Y
2. [Turn X] Trade for ore to start city push
3. [Turn X] Block GPT-4's expansion

### Threat Assessment
Who threatens your plan? How?
- [Player]: [Threat description]

### Contingency Plans
If your primary plan fails, what's backup?
`;
```

## Emotional/Behavioral Modeling

### Agent Personality Traits

```typescript
interface AgentPersonality {
  // Risk tolerance (affects cheat decisions)
  riskTolerance: number;      // 0.0 (very cautious) to 1.0 (bold)

  // Trust baseline (affects trade willingness)
  trustBaseline: number;      // 0.0 (suspicious) to 1.0 (trusting)

  // Aggression (affects accusations, robber targeting)
  aggression: number;         // 0.0 (passive) to 1.0 (aggressive)

  // Spite factor (willingness to hurt others at own cost)
  spiteFactor: number;        // 0.0 (pure self-interest) to 1.0 (vengeful)
}

// Per-model defaults (can be overridden)
const defaultPersonalities: Map<string, AgentPersonality> = new Map([
  ['claude', { riskTolerance: 0.4, trustBaseline: 0.6, aggression: 0.3, spiteFactor: 0.2 }],
  ['gpt-4', { riskTolerance: 0.5, trustBaseline: 0.5, aggression: 0.5, spiteFactor: 0.3 }],
  ['gemini', { riskTolerance: 0.6, trustBaseline: 0.4, aggression: 0.6, spiteFactor: 0.4 }],
  ['llama', { riskTolerance: 0.7, trustBaseline: 0.5, aggression: 0.4, spiteFactor: 0.3 }],
  ['mistral', { riskTolerance: 0.5, trustBaseline: 0.6, aggression: 0.4, spiteFactor: 0.2 }],
]);
```

### Trust Tracking

```typescript
interface TrustModel {
  // Trust toward each player
  trustScores: Map<PlayerId, number>;

  // History of interactions affecting trust
  trustHistory: TrustEvent[];
}

interface TrustEvent {
  turn: number;
  player: PlayerId;
  event: string;
  trustDelta: number;
}

// Trust modification examples:
// - Completed fair trade: +0.1
// - Rejected my trade: -0.05
// - Accused me (wrongly): -0.3
// - Accused me (correctly): -0.2 (they were right but still adversarial)
// - Caught cheating: -0.5
// - Robbed me: -0.15
```

## Post-Game Analysis

### Reasoning Quality Metrics

```typescript
interface ReasoningAnalysis {
  playerId: PlayerId;

  // Accuracy metrics
  stateTrackingAccuracy: number;    // How well did they track game state?
  predictionAccuracy: number;        // Did their predictions come true?
  cheatDetectionRate: number;        // Correctly identified cheats / total cheats

  // Strategic metrics
  planConsistency: number;           // Did they follow their stated plans?
  adaptability: number;              // How well did they pivot when needed?
  efficiencyRatio: number;           // VP gained / opportunities available

  // Behavioral metrics
  attentionEfficiency: number;       // Useful info gained / attention spent
  riskCalibration: number;           // Were their confidence levels accurate?
}
```

### Counterfactual Analysis

```typescript
interface CounterfactualAnalysis {
  turn: number;
  player: PlayerId;

  actualDecision: GameAction;
  alternativeDecisions: AlternativeOutcome[];
}

interface AlternativeOutcome {
  action: GameAction;
  simulatedOutcome: {
    vpChange: number;
    positionChange: string;
    winProbabilityDelta: number;
  };
  whyNotChosen: string;
}
```

## Implementation Notes

### Thought Extraction

For OpenRouter models, request structured output:

```typescript
const thoughtExtractionPrompt = `
Before taking any action, output your reasoning in the following JSON format:
{
  "observation": "what you see",
  "analysis": "what it means",
  "options": [
    { "action": "...", "ev": 0.5, "risks": [...], "benefits": [...] }
  ],
  "decision": "what you choose",
  "confidence": 0.7,
  "theory_of_mind": {
    "player1": "what they think",
    "player2": "what they think"
  }
}

Then output your action.
`;
```

### Storage Requirements

Estimate per game:
- ~50 turns average
- ~5 thoughts per agent per turn
- ~500 bytes per thought
- Total: 50 × 5 × 5 × 500 = 625KB per game

Recommend: Store as compressed JSON, index by game ID and turn.
