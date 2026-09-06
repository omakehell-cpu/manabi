# Manabi

Flipcards de japonés para Windows y macOS, con repetición espaciada FSRS.
Funciona sin conexión: todo el progreso vive en una base SQLite local.

## Modos

| Modo | Contenido |
|---|---|
| **Hiragana** | 104 signos: 46 gojūon + 25 dakuten/handakuten + 33 yōon |
| **Katakana** | los mismos 104 + 25 extendidos (ファ, ヴィ, ティ…) |
| **Vocabulario en kana** | 434 palabras leídas en kana, generadas desde JMdict |
| **Kanji N5 → N1** | 2383 caracteres con 5443 palabras de ejemplo |
| **Vocabulario N5 → N1** | 7057 palabras del JLPT, en cinco niveles |
| **Conjugación** | 7 formas de verbos y adjetivos, 654 fichas |
| **Gramática N5 → N1** | 249 puntos, escritos para esta aplicación |

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

Cubre los cuatro mazos: los kanji en rejilla y los kana y el vocabulario en
lista, donde lo que importa es la pareja signo–lectura y no reconocer una
forma de un vistazo.

El buscador acepta las tres formas en que uno recuerda un kanji: el carácter
(`水`), un significado en español (`agua`) o una lectura, escrita en rōmaji
(`sui`) o en kana. El rōmaji se convierte a hiragana y katakana antes de
consultar, para no obligar a cambiar de teclado.

Buscar ignora el filtro de nivel a propósito: si escribes 水 quieres
encontrarlo, no que te digan que no está en el nivel que tienes abierto. Los
resultados se ordenan por relevancia —coincidencia exacta primero— porque la
búsqueda por subcadena hacía que «agua» arrastrase 傘, «paraguas».

## Lecciones: primero se enseña, después se pregunta

Nada llega al examen sin haberse presentado antes. Cuando entra material
nuevo, la sesión abre una tanda de cinco fichas informativas —el carácter, su
trazado animándose, significados, lecturas con audio y sus palabras de
ejemplo— y solo después examina esas mismas cinco, repitiéndolas hasta
acertarlas todas. Luego viene la siguiente tanda.

Sin esto, la primera vez que aparecía un kanji ya era un examen. Eso no medía
nada: garantizaba un fallo, FSRS lo interpretaba como «esta carta te cuesta»
y empezaba a calcular con datos falsos, y ese fallo empujaba la carta hacia
el umbral de las apartadas por un motivo que no era suyo.

Cinco por tanda no es arbitrario: la memoria de trabajo maneja del orden de
cuatro elementos a la vez, y presentar veinte seguidos reparte la atención
hasta no dejar nada de ninguno. Es configurable en Progreso.

Los repasos vencidos van siempre antes que las lecciones: son deuda
contraída. Y durante el examen, una carta recién presentada se marca como
**nueva**, porque ante algo que acabas de ver no tiene sentido exigirte lo
mismo que ante un repaso de hace una semana.

## Cuándo vuelve cada carta

Al acertar, los botones enseñan cuándo volvería la carta con cada nota
—«Costó 6 min», «Bien 10 min», «Fácil 9 d»—, calculado sobre una copia sin
tocar nada.

La nota se registra **una sola vez, al elegirla**. Antes se calificaba al
responder y otra vez al pulsar el botón, así que una única respuesta dejaba
dos repasos en el historial y FSRS aplicaba las dos programaciones en
cascada.

## Un reintento por carta

Fallar una vez no da la carta por fallada. El primer error no se califica ni
revela la respuesta: avisa, da una pista y deja corregir. Si se acierta en el
segundo intento se registra **Difícil** —se recordaba, pero costó—; si se
falla otra vez, entonces sí cuenta como fallo.

Lo que esto evita es que un desliz de tecleo se registre como un fallo de
memoria, ensucie el cálculo de FSRS y empuje la carta hacia el umbral de las
apartadas.

La pista es la primera letra y la longitud del resto: `día` se muestra como
`d · ·`. Es deliberadamente parca. En el temario hay **1246 pares de
significados separados por una sola letra** dentro del mismo nivel —東
«este» y 西 «oeste», entre ellos—, así que una pista generosa resolvería la
carta en lugar de ayudar a recordarla; 51 máscaras de N5 las comparten varios
kanji.

Por eso mismo **no se aceptan respuestas «casi correctas»**: perdonar un
carácter de diferencia daría por buena «oeste» cuando la respuesta es
«este». El reintento es seguro porque nunca acepta nada incorrecto — quien
responde se corrige solo.

En rōmaji→kana la respuesta es un único signo y enmascararla no diría nada:
ahí la pista es su primer trazo.

## Ritmo de estudio

Dos mecanismos gobiernan cuánto trabajo hay cada día, y son lo que separa
usar la aplicación seis meses de abandonarla en tres días.

