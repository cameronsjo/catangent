import type {
  Action,
  BankTradeAction,
  BuildCityAction,
  BuildRoadAction,
  BuildSettlementAction,
  DiscardAction,
  GameState,
  PlayDevCardAction,
  ProposeTradeAction,
} from '../../types/index.js'
import {
  BUILDING_COSTS,
  hasResources,
  RESOURCE_TYPES,
  totalResources,
  type Resources,
} from '../../types/index.js'
import { BUILDING_LIMITS } from '../../types/board.js'
import type { HardRule } from '../types.js'
import { hardViolation } from '../types.js'

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function getPlayer(state: GameState, playerId: string) {
  return state.players.get(playerId)
}

function isSetupPhase(state: GameState) {
  return state.phase.startsWith('setup_')
}

function isFreeRoad(state: GameState) {
  return state.activeEffect.type === 'road_building' && state.activeEffect.roadsRemaining > 0
}

function toFullResources(partial: Partial<Resources>): Resources {
  return {
    wood: partial.wood ?? 0,
    brick: partial.brick ?? 0,
    wheat: partial.wheat ?? 0,
    sheep: partial.sheep ?? 0,
    ore: partial.ore ?? 0,
  }
}

function sumPartialResources(partial: Partial<Resources>): number {
  return Object.values(partial).reduce((sum, v) => sum + (v ?? 0), 0)
}

function countPlayerBuildings(state: GameState, playerId: string, type: 'settlement' | 'city') {
  return state.board.buildings.filter(b => b.player === playerId && b.type === type).length
}

function countPlayerRoads(state: GameState, playerId: string) {
  return state.board.roads.filter(r => r.player === playerId).length
}

function playerHasPort(state: GameState, playerId: string, portType: string): boolean {
  for (const port of state.board.ports) {
    if (port.type !== portType) continue

    // Check if player has building on either port vertex
    for (const vertexId of port.vertices) {
      if (state.board.buildings.some(b => b.vertex === vertexId && b.player === playerId)) {
        return true
      }
    }
  }
  return false
}

function getBestTradeRatio(state: GameState, playerId: string, resource: string): number {
  // Check for 2:1 specific port
  if (playerHasPort(state, playerId, `2:1_${resource}`)) {
    return 2
  }
  // Check for 3:1 generic port
  if (playerHasPort(state, playerId, '3:1')) {
    return 3
  }
  // Default 4:1
  return 4
}

// =============================================================================
// BUILDING COST RULES
// =============================================================================

/**
 * Must have resources to build a road
 */
export const roadCost: HardRule = {
  name: 'road_cost',
  appliesTo: ['build_road'],
  validate: (action: Action, state: GameState) => {
    if (isSetupPhase(state) || isFreeRoad(state)) return null

    const { player } = action as BuildRoadAction
    const p = getPlayer(state, player)
    if (!p) return hardViolation('road_cost', `Player ${player} not found`)

    if (!hasResources(p.resources, BUILDING_COSTS.road)) {
      return hardViolation('road_cost', `${player} cannot afford road (need 1 wood, 1 brick)`)
    }
    return null
  },
}

/**
 * Must have resources to build a settlement
 */
export const settlementCost: HardRule = {
  name: 'settlement_cost',
  appliesTo: ['build_settlement'],
  validate: (action: Action, state: GameState) => {
    if (isSetupPhase(state)) return null

    const { player } = action as BuildSettlementAction
    const p = getPlayer(state, player)
    if (!p) return hardViolation('settlement_cost', `Player ${player} not found`)

    if (!hasResources(p.resources, BUILDING_COSTS.settlement)) {
      return hardViolation(
        'settlement_cost',
        `${player} cannot afford settlement (need 1 wood, 1 brick, 1 wheat, 1 sheep)`
      )
    }
    return null
  },
}

/**
 * Must have resources to build a city
 */
export const cityCost: HardRule = {
  name: 'city_cost',
  appliesTo: ['build_city'],
  validate: (action: Action, state: GameState) => {
    const { player } = action as BuildCityAction
    const p = getPlayer(state, player)
    if (!p) return hardViolation('city_cost', `Player ${player} not found`)

    if (!hasResources(p.resources, BUILDING_COSTS.city)) {
      return hardViolation('city_cost', `${player} cannot afford city (need 2 wheat, 3 ore)`)
    }
    return null
  },
}

/**
 * Must have resources to buy a dev card
 */
