/**
 * Player Agent - LLM-powered Catan player
 */

import type { Message, Tool, ToolCall } from '../lib/openrouter.js'
import { OpenRouterClient, MODELS } from '../lib/openrouter.js'
import type { PlayerId } from '../types/index.js'
import type { Agent, AgentConfig, AgentContext, AgentDecision, AgentModel, TradeResponse } from './types.js'
import { AGENT_TOOLS, TRADE_RESPONSE_TOOLS } from './tools.js'
import { getSystemPrompt, getTurnPrompt, getTradeResponsePrompt, getAttentionPrompt } from './prompts.js'

/**
 * Map agent model names to OpenRouter model IDs
 */
const MODEL_MAP: Record<AgentModel, string> = {
  claude: MODELS.claude,
  gpt4: MODELS.gpt4o,
  gemini: MODELS.gemini,
  llama: MODELS.llama,
  mistral: MODELS.mistral,
}

/**
 * Player agent implementation using OpenRouter
 */
export class PlayerAgent implements Agent {
  readonly id: PlayerId
  readonly model: AgentModel

  private client: OpenRouterClient
  private modelId: string
  private temperature: number
  private conversationHistory: Message[] = []
  private systemPrompt: string

  constructor(config: AgentConfig, client: OpenRouterClient) {
    this.id = config.id
    this.model = config.model
    this.client = client
    this.modelId = config.modelId ?? MODEL_MAP[config.model]
    this.temperature = config.temperature ?? 0.7
    this.systemPrompt = config.systemPrompt ?? getSystemPrompt(config.id, config.model)
  }

  /**
   * Make a turn decision
   */
  async decide(context: AgentContext): Promise<AgentDecision> {
    const prompt = getTurnPrompt(context)

    const messages: Message[] = [
      { role: 'system', content: this.systemPrompt },
      ...this.conversationHistory,
      { role: 'user', content: prompt },
    ]

    const response = await this.client.chatWithTools(messages, AGENT_TOOLS, {
      model: this.modelId,
      temperature: this.temperature,
    })

    const choice = response.choices[0]
    if (!choice) {
      throw new Error('No response from model')
    }

    // Add to conversation history
    this.conversationHistory.push({ role: 'user', content: prompt })
    this.conversationHistory.push(choice.message)

    // Trim history if too long
    this.trimHistory()

    // Parse the response
    return this.parseDecision(choice.message)
  }

  /**
   * Respond to a trade offer
   */
  async respondToTrade(
    context: AgentContext,
    trade: { id: string; from: PlayerId; offer: Record<string, number>; request: Record<string, number> }
  ): Promise<TradeResponse> {
    const prompt = getTradeResponsePrompt(context, trade)

    const messages: Message[] = [
      { role: 'system', content: this.systemPrompt },
      { role: 'user', content: prompt },
    ]

    const response = await this.client.chatWithTools(messages, TRADE_RESPONSE_TOOLS, {
      model: this.modelId,
      temperature: this.temperature,
    })

    const choice = response.choices[0]
    if (!choice) {
      throw new Error('No response from model')
    }

    return this.parseTradeResponse(choice.message, trade.id)
  }

  /**
   * Allocate attention for next turn
   */
  async allocateAttention(context: AgentContext): Promise<Record<PlayerId | 'board', number>> {
    const otherPlayers = context.opponents.map(o => o.id)
    const prompt = getAttentionPrompt(context, otherPlayers)

    const attentionTool: Tool = {
      type: 'function',
      function: {
        name: 'allocate_attention',
        description: 'Allocate attention across players and board',
        parameters: {
          type: 'object',
          properties: {
            allocations: {
              type: 'object',
              additionalProperties: { type: 'number' },
            },
          },
          required: ['allocations'],
        },
      },
    }

    const messages: Message[] = [
      { role: 'system', content: this.systemPrompt },
      { role: 'user', content: prompt },
    ]

    const response = await this.client.chatWithTools(messages, [attentionTool], {
      model: this.modelId,
      temperature: this.temperature,
    })

    const choice = response.choices[0]
    if (!choice) {
      // Default to even distribution
      return this.defaultAttention(otherPlayers)
    }

    const toolCall = choice.message.tool_calls?.[0]
    if (!toolCall || toolCall.function.name !== 'allocate_attention') {
      return this.defaultAttention(otherPlayers)
    }

    try {
      const args = JSON.parse(toolCall.function.arguments)
      return args.allocations ?? this.defaultAttention(otherPlayers)
    } catch {
      return this.defaultAttention(otherPlayers)
    }
  }

