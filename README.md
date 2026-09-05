# Manabi

Flipcards de japonés para Windows y macOS, con repetición espaciada FSRS.
Funciona sin conexión: todo el progreso vive en una base SQLite local.

## Modos

| Modo | Contenido |
|---|---|
| **Hiragana** | 104 signos: 46 gojūon + 25 dakuten/handakuten + 33 yōon |
| **Katakana** | los mismos 104 + 25 extendidos (ファ, ヴィ, ティ…) |
| **Vocabulario en kana** | 90 palabras escritas solo en kana, sin kanji |
| **Kanji N5 → N1** | 2383 caracteres con 4476 palabras de ejemplo |

### Los cinco niveles

| Nivel | Nuevos | Acumulado |
|---|---|---|
| N5 | 79 | 79 |
| N4 | 166 | 245 |
| N3 | 367 | 612 |
| N2 | 367 | 979 |
| N1 | 1404 | 2383 |

Los cinco niveles JLPT suman 2211 caracteres. N1 incluye además los 172 jōyō
que ninguna lista JLPT recoge, hasta cubrir el conjunto de uso común. Ese
número **no** es 2136: las listas JLPT contienen kanji que no son jōyō
(jinmeiyō, de nombres propios) y el jōyō contiene kanji que ninguna lista
JLPT recoge; son conjuntos que se solapan, no uno contenido en el otro.

## Cómo se aprende

Tres reglas de desbloqueo encadenadas, todas en `refreshLocks()`
([electron/db.ts](electron/db.ts)):

1. **Los bloques se abren en orden.** Empiezas con los 46 signos básicos.
   Dakuten aparece cuando el 80 % del gojūon está asentado; después yōon.
2. **Primero reconocer, luego producir.** Cada signo genera dos cartas:
   ver か y decir «ka», y ver «ka» y escribir か. La segunda se abre cuando
   la primera está asentada.
3. **Las palabras esperan a sus signos.** ねこ no aparece hasta dominar ね
   y こ. La comprobación tokeniza respetando los yōon: しゃ es una unidad,
   no し + ゃ.
4. **Los niveles de kanji se abren en cadena.** N4 espera al 80 % de N5, y
   así sucesivamente.
5. **En cada kanji, la lectura espera al significado.** Primero sabes qué
   quiere decir 地, después cómo suena.
6. **Primero aislados, después en palabras.** 地下 no aparece hasta dominar
   地 por separado. El generador solo admite palabras cuyos kanji
   pertenezcan todos a niveles ya estudiados, así que nunca aparece un
   ejemplo con un carácter que aún no toca.

## Escribir las respuestas

Se teclea en rōmaji y **WanaKana** convierte a kana según escribes: no hace
falta instalar un IME japonés. La conversión aparece bajo el campo antes de
validar.

Los kana extendidos no piden dirección rōmaji→kana a propósito: `ウォ` y `ヲ`
comparten el rōmaji «wo», así que la pregunta sería ambigua. Se practican
solo por reconocimiento, que es como se usan en la práctica.

## Explorar

El temario completo es consultable sin depender de que la aplicación te
pregunte: los 2383 kanji en una rejilla, coloreados según su estado (sin
abrir, por empezar, aprendiendo, asentado). Al pulsar uno se abre su ficha
con significados, lecturas con audio, trazos, puesto por frecuencia en
prensa, cuándo vuelve a tocar y sus palabras de ejemplo.

El buscador acepta las tres formas en que uno recuerda un kanji: el carácter
(`水`), un significado en español (`agua`) o una lectura, escrita en rōmaji
(`sui`) o en kana. El rōmaji se convierte a hiragana y katakana antes de
consultar, para no obligar a cambiar de teclado.

Buscar ignora el filtro de nivel a propósito: si escribes 水 quieres
encontrarlo, no que te digan que no está en el nivel que tienes abierto. Los
resultados se ordenan por relevancia —coincidencia exacta primero— porque la
búsqueda por subcadena hacía que «agua» arrastrase 傘, «paraguas».