**Las cartas nuevas tienen dos topes.** Veinte por mazo y día, y cuarenta
sumando todos, ambos ajustables en Progreso. El segundo hace falta porque el
primero dejó de frenar al crecer el temario: con trece mazos a veinte cada
uno entrarían **260 cartas nuevas al día**, que es exactamente la avalancha
que el cupo existía para evitar. Los repasos que ya tocan nunca se limitan.

**Las cartas en aprendizaje vuelven dentro de la misma sesión.** FSRS las
reprograma a 1 minuto si fallas y a 10 si aciertas, contando con verlas otra
vez el mismo día: ahí es donde se consolidan. La sesión repone la cola en vez
de terminar tras una pasada.

Al reponer se piden primero las realmente vencidas. Solo si no queda ninguna
se mira el futuro cercano (20 minutos), y entonces la aplicación ofrece
terminar en lugar de repetir en bucle la única carta pendiente — el respiro
entre repeticiones es parte del método, no un hueco que rellenar.

## Deshacer

Un Intro de más calificaba una carta sin vuelta atrás. Ahora la sesión tiene
`⌘Z` (o el botón de la cabecera), que devuelve la carta a su estado exacto
anterior, borra el repaso y la vuelve a poner delante.

El estado previo se guarda en el propio registro de repaso, no en una pila
en memoria: así se puede deshacer aunque se haya cerrado la aplicación entre
medias. Se pueden encadenar varios deshacer.

Lo único que no se revierte son los desbloqueos. Si ese repaso abrió un
bloque o un nivel, esas cartas siguen abiertas: volver a cerrarlas
escondería material que ya has visto, y la apertura solo ocurre al cumplir
el umbral, así que dejarlas no adelanta nada indebido.

## Vocabulario del JLPT

Un temario propio en cinco niveles, en paralelo al de kanji: 6483 palabras
con su lectura y su traducción al español.

| Nivel | Palabras |
|---|---|
| N5 | 543 |
| N4 | 500 |
| N3 | 1843 |
| N2 | 1320 |
| N1 | 2277 |

Los niveles salen de las listas de Jonathan Waller —la misma procedencia que
las de kanji, así que ambos temarios encajan— y las traducciones de JMdict,
porque esas listas vienen en inglés. Se conserva el 84 % de las palabras: las
que JMdict no traduce al español se descartan antes que mostrar inglés.

Cada palabra lleva su **categoría gramatical**, y no es un adorno: 青 y 青い
son ambas «azul», sustantivo la primera y adjetivo la segunda. En N5 hay 33
significados compartidos por 69 palabras distintas, y en N1 son 220 por 488;
sin la categoría no habría forma de distinguirlas.

Cuando JMdict mezcla lecturas en una misma entrada —開く es あく intransitivo
y ひらく transitivo— no se afirma la transitividad: vale más callar que
enseñar lo contrario.

También se muestran las **otras acepciones**, pero solo como información: no
se aceptan como respuesta. JMdict agrupa palabras que comparten entrada, así
que entre las acepciones de 会う aparecen las de 遭う, y dar «tener un
accidente» por buena para 会う sería enseñar algo falso.

**No espera a los kanji que contiene**, y es deliberado: los libros enseñan
vocabulario y kanji a la vez, y la lección presenta cada palabra con su
lectura y su significado, así que se aprende como una unidad aunque sus
caracteres aún no se hayan estudiado por separado.

Dentro de cada palabra, la lectura espera al significado; y los niveles se
abren en cadena al 80 %, igual que los kanji.

## Conjugación

Un mazo propio para las formas de verbos y adjetivos: ます, て, た, ない,
なかった, potencial y volitivo.

**No se conjugan las 3366 palabras conjugables del temario**, porque la
conjugación no se memoriza palabra a palabra: se aprende como regla. Una vez
sabes que un godan en く hace いて, lo aplicas a todos. Se practican entonces
ocho palabras representativas de cada uno de los 14 grupos que cambian la
regla —la clase, y en los godan la última sílaba— lo que da 98 palabras y
654 fichas.

Las formas se abren de una en una: la て no aparece hasta dominar la ます. Se
estudia una regla cada vez, no una palabra cada vez.

Las reglas viven en [src/lib/conjugation.ts](src/lib/conjugation.ts) y se
calculan, no se almacenan. Están cubiertas por 17 pruebas que vigilan sobre
todo las excepciones, que es donde todo el mundo falla:

- **行く** hace 行って y no 行いて, siendo el único godan en く que lo hace.
- **買う** hace 買わない y no 買あない: la fila あ de う es わ.
- **いい / 良い** se conjugan como よい: よかった, nunca いかった.
- **来る** cambia de lectura en cada forma: く.る, き.ます, こ.ない.
- Los adjetivos no tienen potencial ni volitivo, así que esas fichas no se
  generan en lugar de inventarlas.

