/**
 * The architecture rules in CLAUDE.md, as a command.
 *
 * They were violated once already — four imports crossed between features, and
 * a review found it rather than the build. A rule nothing checks is a rule that
 * decays, so the four boundaries and the no-empty-layers rule run here.
 *
 *   npm run check:arch
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

type Rule = {
  name: string
  /** Files under these roots… */
  roots: string[]
  /** …must not contain any of these import specifiers. */
  forbidden: RegExp
  why: string
}

const RULES: Rule[] = [
  {
    name: 'a feature never imports another feature',
    roots: ['src/client/features'],
    forbidden: /from '@\/client\/features\//,
    why: 'lift shared code into src/client/shared — features reaching for each other is where layering collapses',
  },
  {
    name: 'the client never reaches into the server',
    roots: ['src/client'],
    forbidden: /from '@\/(server|generated)\//,
    why: 'the split is physical; the only bridge is HTTP through src/app/api',
  },
  {
    name: 'the server never reaches into the client',
    roots: ['src/server'],
    forbidden: /from '@\/client\//,
    why: 'server code must not depend on browser code, even for a type',
  },
  {
    name: 'shared belongs to neither side',
    roots: ['src/shared'],
    forbidden: /from '@\/(client|server|generated)\//,
    why: 'shared holds wire contracts only — shapes, not behaviour',
  },
]

const SOURCE = /\.tsx?$/

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      if (entry === 'generated') continue
      out.push(...walk(path))
    } else if (SOURCE.test(entry)) {
      out.push(path)
    }
  }
  return out
}

/** A segment folder exists only when the feature needs it (CLAUDE.md §7). */
function emptyDirectories(dir: string): string[] {
  const out: string[] = []
  let hasFile = false
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      if (entry === 'generated') continue
      out.push(...emptyDirectories(path))
    } else {
      hasFile = true
    }
  }
  if (!hasFile && out.length === 0 && readdirSync(dir).length === 0) out.push(dir)
  return out
}

let violations = 0

for (const rule of RULES) {
  const offenders: string[] = []
  for (const root of rule.roots) {
    for (const file of walk(root)) {
      for (const [index, line] of readFileSync(file, 'utf8').split('\n').entries()) {
        if (rule.forbidden.test(line)) {
          offenders.push(`      ${relative(process.cwd(), file)}:${index + 1}  ${line.trim()}`)
        }
      }
    }
  }

  if (offenders.length === 0) {
    console.log(`PASS  ${rule.name}`)
  } else {
    violations += offenders.length
    console.log(`FAIL  ${rule.name}`)
    console.log(`      ${rule.why}`)
    offenders.forEach((o) => console.log(o))
  }
}

/**
 * Links into the source from the deliverable documents.
 *
 * The brief asks AI_USAGE to "link the lines", and every one of those links
 * broke silently when the folders moved. The link text carries the symbol it
 * points at, so this can check the anchor still lands on it rather than merely
 * that the file exists.
 */
const DOCS = ['README.md', 'DECISIONS.md', 'AI_USAGE.md', 'CLAUDE.md']
const LINK = /\[`?([\w.]+)`?[^\]]*\]\((src\/[^)#]+)(?:#L(\d+))?\)/g

const brokenLinks: string[] = []
for (const doc of DOCS) {
  const text = readFileSync(doc, 'utf8')
  for (const match of text.matchAll(LINK)) {
    const [whole, symbol, path, lineNumber] = match
    if (!existsSync(path)) {
      brokenLinks.push(`${doc}: ${whole} → no such file`)
      continue
    }
    if (!lineNumber) continue
    const line = readFileSync(path, 'utf8').split('\n')[Number(lineNumber) - 1]
    if (line === undefined || !line.includes(symbol.split('.').pop() as string)) {
      brokenLinks.push(`${doc}: ${whole} → line ${lineNumber} does not mention ${symbol}`)
    }
  }
}

if (brokenLinks.length === 0) {
  console.log('PASS  every documented source link resolves')
} else {
  violations += brokenLinks.length
  console.log('FAIL  documented source links have drifted')
  brokenLinks.forEach((b) => console.log(`      ${b}`))
}

const empty = ['src'].flatMap(emptyDirectories)
if (empty.length === 0) {
  console.log('PASS  no empty layer folders')
} else {
  violations += empty.length
  console.log('FAIL  no empty layer folders — a segment exists only when the feature needs it')
  empty.forEach((d) => console.log(`      ${d}`))
}

console.log()
if (violations > 0) {
  console.error(`FAILED: ${violations} architecture violation(s).`)
  process.exit(1)
}
console.log('The architecture rules in CLAUDE.md hold.')
