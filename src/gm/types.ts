/**
 * Game Master types
 */

import type { PlayerId } from '../types/index.js'
import type { AgentDecision, GameEvent } from '../agents/types.js'

/**
 * A cheat record (secret, only GM knows)
 */
export interface CheatRecord {
  turn: number
  player: PlayerId
  type: string
  useToken: boolean
  details?: Record<string, unknown>
  detected: boolean
  detectedBy?: PlayerId
}

/**
 * An accusation record
 */
export interface AccusationRecord {
  turn: number
  accuser: PlayerId
  accused: PlayerId
  cheatType: string
  evidence?: string
  correct: boolean
}

/**
 * Result of processing an agent's action
 */
export interface ActionResult {
  success: boolean
  error?: string
  events: GameEvent[]
}

/**
 * Result of processing a cheat declaration
 */
export interface CheatResult {
  success: boolean
  tokenUsed: boolean
  tokensRemaining: number
  detected?: boolean
}

/**
 * Result of processing an accusation
 */
export interface AccusationResult {
  correct: boolean
  accuserReward?: { victoryPoints: number }
  accuserPenalty?: { loseTurn: boolean }
  accusedPenalty?: { loseTurn: boolean }
}

/**
 * Attention allocation for a player
 */
export interface AttentionAllocation {
  player: PlayerId
  turn: number
  allocations: Record<PlayerId | 'board', number>
}

/**
 * Filtered event for a specific observer
 */
export interface FilteredEvent {
  original: GameEvent
  filtered: Partial<GameEvent> | null // null = not visible at all
  fidelity: number
}

/**
 * Game log entry
 */
export interface GameLogEntry {
  turn: number
  timestamp: Date
  type: 'action' | 'event' | 'cheat' | 'accusation' | 'decision'
  player?: PlayerId
  data: unknown
}

/**
 * Complete game log (for replay/analysis)
 */
export interface GameLog {
  gameId: string
  startTime: Date
  endTime?: Date
  players: PlayerId[]
  winner?: PlayerId
  entries: GameLogEntry[]
  cheatLog: CheatRecord[] // Revealed post-game
  accusationLog: AccusationRecord[]
}
