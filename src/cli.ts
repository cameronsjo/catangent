#!/usr/bin/env node
/**
 * CLI entry point for running Catangent games
 */

import { runGame, runDemoGame } from './runner/index.js'
import { viewReplayFromFile, type ReplayOptions } from './observability/index.js'

const args = process.argv.slice(2)

async function main() {
  const command = args[0]

  switch (command) {
    case 'demo':
      console.log('Running demo game with mock agents...\n')
      await runDemoGame()
      break

    case 'play':
      const apiKey = process.env.OPENROUTER_API_KEY
      if (!apiKey) {
        console.error('Error: OPENROUTER_API_KEY environment variable not set')
        console.error('Run with: OPENROUTER_API_KEY=your-key pnpm run play')
        console.error('Or use: pnpm run demo (for mock mode)')
        process.exit(1)
      }

      console.log('Running game with real LLM agents...\n')
      await runGame({
        apiKey,
        players: [
          { id: 'claude', model: 'claude' },
          { id: 'gpt4', model: 'gpt4' },
          { id: 'gemini', model: 'gemini' },
          { id: 'llama', model: 'llama' },
          { id: 'mistral', model: 'mistral' },
        ],
        gmConfig: {
          maxTurns: 50,
        },
      })
      break

    case 'replay':
      const filepath = args[1]
      if (!filepath) {
        console.error('Error: Please provide a log file path')
        console.error('Usage: pnpm run replay <path-to-log.json>')
        process.exit(1)
      }

      const options: ReplayOptions = {
        showReasoning: args.includes('--reasoning'),
        showCheats: args.includes('--cheats'),
      }

      // Parse optional flags
      const playerIdx = args.indexOf('--player')
      if (playerIdx !== -1 && args[playerIdx + 1]) {
        options.player = args[playerIdx + 1]
      }

      const turnIdx = args.indexOf('--turn')
      if (turnIdx !== -1) {
        const turnVal = args[turnIdx + 1]
        if (turnVal) options.turn = parseInt(turnVal, 10)
      }

      const limitIdx = args.indexOf('--limit')
      if (limitIdx !== -1) {
        const limitVal = args[limitIdx + 1]
        if (limitVal) options.limit = parseInt(limitVal, 10)
      }

      try {
        viewReplayFromFile(filepath, options)
      } catch (err) {
        console.error('Error loading replay:', err)
        process.exit(1)
      }
      break

    case 'help':
    default:
      console.log('Catangent - Multi-Agent Settlers of Catan\n')
      console.log('Usage:')
      console.log('  pnpm run demo                   Run a demo game with mock agents')
      console.log('  pnpm run play                   Run a game with real LLM agents')
      console.log('  pnpm run replay <file>          View a game replay')
      console.log('')
      console.log('Replay options:')
      console.log('  --player <name>                 Filter by player')
      console.log('  --turn <number>                 Show specific turn')
      console.log('  --limit <number>                Limit events shown')
      console.log('  --reasoning                     Show agent reasoning')
      console.log('  --cheats                        Show cheats and accusations')
      console.log('')
      console.log('Environment variables:')
      console.log('  OPENROUTER_API_KEY    Your OpenRouter API key for live mode')
      break
  }
}

main().catch(err => {
  console.error('Error:', err)
  process.exit(1)
})