## Ritmo de estudio

Dos mecanismos gobiernan cuánto trabajo hay cada día, y son lo que separa
usar la aplicación seis meses de abandonarla en tres días.

**Las cartas nuevas tienen cupo.** Veinte por mazo y día de forma
predeterminada, ajustable en Progreso. Cada carta nueva arrastra una decena
de repasos futuros, así que sin freno la carga diaria crece hasta volverse
inasumible en un par de semanas. Los repasos que ya tocan nunca se limitan:
el tope solo controla cuánto material nuevo entra.

**Las cartas en aprendizaje vuelven dentro de la misma sesión.** FSRS las
reprograma a 1 minuto si fallas y a 10 si aciertas, contando con verlas otra
vez el mismo día: ahí es donde se consolidan. La sesión repone la cola en vez
de terminar tras una pasada.

Al reponer se piden primero las realmente vencidas. Solo si no queda ninguna
se mira el futuro cercano (20 minutos), y entonces la aplicación ofrece
terminar en lugar de repetir en bucle la única carta pendiente — el respiro
entre repeticiones es parte del método, no un hueco que rellenar.

## Cartas apartadas

Una carta que se falla ocho veces se aparta sola: si no, envenena todas las
sesiones. Quedan listadas en Progreso, con su recuento de fallos, y se pueden
devolver a la circulación.

El criterio son los **fallos realmente registrados**, no el contador de
lapsus de FSRS. Ese solo sube al fallar una carta que ya estaba en repaso,
así que una carta que nunca llegas a aprender se queda en aprendizaje
acumulando cero lapsus por muchas veces que la falles — justo el caso que
esto tiene que detectar.

Al devolver una carta, su umbral sube en lugar de borrarle los fallos: así
no se vuelve a apartar al primer tropiezo, y FSRS conserva el historial con
el que calcula la dificultad.

## Previsión de carga

Progreso muestra los repasos ya comprometidos para los próximos catorce
días, con el total, la media diaria y el día más cargado. Es la cifra que
permite decidir si hoy conviene meter más material nuevo.

Solo cuenta lo ya programado. Las cartas nuevas sin estudiar no aparecen,
porque su fecha depende de cuándo las veas y con qué nota: es una previsión
de lo comprometido, no una estimación.

## Pronunciación

Los botones de audio usan las voces japonesas instaladas en el sistema
(Kyoko en macOS; Haruka, Nanami o Ayumi en Windows con el paquete de idioma
japonés). No se empaqueta audio: serían miles de grabaciones.

Si no hay ninguna voz japonesa, los botones no se dibujan y **Progreso →
Pronunciación** explica cómo instalarla. Reproducir kana con una voz
española enseñaría una pronunciación falsa.

Un kanji aislado no se pronuncia: 日 es ニチ, ジツ o ひ según la palabra. Por
eso el audio va en cada lectura por separado, y en las palabras completas.

## Atajos

| Tecla | Acción |
|---|---|
| `Intro` | responder / pasar a la siguiente |
| `2` / `4` | tras acertar: «costó» / «fácil» |
| `Esc` | salir de la sesión, o cerrar la ficha de un kanji |
| `Cmd`/`Ctrl` + `F` | buscar, en Explorar |

## Desarrollo

```bash
npm install          # instala dependencias
npm run dev          # app en modo desarrollo
npm run check        # verifica la lógica de datos sin abrir la interfaz
npm run build        # compila renderer + procesos de Electron
npm run dist:mac     # DMG (arm64 y x64) en release/
npm run dist:win     # instalador NSIS en release/
```

### Regenerar los datos de kanji

Los datasets ya están en el repositorio; esto solo hace falta para
actualizarlos. Las fuentes pesan más de 100 MB y no se versionan:

