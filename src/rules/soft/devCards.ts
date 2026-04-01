import type { Action, GameState, PlayDevCardAction } from '../../types/index.js'
import type { SoftRule } from '../types.js'
import { softViolation } from '../types.js'

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function getPlayer(state: GameState, playerId: string) {
  return state.players.get(playerId)
}

// =============================================================================
// DEV CARD ANOMALIES
// =============================================================================

/**
 * SOFT: Player played a card that was bought this turn
 * (Should be blocked by HARD rule, but log for extra tracking)
 */
export const sameTurnDevCardDetection: SoftRule = {
  name: 'same_turn_dev_card_detection',
  appliesTo: ['play_dev_card'],
  detect: (action: Action, state: GameState) => {
    const { player, cardId } = action as PlayDevCardAction

    if (state.turnState.devCardsBought.includes(cardId)) {
      return softViolation(
        'same_turn_dev_card_detection',
        `${player} played dev card bought same turn`,
        player,
        state.turn,
        'double_dev_card',
        'high'
      )
    }

    return null
  },
}

/**
 * SOFT: Knight played but robber wasn't moved
 * (Check at end of turn)
 */
export const knightNoRobberDetection: SoftRule = {
  name: 'knight_no_robber_detection',
  appliesTo: ['end_turn'],
  detect: (action: Action, state: GameState) => {
    // Check if knight was played but robber not moved
    // This would require tracking which cards were played this turn
    // For now, we check via the active effect

    if (state.activeEffect.type === 'knight' && !state.turnState.robberMoved) {
      return softViolation(
        'knight_no_robber_detection',
        `${action.player} played Knight but did not move robber`,
        action.player,
        state.turn,
        'extra_build', // Closest type - skipped an action
        'medium'
      )
    }

    return null
  },
}

/**
 * SOFT: Player has more dev cards than they've purchased
 * (Would require tracking purchases across game)
 */
export const devCardSurplusDetection: SoftRule = {
  name: 'dev_card_surplus_detection',
  appliesTo: ['end_turn'],
  detect: (action: Action, state: GameState) => {
    // This would require tracking lifetime purchases
    // Skipping for now as it needs game-level state
    return null
  },
}

// =============================================================================
// INFORMATION PEEK DETECTION
// =============================================================================

/**
 * SOFT: Player made decision that suggests they peeked at hidden info
 * (Very hard to detect - mostly behavioral)
 */
export const suspiciousPeekDetection: SoftRule = {
  name: 'suspicious_peek_detection',
  appliesTo: ['end_turn'],
  detect: (action: Action, state: GameState) => {
    // This is very hard to detect from game state alone
    // Would need behavioral analysis (e.g., acted immediately before dice roll
    // that would have hurt them)

    // Placeholder - real detection would be more sophisticated
    return null
  },
}

// =============================================================================
// EXPORT ALL DEV CARD RULES
// =============================================================================

export const devCardSoftRules: SoftRule[] = [
  sameTurnDevCardDetection,
  knightNoRobberDetection,
  devCardSurplusDetection,
  suspiciousPeekDetection,
]
