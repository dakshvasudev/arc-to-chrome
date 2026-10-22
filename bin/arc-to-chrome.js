#!/usr/bin/env node
// Export Arc spaces, pinned tabs, favorites and extensions into one bookmarks
// file per Chrome profile, ready for Chrome's "Bookmarks HTML file" import.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  parseSidebar,
  parseMarkdown,
  toNetscapeHTML,
  extensionsFolder,
  barLayout,
  withoutLive,
} from '../src/convert.js'

const HELP = `
arc-to-chrome — move your Arc spaces into the right Chrome profiles

Usage:
  npx arc-to-chrome [options]

Each Arc space goes to the Chrome profile with the same name (Arc profile or
space name), otherwise to your main Chrome profile. Override with --map.

Options:
  --map "<space>=<chrome profile>"  Send a space to a Chrome profile (repeatable).
                                    Use "<space>=skip" to leave a space out.
  --markdown <file>    Use Arc's "Export data" Markdown instead of Arc's sidebar
  --arc-dir <path>     Arc data folder (auto-detected on macOS and Windows)
  --out <dir>          Output folder (default: ./arc-export)
  --open               Open Chrome's import page in each target profile (macOS)
  --no-unpinned        Skip open (unpinned / "Today") tabs
  --no-extensions      Skip the "Arc extensions" reinstall folder
  --include-live       Keep live folders (e.g. GitHub pull requests); skipped by default
  -h, --help           Show this help
`

function parseArgs(argv) {
  const opts = { out: 'arc-export', unpinned: true, extensions: true, map: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '-h' || a === '--help') opts.help = true
    else if (a === '--arc-dir') opts.arcDir = argv[++i]
    else if (a === '--markdown') opts.markdown = argv[++i]
    else if (a === '--out') opts.out = argv[++i]
    else if (a === '--map') opts.map.push(argv[++i])
    else if (a === '--open') opts.open = true
    else if (a === '--no-unpinned') opts.unpinned = false
    else if (a === '--no-extensions') opts.extensions = false
    else if (a === '--include-live') opts.live = true
    else throw new Error(`Unknown option: ${a}`)
  }
  return opts
}

const readJSON = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const norm = s => String(s ?? '').trim().toLowerCase()
const slug = s => s.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'profile'

function findArcDir() {
  const candidates = []
  if (process.platform === 'darwin') {
    candidates.push(path.join(os.homedir(), 'Library/Application Support/Arc'))
  } else if (process.platform === 'win32') {
    const packages = path.join(process.env.LOCALAPPDATA ?? '', 'Packages')
    if (fs.existsSync(packages)) {
      for (const d of fs.readdirSync(packages)) {
        if (d.startsWith('TheBrowserCompany.Arc'))
          candidates.push(path.join(packages, d, 'LocalCache/Local/Arc'))
      }
    }
  }
  return candidates.find(d => fs.existsSync(path.join(d, 'StorableSidebar.json')))
}

function chromeUserData() {
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library/Application Support/Google/Chrome')
  if (process.platform === 'win32') return path.join(process.env.LOCALAPPDATA ?? '', 'Google/Chrome/User Data')
  return path.join(os.homedir(), '.config/google-chrome')
}

// Chromium "Local State" lists every profile folder with its display name.
function readProfiles(userData) {
  try {
    const cache = readJSON(path.join(userData, 'Local State')).profile.info_cache
    return Object.entries(cache).map(([dir, info]) => ({ dir, name: info.name || dir }))
  } catch {
    return []
  }
}

// Resolve "__MSG_appName__" style names through the extension's _locales.
function extensionName(dir, manifest) {
  const m = /^__MSG_(.+)__$/.exec(manifest.name ?? '')
  if (!m) return manifest.name
  for (const locale of [manifest.default_locale, 'en', 'en_US'].filter(Boolean)) {
    try {
      const messages = readJSON(path.join(dir, '_locales', locale, 'messages.json'))
      const key = Object.keys(messages).find(k => k.toLowerCase() === m[1].toLowerCase())
      if (key) return messages[key].message
    } catch {}
  }
  return manifest.name
}

function readExtensions(profilePath) {
  const extDir = path.join(profilePath, 'Extensions')
  if (!fs.existsSync(extDir)) return []
  const out = []
  for (const id of fs.readdirSync(extDir)) {
    if (!/^[a-p]{32}$/.test(id)) continue
    const versions = fs.readdirSync(path.join(extDir, id)).filter(v => !v.startsWith('.'))
    const dir = path.join(extDir, id, versions.sort().at(-1) ?? '')
    try {
      const manifest = readJSON(path.join(dir, 'manifest.json'))
      if (manifest.theme) continue
      out.push({ id, name: extensionName(dir, manifest) || id })
    } catch {}
  }
  return out
}

// Arc caches each sidebar item's favicon as a PNG named after the MD5 of the item's id.
function readIcons(arcDir, sidebar) {
  const icons = {}
  for (const c of sidebar?.sidebar?.containers ?? []) {
    for (const item of c.items ?? []) {
      if (!item?.data?.tab) continue
      const file = path.join(arcDir, 'SidebarItemsFaviconCache', createHash('md5').update(item.id).digest('hex'))
      try {
        const png = fs.readFileSync(file)
        if (png.length <= 64 * 1024) icons[item.id] = `data:image/png;base64,${png.toString('base64')}`
      } catch {}
    }
  }
  return icons
}

