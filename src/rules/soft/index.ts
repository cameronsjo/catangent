import { actionSoftRules } from './actions.js'
import { resourceSoftRules } from './resources.js'
import { devCardSoftRules } from './devCards.js'
import type { SoftRule } from '../types.js'

/**
 * All SOFT rules - these flag potential cheats
 */
export const allSoftRules: SoftRule[] = [
  ...actionSoftRules,
  ...resourceSoftRules,
  ...devCardSoftRules,
]

export { actionSoftRules } from './actions.js'
export { resourceSoftRules } from './resources.js'
export { devCardSoftRules } from './devCards.js'
