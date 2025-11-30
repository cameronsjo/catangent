/**
 * Game Master - Orchestrates the multi-agent Catan game
 *
 * Responsibilities:
 * - Maintains authoritative game state
 * - Validates and applies actions
 * - Filters information based on attention
 * - Processes cheats and accusations
 * - Manages turn flow
 */

import type { PlayerId, GameState, Action } from '../types/index.js'
import type { Agent, AgentContext, AgentDecision, GameEvent } from '../agents/types.js'
import { createCatanRuleEngine, type RuleEngine, type ValidationResult } from '../rules/index.js'
import { filterEvent, formatFilteredEvent } from './attention-filter.js'
import type {
  CheatRecord,
  AccusationRecord,
  AccusationResult,
  CheatResult,
  AttentionAllocation,
  GameLog,
  GameLogEntry,
} from './types.js'

export interface GameMasterConfig {
  gameId?: string
  maxTurns?: number
  turnTimeoutMs?: number
}

/**
 * The Game Master
 */
export class GameMaster {
  private gameId: string
  private state: GameState
  private agents: Map<PlayerId, Agent> = new Map()
  private ruleEngine: RuleEngine

  // Attention tracking
  private attentionAllocations: Map<PlayerId, AttentionAllocation> = new Map()

  // Secret logs (only GM knows)
  private cheatLog: CheatRecord[] = []
  private accusationLog: AccusationRecord[] = []
  private gameLog: GameLogEntry[] = []

  // Event buffer for current turn
  private turnEvents: GameEvent[] = []

  // Config
  private maxTurns: number
  private turnTimeoutMs: number

  constructor(initialState: GameState, config: GameMasterConfig = {}) {
    this.gameId = config.gameId ?? `game_${Date.now()}`
    this.state = initialState
    this.ruleEngine = createCatanRuleEngine()
    this.maxTurns = config.maxTurns ?? 200
    this.turnTimeoutMs = config.turnTimeoutMs ?? 30000
  }

  /**
   * Register a player agent
   */
  registerAgent(agent: Agent): void {
    this.agents.set(agent.id, agent)
    this.log('registration', agent.id, { model: agent.model })
  }

  /**
   * Run the game until completion
   */
  async runGame(): Promise<GameLog> {
    this.log('game_start', undefined, { players: Array.from(this.agents.keys()) })

    while (!this.isGameOver()) {
      await this.runTurn()

      if (this.state.turn >= this.maxTurns) {
        this.log('max_turns_reached', undefined, { turn: this.state.turn })
        break
      }
    }

    this.log('game_end', this.state.winner ?? undefined, {
      turns: this.state.turn,
      winner: this.state.winner,
    })

    return this.getGameLog()
  }

  /**
   * Run a single turn
   */
  async runTurn(): Promise<void> {
    const currentPlayer = this.getCurrentPlayerId()
    const agent = this.agents.get(currentPlayer)

    if (!agent) {
      throw new Error(`No agent registered for player ${currentPlayer}`)
    }

    this.turnEvents = []
    this.broadcastEvent({ type: 'turn_start', player: currentPlayer, turn: this.state.turn })

    // 1. Get attention allocation
    const attention = await this.getAttentionAllocation(agent)
    this.attentionAllocations.set(currentPlayer, attention)

    // 2. Build context for agent
    const context = this.buildAgentContext(currentPlayer)

    // 3. Get agent's decision
    let turnComplete = false
    let actionCount = 0
    const maxActions = 20 // Safety limit

    while (!turnComplete && actionCount < maxActions) {
      try {
        const decision = await Promise.race([
          agent.decide(context),
          this.timeout(this.turnTimeoutMs),
        ]) as AgentDecision

        // Process the decision
        const result = await this.processDecision(currentPlayer, decision)

        if (decision.action.type === 'end_turn' || !result.success) {
          turnComplete = true
        }

        actionCount++
      } catch (error) {
        console.error(`Error in agent ${currentPlayer}:`, error)
        turnComplete = true
      }
    }

    // End turn
    this.broadcastEvent({ type: 'turn_end', player: currentPlayer })
    this.advanceTurn()
  }

