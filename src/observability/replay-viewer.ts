/**
 * CLI Replay Viewer - View and analyze game logs
 *
 * Features:
 * - Step through game events
 * - View agent reasoning
 * - Analyze attention patterns
 * - Filter by player/event type
 */

import type { GameLog, LogEntry, ReasoningEntry, CheatLogEntry, AccusationLogEntry } from './game-logger.js'
import { loadGameLog } from './game-logger.js'

/**
 * ANSI color codes for CLI output
 */
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
}

/**
 * Player colors for consistent display
 */
const playerColors: Record<string, string> = {
  claude: colors.magenta,
  gpt4: colors.green,
  gemini: colors.blue,
  llama: colors.yellow,
  mistral: colors.cyan,
}

/**
 * Format timestamp
 */
function formatTime(timestamp: number, startTime: number): string {
  const elapsed = Math.floor((timestamp - startTime) / 1000)
  const mins = Math.floor(elapsed / 60)
  const secs = elapsed % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

/**
 * Get color for player
 */
function playerColor(player: string): string {
  return playerColors[player] ?? colors.white
}

/**
 * Format a log entry for display
 */
function formatLogEntry(entry: LogEntry, startTime: number): string {
  const time = formatTime(entry.timestamp, startTime)
  const player = entry.player
    ? `${playerColor(entry.player)}${entry.player}${colors.reset}`
    : colors.dim + 'system' + colors.reset

  let eventText = ''
  switch (entry.eventType) {
    case 'dice_rolled':
      eventText = `rolled ${colors.bright}${entry.data.value}${colors.reset} (total: ${entry.data.total})`
      break
    case 'building_built':
      eventText = `built ${colors.bright}${entry.data.buildingType}${colors.reset} at ${entry.data.location}`
      break
    case 'resources_spent':
      eventText = `spent ${formatResources(entry.data.resources as Record<string, number>)}`
      break
    case 'resources_produced':
      eventText = `received resources`
      break
    case 'trade_completed':
      eventText = `traded with ${entry.data.to}`
      break
    case 'robber_moved':
      eventText = `moved robber to ${entry.data.to}`
      break
    case 'resource_stolen':
      eventText = `stole ${entry.data.resource} from ${entry.data.victim}`
      break
    case 'dev_card_bought':
      eventText = `bought a development card`
      break
    case 'dev_card_played':
      eventText = `played ${colors.bright}${entry.data.cardType}${colors.reset}`
      break
    case 'turn_ended':
      eventText = `ended turn`
      break
    case 'victory_points_changed':
      eventText = `VP: ${entry.data.oldVP} → ${colors.bright}${entry.data.newVP}${colors.reset}`
      break
    case 'longest_road_changed':
      eventText = `${colors.yellow}Longest Road${colors.reset} changed: ${entry.data.oldHolder ?? 'none'} → ${entry.data.newHolder}`
      break
    case 'largest_army_changed':
      eventText = `${colors.red}Largest Army${colors.reset} changed: ${entry.data.oldHolder ?? 'none'} → ${entry.data.newHolder}`
      break
    default:
      eventText = `${entry.eventType}: ${JSON.stringify(entry.data)}`
  }

  return `${colors.dim}[${time}]${colors.reset} T${entry.turn} ${player} ${eventText}`
}

/**
 * Format resources for display
 */
function formatResources(resources: Record<string, number>): string {
  const parts: string[] = []
  const resourceColors: Record<string, string> = {
    wood: colors.green,
    brick: colors.red,
    wheat: colors.yellow,
    sheep: colors.white,
    ore: colors.blue,
  }

  for (const [type, amount] of Object.entries(resources)) {
    if (amount > 0) {
      parts.push(`${resourceColors[type] ?? ''}${amount} ${type}${colors.reset}`)
    }
  }

  return parts.length > 0 ? parts.join(', ') : 'nothing'
}

/**
 * Format reasoning entry for display
 */
function formatReasoningEntry(entry: ReasoningEntry, startTime: number): string {
  const time = formatTime(entry.timestamp, startTime)
  const agent = `${playerColor(entry.agent)}${entry.agent}${colors.reset}`

  const lines = [
    `${colors.dim}[${time}]${colors.reset} T${entry.turn} ${agent} ${colors.bright}REASONING${colors.reset}`,
    `  Decision: ${entry.decision}`,
    `  Reasoning: ${entry.reasoning}`,
  ]

  if (entry.tokenUsage) {
    lines.push(`  Tokens: ${entry.tokenUsage.prompt} prompt, ${entry.tokenUsage.completion} completion`)
  }

  return lines.join('\n')
}

/**
 * Format cheat entry for display
 */
function formatCheatEntry(entry: CheatLogEntry, startTime: number): string {
  const time = formatTime(entry.timestamp, startTime)
  const player = `${playerColor(entry.player)}${entry.player}${colors.reset}`
  const detected = entry.detected
    ? `${colors.red}DETECTED by ${entry.detectedBy}${colors.reset}`
    : `${colors.green}undetected${colors.reset}`
  const token = entry.usedToken ? '(used token)' : '(no token)'

  return `${colors.dim}[${time}]${colors.reset} T${entry.turn} ${player} ${colors.bgRed}${colors.white} CHEAT ${colors.reset} ${entry.cheatType} ${token} - ${detected}`
}

/**
 * Format accusation entry for display
 */
function formatAccusationEntry(entry: AccusationLogEntry, startTime: number): string {
  const time = formatTime(entry.timestamp, startTime)
  const accuser = `${playerColor(entry.accuser)}${entry.accuser}${colors.reset}`
  const accused = `${playerColor(entry.accused)}${entry.accused}${colors.reset}`
  const result = entry.correct
    ? `${colors.green}CORRECT${colors.reset}`
    : `${colors.red}WRONG${colors.reset}`

  return `${colors.dim}[${time}]${colors.reset} T${entry.turn} ${accuser} ${colors.bgYellow}${colors.white} ACCUSED ${colors.reset} ${accused} of ${entry.cheatType} - ${result}`
}

/**
 * Print game header
 */
function printHeader(log: GameLog): void {
  console.log('\n' + '='.repeat(60))
  console.log(`${colors.bright}GAME REPLAY: ${log.gameId}${colors.reset}`)
  console.log('='.repeat(60))
  console.log()
  console.log(`Players: ${log.players.map(p => `${playerColor(p.id)}${p.id}${colors.reset} (${p.model})`).join(', ')}`)
  console.log(`Duration: ${Math.round((log.endTime! - log.startTime) / 1000)}s`)
  console.log(`Turns: ${log.statistics.totalTurns}`)
  console.log(`Winner: ${log.winner ? `${playerColor(log.winner)}${log.winner}${colors.reset}` : 'No winner'}`)
  console.log()
}

/**
 * Print game statistics
 */
function printStatistics(log: GameLog): void {
  const stats = log.statistics

  console.log('\n' + '-'.repeat(40))
  console.log(`${colors.bright}STATISTICS${colors.reset}`)
  console.log('-'.repeat(40))
  console.log()

  console.log('Buildings Built:')
  for (const [player, buildings] of Object.entries(stats.buildingsBuilt)) {
    console.log(`  ${playerColor(player)}${player}${colors.reset}: ${buildings.settlements}S ${buildings.cities}C ${buildings.roads}R`)
  }

  console.log()
  console.log('Resources Gained:')
  for (const [player, resources] of Object.entries(stats.resourcesGained)) {
    console.log(`  ${playerColor(player)}${player}${colors.reset}: ${formatResources(resources)}`)
  }

  console.log()
  console.log(`Trades: ${stats.tradesCompleted}`)
  console.log(`Cheats: ${stats.cheatsAttempted} attempted, ${stats.cheatsDetected} detected`)
  console.log(`Accusations: ${stats.accusationsMade} made, ${stats.correctAccusations} correct`)
  console.log(`Avg Turn Duration: ${Math.round(stats.avgTurnDuration / 1000)}s`)
}

/**
 * Replay viewer options
 */
export interface ReplayOptions {
  /** Filter by player */
  player?: string
  /** Filter by event type */
  eventType?: string
  /** Show only specific turn */
  turn?: number
  /** Show reasoning */
  showReasoning?: boolean
  /** Show cheats and accusations */
  showCheats?: boolean
  /** Limit number of events */
  limit?: number
}

/**
 * View a game replay
 */
export function viewReplay(log: GameLog, options: ReplayOptions = {}): void {
  printHeader(log)

  const startTime = log.startTime

  // Filter events
  let events = log.events
  if (options.player) {
    events = events.filter(e => e.player === options.player)
  }
  if (options.eventType) {
    events = events.filter(e => e.eventType === options.eventType)
  }
  if (options.turn !== undefined) {
    events = events.filter(e => e.turn === options.turn)
  }
  if (options.limit) {
    events = events.slice(0, options.limit)
  }

  console.log('-'.repeat(40))
  console.log(`${colors.bright}EVENTS${colors.reset} (${events.length} of ${log.events.length})`)
  console.log('-'.repeat(40))
  console.log()

  for (const event of events) {
    console.log(formatLogEntry(event, startTime))

    // Show reasoning if available and requested
    if (options.showReasoning && event.reasoning) {
      console.log(`  ${colors.dim}Reasoning: ${event.reasoning}${colors.reset}`)
    }

    // Show attention snapshot if available
    if (event.attentionSnapshot) {
      const attention = Object.entries(event.attentionSnapshot)
        .map(([target, value]) => `${target}:${value.toFixed(2)}`)
        .join(' ')
      console.log(`  ${colors.dim}Attention: ${attention}${colors.reset}`)
    }
  }

  // Show cheats and accusations
  if (options.showCheats && (log.cheats.length > 0 || log.accusations.length > 0)) {
    console.log()
    console.log('-'.repeat(40))
    console.log(`${colors.bright}CHEATS & ACCUSATIONS${colors.reset}`)
    console.log('-'.repeat(40))
    console.log()

    for (const cheat of log.cheats) {
      console.log(formatCheatEntry(cheat, startTime))
    }

    for (const accusation of log.accusations) {
      console.log(formatAccusationEntry(accusation, startTime))
    }
  }

  // Show reasoning log
  if (options.showReasoning && log.reasoning.length > 0) {
    console.log()
    console.log('-'.repeat(40))
    console.log(`${colors.bright}AGENT REASONING${colors.reset}`)
    console.log('-'.repeat(40))
    console.log()

    let reasoningEntries = log.reasoning
    if (options.player) {
      reasoningEntries = reasoningEntries.filter(r => r.agent === options.player)
    }
    if (options.turn !== undefined) {
      reasoningEntries = reasoningEntries.filter(r => r.turn === options.turn)
    }
    if (options.limit) {
      reasoningEntries = reasoningEntries.slice(0, options.limit)
    }

    for (const entry of reasoningEntries) {
      console.log(formatReasoningEntry(entry, startTime))
      console.log()
    }
  }

  printStatistics(log)
}

/**
 * Load and view a game replay from file
 */
export function viewReplayFromFile(filepath: string, options: ReplayOptions = {}): void {
  const log = loadGameLog(filepath)
  viewReplay(log, options)
}

/**
 * Get turn summary
 */
export function getTurnSummary(log: GameLog, turn: number): string {
  const events = log.events.filter(e => e.turn === turn)
  const startTime = log.startTime

  const lines: string[] = [
    `${colors.bright}Turn ${turn} Summary${colors.reset}`,
    '-'.repeat(30),
  ]

  for (const event of events) {
    lines.push(formatLogEntry(event, startTime))
  }

  return lines.join('\n')
}

/**
 * Get player summary
 */
export function getPlayerSummary(log: GameLog, player: string): string {
  const events = log.events.filter(e => e.player === player)
  const reasoning = log.reasoning.filter(r => r.agent === player)
  const cheats = log.cheats.filter(c => c.player === player)
  const accusations = log.accusations.filter(a => a.accuser === player)

  const lines: string[] = [
    `${colors.bright}${playerColor(player)}${player}${colors.reset} Summary`,
    '-'.repeat(30),
    `Total Actions: ${events.length}`,
    `Reasoning Entries: ${reasoning.length}`,
    `Cheats Attempted: ${cheats.length}`,
    `Cheats Detected: ${cheats.filter(c => c.detected).length}`,
    `Accusations Made: ${accusations.length}`,
    `Correct Accusations: ${accusations.filter(a => a.correct).length}`,
    `Final Score: ${log.finalScores[player] ?? 'N/A'}`,
  ]

  return lines.join('\n')
}