Se responde en kana, no en kanji: exigir el kanji obligaría a tener un IME
instalado.

## Gramática

Un temario escrito para esta aplicación, porque **no existe** un conjunto de
datos abierto de puntos gramaticales del JLPT con licencia clara: solo listas
en webs de estudio, sin permiso de reutilización.

Cada punto trae el patrón, cómo se construye, para qué sirve —incluida la
confusión típica con la que se parece— y ejemplos con su traducción. De ahí
salen dos cartas: una pregunta qué significa el patrón y la otra lo borra de
una frase para que haya que reponerlo. La segunda es la que enseña a usarlo;
la primera, a reconocerlo, y por eso rellenar el hueco espera a haber
aprendido el significado.

| Nivel | Puntos |
|---|---|
| N5 | 56 |
| N4 | 49 |
| N3 | 50 |
| N2 | 50 |
| N1 | 44 |

Están los cinco niveles: desde las partículas que sostienen cualquier frase
hasta las formas del japonés escrito y clásico que sobreviven en la prensa y
los avisos oficiales.

Las notas no se limitan a traducir el patrón: explican con qué se confunde,
que es donde está la dificultad real. は frente a が, に frente a で, たら
frente a ば, について frente a に対して, さ frente a み.

Hay 13 pruebas sobre el temario. Además de comprobar que cada punto tenga
explicación, formación y ejemplos marcados, vigilan que no se cuele ningún
carácter de otro alfabeto: escribiendo a mano se coló un 참 coreano en N3 y
un marcador en ruso en N1, y las dos veces fue el test quien lo encontró.

## Escritura a mano

Reconocer 鬱 y saber escribirlo son cosas distintas. Cada kana y cada kanji
tienen su carta de escritura, que aparece como **última fase**: primero se
reconoce el carácter, después se produce desde el rōmaji, y solo entonces se
traza de memoria.

### La ayuda se retira sola

Se empieza calcando y se acaba escribiendo sin nada delante. El nivel lo
decide lo trabajada que esté la carta, sin que haya que acordarse de bajarlo:

| Ayuda | Cuándo |
|---|---|
| Calcando el modelo | la primera vez |
| Con el modelo de fondo | las dos siguientes |
| Solo el trazo que toca | hasta la sexta |
| De memoria | a partir de ahí |

Retirar la guía de golpe convierte la práctica en un examen, y dejarla
siempre impide que llegue a memorizarse. El nivel intermedio —marcar solo el
trazo que toca— dice por dónde seguir sin regalar la forma.

El lienzo también está en la ficha de cualquier carácter, ahí con la guía
ajustable a mano.

No se compara el parecido del dibujo terminado, sino **cómo se ha hecho**:
cuántos trazos, en qué orden y en qué dirección. Un carácter dibujado
empezando por abajo se parece mucho al modelo y está mal escrito, así que
cada trazo se remuestrea a doce puntos y se compara con el suyo punto por
punto; comparar el primero del usuario con el primero del modelo es lo que
detecta el sentido invertido.

El resultado pinta cada trazo en verde o rojo y señala el primero que falla,
diciendo si además iba en el otro sentido.

## Frases de ejemplo

Cada kanji trae una frase corta donde aparece en uso, con su traducción y
audio. Salen de Tatoeba y siguen la misma regla que las palabras: **todos**
sus kanji pertenecen a niveles ya estudiados, así que un ejemplo nunca se
convierte en un muro. 1738 de los 2383 kanji tienen frase.

## Componentes y radicales

Los kanji se estudian por frecuencia, así que aparecen caracteres complejos
sin haber visto sus piezas. La ficha de cada uno muestra en qué se
descompone: 休 es 亻 más 木 —persona junto a un árbol, de ahí «descansar»—,
señalando cuál es el radical, cómo se llama y dónde va.

Las piezas que ya se dominan salen marcadas, que es lo que enseña que un
carácter difícil suele ser una combinación de conocidos.

Los datos salen de KanjiVG, que además de los trazos marca los componentes.
Solo se toma el primer nivel: 語 es 言 más 吾 y ahí conviene parar, porque
bajar más devuelve trazos sueltos que no significan nada. 1918 de los 2383
kanji se descomponen; el resto son simples.

Los radicales que no existen como kanji suelto —氵 por 水, 亻 por 人— llevan
su significado escrito para esta aplicación, en
[src/data/radicals.ts](src/data/radicals.ts). Con eso, el 87 % de los
componentes tiene explicación; de las piezas restantes, muchas son elementos
puramente fonéticos, y ahí la interfaz muestra el carácter y calla en lugar
de inventar un significado.

## Orden de trazos