const countLinks = n => (n.type === 'link' ? 1 : n.children.reduce((s, c) => s + countLinks(c), 0))

/**
 * Decide which Chrome profile each space goes to.
 * Order: explicit --map, then a Chrome profile named like the Arc profile or
 * the space, then the main Chrome profile. Empty spaces are skipped.
 */
function route(spaces, chromeProfiles, mapArgs) {
  const byName = new Map(chromeProfiles.map(p => [norm(p.name), p]))
  const main = chromeProfiles.find(p => p.dir === 'Default') ?? chromeProfiles[0] ?? { dir: null, name: 'Chrome' }

  const overrides = new Map()
  for (const m of mapArgs) {
    const i = m.lastIndexOf('=')
    if (i < 1) throw new Error(`--map expects "<space>=<chrome profile>", got "${m}"`)
    const [space, target] = [m.slice(0, i), m.slice(i + 1)]
    if (!spaces.some(s => norm(s.title) === norm(space)))
      throw new Error(`--map: no Arc space named "${space}". Spaces: ${spaces.map(s => s.title).join(', ')}`)
    if (norm(target) !== 'skip' && !byName.has(norm(target)) && chromeProfiles.length)
      throw new Error(`--map: no Chrome profile named "${target}". Profiles: ${chromeProfiles.map(p => p.name).join(', ')}`)
    overrides.set(norm(space), norm(target))
  }

  return spaces.map(s => {
    const o = overrides.get(norm(s.title))
    if (o === 'skip' || (!o && !countLinks(s.root))) return { space: s, target: null }
    const target = (o && byName.get(o)) ?? byName.get(norm(s.profileName)) ?? byName.get(norm(s.title)) ?? main
    return { space: s, target }
  })
}

function openImport(userData, profileDir, file) {
  if (process.platform !== 'darwin') return
  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  // Launching the binary hands the URL to the running Chrome in that profile.
  spawn(chrome, [`--profile-directory=${profileDir}`, 'chrome://settings/importData'], {
    detached: true, stdio: 'ignore',
  }).unref()
  spawn('open', ['-R', file], { detached: true, stdio: 'ignore' }).unref()
}

function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.help) return console.log(HELP)

  let parsed
  let arcUserData = null
  if (opts.markdown) {
    parsed = parseMarkdown(fs.readFileSync(opts.markdown, 'utf8'))
  } else {
    const arcDir = opts.arcDir ?? findArcDir()
    if (!arcDir) {
      throw new Error(
        'Could not find Arc data. Pass --arc-dir <folder with StorableSidebar.json>, or use\n' +
          '  --markdown "Arc Data Export.md" (Arc → Settings → Advanced → Export data).',
      )
    }
    arcUserData = path.join(arcDir, 'User Data')
    const arcNames = Object.fromEntries(readProfiles(arcUserData).map(p => [p.dir, p.name]))
    const sidebar = readJSON(path.join(arcDir, 'StorableSidebar.json'))
    parsed = parseSidebar(sidebar, {
      profileNames: arcNames,
      includeUnpinned: opts.unpinned,
      icons: readIcons(arcDir, sidebar),
    })
  }

  const userData = chromeUserData()
  const chromeProfiles = readProfiles(userData)
  const routes = route(parsed.spaces, chromeProfiles, opts.map)

  // Group spaces per target Chrome profile, keeping Arc's order.
  const groups = new Map()
  for (const r of routes) {
    if (!r.target) continue
    const key = r.target.dir ?? r.target.name
    if (!groups.has(key)) groups.set(key, { target: r.target, spaces: [], arcDirs: new Set() })
    groups.get(key).spaces.push(r.space)
    groups.get(key).arcDirs.add(r.space.profileDir)
  }

  fs.mkdirSync(opts.out, { recursive: true })
  console.log('\nArc space            →  Chrome profile')
  for (const r of routes) {
    const n = countLinks(r.space.root)
    const label = `${r.space.title} (${n})`.padEnd(20)
    console.log(`  ${label} →  ${r.target ? r.target.name : 'skipped'}`)
  }

  const written = []
  for (const g of groups.values()) {
    const nodes = barLayout(g.spaces.map(s => (opts.live ? s.root : withoutLive(s.root))))
    if (opts.extensions && arcUserData) {
      const exts = new Map()
      for (const dir of g.arcDirs) for (const e of readExtensions(path.join(arcUserData, dir))) exts.set(e.id, e)
      if (exts.size) nodes.push(extensionsFolder([...exts.values()].sort((a, b) => a.name.localeCompare(b.name))))
    }
    const file = path.resolve(opts.out, `arc-bookmarks-${slug(g.target.name)}.html`)
    fs.writeFileSync(file, toNetscapeHTML(nodes))
    written.push({ file, target: g.target })
  }

  console.log('\nFiles:')
  for (const w of written) console.log(`  ${w.target.name.padEnd(18)} ${w.file}`)
  console.log(`
Import into each Chrome profile:
  1. Open Chrome in that profile and go to chrome://settings/importData
  2. In the dropdown at the top (it shows another browser, e.g. "Mozilla Firefox"),
     pick "Bookmarks HTML File". Don't press Import before that.
  3. Click "Choose file" and pick that profile's file
  Tip: run again with --open to have the import pages opened for you.
`)
  if (opts.open) for (const w of written) if (w.target.dir) openImport(userData, w.target.dir, w.file)
}

try {
  main()
} catch (err) {
  console.error(`✖ ${err.message}`)
  process.exit(1)
}
