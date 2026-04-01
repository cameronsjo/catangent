/**
 * Board Generator - Creates the standard Catan board layout
 *
 * Standard Catan board:
 * - 19 hexes arranged in a hexagonal pattern (3-4-5-4-3)
 * - 54 vertices (intersection points)
 * - 72 edges (road locations)
 * - 9 ports
 */

import type { Board, Hex, Vertex, Edge, Port, HexId, VertexId, EdgeId, TerrainType } from '../types/board.js'
import type { ResourceType } from '../types/resources.js'

/**
 * Standard terrain distribution
 */
const STANDARD_TERRAINS: TerrainType[] = [
  'forest', 'forest', 'forest', 'forest',     // 4 forest (wood)
  'hills', 'hills', 'hills',                   // 3 hills (brick)
  'fields', 'fields', 'fields', 'fields',     // 4 fields (wheat)
  'pasture', 'pasture', 'pasture', 'pasture', // 4 pasture (sheep)
  'mountains', 'mountains', 'mountains',       // 3 mountains (ore)
  'desert',                                    // 1 desert
]

/**
 * Standard number token distribution (excluding desert)
 */
const STANDARD_NUMBERS: number[] = [
  2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12
]

/**
 * Port types for standard board
 */
const STANDARD_PORTS: ('3:1' | `2:1_${ResourceType}`)[] = [
  '3:1', '3:1', '3:1', '3:1',
  '2:1_wood', '2:1_brick', '2:1_wheat', '2:1_sheep', '2:1_ore'
]

/**
 * Hex positions in the standard layout
 * Using axial coordinates (q, r)
 */
const HEX_POSITIONS: [number, number][] = [
  // Row 0 (top): 3 hexes
  [0, 0], [1, 0], [2, 0],
  // Row 1: 4 hexes
  [-1, 1], [0, 1], [1, 1], [2, 1],
  // Row 2 (middle): 5 hexes
  [-2, 2], [-1, 2], [0, 2], [1, 2], [2, 2],
  // Row 3: 4 hexes
  [-2, 3], [-1, 3], [0, 3], [1, 3],
  // Row 4 (bottom): 3 hexes
  [-2, 4], [-1, 4], [0, 4],
]

/**
 * Generate a shuffled array
 */
function shuffle<T>(array: T[]): T[] {
  const result = [...array]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j]!, result[i]!]
  }
  return result
}

/**
 * Generate hex ID from coordinates
 */
function hexId(q: number, r: number): HexId {
  return `h_${q}_${r}`
}

/**
 * Generate vertex ID from hex and position (0-5, clockwise from top)
 */
function vertexId(q: number, r: number, pos: number): VertexId {
  return `v_${q}_${r}_${pos}`
}

/**
 * Generate edge ID from hex and position (0-5, clockwise from top-right)
 */
function edgeId(q: number, r: number, pos: number): EdgeId {
  return `e_${q}_${r}_${pos}`
}

/**
 * Get the 6 vertex positions for a hex
 */
function getHexVertices(q: number, r: number): VertexId[] {
  return [0, 1, 2, 3, 4, 5].map(pos => vertexId(q, r, pos))
}

/**
 * Get the 6 edge positions for a hex
 */
function getHexEdges(q: number, r: number): EdgeId[] {
  return [0, 1, 2, 3, 4, 5].map(pos => edgeId(q, r, pos))
}

/**
 * Generate a standard Catan board
 */
