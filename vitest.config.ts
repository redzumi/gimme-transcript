import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // Scope to the T-one engine's pure-logic unit tests.
    include: ['src/main/t-one/**/*.test.ts']
  }
})
