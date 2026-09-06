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
        <h2 className="text-sm tracking-wide text-muted uppercase">Datos de los kanji</h2>
        <div className="mt-4 space-y-5 text-sm leading-relaxed">
          <Entry
            title="KANJIDIC2"
            license="Electronic Dictionary Research and Development Group · CC BY-SA 4.0"
            text="Significados en español, lecturas on'yomi y kun'yomi, número de trazos, grado escolar y frecuencia en prensa. Los ficheros del diccionario son propiedad del EDRDG y se usan conforme a su licencia."
          />
          <Entry
            title="Listas JLPT de Jonathan Waller"
            license="JLPT Resources · tanos.co.uk"
            text="Reparto de los kanji y del vocabulario entre los niveles N5 a N1, a través del paquete kanji-data, kanjiapi.dev y el repositorio elzup/jlpt-word-list (MIT)."
          />
          <Entry
            title="Tatoeba"
            license="CC BY 2.0 FR"
            text="Frases de ejemplo japonés–español, una por kanji, con todos sus caracteres pertenecientes a niveles ya estudiados."
          />
          <Entry
            title="KanjiVG"
            license="Ulrich Apel · CC BY-SA 3.0"
            text="Orden de trazos de los 2383 kanji, 25 154 trazos en total, que se animan en la ficha de cada carácter y al fallarlo durante el estudio."
          />
          <Entry
            title="Voces del sistema"
            license="Web Speech API"
            text="La pronunciación usa las voces japonesas instaladas en tu equipo (Kyoko en macOS; Haruka, Nanami o Ayumi en Windows). No se empaqueta audio."
          />
        </div>
        <p className="mt-5 text-xs leading-relaxed text-muted">
          Los 75 kanji que KANJIDIC2 no traduce al español —casi todos jōyō incorporados
          en la revisión de 2010— se han traducido para esta aplicación a partir de sus
          significados en inglés.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-sm tracking-wide text-muted uppercase">También en uso</h2>
        <div className="mt-4 space-y-5 text-sm leading-relaxed">
          <Entry
            title="JMdict"
            license="Electronic Dictionary Research and Development Group"
            text="Vocabulario para fijar cada kanji dentro de palabras reales. Sus ficheros son propiedad del EDRDG y se usan conforme a su licencia."
          />
        </div>
      </section>

      <p className="mt-12 border-t border-line pt-6 text-xs leading-relaxed text-muted">
        Las listas de kanji por nivel JLPT son reconstrucciones de la comunidad: la Japan
        Foundation dejó de publicar listas oficiales en 2010, y las distintas versiones
        difieren entre sí en torno a un 10 %. Los cinco niveles suman 2211 caracteres, a
        los que se añaden los jōyō que ninguna lista recoge hasta cubrir el conjunto de
        uso común.
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