  /**
   * Consider making an accusation
   */
  async considerAccusation(context: AgentContext): Promise<{
    accuse: boolean
    target?: PlayerId
    cheatType?: string
    evidence?: string
  } | null> {
    // This is called as part of the regular turn decision
    // The agent can use the 'accuse' tool during their turn
    // For now, we don't have a separate accusation phase
    return null
  }

  /**
   * Parse a decision from the model's response
   */
  private parseDecision(message: Message): AgentDecision {
    const decision: AgentDecision = {
      action: { type: 'end_turn' },
      reasoning: message.content ?? undefined,
    }

    const toolCalls = message.tool_calls ?? []

    for (const toolCall of toolCalls) {
      const { name, arguments: argsStr } = toolCall.function

      try {
        const args = JSON.parse(argsStr)

        if (name === 'declare_cheat') {
          decision.cheatDeclaration = {
            type: args.cheat_type,
            useToken: args.use_token,
            details: args.details,
          }
        } else if (name === 'allocate_attention') {
          decision.attentionAllocation = args.allocations
        } else {
          // Game action
          decision.action = {
            type: this.toolToActionType(name),
            ...args,
          }
        }
      } catch (e) {
        console.error(`Failed to parse tool call ${name}:`, e)
      }
    }

    return decision
  }

  /**
   * Parse a trade response
   */
  private parseTradeResponse(message: Message, tradeId: string): TradeResponse {
    const toolCall = message.tool_calls?.[0]

    if (!toolCall) {
      return { action: 'reject', reasoning: message.content ?? undefined }
    }

    const { name, arguments: argsStr } = toolCall.function

    try {
      const args = JSON.parse(argsStr)

      if (name === 'accept_trade') {
        return { action: 'accept', reasoning: message.content ?? undefined }
      } else if (name === 'reject_trade') {
        return { action: 'reject', reasoning: message.content ?? undefined }
      } else if (name === 'counter_trade') {
        return {
          action: 'counter',
          counterOffer: {
            offer: args.offer,
            request: args.request,
          },
          reasoning: message.content ?? undefined,
        }
      }
    } catch (e) {
      console.error('Failed to parse trade response:', e)
    }

    return { action: 'reject' }
  }

  /**
   * Map tool name to action type
   */
  private toolToActionType(toolName: string): string {
    const mapping: Record<string, string> = {
      roll_dice: 'roll_dice',
      build_settlement: 'build_settlement',
      build_city: 'build_city',
      build_road: 'build_road',
      buy_dev_card: 'buy_dev_card',
      play_dev_card: 'play_dev_card',
      propose_trade: 'propose_trade',
      bank_trade: 'bank_trade',
      move_robber: 'move_robber',
      steal_resource: 'steal_resource',
      discard: 'discard',
      end_turn: 'end_turn',
      accuse: 'accuse',
    }
    return mapping[toolName] ?? toolName
  }

  /**
   * Default attention allocation (even split)
   */
  private defaultAttention(otherPlayers: string[]): Record<string, number> {
    const perPlayer = 0.8 / otherPlayers.length
    const allocation: Record<string, number> = { board: 0.2 }
    for (const player of otherPlayers) {
      allocation[player] = perPlayer
    }
    return allocation
  }

  /**
   * Trim conversation history to prevent context overflow
   */
  private trimHistory(): void {
    const maxMessages = 20
    if (this.conversationHistory.length > maxMessages) {
      // Keep system context by removing from the middle
      this.conversationHistory = this.conversationHistory.slice(-maxMessages)
    }
  }

  /**
   * Reset conversation history (e.g., for new game)
   */
  resetHistory(): void {
    this.conversationHistory = []
  }
}

/**
 * Create a player agent
 */
export function createPlayerAgent(config: AgentConfig, client: OpenRouterClient): PlayerAgent {
  return new PlayerAgent(config, client)
}
