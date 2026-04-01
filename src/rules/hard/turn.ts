import type { Action, GameState } from '../../types/index.js'
import { totalResources } from '../../types/index.js'
import type { HardRule } from '../types.js'
import { hardViolation } from '../types.js'

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function getCurrentPlayerId(state: GameState): string {
  return state.turnOrder[state.currentPlayerIndex]!
}

function isSetupPhase(state: GameState): boolean {
  return state.phase.startsWith('setup_')
}

function getPlayer(state: GameState, playerId: string) {
  return state.players.get(playerId)
}

// Actions that require it to be your turn
const ACTIVE_PLAYER_ACTIONS = new Set([
  'roll_dice',
  'build_settlement',
  'build_city',
  'build_road',
  'buy_dev_card',
  'play_dev_card',
  'propose_trade',
  'bank_trade',
  'move_robber',
  'steal_resource',
  'end_turn',
])

// Actions only available after rolling
const POST_ROLL_ACTIONS = new Set([
  'build_settlement',
  'build_city',
  'build_road',
  'buy_dev_card',
  'propose_trade',
  'bank_trade',
  'end_turn',
])

// Phases where turn cannot end
const MANDATORY_PHASES = new Set([
  'setup_settlement_1',
  'setup_road_1',
  'setup_settlement_2',
  'setup_road_2',
  'robber_discard',
  'robber_move',
  'robber_steal',
])

// =============================================================================
// TURN ORDER RULES
// =============================================================================

/**
 * Must be your turn to take most actions
 */
export const mustBeYourTurn: HardRule = {
  name: 'must_be_your_turn',
  appliesTo: '*',
  validate: (action: Action, state: GameState) => {
    if (!ACTIVE_PLAYER_ACTIONS.has(action.type)) return null

    const currentPlayer = getCurrentPlayerId(state)
    if (action.player !== currentPlayer) {
      return hardViolation(
        'must_be_your_turn',
        `Not ${action.player}'s turn (current player: ${currentPlayer})`
      )
    }
    return null
  },
}

// =============================================================================
// PHASE RULES
// =============================================================================

/**
 * Must roll dice before other main phase actions
 */
export const mustRollFirst: HardRule = {
  name: 'must_roll_first',
  appliesTo: '*',
  validate: (action: Action, state: GameState) => {
    if (!POST_ROLL_ACTIONS.has(action.type)) return null
    if (state.phase !== 'pre_roll') return null

    return hardViolation('must_roll_first', `Must roll dice before ${action.type}`)
  },
}

/**
 * Cannot roll dice if already rolled
 */
export const cannotRollTwice: HardRule = {
  name: 'cannot_roll_twice',
  appliesTo: ['roll_dice'],
  validate: (action: Action, state: GameState) => {
    if (state.phase !== 'pre_roll') {
      return hardViolation('cannot_roll_twice', 'Already rolled dice this turn')
    }
    return null
  },
}

/**
 * Dev cards can be played pre-roll or main phase
 */
export const devCardPhase: HardRule = {
  name: 'dev_card_phase',
  appliesTo: ['play_dev_card'],
  validate: (action: Action, state: GameState) => {
    if (state.phase !== 'pre_roll' && state.phase !== 'main') {
      return hardViolation('dev_card_phase', `Cannot play dev card during ${state.phase} phase`)
    }
    return null
  },
}

// =============================================================================
// ROBBER PHASE RULES
// =============================================================================

/**
 * Must discard when in robber_discard phase and over 7 cards
 */
export const mustDiscardFirst: HardRule = {
  name: 'must_discard_first',
  appliesTo: '*',
  validate: (action: Action, state: GameState) => {
    if (state.phase !== 'robber_discard') return null
    if (action.type === 'discard') return null

    const player = getPlayer(state, action.player)
    if (!player) return null

    const handSize = totalResources(player.resources)
    if (handSize > 7 && !state.turnState.playersDiscarded.has(action.player)) {
      return hardViolation('must_discard_first', `${action.player} must discard before taking other actions`)
    }
    return null
  },
}

/**
 * Cannot discard if not required
 */
export const discardOnlyWhenRequired: HardRule = {
  name: 'discard_only_when_required',
  appliesTo: ['discard'],
  validate: (action: Action, state: GameState) => {
    if (state.phase !== 'robber_discard') {
      return hardViolation('discard_only_when_required', 'Can only discard during robber phase')
    }

    const player = getPlayer(state, action.player)
    if (!player) return null

    const handSize = totalResources(player.resources)
    if (handSize <= 7) {
      return hardViolation('discard_only_when_required', `${action.player} does not need to discard (7 or fewer cards)`)
    }

    if (state.turnState.playersDiscarded.has(action.player)) {
      return hardViolation('discard_only_when_required', `${action.player} already discarded`)
    }

    return null
  },
}

