import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // Las pruebas de aprendizaje comparten una base de datos y avanzan por
    // fases (presentar, asentar, desbloquear): tienen que ir en orden y sin
    // solaparse entre ficheros.
    fileParallelism: false,
    sequence: { concurrent: false },
    include: ['tests/**/*.test.ts'],
  },
})
