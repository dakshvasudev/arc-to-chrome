// Core Arc → Chrome conversion. Pure functions, no Node/DOM APIs, so the CLI
// and the web page share the exact same logic.
//
// Tree shape:
//   { type: 'folder', title, children: Node[] }
//   { type: 'link', title, url }

const folder = (title, children = []) => ({ type: 'folder', title, children })
const link = (title, url) => ({ type: 'link', title: title || prettyTitle(url), url })

const KNOWN_PAGES = [
  [/^docs\.google\.com\/spreadsheets/, 'Google Sheet'],
  [/^docs\.google\.com\/document/, 'Google Doc'],
  [/^docs\.google\.com\/presentation/, 'Google Slides'],
  [/^docs\.google\.com\/forms/, 'Google Form'],
  [/^drive\.google\.com\/drive\/folders/, 'Google Drive folder'],
  [/^drive\.google\.com\/file/, 'Google Drive file'],
  [/^mail\.google\.com/, 'Gmail'],
  [/^claude\.ai\/artifact/, 'Claude artifact'],
  [/^claude\.ai\/project/, 'Claude project'],
]

// Arc's Markdown export has bare URLs only; turn them into readable names.
export function prettyTitle(url) {
  let u
  try { u = new URL(url) } catch { return url }
  const host = u.hostname.replace(/^www\./, '')
  const parts = u.pathname.split('/').filter(Boolean).map(p => {
    try { return decodeURIComponent(p) } catch { return p }
  })
  const key = [host, ...parts].join('/')
  // Several Drive files would otherwise share one name; add a short id to tell them apart.
  const isId = p => /^[\w-]{20,}$/.test(p) && /\d/.test(p) && /[A-Z]/.test(p)
  const id = parts.find(isId)
  for (const [re, name] of KNOWN_PAGES) if (re.test(key)) return id ? `${name} · ${id.slice(0, 6)}` : name

  if (host === 'github.com' && parts.length >= 2) {
    const [, repo, kind, num] = parts
    if ((kind === 'pull' || kind === 'issues') && num) return `${repo} ${kind === 'pull' ? 'PR' : 'issue'} #${num}`
    return parts.slice(0, 2).join('/')
  }
  // Last human-looking path segment: skip ids, hashes and file-ish noise.
  const readable = parts.filter(p => p.length > 2 && !isId(p) && !/\d{4,}|^\d+$/.test(p) && !/^(view|edit|index\.\w+)$/i.test(p))
  const tail = readable.at(-1)?.replace(/\.\w{2,4}$/, '').replace(/[-_]+/g, ' ').trim()
  const title = tail ? `${host} › ${tail}` : host
  return title.length > 70 ? title.slice(0, 69) + '…' : title
}

// Arc encodes a profile as {default:true} or {custom:{_0:{directoryBasename}}}.
export function profileDir(profile) {
  if (!profile || profile.default) return 'Default'
  return profile.custom?._0?.directoryBasename ?? 'Default'
}

// Arc stores several lists as flat [key, value, key, value, ...] arrays.
function pairs(arr = []) {
  const out = []
  for (let i = 0; i + 1 < arr.length; i += 2) out.push([arr[i], arr[i + 1]])
  return out
}

function itemTitle(item) {
  const tab = item.data?.tab
  return item.title || tab?.savedTitle || tab?.savedURL || 'Untitled'
}

/**
 * Parse Arc's StorableSidebar.json.
 * @param {object} sidebarJson  parsed StorableSidebar.json
 * @param {object} [opts]
 * @param {Record<string,string>} [opts.profileNames]  'Profile 2' → 'Work'
 * @param {boolean} [opts.includeUnpinned=true]  include open (Today) tabs
 * @returns {{ spaces: Array<{title, profileDir, profileName, root}>, stats }}
 */
