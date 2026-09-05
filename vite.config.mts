import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'
import electron from 'vite-plugin-electron/simple'

/**
 * better-sqlite3 debe quedar FUERA del bundle.
 *
 * Su cargador localiza el binario nativo con `path.join(__dirname, '..',
 * 'prebuilds', …)`. Si se empaqueta dentro de dist-electron/main.js, ese
 * __dirname deja de apuntar a node_modules/better-sqlite3 y la búsqueda
 * termina en <proyecto>/build/Release, que no existe.
 *
 * Ojo con la clave: Vite 8 lee `build.rolldownOptions`; `rollupOptions` se
 * ignora en silencio, que es justo lo que hacía fallar el arranque.
 */
const NATIVE_DEPS = ['better-sqlite3']

const nodeBuild = () => ({
  build: {
    rolldownOptions: {
      platform: 'node' as const,
      external: NATIVE_DEPS,
    },
  },
})

export default defineConfig({
  plugins: [
    react(),
    tailwind(),
    electron({
      main: { entry: 'electron/main.ts', vite: nodeBuild() },
      preload: { input: 'electron/preload.ts', vite: nodeBuild() },
    }),
  ],
})
