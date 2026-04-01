import type { Tool } from '../lib/openrouter.js'

/**
 * Tool definitions for player agents
 *
 * These are the actions agents can take during their turn.
 */

export const AGENT_TOOLS: Tool[] = [
  // ==========================================================================
  // DICE
  // ==========================================================================
  {
    type: 'function',
    function: {
      name: 'roll_dice',
      description: 'Roll the dice to start your turn. Must be done before other actions.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },

  // ==========================================================================
  // BUILDING
  // ==========================================================================
  {
    type: 'function',
    function: {
      name: 'build_settlement',
      description: 'Build a settlement at a vertex. Costs 1 wood, 1 brick, 1 wheat, 1 sheep.',
      parameters: {
        type: 'object',
        properties: {
          vertex: {
            type: 'string',
            description: 'The vertex ID where to build the settlement',
          },
        },
        required: ['vertex'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'build_city',
      description: 'Upgrade a settlement to a city. Costs 2 wheat, 3 ore.',
      parameters: {
        type: 'object',
        properties: {
          vertex: {
            type: 'string',
            description: 'The vertex ID of the settlement to upgrade',
          },
        },
        required: ['vertex'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'build_road',
      description: 'Build a road on an edge. Costs 1 wood, 1 brick.',
      parameters: {
        type: 'object',
        properties: {
          edge: {
            type: 'string',
            description: 'The edge ID where to build the road',
          },
        },
        required: ['edge'],
      },
    },
  },

  // ==========================================================================
  // DEVELOPMENT CARDS
  // ==========================================================================
  {
    type: 'function',
    function: {
      name: 'buy_dev_card',
      description: 'Buy a development card. Costs 1 wheat, 1 sheep, 1 ore.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'play_dev_card',
      description: 'Play a development card from your hand. Can only play one per turn.',
      parameters: {
        type: 'object',
        properties: {
          card_id: {
            type: 'string',
            description: 'The ID of the card to play',
          },
          params: {
            type: 'object',
            description: 'Card-specific parameters (e.g., resources for Year of Plenty)',
            properties: {
              resources: {
                type: 'array',
                items: { type: 'string' },
                description: 'For Year of Plenty: two resource types to take',
              },
              resource: {
                type: 'string',
                description: 'For Monopoly: the resource type to monopolize',
              },
            },
          },
        },
        required: ['card_id'],
      },
    },
  },

  // ==========================================================================
  // TRADING
  // ==========================================================================
  {
    type: 'function',
    function: {
      name: 'propose_trade',
      description: 'Propose a trade to another player or to everyone.',
      parameters: {
        type: 'object',
        properties: {
          target: {
            type: 'string',
            description: 'Player ID to trade with, or "any" for open offer',
          },
          offer: {
            type: 'object',
            description: 'Resources you are offering',
            properties: {
              wood: { type: 'number' },
              brick: { type: 'number' },
              wheat: { type: 'number' },
              sheep: { type: 'number' },
              ore: { type: 'number' },
            },
          },
          request: {
            type: 'object',
            description: 'Resources you want in return',
            properties: {
              wood: { type: 'number' },
              brick: { type: 'number' },
              wheat: { type: 'number' },
              sheep: { type: 'number' },
              ore: { type: 'number' },
            },
          },
        },
        required: ['target', 'offer', 'request'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'bank_trade',
      description: 'Trade with the bank at 4:1 ratio (or better with ports).',
      parameters: {
        type: 'object',
        properties: {
          offer: {
            type: 'object',
            description: 'Resources you are giving to the bank',
            properties: {
              wood: { type: 'number' },
              brick: { type: 'number' },
              wheat: { type: 'number' },
              sheep: { type: 'number' },
              ore: { type: 'number' },
            },
          },
          request: {
            type: 'object',
            description: 'Resource you want from the bank (should be 1 total)',
            properties: {
              wood: { type: 'number' },
              brick: { type: 'number' },
              wheat: { type: 'number' },
              sheep: { type: 'number' },
              ore: { type: 'number' },
            },
          },
        },
        required: ['offer', 'request'],
      },
    },
  },

  // ==========================================================================
  // ROBBER
  // ==========================================================================
  {
    type: 'function',
    function: {
      name: 'move_robber',
      description: 'Move the robber to a new hex.',
      parameters: {
        type: 'object',
        properties: {
          hex: {
            type: 'string',
            description: 'The hex ID to move the robber to',
          },
        },
        required: ['hex'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'steal_resource',
      description: 'Steal a random resource from a player on the robber hex.',
      parameters: {
        type: 'object',
        properties: {
          target: {
            type: 'string',
            description: 'Player ID to steal from',
          },
        },
        required: ['target'],
      },
    },
  },

  // ==========================================================================
  // DISCARD
  // ==========================================================================
  {
    type: 'function',
    function: {
      name: 'discard',
      description: 'Discard half your cards when you have more than 7 and a 7 is rolled.',
      parameters: {
        type: 'object',
        properties: {
          resources: {
            type: 'object',
            description: 'Resources to discard',
            properties: {
              wood: { type: 'number' },
              brick: { type: 'number' },
              wheat: { type: 'number' },
              sheep: { type: 'number' },
              ore: { type: 'number' },
            },
          },
        },
        required: ['resources'],
      },
    },
  },

  // ==========================================================================
  // TURN MANAGEMENT
  // ==========================================================================
  {
    type: 'function',
    function: {
      name: 'end_turn',
      description: 'End your turn and pass to the next player.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },

  // ==========================================================================
  // ATTENTION (Meta-game)
  // ==========================================================================
  {
    type: 'function',
    function: {
      name: 'allocate_attention',
      description:
        'Allocate your attention for observing other players. Total must be <= 1.0. Higher attention = more detailed perception of their actions.',
      parameters: {
        type: 'object',
        properties: {
          allocations: {
            type: 'object',
            description: 'Map of player IDs (or "board") to attention values (0.0 to 1.0)',
            additionalProperties: { type: 'number' },
          },
        },
        required: ['allocations'],
      },
    },
  },

  // ==========================================================================
  // CHEAT SYSTEM (Meta-game)
  // ==========================================================================
  {
    type: 'function',
    function: {
      name: 'declare_cheat',
      description:
        'Secretly declare a cheat to the Game Master. Use a token for guaranteed success, or risk detection without.',
      parameters: {
        type: 'object',
        properties: {
          cheat_type: {
            type: 'string',
            enum: [
              'resource_inflation',
              'robber_dodge',
              'trade_shortchange',
              'peek_hand',
              'peek_dev_cards',
              'peek_dice',
              'extra_build',
              'extra_trade',
              'skip_discard',
              'double_dev_card',
            ],
            description: 'The type of cheat to attempt',
          },
          use_token: {
            type: 'boolean',
            description: 'Whether to use a cheat token for guaranteed success',
          },
          details: {
            type: 'object',
            description: 'Cheat-specific details',
          },
        },
        required: ['cheat_type', 'use_token'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'accuse',
      description:
        'Accuse another player of cheating. Correct accusation = +1 VP. Wrong accusation = lose your next turn.',
      parameters: {
        type: 'object',
        properties: {
          target: {
            type: 'string',
            description: 'Player ID to accuse',
          },
          cheat_type: {
            type: 'string',
            enum: [
              'resource_inflation',
              'robber_dodge',
              'trade_shortchange',
              'peek_hand',
              'peek_dev_cards',
              'peek_dice',
              'extra_build',
              'extra_trade',
              'skip_discard',
              'double_dev_card',
            ],
            description: 'The type of cheat you are accusing them of',
          },
          evidence: {
            type: 'string',
            description: 'Your reasoning/evidence for the accusation',
          },
        },
        required: ['target', 'cheat_type'],
      },
    },
  },
]

/**
 * Trade response tools (for non-active players)
 */
export const TRADE_RESPONSE_TOOLS: Tool[] = [
  {
    type: 'function',
    function: {
      name: 'accept_trade',
      description: 'Accept the proposed trade.',
      parameters: {
        type: 'object',
        properties: {
          trade_id: {
            type: 'string',
            description: 'The ID of the trade to accept',
          },
        },
        required: ['trade_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reject_trade',
      description: 'Reject the proposed trade.',
      parameters: {
        type: 'object',
        properties: {
          trade_id: {
            type: 'string',
            description: 'The ID of the trade to reject',
          },
        },
        required: ['trade_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'counter_trade',
      description: 'Make a counter-offer.',
      parameters: {
        type: 'object',
        properties: {
          trade_id: {
            type: 'string',
            description: 'The ID of the trade to counter',
          },
          offer: {
            type: 'object',
            description: 'Resources you are offering',
          },
          request: {
            type: 'object',
            description: 'Resources you want in return',
          },
        },
        required: ['trade_id', 'offer', 'request'],
      },
    },
  },
]
