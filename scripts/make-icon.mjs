/**
 * Genera build/icon.png, del que electron-builder deriva el .icns de macOS
 * y el .ico de Windows.
 *
 * Se dibuja con el propio Electron: es un motor de renderizado completo y
 * ya está instalado, así que no hace falta ninguna herramienta de diseño.
 * La fuente se incrusta en base64 porque un @font-face con file:// no
 * llega a cargar dentro del renderer.
 *
 * Uso: npx electron scripts/make-icon.mjs
 */
import { app, BrowserWindow } from 'electron'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SIZE = 1024

const font = readFileSync(
  join(root, 'node_modules/@fontsource/noto-sans-jp/files/noto-sans-jp-japanese-700-normal.woff2'),
).toString('base64')

/**
 * El lienzo se deja transparente y el arte ocupa el 80 % centrado: es la
 * proporción que espera macOS, donde los iconos no llegan al borde. En
 * Windows se ve el mismo cuadrado redondeado sobre el fondo de la barra.
 */
const html = `<!doctype html>
<meta charset="utf-8">
<style>
  @font-face {
    font-family: 'Noto Sans JP';
    src: url(data:font/woff2;base64,${font}) format('woff2');
    font-weight: 700;
  }
  html, body { margin: 0; width: ${SIZE}px; height: ${SIZE}px; background: transparent; }
  body { display: grid; place-items: center; }
  .plate {
    width: 824px; height: 824px;
    border-radius: 185px;
    background: linear-gradient(150deg, #ef6a5f 0%, #d94a43 45%, #a82f2c 100%);
    display: grid; place-items: center;
    box-shadow: inset 0 -14px 40px rgba(0,0,0,.22), inset 0 8px 28px rgba(255,255,255,.16);
    position: relative;
    overflow: hidden;
  }
  /* Brillo diagonal, para que no sea un plano liso a tamaño grande. */
  .plate::after {
    content: '';
    position: absolute; inset: 0;
    background: linear-gradient(160deg, rgba(255,255,255,.18) 0%, rgba(255,255,255,0) 42%);
  }
  .glyph {
    font-family: 'Noto Sans JP', sans-serif;
    font-weight: 700;
    font-size: 470px;
    line-height: 1;
    color: #fff;
    text-shadow: 0 10px 26px rgba(0,0,0,.28);
    /* El 学 tiene más peso arriba; se baja un poco para centrarlo a la vista. */
    transform: translateY(10px);
  }
</style>
<div class="plate"><span class="glyph">学</span></div>
`

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    show: false,
    transparent: true,
    frame: false,
    backgroundColor: '#00000000',
    webPreferences: { offscreen: false },
  })

  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  // Un respiro para que la fuente incrustada termine de aplicarse: sin él
  // la captura sale con el glifo en la tipografía de reserva.
  await new Promise((r) => setTimeout(r, 900))

  const image = await win.webContents.capturePage()
  mkdirSync(join(root, 'build'), { recursive: true })
  const out = join(root, 'build/icon.png')
  writeFileSync(out, image.toPNG())

  const { width, height } = image.getSize()
  console.log(`icono generado: ${out} (${width}×${height})`)
  app.quit()
})