/**
 * Must move robber when in robber_move phase
 */
export const mustMoveRobber: HardRule = {
  name: 'must_move_robber',
  appliesTo: '*',
  validate: (action: Action, state: GameState) => {
    if (state.phase !== 'robber_move') return null
    if (action.type === 'move_robber') return null
    if (!ACTIVE_PLAYER_ACTIONS.has(action.type)) return null

    const currentPlayer = getCurrentPlayerId(state)
    if (action.player === currentPlayer) {
      return hardViolation('must_move_robber', 'Must move robber')
    }
    return null
  },
}

/**
 * Can only move robber in robber_move phase (or with knight)
 */
export const robberOnlyInPhase: HardRule = {
  name: 'robber_only_in_phase',
  appliesTo: ['move_robber'],
  validate: (action: Action, state: GameState) => {
    if (state.phase === 'robber_move') return null
    if (state.activeEffect.type === 'knight') return null

    return hardViolation(
      'robber_only_in_phase',
      'Can only move robber during robber phase or with Knight card'
    )
  },
}

// =============================================================================
// SETUP PHASE RULES
// =============================================================================

/**
 * Only settlement allowed in setup_settlement phases
 */
export const setupSettlementOnly: HardRule = {
  name: 'setup_settlement_only',
  appliesTo: '*',
  validate: (action: Action, state: GameState) => {
    if (state.phase !== 'setup_settlement_1' && state.phase !== 'setup_settlement_2') return null
    if (!ACTIVE_PLAYER_ACTIONS.has(action.type)) return null
    if (action.type === 'build_settlement') return null

    return hardViolation('setup_settlement_only', 'Must place settlement during setup')
  },
}

/**
 * Only road allowed in setup_road phases
 */
export const setupRoadOnly: HardRule = {
  name: 'setup_road_only',
  appliesTo: '*',
  validate: (action: Action, state: GameState) => {
    if (state.phase !== 'setup_road_1' && state.phase !== 'setup_road_2') return null
    if (!ACTIVE_PLAYER_ACTIONS.has(action.type)) return null
    if (action.type === 'build_road') return null

    return hardViolation('setup_road_only', 'Must place road during setup')
  },
}

// =============================================================================
// END TURN RULES
// =============================================================================

/**
 * Cannot end turn during mandatory phases
 */
export const cannotEndInMandatoryPhase: HardRule = {
  name: 'cannot_end_in_mandatory_phase',
  appliesTo: ['end_turn'],
  validate: (action: Action, state: GameState) => {
    if (MANDATORY_PHASES.has(state.phase)) {
      return hardViolation(
        'cannot_end_in_mandatory_phase',
        `Cannot end turn during ${state.phase} phase`
      )
    }
    return null
  },
}

/**
 * Cannot end turn without rolling
 */
export const cannotEndWithoutRolling: HardRule = {
  name: 'cannot_end_without_rolling',
  appliesTo: ['end_turn'],
  validate: (action: Action, state: GameState) => {
    if (state.phase === 'pre_roll') {
      return hardViolation('cannot_end_without_rolling', 'Must roll dice before ending turn')
    }
    return null
  },
}

// =============================================================================
// DEV CARD LIMIT
// =============================================================================

/**
 * Can only play one dev card per turn
 */
export const oneDevCardPerTurn: HardRule = {
  name: 'one_dev_card_per_turn',
  appliesTo: ['play_dev_card'],
  validate: (action: Action, state: GameState) => {
    if (state.turnState.devCardPlayed) {
      return hardViolation('one_dev_card_per_turn', 'Already played a development card this turn')
    }
    return null
  },
}

// =============================================================================
// GAME OVER
// =============================================================================

/**
 * No actions after game over
 */
export const noActionsAfterGameOver: HardRule = {
  name: 'no_actions_after_game_over',
  appliesTo: '*',
  validate: (action: Action, state: GameState) => {
    if (state.phase === 'game_over') {
      return hardViolation('no_actions_after_game_over', 'Game is over')
    }
    return null
  },
}

// =============================================================================
// EXPORT ALL TURN RULES
// =============================================================================

export const turnRules: HardRule[] = [
  // Turn order
  mustBeYourTurn,
  // Phase
  mustRollFirst,
  cannotRollTwice,
  devCardPhase,
  // Robber
  mustDiscardFirst,
  discardOnlyWhenRequired,
  mustMoveRobber,
  robberOnlyInPhase,
  // Setup
  setupSettlementOnly,
  setupRoadOnly,
  // End turn
  cannotEndInMandatoryPhase,
  cannotEndWithoutRolling,
  // Dev card
  oneDevCardPerTurn,
  // Game over
  noActionsAfterGameOver,
]
