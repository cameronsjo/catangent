/**
 * OpenRouter API client for multi-model LLM access
 *
 * Supports: Claude, GPT-4, Gemini, Llama, Mistral via unified API
 */

export interface OpenRouterConfig {
  apiKey: string
  baseUrl?: string
  defaultModel?: string
}

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  name?: string
  tool_call_id?: string
  tool_calls?: ToolCall[]
}

export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface Tool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface ChatCompletionRequest {
  model: string
  messages: Message[]
  tools?: Tool[]
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
  temperature?: number
  max_tokens?: number
  stop?: string[]
}

export interface ChatCompletionResponse {
  id: string
  model: string
  choices: {
    index: number
    message: Message
    finish_reason: 'stop' | 'tool_calls' | 'length' | 'content_filter'
  }[]
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

/**
 * Model identifiers for OpenRouter
 */
export const MODELS = {
  // Anthropic
  claude: 'anthropic/claude-3.5-sonnet',
  claudeOpus: 'anthropic/claude-3-opus',
  claudeHaiku: 'anthropic/claude-3-haiku',

  // OpenAI
  gpt4: 'openai/gpt-4-turbo',
  gpt4o: 'openai/gpt-4o',

  // Google
  gemini: 'google/gemini-pro-1.5',
  geminiFlash: 'google/gemini-flash-1.5',

  // Meta
  llama: 'meta-llama/llama-3.1-70b-instruct',
  llamaSmall: 'meta-llama/llama-3.1-8b-instruct',

  // Mistral
  mistral: 'mistralai/mistral-large',
  mistralSmall: 'mistralai/mistral-7b-instruct',
} as const

export type ModelId = (typeof MODELS)[keyof typeof MODELS] | string

/**
 * OpenRouter API client
 */
export class OpenRouterClient {
  private apiKey: string
  private baseUrl: string
  private defaultModel: ModelId

  constructor(config: OpenRouterConfig) {
    this.apiKey = config.apiKey
    this.baseUrl = config.baseUrl ?? 'https://openrouter.ai/api/v1'
    this.defaultModel = config.defaultModel ?? MODELS.claude
  }

  /**
   * Send a chat completion request
   */
  async chat(request: Partial<ChatCompletionRequest> & { messages: Message[] }): Promise<ChatCompletionResponse> {
    const fullRequest: ChatCompletionRequest = {
      model: request.model ?? this.defaultModel,
      messages: request.messages,
      tools: request.tools,
      tool_choice: request.tool_choice,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.max_tokens ?? 4096,
      stop: request.stop,
    }

    const response = await this.fetch('/chat/completions', {
      method: 'POST',
      body: JSON.stringify(fullRequest),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`OpenRouter API error (${response.status}): ${error}`)
    }

    return response.json() as Promise<ChatCompletionResponse>
  }

  /**
   * Simple completion (no tools)
   */
  async complete(
    prompt: string,
    options: { model?: ModelId; system?: string; temperature?: number } = {}
  ): Promise<string> {
    const messages: Message[] = []

    if (options.system) {
      messages.push({ role: 'system', content: options.system })
    }
    messages.push({ role: 'user', content: prompt })

    const response = await this.chat({
      model: options.model,
      messages,
      temperature: options.temperature,
    })

    return response.choices[0]?.message.content ?? ''
  }

  /**
   * Chat with tool use
   */
  async chatWithTools(
    messages: Message[],
    tools: Tool[],
    options: { model?: ModelId; temperature?: number } = {}
  ): Promise<ChatCompletionResponse> {
    return this.chat({
      model: options.model,
      messages,
      tools,
      tool_choice: 'auto',
      temperature: options.temperature,
    })
  }

  /**
   * Internal fetch wrapper with auth
   */
  private async fetch(path: string, init: RequestInit): Promise<Response> {
    const url = `${this.baseUrl}${path}`

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
      'HTTP-Referer': 'https://github.com/catangent',
      'X-Title': 'Catangent',
    }

    return fetch(url, {
      ...init,
      headers: {
        ...headers,
        ...(init.headers as Record<string, string>),
      },
    })
  }
}

/**
 * Create client from environment or config
 */
export function createOpenRouterClient(config?: { apiKey?: string }): OpenRouterClient {
  const apiKey = config?.apiKey ?? process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY environment variable is required')
  }
  return new OpenRouterClient({ apiKey })
}
