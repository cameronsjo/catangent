/**
 * Mock OpenRouter client for testing without API keys
 *
 * Simulates LLM responses with simple heuristic-based decisions
 */

import type { Message, Tool, ChatCompletionRequest, ChatCompletionResponse } from '../lib/openrouter.js'

export interface MockOpenRouterConfig {
  defaultModel?: string
  responseDelay?: number
}

/**
 * Mock OpenRouter client that generates simple decisions
 */
export class MockOpenRouterClient {
  private responseDelay: number

  constructor(config: MockOpenRouterConfig = {}) {
    this.responseDelay = config.responseDelay ?? 100
  }

  /**
   * Mock chat completion
   */
  async chat(messages: Message[], options?: Partial<ChatCompletionRequest>): Promise<ChatCompletionResponse> {
    await this.delay()

    return {
      id: `mock_${Date.now()}`,
      model: options?.model ?? 'mock-model',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: 'I am a mock agent making a decision.',
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 20,
        total_tokens: 120,
      },
    }
  }

  /**
   * Mock chat with tools - generates tool calls based on context
   */
  async chatWithTools(
    messages: Message[],
    tools: Tool[],
    options?: Partial<ChatCompletionRequest>
  ): Promise<ChatCompletionResponse> {
    await this.delay()

    // Analyze last user message to determine action
    const lastUserMessage = messages.filter(m => m.role === 'user').pop()
    const content = lastUserMessage?.content ?? ''

    // Determine which tool to call based on context
    const toolCall = this.selectTool(content, tools)

    return {
      id: `mock_${Date.now()}`,
      model: options?.model ?? 'mock-model',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: `Thinking through my options... ${toolCall.reasoning}`,
            tool_calls: [
              {
                id: `call_${Date.now()}`,
                type: 'function',
                function: {
                  name: toolCall.name,
                  arguments: JSON.stringify(toolCall.args),
                },
              },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
      usage: {
        prompt_tokens: 200,
        completion_tokens: 50,
        total_tokens: 250,
      },
    }
  }

  /**
   * Select a tool based on the context
   */
  private selectTool(content: string, tools: Tool[]): { name: string; args: Record<string, unknown>; reasoning: string } {
    const toolNames = tools.map(t => t.function.name)

    // Attention allocation
    if (content.includes('Attention Allocation') || toolNames.includes('allocate_attention')) {
      if (toolNames.includes('allocate_attention')) {
        return {
          name: 'allocate_attention',
          args: {
            allocations: {
              board: 0.3,
              // Will be filled with actual player IDs in real game
            },
          },
          reasoning: 'Allocating attention evenly across players with some focus on the board.',
        }
      }
    }

    // Trade response
    if (content.includes('Trade Offer')) {
      if (toolNames.includes('accept_trade')) {
        // Random accept/reject
        const accept = Math.random() > 0.5
        return {
          name: accept ? 'accept_trade' : 'reject_trade',
          args: {},
          reasoning: accept
            ? 'This trade seems beneficial to my strategy.'
            : 'This trade does not align with my current needs.',
        }
      }
    }

    // Pre-roll phase - must roll dice
    if (content.includes('Phase: pre_roll') && toolNames.includes('roll_dice')) {
      return {
        name: 'roll_dice',
        args: {},
        reasoning: 'Starting my turn by rolling the dice.',
      }
    }

    // Main phase - make strategic decision
    if (content.includes('Phase: main')) {
      // Check what resources we have by parsing the context
      const hasResources = this.parseResources(content)

      // Try to build road if we have resources
      if ((hasResources.wood ?? 0) >= 1 && (hasResources.brick ?? 0) >= 1 && toolNames.includes('build_road')) {
        return {
          name: 'build_road',
          args: { edge: 'e_0' },
          reasoning: 'Building a road to expand my network.',
        }
      }

      // Try to build settlement if we have resources
      if (
        (hasResources.wood ?? 0) >= 1 &&
        (hasResources.brick ?? 0) >= 1 &&
        (hasResources.wheat ?? 0) >= 1 &&
        (hasResources.sheep ?? 0) >= 1 &&
        toolNames.includes('build_settlement')
      ) {
        return {
          name: 'build_settlement',
          args: { vertex: 'v_2' },
          reasoning: 'Building a settlement to gain resources and victory points.',
        }
      }

      // Consider cheating occasionally
      if (Math.random() < 0.1 && toolNames.includes('declare_cheat')) {
        return {
          name: 'declare_cheat',
          args: {
            cheat_type: 'resource_inflation',
            use_token: true,
            details: { resources: { wood: 1, brick: 1 } },
          },
          reasoning: 'Taking a risk to accelerate my progress.',
        }
      }

      // Consider proposing a trade
      if (Math.random() < 0.3 && toolNames.includes('propose_trade')) {
        return {
          name: 'propose_trade',
          args: {
            offer: { wood: 1 },
            request: { wheat: 1 },
            to: 'all',
          },
          reasoning: 'Trying to trade for resources I need.',
        }
      }
    }

    // Default: end turn
    if (toolNames.includes('end_turn')) {
      return {
        name: 'end_turn',
        args: {},
        reasoning: 'No more actions to take, ending my turn.',
      }
    }

    // Fallback
    return {
      name: toolNames[0] ?? 'end_turn',
      args: {},
      reasoning: 'Making a default decision.',
    }
  }

  /**
   * Parse resources from context string
   */
  private parseResources(content: string): Record<string, number> {
    const resources: Record<string, number> = { wood: 0, brick: 0, wheat: 0, sheep: 0, ore: 0 }

    const woodMatch = content.match(/Wood:\s*(\d+)/)
    const brickMatch = content.match(/Brick:\s*(\d+)/)
    const wheatMatch = content.match(/Wheat:\s*(\d+)/)
    const sheepMatch = content.match(/Sheep:\s*(\d+)/)
    const oreMatch = content.match(/Ore:\s*(\d+)/)

    if (woodMatch?.[1]) resources.wood = parseInt(woodMatch[1], 10)
    if (brickMatch?.[1]) resources.brick = parseInt(brickMatch[1], 10)
    if (wheatMatch?.[1]) resources.wheat = parseInt(wheatMatch[1], 10)
    if (sheepMatch?.[1]) resources.sheep = parseInt(sheepMatch[1], 10)
    if (oreMatch?.[1]) resources.ore = parseInt(oreMatch[1], 10)

    return resources
  }

  /**
   * Simulate response delay
   */
  private delay(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, this.responseDelay))
  }
}

/**
 * Create a mock client
 */
export function createMockClient(config?: MockOpenRouterConfig): MockOpenRouterClient {
  return new MockOpenRouterClient(config)
}
