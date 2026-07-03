import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.js'],
    globals: true,
    coverage: {
      reporter: ['text', 'lcov'],
      include: ['tests/helpers.js', 'src/pendo-visitor.js'],
    },
  },
})