export const devCardCost: HardRule = {
  name: 'dev_card_cost',
  appliesTo: ['buy_dev_card'],
  validate: (action: Action, state: GameState) => {
    const { player } = action
    const p = getPlayer(state, player)
    if (!p) return hardViolation('dev_card_cost', `Player ${player} not found`)

    if (!hasResources(p.resources, BUILDING_COSTS.devCard)) {
      return hardViolation(
        'dev_card_cost',
        `${player} cannot afford dev card (need 1 wheat, 1 sheep, 1 ore)`
      )
    }
    return null
  },
}

// =============================================================================
// BUILDING LIMITS
// =============================================================================

/**
 * Cannot exceed settlement limit (5)
 */
export const settlementLimit: HardRule = {
  name: 'settlement_limit',
  appliesTo: ['build_settlement'],
  validate: (action: Action, state: GameState) => {
    const { player } = action as BuildSettlementAction
    const count = countPlayerBuildings(state, player, 'settlement')

    if (count >= BUILDING_LIMITS.settlement) {
      return hardViolation('settlement_limit', `${player} has reached settlement limit (5)`)
    }
    return null
  },
}

/**
 * Cannot exceed city limit (4)
 */
export const cityLimit: HardRule = {
  name: 'city_limit',
  appliesTo: ['build_city'],
  validate: (action: Action, state: GameState) => {
    const { player } = action as BuildCityAction
    const count = countPlayerBuildings(state, player, 'city')

    if (count >= BUILDING_LIMITS.city) {
      return hardViolation('city_limit', `${player} has reached city limit (4)`)
    }
    return null
  },
}

/**
 * Cannot exceed road limit (15)
 */
export const roadLimit: HardRule = {
  name: 'road_limit',
  appliesTo: ['build_road'],
  validate: (action: Action, state: GameState) => {
    const { player } = action as BuildRoadAction
    const count = countPlayerRoads(state, player)

    if (count >= BUILDING_LIMITS.road) {
      return hardViolation('road_limit', `${player} has reached road limit (15)`)
    }
    return null
  },
}

// =============================================================================
// TRADE RULES
// =============================================================================

/**
 * Cannot offer resources you don't have
 */
export const tradeOfferValid: HardRule = {
  name: 'trade_offer_valid',
  appliesTo: ['propose_trade'],
  validate: (action: Action, state: GameState) => {
    const { player, offer } = action as ProposeTradeAction
    const p = getPlayer(state, player)
    if (!p) return hardViolation('trade_offer_valid', `Player ${player} not found`)

    for (const resource of RESOURCE_TYPES) {
      const offering = offer[resource] ?? 0
      if (offering > p.resources[resource]) {
        return hardViolation(
          'trade_offer_valid',
          `${player} cannot offer ${offering} ${resource} (only has ${p.resources[resource]})`
        )
      }
    }
    return null
  },
}

/**
 * Bank trade must follow correct ratio
 */
export const bankTradeRatio: HardRule = {
  name: 'bank_trade_ratio',
  appliesTo: ['bank_trade'],
  validate: (action: Action, state: GameState) => {
    const { player, offer, request } = action as BankTradeAction

    const offerTotal = sumPartialResources(offer)
    const requestTotal = sumPartialResources(request)

    // Must request exactly 1 resource type for simplicity
    if (requestTotal !== 1) {
      return hardViolation('bank_trade_ratio', 'Bank trade must request exactly 1 resource')
    }

    // Find the resource being offered (assume single type)
    let offeredResource: string | null = null
    for (const resource of RESOURCE_TYPES) {
      if ((offer[resource] ?? 0) > 0) {
        if (offeredResource) {
          return hardViolation('bank_trade_ratio', 'Bank trade must offer a single resource type')
        }
        offeredResource = resource
      }
    }

    if (!offeredResource) {
      return hardViolation('bank_trade_ratio', 'Bank trade must offer resources')
    }

    const ratio = getBestTradeRatio(state, player, offeredResource)
    if (offerTotal !== ratio) {
      return hardViolation(
        'bank_trade_ratio',
        `Invalid bank trade ratio: offering ${offerTotal} but need ${ratio}`
      )
    }

    return null
  },
}

/**
 * Cannot bank trade resources you don't have
 */
export const bankTradeHasResources: HardRule = {
  name: 'bank_trade_has_resources',
  appliesTo: ['bank_trade'],
  validate: (action: Action, state: GameState) => {
    const { player, offer } = action as BankTradeAction
    const p = getPlayer(state, player)
    if (!p) return hardViolation('bank_trade_has_resources', `Player ${player} not found`)

    for (const resource of RESOURCE_TYPES) {
      const offering = offer[resource] ?? 0
      if (offering > p.resources[resource]) {
        return hardViolation(
          'bank_trade_has_resources',
          `${player} cannot offer ${offering} ${resource} (only has ${p.resources[resource]})`
        )
      }
    }
    return null
  },
}

