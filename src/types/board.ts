import type { ResourceType } from './resources.js'

/**
 * Unique identifiers for board elements
 */
export type VertexId = string  // e.g., "v_0_0_N"
export type EdgeId = string    // e.g., "e_0_0_NE"
export type HexId = string     // e.g., "h_0_0"
export type PlayerId = string  // e.g., "claude", "gpt4"

/**
 * Terrain types for hexes
 */
export type TerrainType = 'forest' | 'hills' | 'fields' | 'pasture' | 'mountains' | 'desert'

/**
 * Map terrain to resource produced
 */
export const TERRAIN_RESOURCE: Record<TerrainType, ResourceType | null> = {
  forest: 'wood',
  hills: 'brick',
  fields: 'wheat',
  pasture: 'sheep',
  mountains: 'ore',
  desert: null,
}

/**
 * A hex tile on the board
 */
export interface Hex {
  id: HexId
  terrain: TerrainType
  number: number | null  // 2-12, null for desert
  hasRobber: boolean
}

/**
 * A vertex where settlements/cities can be built
 */
export interface Vertex {
  id: VertexId
  adjacentVertices: VertexId[]  // Vertices 1 edge away
  adjacentEdges: EdgeId[]       // Edges touching this vertex
  adjacentHexes: HexId[]        // Hexes this vertex borders
}

/**
 * An edge where roads can be built
 */
export interface Edge {
  id: EdgeId
  vertices: [VertexId, VertexId]  // The two endpoints
  adjacentEdges: EdgeId[]         // Edges sharing a vertex
}

/**
 * Port for trading
 */
export interface Port {
  type: '3:1' | `2:1_${ResourceType}`
  vertices: [VertexId, VertexId]  // Two vertices that access this port
}

/**
 * Building types
 */
export type BuildingType = 'settlement' | 'city'

/**
 * A building on the board
 */
export interface Building {
  type: BuildingType
  vertex: VertexId
  player: PlayerId
}

/**
 * A road on the board
 */
export interface Road {
  edge: EdgeId
  player: PlayerId
}

/**
 * The complete board state
 */
export interface Board {
  hexes: Map<HexId, Hex>
  vertices: Map<VertexId, Vertex>
  edges: Map<EdgeId, Edge>
  ports: Port[]

  buildings: Building[]
  roads: Road[]

  robberHex: HexId
}

/**
 * Building limits per player
 */
export const BUILDING_LIMITS = {
  road: 15,
  settlement: 5,
  city: 4,
} as const