La ficha de cada kanji anima cómo se escribe, trazo a trazo, con datos de
KanjiVG: los 2383 caracteres del temario y los 176 kana, 25 669 trazos. Se puede reproducir
entero o avanzar trazo a trazo. Durante el estudio se muestra siempre; en Progreso se
puede cambiar a que aparezca solo al fallar, o nunca.

Cada trazo lleva `pathLength="1"`, que normaliza su longitud real a la
unidad: así se anima con un dash-offset sin medir cada curva en el DOM, y
todos los trazos tardan lo mismo independientemente de su tamaño.

Los 2 MB de trazados viven en el proceso principal y se sirven por petición,
para no cargarlos enteros en el renderer solo por mostrar un kanji.

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

## Retención objetivo

En Progreso se ajusta con qué probabilidad quieres acordarte de algo cuando
vuelve a preguntártelo. Es la palanca directa sobre el trabajo diario:
subirla implica repasar más a menudo; bajarla, menos repasos a cambio de
olvidar más. FSRS usa 0,9 por defecto.

Solo afecta a las cartas ya asentadas: los pasos de aprendizaje (1 y 10
minutos) son fijos.

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
| `Cmd`/`Ctrl` + `Z` | deshacer el último repaso |
| `Cmd`/`Ctrl` + `F` | buscar, en Explorar |

## Desarrollo

```bash
npm install          # instala dependencias
npm run dev          # app en modo desarrollo
npm run test         # comprueba la lógica sin abrir la interfaz
npm run test:watch   # lo mismo, en vigilancia
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
curl -Lo kanjivg.xml.gz https://github.com/KanjiVG/kanjivg/releases/download/r20250816/kanjivg-20250816.xml.gz
curl -o jpn-spa.tar.bz2 https://downloads.tatoeba.org/exports/per_language/jpn/jpn-spa_links.tsv.bz2
curl -O https://downloads.tatoeba.org/exports/sentences.tar.bz2
gunzip kanjidic2.xml.gz JMdict.gz kanjivg.xml.gz
bunzip2 jpn-spa.tar.bz2 && tar xjf sentences.tar.bz2
awk -F'\t' '$2=="jpn" || $2=="spa"' sentences.csv > sent-jpn-spa.tsv
npm pack kanji-data && tar xzf kanji-data-*.tgz   # listas JLPT
```

Con todo en un directorio `<fuentes>`:

```bash
node --experimental-strip-types scripts/build-kanji.ts <fuentes>
node --max-old-space-size=4096 --experimental-strip-types scripts/build-kanji-words.ts <fuentes>
node --max-old-space-size=4096 --experimental-strip-types scripts/build-kanjivg.ts <fuentes>
node --max-old-space-size=4096 --experimental-strip-types scripts/build-kana-vocab.ts <fuentes>
node --max-old-space-size=8192 --experimental-strip-types scripts/build-sentences.ts <fuentes>
```

`npm run test` es la red de seguridad: 53 pruebas con Vitest que cubren la
siembra, la programación de FSRS, las seis reglas de desbloqueo, las
lecciones, el cupo diario, las cartas apartadas, el explorador, el trazado y
deshacer, todo sin abrir Electron. Ha cazado varios fallos que la interfaz
no delataba.

### Diferencias entre sistemas

- **La barra de menú se oculta** (`autoHideMenuBar`). En macOS el menú vive
  en la barra del sistema, pero en Windows y Linux se dibuja dentro de la
  ventana y ocupaba una franja permanente. Sigue accesible con la tecla Alt:
  quitarlo del todo se llevaría por delante los atajos de copiar y pegar.
- El menú es propio y está en español; el de Electron viene en inglés con
  entradas que aquí no pintan nada.
- **El hueco de los semáforos solo se reserva en macOS.** Allí la ventana usa
  `titleBarStyle: hiddenInset` y los botones flotan sobre el contenido; en
  Windows la barra es nativa y ese hueco dejaba un vacío a la izquierda.

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

### El icono

`build/icon.png` se genera con el propio Electron, que ya está instalado y
es un motor de renderizado completo — no hace falta ninguna herramienta de
diseño:

```bash
npm run make:icon
```

El script dibuja el carácter 学 en Noto Sans JP sobre un cuadrado redondeado
y captura la página a 1024×1024. La fuente se incrusta en base64 porque un
`@font-face` con `file://` no llega a cargar en el renderer, y hace falta
una espera antes de capturar: sin ella el glifo sale en la tipografía de
reserva. El arte ocupa el 80 % centrado sobre lienzo transparente, que es la
proporción que espera macOS.

electron-builder deriva de ahí el `.icns` y el `.ico`.

### Pendiente

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
- [KanjiVG](https://kanjivg.tagaini.net/) de Ulrich Apel — orden de trazos,
  CC BY-SA 3.0.
- [Tatoeba](https://tatoeba.org) — frases de ejemplo, CC BY 2.0 FR.

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
