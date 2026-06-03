import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/__tests__/**/*.test.ts'],
    environment: 'node',
    coverage: {
      reporter: ['text', 'lcov'],
      include: ['src/main/skill/**/*.ts'],
      exclude: ['src/main/skill/__tests__/**']
    }
  }
})