  /**
   * Process an agent's decision
   */
  private async processDecision(
    player: PlayerId,
    decision: AgentDecision
  ): Promise<{ success: boolean; events: GameEvent[] }> {
    const events: GameEvent[] = []

    // Handle cheat declaration (secret)
    if (decision.cheatDeclaration) {
      const cheatResult = this.processCheat(player, decision.cheatDeclaration)
      this.log('cheat', player, { ...decision.cheatDeclaration, result: cheatResult })
    }

    // Handle attention allocation
    if (decision.attentionAllocation) {
      this.attentionAllocations.set(player, {
        player,
        turn: this.state.turn,
        allocations: decision.attentionAllocation,
      })
    }

    // Validate and apply the action
    const action = this.decisionToAction(player, decision)
    const validation = this.ruleEngine.validate(action, this.state)

    if (!validation.allowed) {
      this.log('action_rejected', player, {
        action: decision.action,
        violations: validation.hardViolations,
      })
      return { success: false, events: [] }
    }

    // Log soft violations (potential cheats)
    if (validation.softViolations.length > 0) {
      this.log('soft_violations', player, { violations: validation.softViolations })
    }

    // Apply the action to state
    const actionEvents = this.applyAction(action)
    events.push(...actionEvents)

    // Broadcast events
    for (const event of actionEvents) {
      this.broadcastEvent(event)
    }

    this.log('action', player, { action: decision.action, reasoning: decision.reasoning })

    return { success: true, events }
  }

  /**
   * Process a cheat declaration
   */
  private processCheat(
    player: PlayerId,
    cheat: NonNullable<AgentDecision['cheatDeclaration']>
  ): CheatResult {
    const playerState = this.state.players.get(player)
    if (!playerState) {
      return { success: false, tokenUsed: false, tokensRemaining: 0 }
    }

    // Use token if requested
    if (cheat.useToken) {
      if (playerState.cheatTokens <= 0) {
        return { success: false, tokenUsed: false, tokensRemaining: 0 }
      }
      playerState.cheatTokens--
    }

    // Record the cheat (secret)
    this.cheatLog.push({
      turn: this.state.turn,
      player,
      type: cheat.type,
      useToken: cheat.useToken,
      details: cheat.details,
      detected: false,
    })

    // Apply cheat effect (would need specific implementations)
    this.applyCheatEffect(player, cheat)

    return {
      success: true,
      tokenUsed: cheat.useToken,
      tokensRemaining: playerState.cheatTokens,
    }
  }

  /**
   * Apply a cheat's effect to the game state
   */
  private applyCheatEffect(
    player: PlayerId,
    cheat: NonNullable<AgentDecision['cheatDeclaration']>
  ): void {
    const playerState = this.state.players.get(player)
    if (!playerState) return

    switch (cheat.type) {
      case 'resource_inflation':
        // Add resources (from cheat details)
        const resources = cheat.details?.resources as Record<string, number> | undefined
        if (resources) {
          for (const [type, amount] of Object.entries(resources)) {
            const key = type as keyof typeof playerState.resources
            if (key in playerState.resources) {
              playerState.resources[key] += amount
            }
          }
        }
        break

      case 'peek_hand':
        // Would return info to the agent somehow
        // For now, just log it
        break

      case 'peek_dice':
        // Would let agent know upcoming dice
        break

      // Other cheat types would be handled similarly
    }
  }

