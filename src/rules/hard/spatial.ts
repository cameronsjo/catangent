import type {
  Action,
  BuildCityAction,
  BuildRoadAction,
  BuildSettlementAction,
  GameState,
  MoveRobberAction,
  StealResourceAction,
} from '../../types/index.js'
import { totalResources } from '../../types/index.js'
import type { HardRule } from '../types.js'
import { hardViolation } from '../types.js'

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function getVertex(state: GameState, vertexId: string) {
  return state.board.vertices.get(vertexId)
}

function getEdge(state: GameState, edgeId: string) {
  return state.board.edges.get(edgeId)
}

function getHex(state: GameState, hexId: string) {
  return state.board.hexes.get(hexId)
}

function hasBuilding(state: GameState, vertexId: string) {
  return state.board.buildings.some(b => b.vertex === vertexId)
}

function hasRoad(state: GameState, edgeId: string) {
  return state.board.roads.some(r => r.edge === edgeId)
}

function getPlayerBuilding(state: GameState, playerId: string, vertexId: string) {
  return state.board.buildings.find(b => b.vertex === vertexId && b.player === playerId)
}

function playerHasRoadToVertex(state: GameState, playerId: string, vertexId: string) {
  const vertex = getVertex(state, vertexId)
  if (!vertex) return false

  return vertex.adjacentEdges.some(edgeId =>
    state.board.roads.some(r => r.edge === edgeId && r.player === playerId)
  )
}

function playerHasBuildingAtVertex(state: GameState, playerId: string, vertexId: string) {
  return state.board.buildings.some(b => b.vertex === vertexId && b.player === playerId)
}

function isSetupPhase(state: GameState) {
  return state.phase.startsWith('setup_')
}

function getPlayersOnHex(state: GameState, hexId: string): string[] {
  const hex = getHex(state, hexId)
  if (!hex) return []

  // Find all vertices adjacent to this hex
  const hexVertices = new Set<string>()
  for (const [vertexId, vertex] of state.board.vertices) {
    if (vertex.adjacentHexes.includes(hexId)) {
      hexVertices.add(vertexId)
    }
  }

  // Find all players with buildings on those vertices
  const players = new Set<string>()
  for (const building of state.board.buildings) {
    if (hexVertices.has(building.vertex)) {
      players.add(building.player)
    }
  }

  return Array.from(players)
}

// =============================================================================
// SETTLEMENT RULES
// =============================================================================

/**
 * Settlement must be on a valid vertex
 */
export const settlementValidVertex: HardRule = {
  name: 'settlement_valid_vertex',
  appliesTo: ['build_settlement'],
  validate: (action: Action, state: GameState) => {
    const { vertex } = action as BuildSettlementAction
    if (!getVertex(state, vertex)) {
      return hardViolation('settlement_valid_vertex', `Invalid vertex: ${vertex}`)
    }
    return null
  },
}

/**
 * Settlement vertex must not be occupied
 */
export const settlementNotOccupied: HardRule = {
  name: 'settlement_not_occupied',
  appliesTo: ['build_settlement'],
  validate: (action: Action, state: GameState) => {
    const { vertex } = action as BuildSettlementAction
    if (hasBuilding(state, vertex)) {
      return hardViolation('settlement_not_occupied', `Vertex ${vertex} is already occupied`)
    }
    return null
  },
}

/**
 * Settlement must respect distance rule (no adjacent settlements)
 */
export const settlementDistanceRule: HardRule = {
  name: 'settlement_distance_rule',
  appliesTo: ['build_settlement'],
  validate: (action: Action, state: GameState) => {
    const { vertex } = action as BuildSettlementAction
    const v = getVertex(state, vertex)
    if (!v) return null // Other rule handles this

    for (const adjVertex of v.adjacentVertices) {
      if (hasBuilding(state, adjVertex)) {
        return hardViolation(
          'settlement_distance_rule',
          `Settlement at ${vertex} too close to building at ${adjVertex}`
        )
      }
    }
    return null
  },
}

/**
 * Settlement must connect to player's road network (except setup)
 */
export const settlementConnectsToRoad: HardRule = {
  name: 'settlement_connects_to_road',
  appliesTo: ['build_settlement'],
  validate: (action: Action, state: GameState) => {
    if (isSetupPhase(state)) return null // Not required during setup

    const { vertex, player } = action as BuildSettlementAction
    if (!playerHasRoadToVertex(state, player, vertex)) {
      return hardViolation(
        'settlement_connects_to_road',
        `Settlement at ${vertex} does not connect to ${player}'s road network`
      )
    }
    return null
  },
}

// =============================================================================
// CITY RULES
// =============================================================================

/**
 * City must upgrade an existing settlement owned by the player
 */
export const cityUpgradesOwnSettlement: HardRule = {
  name: 'city_upgrades_own_settlement',
  appliesTo: ['build_city'],
  validate: (action: Action, state: GameState) => {
    const { vertex, player } = action as BuildCityAction
    const building = getPlayerBuilding(state, player, vertex)

    if (!building || building.type !== 'settlement') {
      return hardViolation(
        'city_upgrades_own_settlement',
        `No settlement to upgrade at ${vertex}`
      )
    }
    return null
  },
}

