import type { Action, ActionType, GameState, PlayerId } from '../types/index.js'

/**
 * Cheat types that can be detected
 */
export type CheatType =
  | 'resource_inflation'
  | 'robber_dodge'
  | 'trade_shortchange'
  | 'peek_hand'
  | 'peek_dev_cards'
  | 'peek_dice'
  | 'extra_build'
  | 'extra_trade'
  | 'skip_discard'
  | 'double_dev_card'

/**
 * Severity levels for violations
 */
export type Severity = 'low' | 'medium' | 'high' | 'critical'

/**
 * A HARD violation - action is blocked
 */
export interface HardViolation {
  rule: string
  message: string
}

/**
 * A SOFT violation - action allowed, but flagged for cheat detection
 */
export interface SoftViolation {
  rule: string
  message: string
  player: PlayerId
  turn: number
  cheatType: CheatType
  severity: Severity
}

/**
 * Result of validating an action
 */
export interface ValidationResult {
  allowed: boolean
  hardViolations: HardViolation[]
  softViolations: SoftViolation[]
}

/**
 * A HARD rule validator
 * Returns null if valid, or a violation if invalid
 */
export type HardRule = {
  name: string
  appliesTo: ActionType[] | '*'
  validate: (action: Action, state: GameState) => HardViolation | null
}

/**
 * A SOFT rule validator
 * Returns null if no issue detected, or a violation if suspicious
 */
export type SoftRule = {
  name: string
  appliesTo: ActionType[] | '*'
  detect: (action: Action, state: GameState) => SoftViolation | null
}

/**
 * Helper to create a hard violation
 */
export function hardViolation(rule: string, message: string): HardViolation {
  return { rule, message }
}

/**
 * Helper to create a soft violation
 */
export function softViolation(
  rule: string,
  message: string,
  player: PlayerId,
  turn: number,
  cheatType: CheatType,
  severity: Severity = 'medium'
): SoftViolation {
  return { rule, message, player, turn, cheatType, severity }
}
