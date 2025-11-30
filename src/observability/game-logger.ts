/**
 * Game Logger - Structured event logging for game replay and analysis
 *
 * Captures all game events in a structured format for:
 * - Game replay
 * - Agent behavior analysis
 * - Debugging
 * - Research data collection
 */

import type { PlayerId, Resources } from '../types/index.js'
import type { GameEvent } from '../game/state-engine.js'
import * as fs from 'fs'
import * as path from 'path'

/**
 * Log entry for a game event
 */
export interface LogEntry {
  timestamp: number
  turn: number
  phase: string
  eventType: string
  player?: PlayerId
  data: Record<string, unknown>
  reasoning?: string
  attentionSnapshot?: Record<PlayerId | 'board', number>
}

/**
 * Agent reasoning log
 */
export interface ReasoningEntry {
  timestamp: number
  turn: number
  agent: PlayerId
  model: string
  context: string
  decision: string
  reasoning: string
  tokenUsage?: {
    prompt: number
    completion: number
  }
}

/**
 * Complete game log
 */
export interface GameLog {
  gameId: string
  startTime: number
  endTime?: number
  players: {
    id: PlayerId
    model: string
  }[]
  winner?: PlayerId
  finalScores: Record<PlayerId, number>
  events: LogEntry[]
  reasoning: ReasoningEntry[]
  cheats: CheatLogEntry[]
  accusations: AccusationLogEntry[]
  statistics: GameStatistics
}

/**
 * Cheat log entry
 */
export interface CheatLogEntry {
  timestamp: number
  turn: number
  player: PlayerId
  cheatType: string
  usedToken: boolean
  detected: boolean
  detectedBy?: PlayerId
  details?: Record<string, unknown>
}

/**
 * Accusation log entry
 */
export interface AccusationLogEntry {
  timestamp: number
  turn: number
  accuser: PlayerId
  accused: PlayerId
  cheatType: string
  evidence?: string
  correct: boolean
}

/**
 * Game statistics
 */
export interface GameStatistics {
  totalTurns: number
  totalActions: number
  buildingsBuilt: Record<PlayerId, { settlements: number; cities: number; roads: number }>
  resourcesGained: Record<PlayerId, Resources>
  resourcesSpent: Record<PlayerId, Resources>
  tradesCompleted: number
  cheatsAttempted: number
  cheatsDetected: number
  accusationsMade: number
  correctAccusations: number
  avgTurnDuration: number
}

/**
 * Game Logger class
 */
export class GameLogger {
  private gameId: string
  private startTime: number
  private players: { id: PlayerId; model: string }[] = []
  private events: LogEntry[] = []
  private reasoning: ReasoningEntry[] = []
  private cheats: CheatLogEntry[] = []
  private accusations: AccusationLogEntry[] = []

  private currentTurn = 0
  private currentPhase = 'pre_roll'

  // Statistics tracking
  private actionCount = 0
  private buildingsBuilt: Record<PlayerId, { settlements: number; cities: number; roads: number }> = {}
  private resourcesGained: Record<PlayerId, Resources> = {}
  private resourcesSpent: Record<PlayerId, Resources> = {}
  private tradesCompleted = 0
  private turnStartTimes: number[] = []

  constructor(gameId?: string) {
    this.gameId = gameId ?? `game_${Date.now()}`
    this.startTime = Date.now()
  }

  /**
   * Register a player
   */
  registerPlayer(id: PlayerId, model: string): void {
    this.players.push({ id, model })
    this.buildingsBuilt[id] = { settlements: 0, cities: 0, roads: 0 }
    this.resourcesGained[id] = { wood: 0, brick: 0, wheat: 0, sheep: 0, ore: 0 }
    this.resourcesSpent[id] = { wood: 0, brick: 0, wheat: 0, sheep: 0, ore: 0 }
  }

  /**
   * Update turn/phase tracking
   */
  setTurnPhase(turn: number, phase: string): void {
    if (turn !== this.currentTurn) {
      this.turnStartTimes.push(Date.now())
    }
    this.currentTurn = turn
    this.currentPhase = phase
  }

  /**
   * Log a game event
   */
  logEvent(
    eventType: string,
    data: Record<string, unknown>,
    options: {
      player?: PlayerId
      reasoning?: string
      attentionSnapshot?: Record<PlayerId | 'board', number>
    } = {}
  ): void {
    this.events.push({
      timestamp: Date.now(),
      turn: this.currentTurn,
      phase: this.currentPhase,
      eventType,
      player: options.player,
      data,
      reasoning: options.reasoning,
      attentionSnapshot: options.attentionSnapshot,
    })

    this.actionCount++

    // Update statistics
    this.updateStatistics(eventType, data, options.player)
  }

  /**
   * Log from GameEvent type
   */
  logGameEvent(event: GameEvent): void {
    const player = 'player' in event ? event.player : undefined
    const { type, ...data } = event as unknown as { type: string } & Record<string, unknown>
    this.logEvent(type, data, { player })
  }

  /**
   * Log agent reasoning
   */
  logReasoning(entry: Omit<ReasoningEntry, 'timestamp'>): void {
    this.reasoning.push({
      ...entry,
      timestamp: Date.now(),
    })
  }

  /**
   * Log a cheat attempt
   */
  logCheat(entry: Omit<CheatLogEntry, 'timestamp'>): void {
    this.cheats.push({
      ...entry,
      timestamp: Date.now(),
    })
  }

