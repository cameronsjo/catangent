import type { Action, GameState } from '../types/index.js'
import type { HardRule, SoftRule, ValidationResult } from './types.js'

/**
 * The rule engine evaluates actions against HARD and SOFT rules
 */
export class RuleEngine {
  private hardRules: HardRule[] = []
  private softRules: SoftRule[] = []

  /**
   * Register a HARD rule (blocks invalid actions)
   */
  addHardRule(rule: HardRule): this {
    this.hardRules.push(rule)
    return this
  }

  /**
   * Register multiple HARD rules
   */
  addHardRules(rules: HardRule[]): this {
    this.hardRules.push(...rules)
    return this
  }

  /**
   * Register a SOFT rule (flags suspicious actions)
   */
  addSoftRule(rule: SoftRule): this {
    this.softRules.push(rule)
    return this
  }

  /**
   * Register multiple SOFT rules
   */
  addSoftRules(rules: SoftRule[]): this {
    this.softRules.push(...rules)
    return this
  }

  /**
   * Validate an action against all rules
   */
  validate(action: Action, state: GameState): ValidationResult {
    const hardViolations = this.hardRules
      .filter(rule => this.ruleApplies(rule, action))
      .map(rule => rule.validate(action, state))
      .filter((v): v is NonNullable<typeof v> => v !== null)

    const softViolations = this.softRules
      .filter(rule => this.ruleApplies(rule, action))
      .map(rule => rule.detect(action, state))
      .filter((v): v is NonNullable<typeof v> => v !== null)

    return {
      allowed: hardViolations.length === 0,
      hardViolations,
      softViolations,
    }
  }

  /**
   * Check if an action is allowed (ignores soft violations)
   */
  isAllowed(action: Action, state: GameState): boolean {
    return this.validate(action, state).allowed
  }

  /**
   * Get just the hard violations for an action
   */
  getHardViolations(action: Action, state: GameState) {
    return this.validate(action, state).hardViolations
  }

  /**
   * Get just the soft violations for an action
   */
  getSoftViolations(action: Action, state: GameState) {
    return this.validate(action, state).softViolations
  }

  /**
   * Check if a rule applies to an action type
   */
  private ruleApplies(rule: HardRule | SoftRule, action: Action): boolean {
    if (rule.appliesTo === '*') return true
    return rule.appliesTo.includes(action.type)
  }

  /**
   * Get count of registered rules
   */
  getRuleCounts() {
    return {
      hard: this.hardRules.length,
      soft: this.softRules.length,
    }
  }
}

/**
 * Create and configure the default rule engine with all Catan rules
 */
export function createCatanRuleEngine(): RuleEngine {
  const engine = new RuleEngine()

  // Rules will be registered by importing from hard/ and soft/ modules
  // This is just the factory function

  return engine
}