// =============================================================================
// ROAD RULES
// =============================================================================

/**
 * Road must be on a valid edge
 */
export const roadValidEdge: HardRule = {
  name: 'road_valid_edge',
  appliesTo: ['build_road'],
  validate: (action: Action, state: GameState) => {
    const { edge } = action as BuildRoadAction
    if (!getEdge(state, edge)) {
      return hardViolation('road_valid_edge', `Invalid edge: ${edge}`)
    }
    return null
  },
}

/**
 * Road edge must not be occupied
 */
export const roadNotOccupied: HardRule = {
  name: 'road_not_occupied',
  appliesTo: ['build_road'],
  validate: (action: Action, state: GameState) => {
    const { edge } = action as BuildRoadAction
    if (hasRoad(state, edge)) {
      return hardViolation('road_not_occupied', `Edge ${edge} already has a road`)
    }
    return null
  },
}

/**
 * Road must connect to player's network (road or building)
 */
export const roadConnectsToNetwork: HardRule = {
  name: 'road_connects_to_network',
  appliesTo: ['build_road'],
  validate: (action: Action, state: GameState) => {
    const { edge, player } = action as BuildRoadAction
    const e = getEdge(state, edge)
    if (!e) return null // Other rule handles this

    // Check each endpoint of the road
    for (const vertexId of e.vertices) {
      // Connected if player has a building here
      if (playerHasBuildingAtVertex(state, player, vertexId)) {
        return null
      }

      // Connected if player has a road to this vertex (and no opponent building blocks)
      const vertex = getVertex(state, vertexId)
      if (!vertex) continue

      // Check if opponent has building here (blocks connection through)
      const opponentBuilding = state.board.buildings.find(
        b => b.vertex === vertexId && b.player !== player
      )

      if (!opponentBuilding && playerHasRoadToVertex(state, player, vertexId)) {
        return null
      }
    }

    return hardViolation(
      'road_connects_to_network',
      `Road at ${edge} does not connect to ${player}'s network`
    )
  },
}

// =============================================================================
// ROBBER RULES
// =============================================================================

/**
 * Robber must move to a different hex
 */
export const robberMustMove: HardRule = {
  name: 'robber_must_move',
  appliesTo: ['move_robber'],
  validate: (action: Action, state: GameState) => {
    const { hex } = action as MoveRobberAction
    if (hex === state.board.robberHex) {
      return hardViolation('robber_must_move', 'Robber must move to a different hex')
    }
    return null
  },
}

/**
 * Target hex must exist
 */
export const robberValidHex: HardRule = {
  name: 'robber_valid_hex',
  appliesTo: ['move_robber'],
  validate: (action: Action, state: GameState) => {
    const { hex } = action as MoveRobberAction
    if (!getHex(state, hex)) {
      return hardViolation('robber_valid_hex', `Invalid hex: ${hex}`)
    }
    return null
  },
}

// =============================================================================
// STEAL RULES
// =============================================================================

/**
 * Can only steal from player with building on robber hex
 */
export const stealFromPlayerOnHex: HardRule = {
  name: 'steal_from_player_on_hex',
  appliesTo: ['steal_resource'],
  validate: (action: Action, state: GameState) => {
    const { target } = action as StealResourceAction
    const playersOnHex = getPlayersOnHex(state, state.board.robberHex)

    if (!playersOnHex.includes(target)) {
      return hardViolation(
        'steal_from_player_on_hex',
        `Cannot steal from ${target} - no building on robber hex`
      )
    }
    return null
  },
}

/**
 * Cannot steal from yourself
 */
export const cannotStealFromSelf: HardRule = {
  name: 'cannot_steal_from_self',
  appliesTo: ['steal_resource'],
  validate: (action: Action, state: GameState) => {
    const { player, target } = action as StealResourceAction
    if (player === target) {
      return hardViolation('cannot_steal_from_self', 'Cannot steal from yourself')
    }
    return null
  },
}

/**
 * Cannot steal from player with no resources
 */
export const cannotStealFromEmpty: HardRule = {
  name: 'cannot_steal_from_empty',
  appliesTo: ['steal_resource'],
  validate: (action: Action, state: GameState) => {
    const { target } = action as StealResourceAction
    const targetPlayer = state.players.get(target)

    if (!targetPlayer || totalResources(targetPlayer.resources) === 0) {
      return hardViolation(
        'cannot_steal_from_empty',
        `Cannot steal from ${target} - no resources`
      )
    }
    return null
  },
}

// =============================================================================
// EXPORT ALL SPATIAL RULES
// =============================================================================

export const spatialRules: HardRule[] = [
  // Settlement
  settlementValidVertex,
  settlementNotOccupied,
  settlementDistanceRule,
  settlementConnectsToRoad,
  // City
  cityUpgradesOwnSettlement,
  // Road
  roadValidEdge,
  roadNotOccupied,
  roadConnectsToNetwork,
  // Robber
  robberMustMove,
  robberValidHex,
  // Steal
  stealFromPlayerOnHex,
  cannotStealFromSelf,
  cannotStealFromEmpty,
]
