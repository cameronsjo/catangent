import { spatialRules } from './spatial.js'
import { resourceRules } from './resources.js'
import { turnRules } from './turn.js'
import type { HardRule } from '../types.js'

/**
 * All HARD rules - these block invalid actions
 */
export const allHardRules: HardRule[] = [
  ...spatialRules,
  ...resourceRules,
  ...turnRules,
]

export { spatialRules } from './spatial.js'
export { resourceRules } from './resources.js'
export { turnRules } from './turn.js'
