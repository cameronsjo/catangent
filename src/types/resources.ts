/**
 * Resource types in Catan
 */
export type ResourceType = 'wood' | 'brick' | 'wheat' | 'sheep' | 'ore'

export const RESOURCE_TYPES: ResourceType[] = ['wood', 'brick', 'wheat', 'sheep', 'ore']

/**
 * A count of resources by type
 */
export type Resources = Record<ResourceType, number>

/**
 * Create an empty resource bag
 */
export function emptyResources(): Resources {
  return { wood: 0, brick: 0, wheat: 0, sheep: 0, ore: 0 }
}

/**
 * Sum total resources
 */
export function totalResources(r: Resources): number {
  return r.wood + r.brick + r.wheat + r.sheep + r.ore
}

/**
 * Check if a has at least b of each resource
 */
export function hasResources(have: Resources, need: Resources): boolean {
  return RESOURCE_TYPES.every(type => have[type] >= need[type])
}

/**
 * Subtract resources (does not check for negative)
 */
export function subtractResources(from: Resources, amount: Resources): Resources {
  return {
    wood: from.wood - amount.wood,
    brick: from.brick - amount.brick,
    wheat: from.wheat - amount.wheat,
    sheep: from.sheep - amount.sheep,
    ore: from.ore - amount.ore,
  }
}

/**
 * Add resources
 */
export function addResources(to: Resources, amount: Resources): Resources {
  return {
    wood: to.wood + amount.wood,
    brick: to.brick + amount.brick,
    wheat: to.wheat + amount.wheat,
    sheep: to.sheep + amount.sheep,
    ore: to.ore + amount.ore,
  }
}

/**
 * Building costs
 */
export const BUILDING_COSTS = {
  road: { wood: 1, brick: 1, wheat: 0, sheep: 0, ore: 0 } as Resources,
  settlement: { wood: 1, brick: 1, wheat: 1, sheep: 1, ore: 0 } as Resources,
  city: { wood: 0, brick: 0, wheat: 2, sheep: 0, ore: 3 } as Resources,
  devCard: { wood: 0, brick: 0, wheat: 1, sheep: 1, ore: 1 } as Resources,
} as const