// =============================================================================
// DISCARD RULES
// =============================================================================

/**
 * Must discard correct number of cards (half, rounded down)
 */
export const discardCorrectAmount: HardRule = {
  name: 'discard_correct_amount',
  appliesTo: ['discard'],
  validate: (action: Action, state: GameState) => {
    const { player, resources } = action as DiscardAction
    const p = getPlayer(state, player)
    if (!p) return hardViolation('discard_correct_amount', `Player ${player} not found`)

    const handSize = totalResources(p.resources)
    const requiredDiscard = Math.floor(handSize / 2)
    const actualDiscard = sumPartialResources(resources)

    if (actualDiscard !== requiredDiscard) {
      return hardViolation(
        'discard_correct_amount',
        `${player} must discard ${requiredDiscard} cards (discarded ${actualDiscard})`
      )
    }
    return null
  },
}

/**
 * Cannot discard resources you don't have
 */
export const discardHasResources: HardRule = {
  name: 'discard_has_resources',
  appliesTo: ['discard'],
  validate: (action: Action, state: GameState) => {
    const { player, resources } = action as DiscardAction
    const p = getPlayer(state, player)
    if (!p) return hardViolation('discard_has_resources', `Player ${player} not found`)

    for (const resource of RESOURCE_TYPES) {
      const discarding = resources[resource] ?? 0
      if (discarding > p.resources[resource]) {
        return hardViolation(
          'discard_has_resources',
          `${player} cannot discard ${discarding} ${resource} (only has ${p.resources[resource]})`
        )
      }
    }
    return null
  },
}

// =============================================================================
// DEV CARD RULES
// =============================================================================

/**
 * Cannot buy dev card if deck is empty
 */
export const devCardDeckNotEmpty: HardRule = {
  name: 'dev_card_deck_not_empty',
  appliesTo: ['buy_dev_card'],
  validate: (action: Action, state: GameState) => {
    if (state.devCardDeck.length === 0) {
      return hardViolation('dev_card_deck_not_empty', 'Development card deck is empty')
    }
    return null
  },
}

/**
 * Must own the dev card to play it
 */
export const devCardOwnership: HardRule = {
  name: 'dev_card_ownership',
  appliesTo: ['play_dev_card'],
  validate: (action: Action, state: GameState) => {
    const { player, cardId } = action as PlayDevCardAction
    const p = getPlayer(state, player)
    if (!p) return hardViolation('dev_card_ownership', `Player ${player} not found`)

    const card = p.devCards.find(c => c.id === cardId && !c.played)
    if (!card) {
      return hardViolation('dev_card_ownership', `${player} does not own playable card ${cardId}`)
    }
    return null
  },
}

/**
 * Cannot play dev card bought this turn
 */
export const devCardNotBoughtThisTurn: HardRule = {
  name: 'dev_card_not_bought_this_turn',
  appliesTo: ['play_dev_card'],
  validate: (action: Action, state: GameState) => {
    const { cardId } = action as PlayDevCardAction

    if (state.turnState.devCardsBought.includes(cardId)) {
      return hardViolation(
        'dev_card_not_bought_this_turn',
        'Cannot play development card on the turn it was purchased'
      )
    }
    return null
  },
}

/**
 * Cannot play victory point cards (they're automatic)
 */
export const cannotPlayVictoryPoint: HardRule = {
  name: 'cannot_play_victory_point',
  appliesTo: ['play_dev_card'],
  validate: (action: Action, state: GameState) => {
    const { player, cardId } = action as PlayDevCardAction
    const p = getPlayer(state, player)
    if (!p) return null

    const card = p.devCards.find(c => c.id === cardId)
    if (card?.type === 'victory_point') {
      return hardViolation(
        'cannot_play_victory_point',
        'Victory point cards cannot be played - they count automatically'
      )
    }
    return null
  },
}

// =============================================================================
// EXPORT ALL RESOURCE RULES
// =============================================================================

export const resourceRules: HardRule[] = [
  // Building costs
  roadCost,
  settlementCost,
  cityCost,
  devCardCost,
  // Building limits
  settlementLimit,
  cityLimit,
  roadLimit,
  // Trade
  tradeOfferValid,
  bankTradeRatio,
  bankTradeHasResources,
  // Discard
  discardCorrectAmount,
  discardHasResources,
  // Dev cards
  devCardDeckNotEmpty,
  devCardOwnership,
  devCardNotBoughtThisTurn,
  cannotPlayVictoryPoint,
]
