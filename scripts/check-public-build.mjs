#!/usr/bin/env node
/**
 * Guards the public build against leaking owner-only features.
 *
 * This exists because "Owned to CSV" once shipped to the published site: it sat just
 * outside a `{!PUBLIC_MODE && ...}` wrapper, which is invisible in review and produced a
 * button that downloaded the whole inventory with quantities and line values. A build
 * that succeeds proves nothing about which features are in it.
 *
 * Run: npm run check
 */
import { execSync } from 'node:child_process'
import { readFileSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

// Strings that must never appear in the published bundle. Each is UI text unique to a
// feature that exposes the owner's inventory.
const FORBIDDEN = [
  'Owned to CSV',
  'Export backup',
  'Load backup',
  'English market value',
  'Quick add',
  'Value over time',
  'Publish a public snapshot',
  'Refresh prices',
  'Update card list',
]

// Strings the visitor-facing build needs, so a guard that hides too much also fails.
const REQUIRED = ['Your list', 'In your list', 'Reference total', 'Copy list']

const bundleText = (mode) => {
  rmSync('dist', { recursive: true, force: true })
  execSync(mode === 'public' ? 'npm run build:public' : 'npm run build', { stdio: 'pipe' })
  const dir = join('dist', 'assets')
  return readdirSync(dir)
    .filter((f) => f.endsWith('.js'))
    .map((f) => readFileSync(join(dir, f), 'utf8'))
    .join('\n')
}

console.log('Building public bundle...')
const pub = bundleText('public')

let failed = false

for (const needle of FORBIDDEN) {
  if (pub.includes(needle)) {
    console.error(`  LEAK: "${needle}" is present in the public build`)
    failed = true
  }
}
for (const needle of REQUIRED) {
  if (!pub.includes(needle)) {
    console.error(`  MISSING: "${needle}" should be in the public build`)
    failed = true
  }
}

console.log('Building local bundle...')
const local = bundleText('local')

// Sanity check the test itself: if these strings are absent from the local build too,
// the check is passing for the wrong reason.
for (const needle of ['Owned to CSV', 'Export backup', 'English market value']) {
  if (!local.includes(needle)) {
    console.error(`  BROKEN CHECK: "${needle}" missing from the local build as well`)
    failed = true
  }
}

rmSync('dist', { recursive: true, force: true })

if (failed) {
  console.error('\nFAILED')
  process.exit(1)
}
console.log(`\nOK — ${FORBIDDEN.length} owner-only features absent, ${REQUIRED.length} visitor features present.`)
