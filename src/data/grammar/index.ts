import type { GrammarLevel } from './types'
import { N5 } from './n5'
import { N4 } from './n4'
import { N3 } from './n3'
import { N2 } from './n2'
import { N1 } from './n1'

/** Todos los niveles, de más fácil a más difícil. */
export const GRAMMAR: GrammarLevel[] = [N5, N4, N3, N2, N1]

export * from './types'
