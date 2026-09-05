# Manabi

Flipcards de japonés para Windows y macOS, con repetición espaciada FSRS.
Funciona sin conexión: todo el progreso vive en una base SQLite local.

## Modos

| Modo | Contenido |
|---|---|
| **Hiragana** | 104 signos: 46 gojūon + 25 dakuten/handakuten + 33 yōon |
| **Katakana** | los mismos 104 + 25 extendidos (ファ, ヴィ, ティ…) |
| **Vocabulario en kana** | 90 palabras escritas solo en kana, sin kanji |

Los kanji (N5 → N1, hasta los 2136 jōyō) son la fase 2.

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

Es el mismo mecanismo que gobernará «kanji aislado → kanji en palabra».

## Escribir las respuestas

Se teclea en rōmaji y **WanaKana** convierte a kana según escribes: no hace
falta instalar un IME japonés. La conversión aparece bajo el campo antes de
validar.

Los kana extendidos no piden dirección rōmaji→kana a propósito: `ウォ` y `ヲ`
comparten el rōmaji «wo», así que la pregunta sería ambigua. Se practican
solo por reconocimiento, que es como se usan en la práctica.

## Atajos

| Tecla | Acción |
|---|---|
| `Intro` | responder / pasar a la siguiente |
| `2` / `4` | tras acertar: «costó» / «fácil» |
| `Esc` | salir de la sesión |

## Desarrollo

```bash
npm install          # instala dependencias
npm run dev          # app en modo desarrollo
npm run check        # verifica la lógica de datos sin abrir la interfaz
npm run build        # compila renderer + procesos de Electron
npm run dist:mac     # DMG (arm64 y x64) en release/
npm run dist:win     # instalador NSIS en release/
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

Para la fase 2: KANJIDIC2 y JMdict (licencia EDRDG) y KanjiVG (CC BY-SA 3.0).

Las listas de kanji por nivel JLPT son reconstrucciones de la comunidad: la
Japan Foundation dejó de publicar listas oficiales en 2010 y las distintas
versiones difieren entre sí en torno a un 10 %.
