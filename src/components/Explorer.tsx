import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toHiragana, toKatakana } from 'wanakana'
import type { KanjiBrowseItem, KanjiDetail, KanjiProgress, SimpleBrowseItem } from '../types'
import { cleanReading } from '../lib/speech'
import Speaker from './Speaker'
import StrokeOrder from './StrokeOrder'

const LEVELS = [0, 5, 4, 3, 2, 1] as const

const PROGRESS_LABEL: Record<KanjiProgress, string> = {
  locked: 'sin abrir',
  new: 'por empezar',
  learning: 'aprendiendo',
  mature: 'asentados',
}

/** El color codifica el estado; el borde lo repite para no depender solo del tono. */
const PROGRESS_STYLE: Record<KanjiProgress, string> = {
  locked: 'text-muted/40',
  new: 'text-fg/80',
  learning: 'text-warn border-b-2 border-warn/60',
  mature: 'text-ok border-b-2 border-ok/60',
}

/**
 * Convierte lo que se teclea en todas las formas en que puede estar guardado.
 * Quien busca «nichi» espera encontrar ニチ sin cambiar de teclado, y quien
 * busca «agua» espera 水.
 */
function searchTerms(query: string): string[] {
  const q = query.trim()
  if (!q) return []
  const terms = new Set<string>([q])
  if (/^[a-zA-Z]+$/.test(q)) {
    terms.add(toHiragana(q))
    terms.add(toKatakana(q))
  }
  return [...terms]
}

/** Mazos que se pueden recorrer, con el nombre que se ve en el selector. */
const SCOPES = [
  { id: 'kanji', label: 'Kanji' },
  { id: 'hiragana', label: 'Hiragana' },
  { id: 'katakana', label: 'Katakana' },
  { id: 'vocab', label: 'Vocabulario' },
] as const

type Scope = (typeof SCOPES)[number]['id']