export function generateBoard(options: { shuffle?: boolean } = {}): Board {
  const shouldShuffle = options.shuffle ?? true

  // Shuffle terrains and numbers
  const terrains = shouldShuffle ? shuffle(STANDARD_TERRAINS) : [...STANDARD_TERRAINS]
  const numbers = shouldShuffle ? shuffle(STANDARD_NUMBERS) : [...STANDARD_NUMBERS]
  const ports = shouldShuffle ? shuffle(STANDARD_PORTS) : [...STANDARD_PORTS]

  const hexes = new Map<HexId, Hex>()
  const vertices = new Map<VertexId, Vertex>()
  const edges = new Map<EdgeId, Edge>()
  const portList: Port[] = []

  let numberIndex = 0
  let desertHex: HexId | null = null

  // Create hexes
  for (let i = 0; i < HEX_POSITIONS.length; i++) {
    const [q, r] = HEX_POSITIONS[i]!
    const terrain = terrains[i]!
    const id = hexId(q, r)

    let number: number | null = null
    if (terrain === 'desert') {
      desertHex = id
    } else {
      number = numbers[numberIndex++] ?? null
    }

    hexes.set(id, {
      id,
      terrain,
      number,
      hasRobber: terrain === 'desert',
    })
  }

  // Track vertex/edge equivalences (shared between hexes)
  const vertexCanonical = new Map<string, VertexId>()
  const edgeCanonical = new Map<string, EdgeId>()

  // Create vertices and edges for each hex
  for (const [q, r] of HEX_POSITIONS) {
    const hId = hexId(q, r)

    // Create 6 vertices around this hex
    for (let pos = 0; pos < 6; pos++) {
      const vId = vertexId(q, r, pos)

      // Check if this vertex is shared with another hex
      const canonical = findCanonicalVertex(q, r, pos, vertexCanonical)
      if (canonical) {
        // Use existing vertex
        const existingVertex = vertices.get(canonical)
        if (existingVertex && !existingVertex.adjacentHexes.includes(hId)) {
          existingVertex.adjacentHexes.push(hId)
        }
        continue
      }

      // Create new vertex
      vertexCanonical.set(vId, vId)
      vertices.set(vId, {
        id: vId,
        adjacentVertices: [], // Will be filled later
        adjacentEdges: [],    // Will be filled later
        adjacentHexes: [hId],
      })
    }

    // Create 6 edges around this hex
    for (let pos = 0; pos < 6; pos++) {
      const eId = edgeId(q, r, pos)

      // Check if this edge is shared with another hex
      const canonical = findCanonicalEdge(q, r, pos, edgeCanonical)
      if (canonical) {
        continue // Edge already exists
      }

      // Create new edge
      edgeCanonical.set(eId, eId)

      // Get the two vertices that form this edge
      const v1 = vertexId(q, r, pos)
      const v2 = vertexId(q, r, (pos + 1) % 6)

      edges.set(eId, {
        id: eId,
        vertices: [
          findCanonicalVertex(q, r, pos, vertexCanonical) ?? v1,
          findCanonicalVertex(q, r, (pos + 1) % 6, vertexCanonical) ?? v2,
        ],
        adjacentEdges: [], // Will be filled later
      })
    }
  }

  // Connect vertices to edges and adjacent vertices
  for (const edge of edges.values()) {
    const [v1Id, v2Id] = edge.vertices

    const v1 = vertices.get(v1Id)
    const v2 = vertices.get(v2Id)

    if (v1 && !v1.adjacentEdges.includes(edge.id)) {
      v1.adjacentEdges.push(edge.id)
    }
    if (v2 && !v2.adjacentEdges.includes(edge.id)) {
      v2.adjacentEdges.push(edge.id)
    }

    if (v1 && !v1.adjacentVertices.includes(v2Id)) {
      v1.adjacentVertices.push(v2Id)
    }
    if (v2 && !v2.adjacentVertices.includes(v1Id)) {
      v2.adjacentVertices.push(v1Id)
    }
  }

  // Connect edges to adjacent edges
  for (const edge of edges.values()) {
    const [v1Id, v2Id] = edge.vertices

    const v1 = vertices.get(v1Id)
    const v2 = vertices.get(v2Id)

    // Find edges that share a vertex
    for (const otherEdgeId of [...(v1?.adjacentEdges ?? []), ...(v2?.adjacentEdges ?? [])]) {
      if (otherEdgeId !== edge.id && !edge.adjacentEdges.includes(otherEdgeId)) {
        edge.adjacentEdges.push(otherEdgeId)
      }
    }
  }

  // Create ports (simplified - would need proper coastal vertex placement)
  const coastalVertices = Array.from(vertices.keys()).slice(0, 18) // First 18 vertices as coastal
  for (let i = 0; i < ports.length && i * 2 + 1 < coastalVertices.length; i++) {
    portList.push({
      type: ports[i]!,
      vertices: [coastalVertices[i * 2]!, coastalVertices[i * 2 + 1]!],
    })
  }

  return {
    hexes,
    vertices,
    edges,
    ports: portList,
    buildings: [],
    roads: [],
    robberHex: desertHex ?? 'h_0_2',
  }
}

/**
 * Find canonical vertex ID (handles vertex sharing between hexes)
 */
