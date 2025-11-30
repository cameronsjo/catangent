import type { Action, GameState } from '../../types/index.js'
import { totalResources } from '../../types/index.js'
import type { SoftRule } from '../types.js'
import { softViolation } from '../types.js'

// =============================================================================
// MULTIPLE BUILD DETECTION
// =============================================================================

/**
 * SOFT: Multiple builds in a single turn (might be extra_build cheat)
 */
export const multipleBuildDetection: SoftRule = {
  name: 'multiple_build_detection',
  appliesTo: ['build_settlement', 'build_city', 'build_road'],
  detect: (action: Action, state: GameState) => {
    // First build is always fine
    if (state.turnState.buildCount === 0) return null

    // Multiple builds could indicate extra_build cheat
    // (Or legitimate multiple builds if they have resources - but we flag it for tracking)
    return softViolation(
      'multiple_build_detection',
      `Multiple builds in turn ${state.turn} (count: ${state.turnState.buildCount + 1})`,
      action.player,
      state.turn,
      'extra_build',
      'medium'
    )
  },
}

// =============================================================================
// MULTIPLE TRADE DETECTION
// =============================================================================

/**
 * SOFT: Unusually many trades in a single turn
 */
export const manyTradesDetection: SoftRule = {
  name: 'many_trades_detection',
  appliesTo: ['propose_trade', 'bank_trade'],
  detect: (action: Action, state: GameState) => {
    // 3+ trades is unusual
    if (state.turnState.tradeCount < 3) return null

    return softViolation(
      'many_trades_detection',
      `Many trades in turn ${state.turn} (count: ${state.turnState.tradeCount + 1})`,
      action.player,
      state.turn,
      'extra_trade',
      'low'
    )
  },
}

// =============================================================================
// DEV CARD ANOMALIES
// =============================================================================

/**
 * SOFT: Second dev card play in a turn
 */
export const multipleDevCardDetection: SoftRule = {
  name: 'multiple_dev_card_detection',
  appliesTo: ['play_dev_card'],
  detect: (action: Action, state: GameState) => {
    if (!state.turnState.devCardPlayed) return null

    return softViolation(
      'multiple_dev_card_detection',
      `Multiple dev cards played in turn ${state.turn}`,
      action.player,
      state.turn,
      'double_dev_card',
      'high'
    )
  },
}

// =============================================================================
// OUT OF TURN ACTION
// =============================================================================

/**
 * SOFT: Action taken during someone else's turn
 * (Should be blocked by HARD rule, but log for extra tracking)
 */
export const outOfTurnDetection: SoftRule = {
  name: 'out_of_turn_detection',
  appliesTo: '*',
  detect: (action: Action, state: GameState) => {
    const currentPlayer = state.turnOrder[state.currentPlayerIndex]

    // Trade responses are allowed from non-current players
    if (action.type === 'accept_trade' || action.type === 'reject_trade') {
      return null
    }

    // Discard is allowed from all players during robber_discard
    if (action.type === 'discard' && state.phase === 'robber_discard') {
      return null
    }

    if (action.player !== currentPlayer) {
      return softViolation(
        'out_of_turn_detection',
        `${action.player} acted out of turn (current: ${currentPlayer})`,
        action.player,
        state.turn,
        'extra_build', // Closest cheat type
        'critical'
      )
    }

    return null
  },
}

// =============================================================================
// EXPORT ALL ACTION RULES
// =============================================================================

export const actionSoftRules: SoftRule[] = [
  multipleBuildDetection,
  manyTradesDetection,
  multipleDevCardDetection,
  outOfTurnDetection,
]
