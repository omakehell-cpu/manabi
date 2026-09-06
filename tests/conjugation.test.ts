import { describe, expect, it } from 'vitest'
import { classOf, conjugate, formsFor, type WordClass } from '../src/lib/conjugation'

/** Comprueba de golpe todas las formas de una palabra. */
function check(word: string, cls: WordClass, expected: Record<string, string | null>) {
  for (const [form, want] of Object.entries(expected)) {
    expect(conjugate(word, cls, form as never), `${word} → ${form}`).toBe(want)
  }
}

describe('clasificación desde las etiquetas de JMdict', () => {
  it('reconoce las clases principales', () => {
    expect(classOf(['v1'])).toBe('v1')
    expect(classOf(['v5k', 'vt'])).toBe('v5')
    expect(classOf(['vk'])).toBe('vk')
    expect(classOf(['vs-i'])).toBe('vs')
    expect(classOf(['adj-i'])).toBe('adj-i')
    expect(classOf(['adj-na'])).toBe('adj-na')
  })

  it('no clasifica lo que no se conjuga', () => {
    expect(classOf(['n'])).toBeNull()
    expect(classOf(['adv'])).toBeNull()
  })
})

describe('verbos ichidan', () => {
  it('食べる pierde la る y añade la terminación', () => {
    check('食べる', 'v1', {
      masu: '食べます',
      te: '食べて',
      ta: '食べた',
      nai: '食べない',
      nakatta: '食べなかった',
      potential: '食べられる',
      volitional: '食べよう',
    })
  })
})

describe('verbos godan', () => {
  it('買う hace わない, no あない', () => {
    // La excepción clásica: la fila あ de う es わ.
    check('買う', 'v5', {
      masu: '買います',
      te: '買って',
      ta: '買った',
      nai: '買わない',
      potential: '買える',
      volitional: '買おう',
    })
  })

  it('書く hace いて', () => {
    check('書く', 'v5', { te: '書いて', ta: '書いた', masu: '書きます', nai: '書かない' })
  })

  it('泳ぐ hace いで, con dakuten', () => {
    check('泳ぐ', 'v5', { te: '泳いで', ta: '泳いだ' })
  })

  it('話す hace して', () => {
    check('話す', 'v5', { te: '話して', ta: '話した', masu: '話します' })
  })

  it('読む, 遊ぶ y 死ぬ hacen んで', () => {
    check('読む', 'v5', { te: '読んで', ta: '読んだ' })
    check('遊ぶ', 'v5', { te: '遊んで', ta: '遊んだ' })
    check('死ぬ', 'v5', { te: '死んで', ta: '死んだ' })
  })

  it('待つ y 帰る hacen って', () => {
    check('待つ', 'v5', { te: '待って', ta: '待った' })
    check('帰る', 'v5', { te: '帰って', ta: '帰った' })
  })

  it('行く es la excepción: って y no いて', () => {
    // Único godan en く que rompe la regla. Es EL error clásico.
    check('行く', 'v5', { te: '行って', ta: '行った', masu: '行きます' })
    expect(conjugate('行く', 'v5', 'te')).not.toBe('行いて')
  })
})

describe('verbos irregulares', () => {
  it('来る cambia de lectura en cada forma', () => {
    check('来る', 'vk', {
      masu: '来ます',
      te: '来て',
      ta: '来た',
      nai: '来ない',
      potential: '来られる',
      volitional: '来よう',
    })
  })

  it('する y sus compuestos', () => {
    check('する', 'vs', { masu: 'します', te: 'して', ta: 'した', nai: 'しない' })
    check('勉強する', 'vs', {
      masu: '勉強します',
      te: '勉強して',
      potential: '勉強できる',
      volitional: '勉強しよう',
    })
  })
})

describe('adjetivos', () => {
  it('高い pierde la い', () => {
    check('高い', 'adj-i', {
      masu: '高いです',
      te: '高くて',
      ta: '高かった',
      nai: '高くない',
      nakatta: '高くなかった',
    })
  })

  it('いい se conjuga como よい', () => {
    // Otra excepción clásica: いい → よかった, nunca いかった.
    check('いい', 'adj-i', { ta: 'よかった', nai: 'よくない', te: 'よくて' })
    expect(conjugate('いい', 'adj-i', 'ta')).not.toBe('いかった')
  })

  it('静か usa だった y じゃない', () => {
    check('静か', 'adj-na', {
      masu: '静かです',
      te: '静かで',
      ta: '静かだった',
      nai: '静かじゃない',
    })
  })

  it('los adjetivos no tienen potencial ni volitivo', () => {
    expect(conjugate('高い', 'adj-i', 'potential')).toBeNull()
    expect(conjugate('静か', 'adj-na', 'volitional')).toBeNull()
    expect(formsFor('adj-i')).not.toContain('potential')
  })
})

describe('lo que no encaja devuelve null, en vez de inventarse una forma', () => {
  it('rechaza terminaciones imposibles', () => {
    expect(conjugate('本', 'v1', 'masu')).toBeNull()
    expect(conjugate('本', 'v5', 'te')).toBeNull()
    expect(conjugate('食べる', 'vs', 'masu')).toBeNull()
    expect(conjugate('高', 'adj-i', 'ta')).toBeNull()
  })
})