export function parseSidebar(sidebarJson, opts = {}) {
  const { profileNames = {}, includeUnpinned = true } = opts
  const container = sidebarJson?.sidebar?.containers?.find(c => c.spaces && c.items)
  if (!container) throw new Error('Not an Arc StorableSidebar.json (no spaces found)')

  const byId = new Map()
  for (const it of container.items) if (it && typeof it === 'object') byId.set(it.id, it)

  const stats = { links: 0, folders: 0, spaces: 0 }

  const convertChildren = (ids, seen = new Set()) => {
    const out = []
    for (const id of ids ?? []) {
      const item = byId.get(id)
      if (!item || seen.has(id)) continue
      seen.add(id)
      const tab = item.data?.tab
      if (tab) {
        if (!tab.savedURL) continue
        out.push(link(itemTitle(item), tab.savedURL))
        stats.links++
      } else if (item.data?.list) {
        out.push(folder(item.title || 'Folder', convertChildren(item.childrenIds, seen)))
        stats.folders++
      } else {
        // Split views, easels, etc.: keep whatever tabs they hold, flattened.
        out.push(...convertChildren(item.childrenIds, seen))
      }
    }
    return out
  }

  const favoritesByProfile = new Map()
  for (const [profile, containerId] of pairs(container.topAppsContainerIDs)) {
    const c = byId.get(containerId)
    if (c) favoritesByProfile.set(profileDir(profile), convertChildren(c.childrenIds))
  }

  const usedProfiles = new Set()
  const spaces = []
  for (const [, space] of pairs(container.spaces)) {
    if (!space || typeof space !== 'object') continue
    const dir = profileDir(space.profile)
    const containers = Object.fromEntries(pairs(space.containerIDs))
    const pinned = convertChildren(byId.get(containers.pinned)?.childrenIds)
    const unpinned = includeUnpinned
      ? convertChildren(byId.get(containers.unpinned)?.childrenIds)
      : []

    const children = []
    // Favorites are per profile; attach them to the first space of that profile.
    if (!usedProfiles.has(dir)) {
      usedProfiles.add(dir)
      const favs = favoritesByProfile.get(dir) ?? []
      if (favs.length) children.push(folder('Favorites', favs))
    }
    children.push(...pinned)
    if (unpinned.length) children.push(folder('Open tabs (unpinned)', unpinned))

    spaces.push({
      title: space.title || 'Untitled space',
      profileDir: dir,
      profileName: profileNames[dir] ?? dir,
      root: folder(space.title || 'Untitled space', children),
    })
    stats.spaces++
  }

  // Favorites from profiles that no longer have a space would otherwise vanish.
  for (const [dir, favs] of favoritesByProfile) {
    if (usedProfiles.has(dir) || !favs.length) continue
    const name = profileNames[dir] ?? dir
    spaces.push({
      title: `${name} (no space)`,
      profileDir: dir,
      profileName: name,
      root: folder(`${name} (no space)`, [folder('Favorites', favs)]),
    })
  }

  return { spaces, stats }
}

/**
 * Parse the Markdown outline format:
 *   # Space
 *   ## Folder
 *   ### Subfolder
 *   - https://url           or   - [Title](https://url)
 */
export function parseMarkdown(md) {
  const top = folder('root')
  const stack = [{ depth: 0, node: top }]
  const stats = { links: 0, folders: 0, spaces: 0 }

  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trim()
    const h = line.match(/^(#{1,6})\s+(.*)$/)
    if (h) {
      const depth = h[1].length
      while (stack.length > 1 && stack.at(-1).depth >= depth) stack.pop()
      const node = folder(h[2].trim())
      stack.at(-1).node.children.push(node)
      stack.push({ depth, node })
      depth === 1 ? stats.spaces++ : stats.folders++
      continue
    }
    const li = line.match(/^[-*+]\s+(.*)$/)
    if (!li) continue
    const md = li[1].match(/^\[(.*)\]\((\S+?)\)$/)
    const [title, url] = md ? [md[1], md[2]] : [null, li[1].trim()]
    if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) continue
    stack.at(-1).node.children.push(link(title, url))
    stats.links++
  }

  const spaces = top.children.map(root =>
    root.type === 'folder'
      ? { title: root.title, profileDir: 'Default', profileName: 'Default', root }
      : { title: 'Links', profileDir: 'Default', profileName: 'Default', root: folder('Links', [root]) },
  )
  return { spaces, stats }
}

const esc = s =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * Render nodes as a Netscape bookmark file — the format Chrome's
 * "Import bookmarks and settings → Bookmarks HTML file" accepts.
 */
export function toNetscapeHTML(nodes, { addDate = Math.floor(Date.now() / 1000) } = {}) {
  const lines = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<!-- This is an automatically generated file. Generated by arc-to-chrome. -->',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Bookmarks</TITLE>',
    '<H1>Bookmarks</H1>',
    '<DL><p>',
  ]
  const walk = (list, indent) => {
    const pad = '    '.repeat(indent)
    for (const n of list) {
      if (n.type === 'folder') {
        lines.push(`${pad}<DT><H3 ADD_DATE="${addDate}">${esc(n.title)}</H3>`)
        lines.push(`${pad}<DL><p>`)
        walk(n.children, indent + 1)
        lines.push(`${pad}</DL><p>`)
      } else {
        lines.push(`${pad}<DT><A HREF="${esc(n.url)}" ADD_DATE="${addDate}">${esc(n.title)}</A>`)
      }
    }
  }
  walk(nodes, 1)
  lines.push('</DL><p>', '')
  return lines.join('\n')
}

/** Group parsed spaces by Arc profile: [{ profileDir, profileName, nodes }] */
export function groupByProfile(spaces) {
  const groups = new Map()
  for (const s of spaces) {
    if (!groups.has(s.profileDir))
      groups.set(s.profileDir, { profileDir: s.profileDir, profileName: s.profileName, nodes: [] })
    groups.get(s.profileDir).nodes.push(s.root)
  }
  return [...groups.values()]
}

export function extensionsFolder(extensions) {
  return folder(
    'Arc extensions (reinstall from Chrome Web Store)',
    extensions.map(e => link(e.name, `https://chromewebstore.google.com/detail/${e.id}`)),
  )
}
