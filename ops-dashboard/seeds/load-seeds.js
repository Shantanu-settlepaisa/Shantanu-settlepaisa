#!/usr/bin/env node

/**
 * Load seed data for connectors into the mock API
 * This script reads the connectors.json file and loads it into localStorage
 * to simulate persistent data for the mock API
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Read seed data
const seedFile = path.join(__dirname, 'connectors.json')
const seedData = JSON.parse(fs.readFileSync(seedFile, 'utf8'))

// Store in a format that can be loaded by the frontend
const mockData = {
  connectors: seedData.connectors,
  jobs: seedData.jobs,
  loadedAt: new Date().toISOString()
}

// Output as JSON that can be imported
console.log('// Auto-generated seed data')
console.log('export const SEED_CONNECTORS = ' + JSON.stringify(seedData.connectors, null, 2))
console.log('')
console.log('export const SEED_JOBS = ' + JSON.stringify(seedData.jobs, null, 2))

// Also write to a TypeScript file for direct import
const tsContent = `// Auto-generated seed data
// Generated at: ${new Date().toISOString()}

export const SEED_CONNECTORS = ${JSON.stringify(seedData.connectors, null, 2)}

export const SEED_JOBS = ${JSON.stringify(seedData.jobs, null, 2)}
`

const outputFile = path.join(__dirname, '..', 'src', 'lib', 'seed-data.ts')
fs.writeFileSync(outputFile, tsContent)

console.log(`\n✅ Seed data written to ${outputFile}`)
console.log(`📊 Loaded ${seedData.connectors.length} connectors and ${seedData.jobs.length} jobs`)