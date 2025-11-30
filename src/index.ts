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

// Runner
export { runGame, runDemoGame, createMockGameState, createMockClient } from './runner/index.js'
