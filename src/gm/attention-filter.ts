/**
 * Attention-based information filtering
 *
 * Filters game events based on how much attention an observer
 * has allocated to the player who performed the action.
 */

import type { PlayerId } from '../types/index.js'
import type { GameEvent } from '../agents/types.js'
import type { AttentionAllocation, FilteredEvent } from './types.js'

/**
 * Fidelity thresholds for different information types
 */
const FIDELITY_THRESHOLDS = {
  // Action visibility
  actionExists: 0.1,      // Know something happened
  actionType: 0.3,        // Know what type of action
  actionDetails: 0.5,     // Know most details
  actionExact: 0.8,       // Know exact details

  // Resource visibility
  resourceVague: 0.5,     // "some resources"
  resourceApprox: 0.7,    // "about 3 wheat"
  resourceExact: 0.9,     // "exactly 3 wheat"

  // Trade visibility
  tradePartner: 0.3,      // Know who traded with whom
  tradeResources: 0.5,    // Know what was traded
  tradeExact: 0.8,        // Know exact amounts
}

/**
 * Filter a game event based on observer's attention
 */
export function filterEvent(
  event: GameEvent,
  observerAttention: AttentionAllocation,
  eventPlayer: PlayerId
): FilteredEvent {
  // Get attention on the event player
  const attention = observerAttention.allocations[eventPlayer] ?? 0

  // Special case: own actions are always fully visible
  if (observerAttention.player === eventPlayer) {
    return { original: event, filtered: event, fidelity: 1.0 }
  }

  // Filter based on event type and attention
  switch (event.type) {
    case 'turn_start':
    case 'turn_end':
    case 'game_over':
      // Always visible
      return { original: event, filtered: event, fidelity: 1.0 }

    case 'dice_roll':
      // Always visible (public information)
      return { original: event, filtered: event, fidelity: 1.0 }

    case 'build':
      return filterBuildEvent(event, attention)

    case 'trade':
      return filterTradeEvent(event, attention)

    case 'resource_production':
      return filterResourceEvent(event, attention)

    case 'robber_moved':
      return filterRobberEvent(event, attention)

    case 'dev_card_played':
      return filterDevCardEvent(event, attention)

    case 'accusation':
      // Always visible (public)
      return { original: event, filtered: event, fidelity: 1.0 }

    default:
      // Default to some filtering
      return filterGenericEvent(event, attention)
  }
}

/**
 * Filter a build event
 */
function filterBuildEvent(
  event: Extract<GameEvent, { type: 'build' }>,
  attention: number
): FilteredEvent {
  if (attention < FIDELITY_THRESHOLDS.actionExists) {
    return { original: event, filtered: null, fidelity: attention }
  }

  if (attention < FIDELITY_THRESHOLDS.actionType) {
    return {
      original: event,
      filtered: {
        type: 'build',
        player: event.player,
        building: 'something',
        location: 'somewhere',
      },
      fidelity: attention,
    }
  }

  if (attention < FIDELITY_THRESHOLDS.actionDetails) {
    return {
      original: event,
      filtered: {
        type: 'build',
        player: event.player,
        building: event.building,
        location: 'nearby', // Vague location
      },
      fidelity: attention,
    }
  }

  // Full details
  return { original: event, filtered: event, fidelity: attention }
}

/**
 * Filter a trade event
 */
function filterTradeEvent(
  event: Extract<GameEvent, { type: 'trade' }>,
  attention: number
): FilteredEvent {
  if (attention < FIDELITY_THRESHOLDS.actionExists) {
    return { original: event, filtered: null, fidelity: attention }
  }

  if (attention < FIDELITY_THRESHOLDS.tradePartner) {
    return {
      original: event,
      filtered: {
        type: 'trade',
        from: event.from,
        to: 'someone',
        gave: {},
        received: {},
      },
      fidelity: attention,
    }
  }

  if (attention < FIDELITY_THRESHOLDS.tradeResources) {
    return {
      original: event,
      filtered: {
        type: 'trade',
        from: event.from,
        to: event.to,
        gave: { unknown: 1 },
        received: { unknown: 1 },
      },
      fidelity: attention,
    }
  }

  if (attention < FIDELITY_THRESHOLDS.tradeExact) {
    return {
      original: event,
      filtered: {
        type: 'trade',
        from: event.from,
        to: event.to,
        gave: fuzzyResources(event.gave),
        received: fuzzyResources(event.received),
      },
      fidelity: attention,
    }
  }

  return { original: event, filtered: event, fidelity: attention }
}

/**
 * Filter a resource production event
 */
