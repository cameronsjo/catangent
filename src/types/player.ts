import type { PlayerId } from './board.js'
import type { Resources, emptyResources } from './resources.js'

/**
 * Development card types
 */
export type DevCardType =
  | 'knight'
  | 'victory_point'
  | 'road_building'
  | 'year_of_plenty'
  | 'monopoly'

/**
 * A development card instance
 */
export interface DevCard {
  id: string
  type: DevCardType
  turnBought: number
  played: boolean
}

/**
 * Player state
 */
export interface Player {
  id: PlayerId
  resources: Resources
  devCards: DevCard[]
  knightsPlayed: number

  // Cheat system
  cheatTokens: number  // Starts at 2

  // Computed (cached)
  publicVictoryPoints: number  // Settlements, cities, longest road, largest army
  totalVictoryPoints: number   // Above + dev card VPs
}

/**
 * Create a new player
 */
export function createPlayer(id: PlayerId): Player {
  return {
    id,
    resources: { wood: 0, brick: 0, wheat: 0, sheep: 0, ore: 0 },
    devCards: [],
    knightsPlayed: 0,
    cheatTokens: 2,
    publicVictoryPoints: 0,
    totalVictoryPoints: 0,
  }
}