```bash
curl -o kanjidic2.xml.gz https://www.edrdg.org/kanjidic/kanjidic2.xml.gz
curl -o JMdict.gz https://www.edrdg.org/pub/Nihongo/JMdict.gz
gunzip kanjidic2.xml.gz JMdict.gz
npm pack kanji-data && tar xzf kanji-data-*.tgz   # listas JLPT
```

Con todo en un directorio `<fuentes>`:

```bash
node --experimental-strip-types scripts/build-kanji.ts <fuentes>
node --max-old-space-size=4096 --experimental-strip-types scripts/build-kanji-words.ts <fuentes>
```

`npm run check` es la red de seguridad: comprueba la siembra, la
programación FSRS y las tres reglas de desbloqueo sin abrir Electron.

### Notas de empaquetado

- **`better-sqlite3` va fuera del bundle** (`external` en
  [vite.config.mts](vite.config.mts)) y fuera del asar (`asarUnpack`). Su
  cargador busca el `.node` con rutas relativas al módulo; empaquetarlo
  rompe esa búsqueda. Ojo: Vite 8 lee `build.rolldownOptions`, no
  `rollupOptions` — este último se ignora en silencio.
- Trae prebuilds N-API para todas las plataformas, así que el instalador de
  Windows se genera desde macOS sin compilar nada.
- **Noto Sans JP va empaquetada.** Sin ella, Windows sin paquete de idioma
  japonés muestra cuadros vacíos, y varias fuentes CJK del sistema dibujan
  los glifos con formas chinas en lugar de japonesas.

### Pendiente

- **Icono propio.** Ahora usa el de Electron por defecto: basta con poner un
  PNG de 512×512 en `build/icon.png`.
- **Firma de código.** Los paquetes salen sin firmar (`identity: null`). En
  macOS eso obliga a abrir la app con clic derecho → Abrir la primera vez, y
  en Windows aparece el aviso de SmartScreen. Distribuirla de verdad exige
  una cuenta de Apple Developer (99 $/año) y un certificado de firma para
  Windows.

## Licencias

La app empaqueta trabajo de terceros que exige atribución; está toda
recogida en la pantalla **Créditos**.

- [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) — MIT
- [WanaKana](https://github.com/WaniKani/WanaKana) — MIT
- [Noto Sans JP](https://fonts.google.com/noto/specimen/Noto+Sans+JP) — SIL OFL 1.1
- **KANJIDIC2** y **JMdict** — significados en español, lecturas y
  vocabulario. Ficheros propiedad del
  [Electronic Dictionary Research and Development Group](https://www.edrdg.org/),
  usados conforme a su [licencia](https://www.edrdg.org/edrdg/licence.html).
- **Listas JLPT** de Jonathan Waller, vía el paquete `kanji-data` y
  kanjiapi.dev.

Los 75 kanji que KANJIDIC2 no traduce al español —casi todos jōyō
incorporados en la revisión de 2010— se tradujeron para esta aplicación
desde sus significados en inglés
([scripts/kanji-es-fallback.ts](scripts/kanji-es-fallback.ts)).

Las listas de kanji por nivel JLPT son reconstrucciones de la comunidad: la
Japan Foundation dejó de publicar listas oficiales en 2010 y las distintas
versiones difieren entre sí en torno a un 10 %.

### Limitaciones conocidas de los datos

- Solo el 76 % del vocabulario frecuente de JMdict tiene traducción al
  español. Las palabras sin ella se descartan antes que mostrar inglés en
  una aplicación en español, y por eso 545 kanji se quedan sin ejemplo.
- JMdict agrupa cada idioma en un `<sense>` propio, sin indicar a qué
  lectura corresponde. Las entradas con varias lecturas se descartan: en
  一日 no hay forma de saber si el español traduce いちにち o ついたち.
- Los kanji que se estudian primero reciben ejemplos pobres, porque casi no
  hay palabras que puedan formarse solo con caracteres ya vistos. Es el
  precio de no adelantar nunca un kanji sin estudiar.