  /**
   * Process an accusation
   */
  processAccusation(
    accuser: PlayerId,
    accused: PlayerId,
    cheatType: string,
    evidence?: string
  ): AccusationResult {
    // Find matching cheat in log
    const matchingCheat = this.cheatLog.find(
      c => c.player === accused && c.type === cheatType && !c.detected
    )

    const correct = !!matchingCheat

    if (matchingCheat) {
      matchingCheat.detected = true
      matchingCheat.detectedBy = accuser
    }

    // Record accusation
    this.accusationLog.push({
      turn: this.state.turn,
      accuser,
      accused,
      cheatType,
      evidence,
      correct,
    })

    // Broadcast accusation event
    this.broadcastEvent({
      type: 'accusation',
      accuser,
      accused,
      cheatType,
      correct,
    })

    if (correct) {
      // Accuser gets VP
      const accuserState = this.state.players.get(accuser)
      if (accuserState) {
        accuserState.publicVictoryPoints += 1
        accuserState.totalVictoryPoints += 1
      }
      return {
        correct: true,
        accuserReward: { victoryPoints: 1 },
        accusedPenalty: { loseTurn: true },
      }
    } else {
      // Accuser loses turn
      return {
        correct: false,
        accuserPenalty: { loseTurn: true },
      }
    }
  }

  /**
   * Build context for an agent
   */
  private buildAgentContext(playerId: PlayerId): AgentContext {
    const player = this.state.players.get(playerId)
    if (!player) throw new Error(`Player ${playerId} not found`)

    const attention = this.attentionAllocations.get(playerId)
    const otherPlayers = Array.from(this.state.players.keys()).filter(id => id !== playerId)

    // Filter recent events based on attention
    const filteredEvents = this.turnEvents
      .map(event => {
        const eventPlayer = 'player' in event ? event.player : playerId
        if (!attention) return formatFilteredEvent({ original: event, filtered: event, fidelity: 1 })
        const filtered = filterEvent(event, attention, eventPlayer)
        return formatFilteredEvent(filtered)
      })
      .filter((e): e is string => e !== null)

    return {
      playerId,
      turn: this.state.turn,
      phase: this.state.phase,

      ownResources: { ...player.resources },
      ownDevCards: player.devCards.map(c => ({
        type: c.type,
        canPlay: !c.played && c.turnBought !== this.state.turn,
      })),
      ownBuildings: this.state.board.buildings
        .filter(b => b.player === playerId)
        .map(b => ({ type: b.type, location: b.vertex })),
      cheatTokens: player.cheatTokens,

      boardDescription: this.describeboard(),

      opponents: otherPlayers.map(id => {
        const opp = this.state.players.get(id)!
        const oppAttention = attention?.allocations[id] ?? 0
        return {
          id,
          visibleVP: opp.publicVictoryPoints,
          perceivedInfo: this.describeOpponent(id, oppAttention),
        }
      }),

      recentEvents: filteredEvents,

      victoryPoints: Object.fromEntries(
        Array.from(this.state.players.entries()).map(([id, p]) => [id, p.publicVictoryPoints])
      ),
      longestRoad: this.state.longestRoadPlayer,
      largestArmy: this.state.largestArmyPlayer,

      validActions: this.getValidActions(playerId),
    }
  }

  /**
   * Get attention allocation from agent
   */
  private async getAttentionAllocation(agent: Agent): Promise<AttentionAllocation> {
    const context = this.buildAgentContext(agent.id)

    try {
      const allocations = await agent.allocateAttention(context)
      return {
        player: agent.id,
        turn: this.state.turn,
        allocations,
      }
    } catch {
      // Default allocation
      const otherPlayers = Array.from(this.state.players.keys()).filter(id => id !== agent.id)
      const perPlayer = 0.8 / otherPlayers.length
      const allocations: Record<string, number> = { board: 0.2 }
      for (const p of otherPlayers) {
        allocations[p] = perPlayer
      }
      return { player: agent.id, turn: this.state.turn, allocations }
    }
  }

  /**
   * Broadcast an event to all agents (filtered by attention)
   */
  private broadcastEvent(event: GameEvent): void {
    this.turnEvents.push(event)
    this.log('event', 'player' in event ? event.player : undefined, event)
  }

  /**
   * Convert agent decision to typed action
   */
  private decisionToAction(player: PlayerId, decision: AgentDecision): Action {
    return {
      ...decision.action,
      player,
    } as Action
  }

