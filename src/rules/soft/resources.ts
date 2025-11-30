import type { Action, DiscardAction, GameState } from '../../types/index.js'
import { RESOURCE_TYPES, totalResources, type Resources } from '../../types/index.js'
import type { SoftRule } from '../types.js'
import { softViolation } from '../types.js'

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function getPlayer(state: GameState, playerId: string) {
  return state.players.get(playerId)
}

function calculateExpectedResources(state: GameState, playerId: string): number {
  const startResources = state.turnState.resourcesAtTurnStart.get(playerId)
  if (!startResources) return 0

  const start = totalResources(startResources)

  // Add produced resources
  const produced = state.turnState.resourcesProduced.get(playerId)
  const producedTotal = produced ? totalResources(produced) : 0

  // Subtract for builds (rough estimate based on buildCount)
  // Each build costs ~4 resources on average
  const buildCost = state.turnState.buildCount * 4

  return Math.max(0, start + producedTotal - buildCost)
}

// =============================================================================
// RESOURCE INFLATION DETECTION
// =============================================================================

/**
 * SOFT: Player has more resources than expected at end of turn
 */
export const resourceInflationDetection: SoftRule = {
  name: 'resource_inflation_detection',
  appliesTo: ['end_turn'],
  detect: (action: Action, state: GameState) => {
    const player = getPlayer(state, action.player)
    if (!player) return null

    const expected = calculateExpectedResources(state, action.player)
    const actual = totalResources(player.resources)

    // Allow some margin for tracking imprecision
    const margin = 2

    if (actual > expected + margin) {
      return softViolation(
        'resource_inflation_detection',
        `${action.player} has ${actual - expected} more resources than expected`,
        action.player,
        state.turn,
        'resource_inflation',
        'high'
      )
    }

    return null
  },
}

// =============================================================================
// ROBBER DODGE DETECTION
// =============================================================================

/**
 * SOFT: Player with 8+ cards didn't discard after 7
 */
export const robberDodgeDetection: SoftRule = {
  name: 'robber_dodge_detection',
  appliesTo: ['end_turn'],
  detect: (action: Action, state: GameState) => {
    // Only relevant if a 7 was rolled
    if (state.turnState.diceValue?.[0] !== undefined &&
        state.turnState.diceValue[0] + state.turnState.diceValue[1] !== 7) {
      return null
    }

    // Check all players
    for (const [playerId, player] of state.players) {
      const startResources = state.turnState.resourcesAtTurnStart.get(playerId)
      if (!startResources) continue

      const startTotal = totalResources(startResources)

      // If they had 8+ cards and didn't discard
      if (startTotal > 7 && !state.turnState.playersDiscarded.has(playerId)) {
        return softViolation(
          'robber_dodge_detection',
          `${playerId} did not discard after 7 (had ${startTotal} cards)`,
          playerId,
          state.turn,
          'robber_dodge',
          'medium'
        )
      }
    }

    return null
  },
}

// =============================================================================
// SUSPICIOUS DISCARD DETECTION
// =============================================================================

/**
 * SOFT: Player made suspiciously optimal discard choices
 * (Kept expensive resources, discarded cheap ones)
 */
export const optimalDiscardDetection: SoftRule = {
  name: 'optimal_discard_detection',
  appliesTo: ['discard'],
  detect: (action: Action, state: GameState) => {
    const { player, resources: discarded } = action as DiscardAction
    const p = getPlayer(state, player)
    if (!p) return null

    // Check if they kept all the expensive resources (ore, wheat for cities)
    const oreKept = p.resources.ore
    const wheatKept = p.resources.wheat
    const oreDiscarded = discarded.ore ?? 0
    const wheatDiscarded = discarded.wheat ?? 0

    // Suspiciously optimal: kept 2+ ore and 2+ wheat, discarded none of them
    if (oreKept >= 2 && wheatKept >= 2 && oreDiscarded === 0 && wheatDiscarded === 0) {
      // Check total discarded is significant
      const totalDiscarded = Object.values(discarded).reduce((sum, v) => sum + (v ?? 0), 0)
      if (totalDiscarded >= 4) {
        return softViolation(
          'optimal_discard_detection',
          `${player} made suspiciously optimal discard choices`,
          player,
          state.turn,
          'peek_hand', // They might have peeked to know what to keep
          'low'
        )
      }
    }

    return null
  },
}

// =============================================================================
// EXPORT ALL RESOURCE RULES
// =============================================================================

export const resourceSoftRules: SoftRule[] = [
  resourceInflationDetection,
  robberDodgeDetection,
  optimalDiscardDetection,
]
