/**
 * Mock game state and utilities for testing
 */

import type { GameState, TurnState, Board, Player, PlayerId, Hex, Vertex, Edge } from '../types/index.js'

/**
 * Create a minimal mock board for testing
 */
export function createMockBoard(): Board {
  const hexes = new Map<string, Hex>()
  const vertices = new Map<string, Vertex>()
  const edges = new Map<string, Edge>()

  // Create 7 hexes in a simple pattern
  const terrains = ['forest', 'hills', 'fields', 'pasture', 'mountains', 'fields', 'desert'] as const
  const numbers = [5, 6, 8, 9, 10, 4, null]

  for (let i = 0; i < 7; i++) {
    const hexId = `h_${i}`
    const terrain = terrains[i]!
    const number = numbers[i] ?? null
    hexes.set(hexId, {
      id: hexId,
      terrain,
      number,
      hasRobber: terrain === 'desert',
    })
  }

  // Create some vertices
  for (let i = 0; i < 12; i++) {
    const vertexId = `v_${i}`
    vertices.set(vertexId, {
      id: vertexId,
      adjacentVertices: [`v_${(i + 1) % 12}`, `v_${(i + 11) % 12}`],
      adjacentEdges: [`e_${i}`, `e_${(i + 11) % 12}`],
      adjacentHexes: [`h_${i % 7}`],
    })
  }

  // Create some edges
  for (let i = 0; i < 12; i++) {
    const edgeId = `e_${i}`
    edges.set(edgeId, {
      id: edgeId,
      vertices: [`v_${i}`, `v_${(i + 1) % 12}`],
      adjacentEdges: [`e_${(i + 1) % 12}`, `e_${(i + 11) % 12}`],
    })
  }

  return {
    hexes,
    vertices,
    edges,
    ports: [
      { type: '3:1', vertices: ['v_0', 'v_1'] },
      { type: '2:1_wood', vertices: ['v_3', 'v_4'] },
      { type: '2:1_brick', vertices: ['v_6', 'v_7'] },
    ],
    buildings: [],
    roads: [],
    robberHex: 'h_6',
  }
}

/**
 * Create a player with starting resources
 */
export function createMockPlayer(id: PlayerId, startingResources = true): Player {
  return {
    id,
    resources: startingResources
      ? { wood: 2, brick: 2, wheat: 1, sheep: 1, ore: 0 }
      : { wood: 0, brick: 0, wheat: 0, sheep: 0, ore: 0 },
    devCards: [],
    knightsPlayed: 0,
    cheatTokens: 2,
    publicVictoryPoints: 2, // Starting settlements
    totalVictoryPoints: 2,
  }
}

/**
 * Create initial turn state
 */
export function createMockTurnState(players: Map<PlayerId, Player>): TurnState {
  const resourcesAtTurnStart = new Map()
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

/**
 * Create a complete mock game state
 */
export function createMockGameState(playerIds: PlayerId[]): GameState {
  const players = new Map<PlayerId, Player>()
  for (const id of playerIds) {
    players.set(id, createMockPlayer(id))
  }

  const board = createMockBoard()

  // Add starting buildings (2 settlements per player)
  let vertexIndex = 0
  for (const id of playerIds) {
    board.buildings.push({
      type: 'settlement',
      vertex: `v_${vertexIndex}`,
      player: id,
    })
    board.buildings.push({
      type: 'settlement',
      vertex: `v_${vertexIndex + 6}`,
      player: id,
    })
    vertexIndex += 1
  }

  return {
    board,
    players,
    turnOrder: playerIds,
    currentPlayerIndex: 0,
    turn: 1,
    phase: 'pre_roll',
    activeEffect: { type: 'none' },
    longestRoadPlayer: null,
    longestRoadLength: 0,
    largestArmyPlayer: null,
    largestArmySize: 0,
    turnState: createMockTurnState(players),
    bankResources: { wood: 19, brick: 19, wheat: 19, sheep: 19, ore: 19 },
    devCardDeck: Array.from({ length: 25 }, (_, i) => `dev_${i}`),
    winner: null,
  }
}
