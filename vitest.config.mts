import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Vite resolves the `@/*` alias from tsconfig natively; no plugin needed.
  resolve: { tsconfigPaths: true },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // Node by default — pure logic needs no DOM. Component tests opt in with a
    // `@vitest-environment jsdom` docblock, so the cost is paid per file.
    environment: 'node',
  },
})
