import type { GrammarLevel } from './types'
import { N5 } from './n5'
import { N4 } from './n4'
import { N3 } from './n3'

/** Todos los niveles, de más fácil a más difícil. */
export const GRAMMAR: GrammarLevel[] = [N5, N4, N3]

export * from './types'