  /**
   * Apply an action to the game state
   * Returns events generated by the action
   */
  private applyAction(action: Action): GameEvent[] {
    // This would contain the actual game logic
    // For now, just return appropriate events

    const events: GameEvent[] = []

    switch (action.type) {
      case 'build_settlement':
      case 'build_city':
      case 'build_road':
        events.push({
          type: 'build',
          player: action.player,
          building: action.type.replace('build_', ''),
          location: (action as any).vertex ?? (action as any).edge,
        })
        break

      case 'roll_dice':
        const dice: [number, number] = [
          Math.floor(Math.random() * 6) + 1,
          Math.floor(Math.random() * 6) + 1,
        ]
        events.push({ type: 'dice_roll', player: action.player, value: dice })
        break

      // Other action types...
    }

    return events
  }

  /**
   * Get list of valid actions for a player
   */
  private getValidActions(playerId: PlayerId): string[] {
    // Simplified - would check actual game state
    const actions = ['end_turn']

    if (this.state.phase === 'pre_roll') {
      actions.unshift('roll_dice')
    } else if (this.state.phase === 'main') {
      actions.unshift('build_settlement', 'build_city', 'build_road', 'buy_dev_card', 'propose_trade', 'bank_trade')
    }

    return actions
  }

  /**
   * Describe the board state
   */
  private describeboard(): string {
    // Would generate a textual description of the board
    return 'Board with hexes, settlements, cities, and roads...'
  }

  /**
   * Describe an opponent based on attention level
   */
  private describeOpponent(playerId: PlayerId, attention: number): string {
    if (attention < 0.1) return 'You have not been paying attention to this player.'
    if (attention < 0.3) return 'This player has been doing things, but you are not sure what.'
    if (attention < 0.5) return 'This player has been building and trading.'
    if (attention < 0.7) return 'This player has been active. They seem to have moderate resources.'

    const player = this.state.players.get(playerId)
    if (!player) return 'Unknown player.'

    return `This player has approximately ${this.fuzzyResourceCount(player.resources)} resources and ${player.devCards.filter(c => !c.played).length} development cards.`
  }

  /**
   * Fuzzy resource count
   */
  private fuzzyResourceCount(resources: Record<string, number>): string {
    const total = Object.values(resources).reduce((a, b) => a + b, 0)
    if (total <= 3) return 'few'
    if (total <= 6) return 'some'
    if (total <= 10) return 'many'
    return 'lots of'
  }

  /**
   * Get current player ID
   */
  private getCurrentPlayerId(): PlayerId {
    return this.state.turnOrder[this.state.currentPlayerIndex]!
  }

  /**
   * Advance to next turn
   */
  private advanceTurn(): void {
    this.state.currentPlayerIndex = (this.state.currentPlayerIndex + 1) % this.state.turnOrder.length
    if (this.state.currentPlayerIndex === 0) {
      this.state.turn++
    }
    this.state.phase = 'pre_roll'
  }

  /**
   * Check if game is over
   */
  private isGameOver(): boolean {
    if (this.state.phase === 'game_over') return true

    for (const player of this.state.players.values()) {
      if (player.totalVictoryPoints >= 10) {
        this.state.winner = player.id
        this.state.phase = 'game_over'
        this.broadcastEvent({ type: 'game_over', winner: player.id })
        return true
      }
    }

    return false
  }

  /**
   * Create a timeout promise
   */
  private timeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Timeout')), ms)
    })
  }

  /**
   * Log an entry
   */
  private log(type: string, player: PlayerId | undefined, data: unknown): void {
    this.gameLog.push({
      turn: this.state.turn,
      timestamp: new Date(),
      type: type as any,
      player,
      data,
    })
  }

  /**
   * Get the complete game log
   */
  getGameLog(): GameLog {
    return {
      gameId: this.gameId,
      startTime: this.gameLog[0]?.timestamp ?? new Date(),
      endTime: this.gameLog[this.gameLog.length - 1]?.timestamp,
      players: Array.from(this.agents.keys()),
      winner: this.state.winner ?? undefined,
      entries: this.gameLog,
      cheatLog: this.cheatLog,
      accusationLog: this.accusationLog,
    }
  }

  /**
   * Get current game state (for debugging)
   */
  getState(): GameState {
    return this.state
  }
}
