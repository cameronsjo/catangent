import { describe, it, expect, beforeEach } from 'vitest'
import { RuleEngine } from './engine.js'
import { createCatanRuleEngine } from './index.js'
import type { HardRule, SoftRule } from './types.js'
import { hardViolation, softViolation } from './types.js'
import type { Action, GameState, BuildSettlementAction } from '../types/index.js'

// =============================================================================
// TEST HELPERS
// =============================================================================

function createMockGameState(overrides: Partial<GameState> = {}): GameState {
  const defaultState: GameState = {
    board: {
      hexes: new Map(),
      vertices: new Map([
        ['v1', { id: 'v1', adjacentVertices: ['v2'], adjacentEdges: ['e1'], adjacentHexes: ['h1'] }],
        ['v2', { id: 'v2', adjacentVertices: ['v1', 'v3'], adjacentEdges: ['e1', 'e2'], adjacentHexes: ['h1'] }],
        ['v3', { id: 'v3', adjacentVertices: ['v2'], adjacentEdges: ['e2'], adjacentHexes: ['h1'] }],
      ]),
      edges: new Map([
        ['e1', { id: 'e1', vertices: ['v1', 'v2'], adjacentEdges: ['e2'] }],
        ['e2', { id: 'e2', vertices: ['v2', 'v3'], adjacentEdges: ['e1'] }],
      ]),
      ports: [],
      buildings: [],
      roads: [],
      robberHex: 'h1',
    },
    players: new Map([
      ['alice', {
        id: 'alice',
        resources: { wood: 2, brick: 2, wheat: 1, sheep: 1, ore: 0 },
        devCards: [],
        knightsPlayed: 0,
        cheatTokens: 2,
        publicVictoryPoints: 0,
        totalVictoryPoints: 0,
      }],
      ['bob', {
        id: 'bob',
        resources: { wood: 0, brick: 0, wheat: 0, sheep: 0, ore: 0 },
        devCards: [],
        knightsPlayed: 0,
        cheatTokens: 2,
        publicVictoryPoints: 0,
        totalVictoryPoints: 0,
      }],
    ]),
    turnOrder: ['alice', 'bob'],
    currentPlayerIndex: 0,
    turn: 1,
    phase: 'main',
    activeEffect: { type: 'none' },
    longestRoadPlayer: null,
    longestRoadLength: 0,
    largestArmyPlayer: null,
    largestArmySize: 0,
    turnState: {
      diceRolled: true,
      diceValue: [3, 4],
      buildCount: 0,
      tradeCount: 0,
      devCardPlayed: false,
      devCardsBought: [],
      playersDiscarded: new Set(),
      robberMoved: false,
      resourcesAtTurnStart: new Map([
        ['alice', { wood: 2, brick: 2, wheat: 1, sheep: 1, ore: 0 }],
        ['bob', { wood: 0, brick: 0, wheat: 0, sheep: 0, ore: 0 }],
      ]),
      resourcesProduced: new Map(),
    },
    bankResources: { wood: 19, brick: 19, wheat: 19, sheep: 19, ore: 19 },
    devCardDeck: ['d1', 'd2', 'd3'],
    winner: null,
  }

  return { ...defaultState, ...overrides }
}

// =============================================================================
// ENGINE BASIC TESTS
// =============================================================================

