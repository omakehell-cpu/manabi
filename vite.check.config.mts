import { defineConfig } from 'vite'

/** Build aislado del script de verificación (no toca la app). */
export default defineConfig({
  build: {
    ssr: true,
    outDir: 'dist-check',
    emptyOutDir: true,
    rollupOptions: {
      input: 'scripts/check-db.ts',
      output: { format: 'cjs', entryFileNames: 'check-db.cjs' },
      external: ['better-sqlite3'],
    },
  },
})
