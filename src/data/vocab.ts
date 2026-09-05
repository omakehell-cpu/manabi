/**
 * Vocabulario escrito íntegramente en kana — el puente entre aprender los
 * signos aislados y leer texto real. Nada aquí lleva kanji a propósito.
 *
 * Las vocales largas se romanizan duplicando la vocal (コーヒー → koohii),
 * que es lo que produce wanakana y evita la ambigüedad de los macrones.
 */

export interface VocabItem {
  glyph: string
  reading: string
  /** Romanizaciones alternativas aceptadas. */
  altReading: string[]
  meaning: string
  /** Traducciones alternativas aceptadas. */
  altMeaning: string[]
  script: 'hiragana' | 'katakana'
}

const H: [string, string, string, ...string[]][] = [
  ['あさ', 'asa', 'mañana', 'la mañana'],
  ['あめ', 'ame', 'lluvia'],
  ['いえ', 'ie', 'casa', 'hogar'],
  ['いぬ', 'inu', 'perro'],
  ['うみ', 'umi', 'mar'],
  ['えき', 'eki', 'estación', 'estacion'],
  ['おかね', 'okane', 'dinero'],
  ['おちゃ', 'ocha', 'té', 'te'],
  ['かお', 'kao', 'cara', 'rostro'],
  ['かぎ', 'kagi', 'llave'],
  ['かさ', 'kasa', 'paraguas'],
  ['かぜ', 'kaze', 'viento'],
  ['かわ', 'kawa', 'río', 'rio'],
  ['くち', 'kuchi', 'boca'],
  ['くつ', 'kutsu', 'zapatos', 'zapato'],
  ['くも', 'kumo', 'nube'],
  ['こえ', 'koe', 'voz'],
  ['さかな', 'sakana', 'pez', 'pescado'],
  ['しごと', 'shigoto', 'trabajo'],
  ['そら', 'sora', 'cielo'],
  ['たまご', 'tamago', 'huevo'],
  ['ちち', 'chichi', 'padre', 'mi padre'],
  ['つくえ', 'tsukue', 'escritorio', 'mesa de escritorio'],
  ['とけい', 'tokei', 'reloj'],
  ['となり', 'tonari', 'al lado', 'contiguo'],
  ['なつ', 'natsu', 'verano'],
  ['なまえ', 'namae', 'nombre'],
  ['にく', 'niku', 'carne'],
  ['ねこ', 'neko', 'gato'],
  ['のみもの', 'nomimono', 'bebida'],
  ['はな', 'hana', 'flor'],
  ['はる', 'haru', 'primavera'],
  ['ひと', 'hito', 'persona'],
  ['ふゆ', 'fuyu', 'invierno'],
  ['へや', 'heya', 'habitación', 'habitacion', 'cuarto'],
  ['ほん', 'hon', 'libro'],
  ['まち', 'machi', 'ciudad', 'pueblo'],
  ['まど', 'mado', 'ventana'],
  ['みず', 'mizu', 'agua'],
  ['みち', 'michi', 'camino', 'calle'],
  ['みみ', 'mimi', 'oreja', 'oído', 'oido'],
  ['むすめ', 'musume', 'hija'],
  ['やま', 'yama', 'montaña', 'montana', 'monte'],
  ['ゆき', 'yuki', 'nieve'],
  ['よる', 'yoru', 'noche'],
  ['りんご', 'ringo', 'manzana'],
  ['わたし', 'watashi', 'yo'],
  ['ともだち', 'tomodachi', 'amigo', 'amiga'],
  ['がっこう', 'gakkou', 'escuela', 'colegio'],
  ['せんせい', 'sensei', 'profesor', 'maestro', 'profesora'],
]

const K: [string, string, string, ...string[]][] = [
  ['アイス', 'aisu', 'helado'],
  ['アメリカ', 'amerika', 'América', 'america', 'EEUU'],
  ['イタリア', 'itaria', 'Italia', 'italia'],
  ['カメラ', 'kamera', 'cámara', 'camara'],
  ['カレー', 'karee', 'curry'],
  ['ギター', 'gitaa', 'guitarra'],
  ['クラス', 'kurasu', 'clase'],
  ['ケーキ', 'keeki', 'tarta', 'pastel'],
  ['コーヒー', 'koohii', 'café', 'cafe'],
  ['コップ', 'koppu', 'vaso'],
  ['サッカー', 'sakkaa', 'fútbol', 'futbol'],
  ['シャツ', 'shatsu', 'camisa'],
  ['ジュース', 'juusu', 'zumo', 'jugo'],
  ['スポーツ', 'supootsu', 'deporte', 'deportes'],
  ['スプーン', 'supuun', 'cuchara'],
  ['テーブル', 'teeburu', 'mesa'],
  ['テスト', 'tesuto', 'examen', 'test', 'prueba'],
  ['テレビ', 'terebi', 'televisión', 'television', 'tele'],
  ['ドア', 'doa', 'puerta'],
  ['トイレ', 'toire', 'baño', 'bano', 'aseo'],
  ['ナイフ', 'naifu', 'cuchillo'],
  ['ニュース', 'nyuusu', 'noticias', 'noticia'],
  ['ノート', 'nooto', 'cuaderno', 'libreta'],
  ['パン', 'pan', 'pan'],
  ['バス', 'basu', 'autobús', 'autobus', 'bus'],
  ['パソコン', 'pasokon', 'ordenador', 'computadora', 'pc'],
  ['ビール', 'biiru', 'cerveza'],
  ['ビル', 'biru', 'edificio'],
  ['プール', 'puuru', 'piscina'],
  ['ペン', 'pen', 'bolígrafo', 'boligrafo', 'pluma'],
  ['ホテル', 'hoteru', 'hotel'],
  ['ボタン', 'botan', 'botón', 'boton'],
  ['メール', 'meeru', 'correo', 'email', 'correo electrónico'],
  ['ラジオ', 'rajio', 'radio'],
  ['レストラン', 'resutoran', 'restaurante'],
  ['エレベーター', 'erebeetaa', 'ascensor'],
  ['カード', 'kaado', 'tarjeta'],
  ['タクシー', 'takushii', 'taxi'],
  ['チーズ', 'chiizu', 'queso'],
  ['スキー', 'sukii', 'esquí', 'esqui'],
]

function build(
  rows: [string, string, string, ...string[]][],
  script: VocabItem['script'],
): VocabItem[] {
  return rows.map(([glyph, reading, meaning, ...altMeaning]) => ({
    glyph,
    reading,
    altReading: [],
    meaning,
    altMeaning,
    script,
  }))
}

export const VOCAB: VocabItem[] = [...build(H, 'hiragana'), ...build(K, 'katakana')]
