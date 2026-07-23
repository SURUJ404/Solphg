// Vitest workspace config — collects test results from every package that
// has a vitest.config.ts. Run from the repo root with `npm test`.

export default [
  'packages/core',
  'packages/engine',
  'packages/integrations',
  'packages/shell',
  'services/compiler',
]
