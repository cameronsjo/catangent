import type { EdgeId, HexId, PlayerId, VertexId } from './board.js'
import type { DevCardType } from './player.js'
import type { Resources, ResourceType } from './resources.js'

/**
 * All possible action types
 */
export type ActionType =
  | 'roll_dice'
  | 'build_settlement'
  | 'build_city'
  | 'build_road'
  | 'buy_dev_card'
  | 'play_dev_card'
  | 'propose_trade'
  | 'accept_trade'
  | 'reject_trade'
  | 'bank_trade'
  | 'move_robber'
  | 'steal_resource'
  | 'discard'
  | 'end_turn'

/**
 * Base action interface
 */
interface BaseAction {
  type: ActionType
  player: PlayerId
}

/**
 * Roll the dice
 */
export interface RollDiceAction extends BaseAction {
  type: 'roll_dice'
}

/**
 * Build a settlement
 */
export interface BuildSettlementAction extends BaseAction {
  type: 'build_settlement'
  vertex: VertexId
}

/**
 * Upgrade settlement to city
 */
export interface BuildCityAction extends BaseAction {
  type: 'build_city'
  vertex: VertexId
}

/**
 * Build a road
 */
export interface BuildRoadAction extends BaseAction {
  type: 'build_road'
  edge: EdgeId
}

/**
 * Buy a development card
 */
export interface BuyDevCardAction extends BaseAction {
  type: 'buy_dev_card'
}

/**
 * Play a development card
 */
export interface PlayDevCardAction extends BaseAction {
  type: 'play_dev_card'
  cardId: string
  // Card-specific params
  params?: {
    // Year of Plenty
    resources?: [ResourceType, ResourceType]
    // Monopoly
    resource?: ResourceType
  }
}

/**
 * Propose a trade to another player
 */
export interface ProposeTradeAction extends BaseAction {
  type: 'propose_trade'
  target: PlayerId | 'any'  // Specific player or open offer
  offer: Partial<Resources>
  request: Partial<Resources>
}

/**
 * Accept a proposed trade
 */
export interface AcceptTradeAction extends BaseAction {
  type: 'accept_trade'
  tradeId: string
}

/**
 * Reject a proposed trade
 */
export interface RejectTradeAction extends BaseAction {
  type: 'reject_trade'
  tradeId: string
}

/**
 * Trade with the bank (4:1 or port ratio)
 */
export interface BankTradeAction extends BaseAction {
  type: 'bank_trade'
  offer: Partial<Resources>
  request: Partial<Resources>
}

/**
 * Move the robber
 */
export interface MoveRobberAction extends BaseAction {
  type: 'move_robber'
  hex: HexId
}

/**
 * Steal a resource after moving robber
 */
export interface StealResourceAction extends BaseAction {
  type: 'steal_resource'
  target: PlayerId
}

/**
 * Discard cards when over 7 on a 7 roll
 */
export interface DiscardAction extends BaseAction {
  type: 'discard'
  resources: Partial<Resources>
}

/**
 * End the current turn
 */
export interface EndTurnAction extends BaseAction {
  type: 'end_turn'
}

/**
 * Union of all action types
 */
export type Action =
  | RollDiceAction
  | BuildSettlementAction
  | BuildCityAction
  | BuildRoadAction
  | BuyDevCardAction
  | PlayDevCardAction
  | ProposeTradeAction
  | AcceptTradeAction
  | RejectTradeAction
  | BankTradeAction
  | MoveRobberAction
  | StealResourceAction
  | DiscardAction
  | EndTurnAction
