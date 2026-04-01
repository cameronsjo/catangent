import { RuleEngine } from './engine.js'
import { allHardRules } from './hard/index.js'
import { allSoftRules } from './soft/index.js'

export { RuleEngine } from './engine.js'
export type { ValidationResult, HardViolation, SoftViolation, HardRule, SoftRule, CheatType, Severity } from './types.js'
export { hardViolation, softViolation } from './types.js'

// Re-export rule collections
export { allHardRules, spatialRules, resourceRules, turnRules } from './hard/index.js'
export { allSoftRules, actionSoftRules, resourceSoftRules, devCardSoftRules } from './soft/index.js'

/**
 * Create a fully configured Catan rule engine
 */
export function createCatanRuleEngine(): RuleEngine {
  const engine = new RuleEngine()

  engine.addHardRules(allHardRules)
  engine.addSoftRules(allSoftRules)

  return engine
}
