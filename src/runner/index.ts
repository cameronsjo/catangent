/**
 * Game Runner - Orchestrates multi-agent Catan games
 */

import { GameMaster, type GameMasterConfig } from '../gm/index.js'
import { PlayerAgent, type AgentConfig, type AgentModel } from '../agents/index.js'
import { createOpenRouterClient, type OpenRouterClient } from '../lib/index.js'
import { createMockGameState } from './mock-game.js'
import { MockOpenRouterClient, createMockClient } from './mock-client.js'

export interface GameRunnerConfig {
  /**
   * Player configurations
   */
  players: Array<{
    id: string
    model: AgentModel
  }>

  /**
   * OpenRouter API key (optional - uses mock if not provided)
   */
  apiKey?: string

  /**
   * Use mock client for testing
   */
  useMock?: boolean

  /**
   * Game Master config
   */
  gmConfig?: GameMasterConfig
}

/**
 * Run a multi-agent Catan game
 */
export async function runGame(config: GameRunnerConfig) {
  console.log('='.repeat(60))
  console.log('CATANGENT - Multi-Agent Settlers of Catan')
  console.log('='.repeat(60))
  console.log()

  // Determine client type
  const useMock = config.useMock ?? !config.apiKey
  console.log(`Mode: ${useMock ? 'MOCK (no API calls)' : 'LIVE (using OpenRouter)'}`)
  console.log()

  // Create client
  const client: OpenRouterClient | MockOpenRouterClient = useMock
    ? createMockClient({ responseDelay: 50 })
    : createOpenRouterClient({ apiKey: config.apiKey! })

  // Create game state
  const playerIds = config.players.map(p => p.id)
  const gameState = createMockGameState(playerIds)

  console.log('Players:')
  for (const player of config.players) {
    console.log(`  - ${player.id} (${player.model})`)
  }
  console.log()

  // Create Game Master
  const gm = new GameMaster(gameState, {
    maxTurns: 10, // Short game for testing
    turnTimeoutMs: 30000,
    ...config.gmConfig,
  })

  // Create and register agents
  for (const playerConfig of config.players) {
    const agentConfig: AgentConfig = {
      id: playerConfig.id,
      model: playerConfig.model,
    }

    const agent = new PlayerAgent(agentConfig, client as any)
    gm.registerAgent(agent)
    console.log(`Registered agent: ${playerConfig.id}`)
  }

  console.log()
  console.log('Starting game...')
  console.log('-'.repeat(60))

  // Run the game
  const log = await gm.runGame()

  // Print summary
  console.log()
  console.log('='.repeat(60))
  console.log('GAME COMPLETE')
  console.log('='.repeat(60))
  console.log()
  console.log(`Total turns: ${log.entries.filter(e => e.type === 'event' && (e.data as any)?.type === 'turn_start').length}`)
  console.log(`Winner: ${log.winner ?? 'No winner (max turns reached)'}`)
  console.log()

  // Print cheat summary
  if (log.cheatLog.length > 0) {
    console.log('Cheats:')
    for (const cheat of log.cheatLog) {
      const detected = cheat.detected ? ` (detected by ${cheat.detectedBy})` : ' (undetected)'
      console.log(`  - Turn ${cheat.turn}: ${cheat.player} used ${cheat.type}${detected}`)
    }
    console.log()
  }

  // Print accusation summary
  if (log.accusationLog.length > 0) {
    console.log('Accusations:')
    for (const acc of log.accusationLog) {
      const result = acc.correct ? 'CORRECT' : 'WRONG'
      console.log(`  - Turn ${acc.turn}: ${acc.accuser} accused ${acc.accused} of ${acc.cheatType} - ${result}`)
    }
    console.log()
  }

  return log
}

/**
 * Run a demo game with mock agents
 */
export async function runDemoGame() {
  return runGame({
    useMock: true,
    players: [
      { id: 'claude', model: 'claude' },
      { id: 'gpt4', model: 'gpt4' },
      { id: 'gemini', model: 'gemini' },
    ],
    gmConfig: {
      maxTurns: 5,
    },
  })
}

// Re-export utilities
export { createMockGameState } from './mock-game.js'
export { createMockClient, MockOpenRouterClient } from './mock-client.js'
