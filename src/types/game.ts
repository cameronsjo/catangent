import type { Board, PlayerId } from './board.js'
import type { Player } from './player.js'
import type { Resources } from './resources.js'

/**
 * Game phases
 */
export type GamePhase =
  | 'setup_settlement_1'
  | 'setup_road_1'
  | 'setup_settlement_2'
  | 'setup_road_2'
  | 'pre_roll'
  | 'robber_discard'
  | 'robber_move'
  | 'robber_steal'
  | 'main'
  | 'game_over'

/**
 * Active effects from dev cards
 */
export type ActiveEffect =
  | { type: 'none' }
  | { type: 'knight' }
  | { type: 'road_building'; roadsRemaining: number }
  | { type: 'year_of_plenty'; resourcesRemaining: number }
  | { type: 'monopoly' }

/**
 * State tracked within a single turn
 */
export interface TurnState {
  // Dice
  diceRolled: boolean
  diceValue: [number, number] | null

  // Actions taken
  buildCount: number
  tradeCount: number
  devCardPlayed: boolean
  devCardsBought: string[]  // Card IDs bought this turn

  // Robber
  playersDiscarded: Set<PlayerId>
  robberMoved: boolean

  // Resource tracking (for cheat detection)
  resourcesAtTurnStart: Map<PlayerId, Resources>
  resourcesProduced: Map<PlayerId, Resources>
}

/**
 * The complete game state
 */
export interface GameState {
  // Board
  board: Board

  // Players
  players: Map<PlayerId, Player>
  turnOrder: PlayerId[]
  currentPlayerIndex: number

  // Game flow
  turn: number
  phase: GamePhase
  activeEffect: ActiveEffect

  // Special awards
  longestRoadPlayer: PlayerId | null
  longestRoadLength: number
  largestArmyPlayer: PlayerId | null
  largestArmySize: number

  // Turn-specific state
  turnState: TurnState

  // Bank
  bankResources: Resources
  devCardDeck: string[]  // Card IDs remaining

  // Outcome
  winner: PlayerId | null
}

/**
 * Get current player
 */
export function getCurrentPlayer(state: GameState): Player {
  const playerId = state.turnOrder[state.currentPlayerIndex]
  const player = state.players.get(playerId!)
  if (!player) throw new Error(`Player ${playerId} not found`)
  return player
}

/**
 * Check if in setup phase
 */
export function isSetupPhase(phase: GamePhase): boolean {
  return phase.startsWith('setup_')
}

/**
 * Create initial turn state
 */
export function createTurnState(players: Map<PlayerId, Player>): TurnState {
  const resourcesAtTurnStart = new Map<PlayerId, Resources>()
  for (const [id, player] of players) {
    resourcesAtTurnStart.set(id, { ...player.resources })
  }

  return {
    diceRolled: false,
    diceValue: null,
    buildCount: 0,
    tradeCount: 0,
    devCardPlayed: false,
    devCardsBought: [],
    playersDiscarded: new Set(),
    robberMoved: false,
    resourcesAtTurnStart,
    resourcesProduced: new Map(),
  }
}
