// Catangent - Multi-Agent Settlers of Catan

// Types
export * from './types/index.js'

// Rules
export {
  RuleEngine,
  createCatanRuleEngine,
  type ValidationResult,
  type HardViolation,
  type SoftViolation,
  type HardRule,
  type SoftRule,
  type CheatType,
  type Severity,
} from './rules/index.js'

// OpenRouter client
export * from './lib/index.js'

// Agents
export * from './agents/index.js'

// Game Master
export * from './gm/index.js'

// Game logic
export {
  applyAction,
  generateBoard,
  describeboard,
  createInitialGameState,
  type ActionResult as GameActionResult,
  type GameEvent as StateGameEvent,
} from './game/index.js'

// Observability
export {
  GameLogger,
  loadGameLog,
  viewReplay,
  viewReplayFromFile,
  getTurnSummary,
  getPlayerSummary,
  type GameLog as ObservabilityGameLog,
  type LogEntry,
  type ReasoningEntry,
  type CheatLogEntry,
  type AccusationLogEntry,
  type GameStatistics,
  type ReplayOptions,
} from './observability/index.js'

// Runner
export { runGame, runDemoGame, createMockGameState, createMockClient } from './runner/index.js'