  /**
   * Log an accusation
   */
  logAccusation(entry: Omit<AccusationLogEntry, 'timestamp'>): void {
    this.accusations.push({
      ...entry,
      timestamp: Date.now(),
    })
  }

  /**
   * Mark a cheat as detected
   */
  markCheatDetected(player: PlayerId, cheatType: string, detectedBy: PlayerId): void {
    const cheat = this.cheats.find(
      c => c.player === player && c.cheatType === cheatType && !c.detected
    )
    if (cheat) {
      cheat.detected = true
      cheat.detectedBy = detectedBy
    }
  }

  /**
   * Update statistics based on event
   */
  private updateStatistics(
    eventType: string,
    data: Record<string, unknown>,
    player?: PlayerId
  ): void {
    if (!player) return

    switch (eventType) {
      case 'building_built':
        const buildingType = data.buildingType as string
        if (buildingType === 'settlement') {
          this.buildingsBuilt[player]!.settlements++
        } else if (buildingType === 'city') {
          this.buildingsBuilt[player]!.cities++
        } else if (buildingType === 'road') {
          this.buildingsBuilt[player]!.roads++
        }
        break

      case 'resources_produced':
        const productions = data.productions as Map<PlayerId, Resources>
        if (productions) {
          for (const [pid, resources] of productions) {
            for (const [type, amount] of Object.entries(resources) as [keyof Resources, number][]) {
              this.resourcesGained[pid]![type] += amount
            }
          }
        }
        break

      case 'resources_spent':
        const spent = data.resources as Resources
        if (spent) {
          for (const [type, amount] of Object.entries(spent) as [keyof Resources, number][]) {
            this.resourcesSpent[player]![type] += amount
          }
        }
        break

      case 'trade_completed':
        this.tradesCompleted++
        break
    }
  }

  /**
   * Generate statistics
   */
  private generateStatistics(): GameStatistics {
    const turnDurations: number[] = []
    for (let i = 1; i < this.turnStartTimes.length; i++) {
      turnDurations.push(this.turnStartTimes[i]! - this.turnStartTimes[i - 1]!)
    }

    return {
      totalTurns: this.currentTurn,
      totalActions: this.actionCount,
      buildingsBuilt: this.buildingsBuilt,
      resourcesGained: this.resourcesGained,
      resourcesSpent: this.resourcesSpent,
      tradesCompleted: this.tradesCompleted,
      cheatsAttempted: this.cheats.length,
      cheatsDetected: this.cheats.filter(c => c.detected).length,
      accusationsMade: this.accusations.length,
      correctAccusations: this.accusations.filter(a => a.correct).length,
      avgTurnDuration: turnDurations.length > 0
        ? turnDurations.reduce((a, b) => a + b, 0) / turnDurations.length
        : 0,
    }
  }

  /**
   * Get the complete game log
   */
  getLog(winner?: PlayerId, finalScores?: Record<PlayerId, number>): GameLog {
    return {
      gameId: this.gameId,
      startTime: this.startTime,
      endTime: Date.now(),
      players: this.players,
      winner,
      finalScores: finalScores ?? {},
      events: this.events,
      reasoning: this.reasoning,
      cheats: this.cheats,
      accusations: this.accusations,
      statistics: this.generateStatistics(),
    }
  }

  /**
   * Export log to JSON file
   */
  exportToFile(filepath: string, winner?: PlayerId, finalScores?: Record<PlayerId, number>): void {
    const log = this.getLog(winner, finalScores)
    const dir = path.dirname(filepath)

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    fs.writeFileSync(filepath, JSON.stringify(log, mapReplacer, 2))
    console.log(`Game log exported to: ${filepath}`)
  }

  /**
   * Export log to JSON string
   */
  toJSON(winner?: PlayerId, finalScores?: Record<PlayerId, number>): string {
    return JSON.stringify(this.getLog(winner, finalScores), mapReplacer, 2)
  }

  /**
   * Get summary for CLI output
   */
  getSummary(): string {
    const stats = this.generateStatistics()
    const lines: string[] = [
      `\n=== GAME SUMMARY ===`,
      `Game ID: ${this.gameId}`,
      `Duration: ${Math.round((Date.now() - this.startTime) / 1000)}s`,
      `Total Turns: ${stats.totalTurns}`,
      `Total Actions: ${stats.totalActions}`,
      ``,
      `Buildings Built:`,
    ]

    for (const [player, buildings] of Object.entries(stats.buildingsBuilt)) {
      lines.push(`  ${player}: ${buildings.settlements} settlements, ${buildings.cities} cities, ${buildings.roads} roads`)
    }

    lines.push(``)
    lines.push(`Trades: ${stats.tradesCompleted}`)
    lines.push(`Cheats: ${stats.cheatsAttempted} attempted, ${stats.cheatsDetected} detected`)
    lines.push(`Accusations: ${stats.accusationsMade} made, ${stats.correctAccusations} correct`)

    return lines.join('\n')
  }
}

/**
 * JSON replacer to handle Map objects
 */
function mapReplacer(key: string, value: unknown): unknown {
  if (value instanceof Map) {
    return Object.fromEntries(value)
  }
  if (value instanceof Set) {
    return Array.from(value)
  }
  return value
}

/**
 * Load a game log from JSON file
 */
export function loadGameLog(filepath: string): GameLog {
  const content = fs.readFileSync(filepath, 'utf-8')
  return JSON.parse(content) as GameLog
}