function findCanonicalVertex(
  q: number,
  r: number,
  pos: number,
  canonical: Map<string, VertexId>
): VertexId | null {
  // Check all possible shared positions
  const shared = getSharedVertexPositions(q, r, pos)
  for (const [sq, sr, sp] of shared) {
    const candidateId = vertexId(sq, sr, sp)
    if (canonical.has(candidateId)) {
      return canonical.get(candidateId)!
    }
  }
  return null
}

/**
 * Find canonical edge ID (handles edge sharing between hexes)
 */
function findCanonicalEdge(
  q: number,
  r: number,
  pos: number,
  canonical: Map<string, EdgeId>
): EdgeId | null {
  // Check all possible shared positions
  const shared = getSharedEdgePositions(q, r, pos)
  for (const [sq, sr, sp] of shared) {
    const candidateId = edgeId(sq, sr, sp)
    if (canonical.has(candidateId)) {
      return canonical.get(candidateId)!
    }
  }
  return null
}

/**
 * Get positions in adjacent hexes that share this vertex
 */
function getSharedVertexPositions(q: number, r: number, pos: number): [number, number, number][] {
  // Vertex positions are shared with 2 other hexes
  // This is a simplified version - would need proper neighbor calculation
  const neighbors: [number, number, number][] = []

  switch (pos) {
    case 0: // Top vertex
      neighbors.push([q, r - 1, 4], [q + 1, r - 1, 2])
      break
    case 1: // Top-right vertex
      neighbors.push([q + 1, r - 1, 3], [q + 1, r, 5])
      break
    case 2: // Bottom-right vertex
      neighbors.push([q + 1, r, 4], [q, r + 1, 0])
      break
    case 3: // Bottom vertex
      neighbors.push([q, r + 1, 5], [q - 1, r + 1, 1])
      break
    case 4: // Bottom-left vertex
      neighbors.push([q - 1, r + 1, 0], [q - 1, r, 2])
      break
    case 5: // Top-left vertex
      neighbors.push([q - 1, r, 1], [q, r - 1, 3])
      break
  }

  return neighbors
}

/**
 * Get positions in adjacent hexes that share this edge
 */
function getSharedEdgePositions(q: number, r: number, pos: number): [number, number, number][] {
  // Edges are shared with 1 other hex
  const neighbors: [number, number, number][] = []

  switch (pos) {
    case 0: // Top-right edge
      neighbors.push([q + 1, r - 1, 3])
      break
    case 1: // Right edge
      neighbors.push([q + 1, r, 4])
      break
    case 2: // Bottom-right edge
      neighbors.push([q, r + 1, 5])
      break
    case 3: // Bottom-left edge
      neighbors.push([q - 1, r + 1, 0])
      break
    case 4: // Left edge
      neighbors.push([q - 1, r, 1])
      break
    case 5: // Top-left edge
      neighbors.push([q, r - 1, 2])
      break
  }

  return neighbors
}

/**
 * Generate board description for agents
 */
export function describeboard(board: Board): string {
  const lines: string[] = ['=== BOARD STATE ===']

  // Describe hexes
  lines.push('\nHexes:')
  for (const hex of board.hexes.values()) {
    const robber = hex.hasRobber ? ' [ROBBER]' : ''
    const number = hex.number ? ` (${hex.number})` : ''
    lines.push(`  ${hex.id}: ${hex.terrain}${number}${robber}`)
  }

  // Describe buildings
  if (board.buildings.length > 0) {
    lines.push('\nBuildings:')
    for (const building of board.buildings) {
      lines.push(`  ${building.player}: ${building.type} at ${building.vertex}`)
    }
  }

  // Describe roads
  if (board.roads.length > 0) {
    lines.push('\nRoads:')
    for (const road of board.roads) {
      lines.push(`  ${road.player}: road at ${road.edge}`)
    }
  }

  // Describe ports
  if (board.ports.length > 0) {
    lines.push('\nPorts:')
    for (const port of board.ports) {
      lines.push(`  ${port.type} at ${port.vertices.join(', ')}`)
    }
  }

  return lines.join('\n')
}

/**
 * Create initial game state with a generated board
 */
export function createInitialGameState(playerIds: string[]): {
  board: Board
  bankResources: { wood: number; brick: number; wheat: number; sheep: number; ore: number }
  devCardDeck: string[]
} {
  const board = generateBoard()

  return {
    board,
    bankResources: { wood: 19, brick: 19, wheat: 19, sheep: 19, ore: 19 },
    devCardDeck: Array.from({ length: 25 }, (_, i) => `dev_${i}`),
  }
}
