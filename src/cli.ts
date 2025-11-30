#!/usr/bin/env node
/**
 * CLI entry point for running Catangent games
 */

import { runGame, runDemoGame } from './runner/index.js'

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

    case 'help':
    default:
      console.log('Catangent - Multi-Agent Settlers of Catan\n')
      console.log('Usage:')
      console.log('  pnpm run demo    Run a demo game with mock agents (no API key needed)')
      console.log('  pnpm run play    Run a game with real LLM agents (requires OPENROUTER_API_KEY)')
      console.log('  pnpm run gm      Alias for demo')
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