function filterResourceEvent(
  event: Extract<GameEvent, { type: 'resource_production' }>,
  attention: number
): FilteredEvent {
  if (attention < FIDELITY_THRESHOLDS.resourceVague) {
    return { original: event, filtered: null, fidelity: attention }
  }

  if (attention < FIDELITY_THRESHOLDS.resourceApprox) {
    return {
      original: event,
      filtered: {
        type: 'resource_production',
        player: event.player,
        resources: { some: 1 }, // Vague
      },
      fidelity: attention,
    }
  }

  if (attention < FIDELITY_THRESHOLDS.resourceExact) {
    return {
      original: event,
      filtered: {
        type: 'resource_production',
        player: event.player,
        resources: fuzzyResources(event.resources),
      },
      fidelity: attention,
    }
  }

  return { original: event, filtered: event, fidelity: attention }
}

/**
 * Filter a robber movement event
 */
function filterRobberEvent(
  event: Extract<GameEvent, { type: 'robber_moved' }>,
  attention: number
): FilteredEvent {
  // Robber location is always visible (it's on the board)
  // But who they stole from might not be

  if (attention < FIDELITY_THRESHOLDS.actionDetails) {
    return {
      original: event,
      filtered: {
        type: 'robber_moved',
        player: event.player,
        hex: event.hex,
        stoleFrom: undefined, // Don't know who they stole from
      },
      fidelity: attention,
    }
  }

  return { original: event, filtered: event, fidelity: attention }
}

/**
 * Filter a dev card played event
 */
function filterDevCardEvent(
  event: Extract<GameEvent, { type: 'dev_card_played' }>,
  attention: number
): FilteredEvent {
  if (attention < FIDELITY_THRESHOLDS.actionExists) {
    return { original: event, filtered: null, fidelity: attention }
  }

  if (attention < FIDELITY_THRESHOLDS.actionType) {
    return {
      original: event,
      filtered: {
        type: 'dev_card_played',
        player: event.player,
        card: 'a development card',
      },
      fidelity: attention,
    }
  }

  return { original: event, filtered: event, fidelity: attention }
}

/**
 * Filter a generic event
 */
function filterGenericEvent(event: GameEvent, attention: number): FilteredEvent {
  if (attention < FIDELITY_THRESHOLDS.actionExists) {
    return { original: event, filtered: null, fidelity: attention }
  }
  return { original: event, filtered: event, fidelity: attention }
}

/**
 * Fuzz resource counts (add noise)
 */
function fuzzyResources(resources: Record<string, number>): Record<string, number> {
  const result: Record<string, number> = {}

  for (const [type, amount] of Object.entries(resources)) {
    if (amount === 0) continue

    // Add ±1 noise
    const noise = Math.random() > 0.5 ? 1 : -1
    result[type] = Math.max(0, amount + noise)
  }

  return result
}

/**
 * Format a filtered event as a human-readable string
 */
export function formatFilteredEvent(filtered: FilteredEvent): string | null {
  const event = filtered.filtered
  if (!event) return null

  switch (event.type) {
    case 'turn_start':
      return `${event.player}'s turn started`

    case 'turn_end':
      return `${event.player} ended their turn`

    case 'dice_roll':
      return `${event.player} rolled ${(event as any).value?.[0] ?? '?'} + ${(event as any).value?.[1] ?? '?'}`

    case 'build':
      return `${event.player} built ${(event as any).building} at ${(event as any).location}`

    case 'trade':
      const gave = formatResourceBrief((event as any).gave)
      const received = formatResourceBrief((event as any).received)
      return `${(event as any).from} traded ${gave} to ${(event as any).to} for ${received}`

    case 'resource_production':
      const resources = formatResourceBrief((event as any).resources)
      return `${event.player} received ${resources}`

    case 'robber_moved':
      const stolen = (event as any).stoleFrom ? ` and stole from ${(event as any).stoleFrom}` : ''
      return `${event.player} moved robber to ${(event as any).hex}${stolen}`

    case 'dev_card_played':
      return `${event.player} played ${(event as any).card}`

    case 'accusation':
      const result = (event as any).correct ? 'correctly' : 'incorrectly'
      return `${(event as any).accuser} ${result} accused ${(event as any).accused} of ${(event as any).cheatType}`

    case 'game_over':
      return `Game over! ${(event as any).winner} wins!`

    default:
      return `Someone did something`
  }
}

/**
 * Format resources briefly
 */
function formatResourceBrief(resources: Record<string, number>): string {
  const parts: string[] = []
  for (const [type, amount] of Object.entries(resources)) {
    if (amount > 0) {
      parts.push(`${amount} ${type}`)
    }
  }
  return parts.length > 0 ? parts.join(', ') : 'nothing'
}
