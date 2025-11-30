/**
 * System prompts for player agents
 */

import type { AgentContext } from './types.js'

/**
 * Base system prompt for all agents
 */
export function getSystemPrompt(playerId: string, model: string): string {
  return `You are playing Settlers of Catan as player "${playerId}". You are powered by ${model}.

## Game Rules
Standard Settlers of Catan rules apply. First player to 10 victory points wins.

## Victory Points
- Settlement: 1 VP
- City: 2 VP
- Longest Road (5+ roads): 2 VP
- Largest Army (3+ knights): 2 VP
- Victory Point dev cards: 1 VP each

## Building Costs
- Road: 1 wood, 1 brick
- Settlement: 1 wood, 1 brick, 1 wheat, 1 sheep
- City: 2 wheat, 3 ore
- Development Card: 1 wheat, 1 sheep, 1 ore

## Special Mechanics in This Game

### Attention System
Each turn, you allocate 1.0 total attention across other players and the board.
- Higher attention on a player = more detailed info about their actions
- 0.0 = you see nothing about them
- 0.3 = vague info ("built something")
- 0.7 = detailed actions and approximate resources
- 1.0 = perfect recall of everything they did

### Cheat System
You have 2 cheat tokens that guarantee success. You can also attempt cheats without tokens (risky).

Cheat types:
- resource_inflation: Add resources to your hand
- robber_dodge: Skip discard when you should
- trade_shortchange: Give less than agreed in a trade
- peek_hand: See another player's resources
- peek_dev_cards: See another player's dev cards
- peek_dice: See the next dice roll
- extra_build: Build more than resources allow
- extra_trade: Make extra trades
- skip_discard: Skip mandatory discard
- double_dev_card: Play two dev cards in one turn

### Accusation System
If you suspect someone cheated:
- Correct accusation: You get +1 VP
- Wrong accusation: You lose your next turn

## Strategy Tips
- Watch players closely (allocate attention) to catch cheaters
- Cheat when others aren't watching you
- Build toward ports for better trading
- Balance expansion with development cards

## Your Goal
Win by reaching 10 victory points. Use building, trading, development cards, and strategic cheating/detection.

IMPORTANT: Always think through your decisions. Consider what other players might know about you.`
}

/**
 * Format the current game context for the agent
 */
export function formatContext(context: AgentContext): string {
  const lines: string[] = []

  lines.push(`## Current Situation`)
  lines.push(`Turn: ${context.turn}`)
  lines.push(`Phase: ${context.phase}`)
  lines.push(`Your Player ID: ${context.playerId}`)
  lines.push('')

  lines.push(`## Your Resources`)
  lines.push(`- Wood: ${context.ownResources.wood}`)
  lines.push(`- Brick: ${context.ownResources.brick}`)
  lines.push(`- Wheat: ${context.ownResources.wheat}`)
  lines.push(`- Sheep: ${context.ownResources.sheep}`)
  lines.push(`- Ore: ${context.ownResources.ore}`)
  lines.push(`- Cheat Tokens: ${context.cheatTokens}`)
  lines.push('')

  if (context.ownDevCards.length > 0) {
    lines.push(`## Your Development Cards`)
    for (const card of context.ownDevCards) {
      lines.push(`- ${card.type}${card.canPlay ? ' (can play)' : ' (cannot play this turn)'}`)
    }
    lines.push('')
  }

  lines.push(`## Board State`)
  lines.push(context.boardDescription)
  lines.push('')

  lines.push(`## Victory Points`)
  for (const [player, vp] of Object.entries(context.victoryPoints)) {
    const marker = player === context.playerId ? ' (you)' : ''
    lines.push(`- ${player}: ${vp} VP${marker}`)
  }
  if (context.longestRoad) {
    lines.push(`- Longest Road: ${context.longestRoad}`)
  }
  if (context.largestArmy) {
    lines.push(`- Largest Army: ${context.largestArmy}`)
  }
  lines.push('')

  lines.push(`## Other Players (filtered by your attention)`)
  for (const opponent of context.opponents) {
    lines.push(`### ${opponent.id} (${opponent.visibleVP} VP)`)
    lines.push(opponent.perceivedInfo || 'No information (low attention)')
    lines.push('')
  }

  if (context.recentEvents.length > 0) {
    lines.push(`## Recent Events`)
    for (const event of context.recentEvents) {
      lines.push(`- ${event}`)
    }
    lines.push('')
  }

  if (context.pendingTrades && context.pendingTrades.length > 0) {
    lines.push(`## Pending Trade Offers`)
    for (const trade of context.pendingTrades) {
      lines.push(`- From ${trade.from}: Offering ${formatResources(trade.offer)} for ${formatResources(trade.request)}`)
    }
    lines.push('')
  }

  lines.push(`## Available Actions`)
  lines.push(context.validActions.join(', '))

  return lines.join('\n')
}

/**
 * Format resources as a readable string
 */
function formatResources(resources: Record<string, number>): string {
  const parts: string[] = []
  for (const [type, amount] of Object.entries(resources)) {
    if (amount > 0) {
      parts.push(`${amount} ${type}`)
    }
  }
  return parts.length > 0 ? parts.join(', ') : 'nothing'
}

/**
 * Prompt for making a turn decision
 */
export function getTurnPrompt(context: AgentContext): string {
  return `${formatContext(context)}

## Your Turn
Decide what action to take. Think through:
1. What's my current position?
2. What do I need to win?
3. What are other players likely doing?
4. Should I cheat? Is anyone watching me closely?
5. Should I accuse anyone of cheating?

Use the available tools to take your action. You can take multiple actions before ending your turn.`
}

/**
 * Prompt for responding to a trade
 */
export function getTradeResponsePrompt(
  context: AgentContext,
  trade: { from: string; offer: Record<string, number>; request: Record<string, number> }
): string {
  return `${formatContext(context)}

## Trade Offer
${trade.from} is offering you: ${formatResources(trade.offer)}
They want in return: ${formatResources(trade.request)}

Should you accept, reject, or counter-offer? Consider:
- Do you need what they're offering?
- Can you afford to give what they want?
- Does this trade help them more than you?
- Is this trade suspiciously good? (They might be cheating)`
}

/**
 * Prompt for allocating attention
 */
export function getAttentionPrompt(context: AgentContext, otherPlayers: string[]): string {
  return `${formatContext(context)}

## Attention Allocation
You have 1.0 attention to distribute across players and the board.

Other players: ${otherPlayers.join(', ')}

Consider:
- Who is closest to winning? (Watch them for cheats)
- Who might be cheating? (Unusual resource gains, suspicious builds)
- Are you planning to cheat? (Don't watch others too closely if so)

Allocate attention using the allocate_attention tool. Values must sum to <= 1.0.`
}
