export default function Credits() {
  return (
    <div className="mx-auto w-full max-w-3xl px-8 py-6">
      <h1 className="text-2xl font-medium">Créditos y licencias</h1>

      <section className="mt-8 space-y-5 text-sm leading-relaxed">
        <Entry
          title="FSRS · ts-fsrs"
          license="MIT"
          text="Algoritmo de repetición espaciada que decide cuándo vuelve cada carta. Es el mismo que Anki adoptó como predeterminado."
        />
        <Entry
          title="WanaKana"
          license="MIT"
          text="Conversión de rōmaji a kana mientras escribes, sin necesidad de instalar un IME japonés."
        />
        <Entry
          title="Noto Sans JP"
          license="SIL Open Font License 1.1"
          text="Fuente japonesa empaquetada con la aplicación, para que los glifos se dibujen con formas japonesas y no chinas en cualquier sistema."
        />
      </section>

      <section className="mt-10">
        <h2 className="text-sm tracking-wide text-muted uppercase">Previsto para la fase 2</h2>
        <div className="mt-4 space-y-5 text-sm leading-relaxed">
          <Entry
            title="KANJIDIC2 y JMdict"
            license="Electronic Dictionary Research and Development Group"
            text="Datos de kanji y vocabulario. Su licencia exige atribución visible, que se añadirá aquí al incorporarlos."
          />
          <Entry
            title="KanjiVG"
            license="CC BY-SA 3.0"
            text="Orden de trazos en SVG, para animar cómo se escribe cada kanji."
          />
        </div>
      </section>

      <p className="mt-12 border-t border-line pt-6 text-xs leading-relaxed text-muted">
        Las listas de kanji por nivel JLPT que usará la fase 2 son reconstrucciones de la
        comunidad: la Japan Foundation dejó de publicar listas oficiales en 2010, y las
        distintas versiones difieren entre sí en torno a un 10 %.
      </p>
    </div>
  )
}

function Entry({ title, license, text }: { title: string; license: string; text: string }) {
  return (
    <div>
      <p className="font-medium">
        {title} <span className="ml-1 text-xs font-normal text-muted">{license}</span>
      </p>
      <p className="mt-1 text-muted">{text}</p>
    </div>
  )
}
