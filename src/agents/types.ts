import type { PlayerId } from '../types/index.js'
import type { ModelId, Tool } from '../lib/openrouter.js'

/**
 * Agent identity - which model is playing
 */
export type AgentModel = 'claude' | 'gpt4' | 'gemini' | 'llama' | 'mistral'

/**
 * Configuration for an agent
 */
export interface AgentConfig {
  id: PlayerId
  model: AgentModel
  modelId?: ModelId  // Actual OpenRouter model ID (optional, uses default)
  temperature?: number
  systemPrompt?: string
}

/**
 * Context provided to agent for decision making
 */
export interface AgentContext {
  // Identity
  playerId: PlayerId
  turn: number
  phase: string

  // Own state (full fidelity)
  ownResources: {
    wood: number
    brick: number
    wheat: number
    sheep: number
    ore: number
  }
  ownDevCards: { type: string; canPlay: boolean }[]
  ownBuildings: { type: string; location: string }[]
  cheatTokens: number

  // Board state (always visible)
  boardDescription: string

  // Other players (filtered by attention)
  opponents: {
    id: PlayerId
    visibleVP: number
    perceivedInfo: string  // Attention-filtered description
  }[]

  // Recent events (filtered by attention)
  recentEvents: string[]

  // Game state
  victoryPoints: Record<PlayerId, number>
  longestRoad: PlayerId | null
  largestArmy: PlayerId | null

  // Available actions
  validActions: string[]

  // Pending trades (if any)
  pendingTrades?: {
    id: string
    from: PlayerId
    offer: Record<string, number>
    request: Record<string, number>
  }[]
}

/**
 * An action decision from an agent
 */
export interface AgentDecision {
  // The action to take
  action: {
    type: string
    [key: string]: unknown
  }

  // Agent's reasoning (for logging/playback)
  reasoning?: string

  // Attention allocation for next observation
  attentionAllocation?: Record<PlayerId | 'board', number>

  // Secret cheat declaration (whisper to GM)
  cheatDeclaration?: {
    type: string
    useToken: boolean
    details?: Record<string, unknown>
  }
}

/**
 * A trade response from an agent
 */
export interface TradeResponse {
  action: 'accept' | 'reject' | 'counter'
  counterOffer?: {
    offer: Record<string, number>
    request: Record<string, number>
  }
  reasoning?: string
}

/**
 * Interface for a player agent
 */
export interface Agent {
  readonly id: PlayerId
  readonly model: AgentModel

  /**
   * Make a turn decision given the current context
   */
  decide(context: AgentContext): Promise<AgentDecision>

  /**
   * Respond to a trade offer
   */
  respondToTrade(
    context: AgentContext,
    trade: { id: string; from: PlayerId; offer: Record<string, number>; request: Record<string, number> }
  ): Promise<TradeResponse>

  /**
   * Allocate attention for the next turn
   */
  allocateAttention(context: AgentContext): Promise<Record<PlayerId | 'board', number>>

  /**
   * Consider making an accusation
   */
  considerAccusation(context: AgentContext): Promise<{
    accuse: boolean
    target?: PlayerId
    cheatType?: string
    evidence?: string
  } | null>
}

/**
 * Events that can be broadcast to agents
 */
export type GameEvent =
  | { type: 'turn_start'; player: PlayerId; turn: number }
  | { type: 'dice_roll'; player: PlayerId; value: [number, number] }
  | { type: 'resource_production'; player: PlayerId; resources: Record<string, number> }
  | { type: 'build'; player: PlayerId; building: string; location: string }
  | { type: 'trade'; from: PlayerId; to: PlayerId; gave: Record<string, number>; received: Record<string, number> }
  | { type: 'robber_moved'; player: PlayerId; hex: string; stoleFrom?: PlayerId }
  | { type: 'dev_card_played'; player: PlayerId; card: string }
  | { type: 'accusation'; accuser: PlayerId; accused: PlayerId; cheatType: string; correct: boolean }
  | { type: 'turn_end'; player: PlayerId }
  | { type: 'game_over'; winner: PlayerId }