describe('RuleEngine', () => {
  let engine: RuleEngine

  beforeEach(() => {
    engine = new RuleEngine()
  })

  it('should start with no rules', () => {
    const counts = engine.getRuleCounts()
    expect(counts.hard).toBe(0)
    expect(counts.soft).toBe(0)
  })

  it('should allow adding hard rules', () => {
    const rule: HardRule = {
      name: 'test_rule',
      appliesTo: ['build_settlement'],
      validate: () => null,
    }

    engine.addHardRule(rule)
    expect(engine.getRuleCounts().hard).toBe(1)
  })

  it('should allow adding soft rules', () => {
    const rule: SoftRule = {
      name: 'test_rule',
      appliesTo: ['build_settlement'],
      detect: () => null,
    }

    engine.addSoftRule(rule)
    expect(engine.getRuleCounts().soft).toBe(1)
  })

  it('should return allowed=true when no violations', () => {
    const action: BuildSettlementAction = {
      type: 'build_settlement',
      player: 'alice',
      vertex: 'v1',
    }
    const state = createMockGameState()

    const result = engine.validate(action, state)

    expect(result.allowed).toBe(true)
    expect(result.hardViolations).toHaveLength(0)
    expect(result.softViolations).toHaveLength(0)
  })

  it('should return allowed=false when hard violation exists', () => {
    const rule: HardRule = {
      name: 'always_fail',
      appliesTo: ['build_settlement'],
      validate: () => hardViolation('always_fail', 'This always fails'),
    }

    engine.addHardRule(rule)

    const action: BuildSettlementAction = {
      type: 'build_settlement',
      player: 'alice',
      vertex: 'v1',
    }
    const state = createMockGameState()

    const result = engine.validate(action, state)

    expect(result.allowed).toBe(false)
    expect(result.hardViolations).toHaveLength(1)
    expect(result.hardViolations[0]?.message).toBe('This always fails')
  })

  it('should return allowed=true but include soft violations', () => {
    const rule: SoftRule = {
      name: 'suspicious',
      appliesTo: ['build_settlement'],
      detect: (action, state) => softViolation(
        'suspicious',
        'Suspicious activity',
        action.player,
        state.turn,
        'extra_build',
        'medium'
      ),
    }

    engine.addSoftRule(rule)

    const action: BuildSettlementAction = {
      type: 'build_settlement',
      player: 'alice',
      vertex: 'v1',
    }
    const state = createMockGameState()

    const result = engine.validate(action, state)

    expect(result.allowed).toBe(true) // Soft violations don't block
    expect(result.softViolations).toHaveLength(1)
    expect(result.softViolations[0]?.cheatType).toBe('extra_build')
  })

  it('should only apply rules matching action type', () => {
    const rule: HardRule = {
      name: 'road_only',
      appliesTo: ['build_road'],
      validate: () => hardViolation('road_only', 'Should not trigger'),
    }

    engine.addHardRule(rule)

    const action: BuildSettlementAction = {
      type: 'build_settlement',
      player: 'alice',
      vertex: 'v1',
    }
    const state = createMockGameState()

    const result = engine.validate(action, state)

    expect(result.allowed).toBe(true) // Rule didn't apply
    expect(result.hardViolations).toHaveLength(0)
  })

  it('should apply wildcard rules to all actions', () => {
    const rule: HardRule = {
      name: 'applies_to_all',
      appliesTo: '*',
      validate: () => hardViolation('applies_to_all', 'Applies to everything'),
    }

    engine.addHardRule(rule)

    const action: BuildSettlementAction = {
      type: 'build_settlement',
      player: 'alice',
      vertex: 'v1',
    }
    const state = createMockGameState()

    const result = engine.validate(action, state)

    expect(result.allowed).toBe(false)
    expect(result.hardViolations).toHaveLength(1)
  })
})

// =============================================================================
// FULL ENGINE TESTS
// =============================================================================

describe('createCatanRuleEngine', () => {
  let engine: RuleEngine

  beforeEach(() => {
    engine = createCatanRuleEngine()
  })

  it('should create engine with all rules loaded', () => {
    const counts = engine.getRuleCounts()
    expect(counts.hard).toBeGreaterThan(0)
    expect(counts.soft).toBeGreaterThan(0)
  })

  it('should block settlement on occupied vertex', () => {
    const state = createMockGameState()
    state.board.buildings.push({
      type: 'settlement',
      vertex: 'v1',
      player: 'bob',
    })

    const action: BuildSettlementAction = {
      type: 'build_settlement',
      player: 'alice',
      vertex: 'v1',
    }

    const result = engine.validate(action, state)

    expect(result.allowed).toBe(false)
    expect(result.hardViolations.some(v => v.rule === 'settlement_not_occupied')).toBe(true)
  })

  it('should block settlement adjacent to existing settlement', () => {
    const state = createMockGameState()
    state.board.buildings.push({
      type: 'settlement',
      vertex: 'v1',
      player: 'bob',
    })

    const action: BuildSettlementAction = {
      type: 'build_settlement',
      player: 'alice',
      vertex: 'v2', // Adjacent to v1
    }

    const result = engine.validate(action, state)

    expect(result.allowed).toBe(false)
    expect(result.hardViolations.some(v => v.rule === 'settlement_distance_rule')).toBe(true)
  })

  it('should block action when not your turn', () => {
    const state = createMockGameState()

    const action: BuildSettlementAction = {
      type: 'build_settlement',
      player: 'bob', // It's alice's turn
      vertex: 'v3',
    }

    const result = engine.validate(action, state)

    expect(result.allowed).toBe(false)
    expect(result.hardViolations.some(v => v.rule === 'must_be_your_turn')).toBe(true)
  })

  it('should block building without resources', () => {
    const state = createMockGameState()
    // Bob has no resources
    state.currentPlayerIndex = 1 // Bob's turn

    const action: BuildSettlementAction = {
      type: 'build_settlement',
      player: 'bob',
      vertex: 'v3',
    }

    const result = engine.validate(action, state)

    expect(result.allowed).toBe(false)
    expect(result.hardViolations.some(v => v.rule === 'settlement_cost')).toBe(true)
  })

  it('should detect multiple builds as soft violation', () => {
    const state = createMockGameState()
    state.turnState.buildCount = 1 // Already built once

    // Add road to connect settlement
    state.board.roads.push({ edge: 'e2', player: 'alice' })

    const action: BuildSettlementAction = {
      type: 'build_settlement',
      player: 'alice',
      vertex: 'v3',
    }

    const result = engine.validate(action, state)

    // Might be blocked by other rules, but should have soft violation
    expect(result.softViolations.some(v => v.rule === 'multiple_build_detection')).toBe(true)
  })
})