export default function Explorer() {
  const [scope, setScope] = useState<Scope>('kanji')
  const [level, setLevel] = useState<number>(5)
  const [progress, setProgress] = useState<KanjiProgress | 'all'>('all')
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<KanjiBrowseItem[] | null>(null)
  const [simple, setSimple] = useState<SimpleBrowseItem[] | null>(null)
  const [selected, setSelected] = useState<KanjiDetail | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const terms = useMemo(() => searchTerms(query), [query])

  useEffect(() => {
    let alive = true
    if (scope === 'kanji') {
      // Al buscar se ignora el nivel: si escribes 水 quieres encontrarlo,
      // no que te digan que no está en el nivel abierto.
      const filters = terms.length ? { terms, progress } : { level, progress }
      void window.manabi.browseKanji(filters).then((r) => {
        if (alive) setItems(r)
      })
    } else {
      void window.manabi.browseDeck(scope, terms).then((r) => {
        if (alive) setSimple(progress === 'all' ? r : r.filter((k) => k.progress === progress))
      })
    }
    return () => {
      alive = false
    }
  }, [scope, level, progress, terms])

  const open = useCallback((glyph: string) => {
    void window.manabi.kanjiDetail(glyph).then(setSelected)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selected) return setSelected(null)
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected])

  const shown = scope === 'kanji' ? items : simple
  const counts = useMemo(() => {
    const out: Record<string, number> = { locked: 0, new: 0, learning: 0, mature: 0 }
    for (const k of shown ?? []) out[k.progress]++
    return out
  }, [shown])

  return (
    <div className="mx-auto w-full max-w-4xl px-8 py-6">
      <h1 className="text-2xl font-medium">Explorar</h1>
      <p className="mt-1 text-sm text-muted">
        Todo el temario, se haya estudiado o no.
      </p>

      <div className="mt-5 flex flex-wrap gap-1">
        {SCOPES.map((s) => (
          <button
            key={s.id}
            onClick={() => {
              setScope(s.id)
              setQuery('')
            }}
            className={`rounded-lg px-3.5 py-1.5 text-sm transition-colors ${
              scope === s.id ? 'bg-raised text-fg' : 'text-muted hover:text-fg'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          spellCheck={false}
          placeholder={
            scope === 'kanji' ? 'Busca 水, «agua» o «sui»…' : 'Busca un signo, su lectura o su significado…'
          }
          className="min-w-56 flex-1 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm outline-none placeholder:text-muted/60 focus:border-muted"
        />
        <select
          value={level}
          onChange={(e) => setLevel(Number(e.target.value))}
          disabled={terms.length > 0 || scope !== 'kanji'}
          className="rounded-lg border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-muted disabled:opacity-40"
        >
          {LEVELS.map((n) => (
            <option key={n} value={n}>
              {n === 0 ? 'Todos los niveles' : `Nivel N${n}`}
            </option>
          ))}
        </select>
        <select
          value={progress}
          onChange={(e) => setProgress(e.target.value as KanjiProgress | 'all')}
          className="rounded-lg border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-muted"
        >
          <option value="all">Cualquier estado</option>
          {(Object.keys(PROGRESS_LABEL) as KanjiProgress[]).map((p) => (
            <option key={p} value={p}>
              {PROGRESS_LABEL[p][0].toUpperCase() + PROGRESS_LABEL[p].slice(1)}
            </option>
          ))}
        </select>
      </div>

      {shown && shown.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
          <span>
            {shown.length} {scope === 'vocab' ? 'palabras' : scope === 'kanji' ? 'kanji' : 'signos'}
          </span>
          {(Object.keys(PROGRESS_LABEL) as KanjiProgress[])
            .filter((p) => counts[p] > 0)
            .map((p) => (
              <span key={p}>
                <span className={PROGRESS_STYLE[p].split(' ')[0]}>{counts[p]}</span>{' '}
                {PROGRESS_LABEL[p]}
              </span>
            ))}
        </div>
      )}

      {!shown ? (
        <p className="mt-10 text-sm text-muted">Cargando…</p>
      ) : shown.length === 0 ? (
        <p className="mt-10 text-sm text-muted">
          {terms.length
            ? `Nada coincide con «${query}». Prueba con el carácter, un significado en español o una lectura.`
            : 'Nada con ese filtro.'}
        </p>
      ) : scope === 'kanji' ? (
        <div className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(3rem,1fr))] gap-1.5">
          {(shown as KanjiBrowseItem[]).map((k) => (
            <button
              key={k.glyph}
              onClick={() => open(k.glyph)}
              title={`${k.glyph} — ${k.meaning} (N${k.level}, ${PROGRESS_LABEL[k.progress]})`}
              className={`jp aspect-square rounded-lg bg-surface text-3xl transition-colors hover:bg-raised ${PROGRESS_STYLE[k.progress]}`}
            >
              {k.glyph}
            </button>
          ))}
        </div>
      ) : (
        // Los kana y las palabras se leen en fila: lo que importa aquí es la
        // pareja signo–lectura, no reconocer una forma de un vistazo.
        <ul className="mt-5 grid gap-1.5 sm:grid-cols-2">
          {(shown as SimpleBrowseItem[]).map((k) => (
            <li
              key={k.glyph}
              className={`flex items-baseline gap-3 rounded-lg bg-surface px-4 py-2.5 ${
                k.progress === 'locked' ? 'opacity-50' : ''
              }`}
            >
              <span className={`jp text-2xl ${PROGRESS_STYLE[k.progress].split(' ')[0]}`}>
                {k.glyph}
              </span>
              <span className="font-mono text-sm text-muted">{k.reading}</span>
              {k.meaning && (
                <span className="ml-auto truncate text-right text-sm text-muted">{k.meaning}</span>
              )}
              <Speaker text={k.glyph} />
            </li>
          ))}
        </ul>
      )}

      {selected && <DetailPanel detail={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

function DetailPanel({ detail, onClose }: { detail: KanjiDetail; onClose: () => void }) {
  const due = detail.nextDue ? new Date(detail.nextDue) : null
  const dueLabel =
    detail.progress === 'locked'
      ? 'Aún no se ha abierto'
      : due && due.getTime() > Date.now()
        ? `Vuelve el ${due.toLocaleDateString('es', { day: 'numeric', month: 'long' })}`
        : 'Pendiente de repaso'

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-10 flex items-center justify-center bg-ink/70 p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-full w-full max-w-lg overflow-y-auto rounded-2xl border border-line bg-surface p-7"
      >
        <div className="flex items-start gap-6">
          <StrokeOrder glyph={detail.glyph} size={150} />
          <div className="min-w-0 flex-1">
            <p className="text-lg">{detail.meanings.join(', ')}</p>
            <p className="mt-2 text-sm text-muted">
              N{detail.level}
              {detail.extra && ' · jōyō fuera de las listas JLPT'} · {detail.strokes} trazos
              {detail.freq > 0 && ` · nº ${detail.freq} por frecuencia en prensa`}
            </p>
            <p className="mt-1 text-sm text-muted">{dueLabel}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="shrink-0 rounded-md px-2 py-1 text-muted hover:bg-raised hover:text-fg"
          >
            ✕
          </button>
        </div>

        <div className="mt-6 space-y-2">
          {detail.on.length > 0 && <ReadingRow label="ON" readings={detail.on} />}
          {detail.kun.length > 0 && <ReadingRow label="KUN" readings={detail.kun} />}
        </div>

        <h3 className="mt-7 text-xs tracking-wide text-muted uppercase">
          {detail.words.length ? 'Palabras de ejemplo' : 'Sin palabras de ejemplo'}
        </h3>
        {detail.words.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {detail.words.map((w) => (
              <li key={w.word} className="flex items-baseline gap-3 text-sm">
                <span className="jp text-lg">{w.word}</span>
                <span className="jp text-muted">{w.reading}</span>
                <Speaker text={w.word} />
                <span className="ml-auto text-right text-muted">{w.meaning}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">
            JMdict no tiene traducción al español para ninguna palabra frecuente que use
            solo kanji ya estudiados.
          </p>
        )}
      </div>
    </div>
  )
}

function ReadingRow({ label, readings }: { label: string; readings: string[] }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-1.5 w-8 shrink-0 text-xs tracking-wide text-muted">{label}</span>
      <div className="flex flex-wrap items-center gap-1">
        {readings.map((r) => (
          <span key={r} className="flex items-center rounded-md bg-raised/60 pl-2">
            <span className="jp text-lg">{r}</span>
            <Speaker text={cleanReading(r)} label={r} />
          </span>
        ))}
      </div>
    </div>
  )
}
