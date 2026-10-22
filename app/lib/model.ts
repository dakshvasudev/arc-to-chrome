import {
  barLayout,
  matchProfile,
  parseBundle,
  parseChromeLocalState,
  parseMarkdown,
  parseSidebar,
  toNetscapeHTML,
} from "../../src/convert.js"

export type LinkNode = { type: "link"; title: string; url: string; icon?: string }
export type FolderNode = { type: "folder"; title: string; children: TreeNode[]; live?: boolean }
export type TreeNode = LinkNode | FolderNode

export type Space = {
  key: string
  title: string
  profileName: string
  root: FolderNode
  links: number
}

export type Profile = {
  id: string
  name: string
  account: string
  color: string
  managed: boolean
  /** True when it came from the user's real Chrome "Local State". */
  real: boolean
}

export type Loaded = {
  spaces: Space[]
  stats: { links: number; folders: number; spaces: number }
  rich: boolean
  /** Chrome profiles that came with the copy-command bundle. */
  chromeProfiles: Profile[]
}

export type ArcSource = { md: string | null; sidebar: string | null; bundle: string | null }

export const SKIP = "skip"

// Chrome's own avatar palette, used for profiles we have to invent.
const PALETTE = ["#1a73e8", "#e8710a", "#188038", "#a142f4", "#d93025", "#007b83", "#b06000"]

export const countLinks = (n: TreeNode): number =>
  n.type === "link" ? 1 : n.children.reduce((s, c) => s + countLinks(c), 0)

export function placeholderProfile(index: number): Profile {
  return {
    id: crypto.randomUUID(),
    name: `Chrome profile ${index + 1}`,
    account: "",
    color: PALETTE[index % PALETTE.length],
    managed: false,
    real: false,
  }
}

export type DroppedFile = { kind: "arc-md" | "arc-sidebar" | "chrome" | "bundle"; text: string }

/** Work out what a dropped file is from its contents, not its name. */
export function classify(text: string): DroppedFile["kind"] {
  const t = text.trimStart()
  if (!t.startsWith("{")) return "arc-md"
  const json = JSON.parse(t)
  if (json?.arcToChrome) return "bundle"
  if (json?.profile?.info_cache || json?.info_cache) return "chrome"
  if (json?.sidebar?.containers) return "arc-sidebar"
  throw new Error("That JSON file isn't Arc's StorableSidebar.json or Chrome's Local State.")
}

export function loadArc(src: ArcSource, includeUnpinned: boolean): Loaded {
  const opts = { includeUnpinned }
  const parsed = src.bundle
    ? parseBundle(JSON.parse(src.bundle), opts)
    : src.sidebar
      ? parseSidebar(JSON.parse(src.sidebar), opts)
      : parseMarkdown(src.md ?? "")
  const spaces: Space[] = parsed.spaces.map((s: Omit<Space, "key" | "links">, i: number) => ({
    ...s,
    key: `s${i}`,
    links: countLinks(s.root),
  }))
  if (!spaces.some(s => s.links)) throw new Error("No links found. Is this Arc's data?")
  return {
    spaces,
    stats: parsed.stats,
    rich: Boolean(src.bundle || src.sidebar),
    chromeProfiles: toProfiles("chromeProfiles" in parsed ? (parsed.chromeProfiles as RawProfile[]) : []),
  }
}

type RawProfile = { name: string; account: string; color: string | null; managed: boolean }

const toProfiles = (raw: RawProfile[]): Profile[] =>
  raw.map((p, i) => ({
    id: crypto.randomUUID(),
    name: p.name,
    account: p.account,
    color: p.color ?? PALETTE[i % PALETTE.length],
    managed: p.managed,
    real: true,
  }))

export function loadChromeProfiles(text: string): Profile[] {
  return toProfiles(parseChromeLocalState(JSON.parse(text.trim())))
}

/** Default routing: empty spaces skipped, otherwise matched to a profile by name. */
export function defaultAssignment(spaces: Space[], profiles: Profile[]): Record<string, string> {
  return Object.fromEntries(
    spaces.map(s => [s.key, s.links ? (matchProfile(s, profiles) as Profile).id : SKIP]),
  )
}

export function bookmarksHTML(spaces: Space[]): string {
  return toNetscapeHTML(barLayout(spaces.map(s => s.root)))
}

/** Folder paths ("s0/2/1") of live folders, which start out excluded. */
export function liveFolderPaths(spaces: Space[]): Set<string> {
  const out = new Set<string>()
  const walk = (nodes: TreeNode[], prefix: string) =>
    nodes.forEach((n, i) => {
      if (n.type !== "folder") return
      if (n.live) out.add(`${prefix}/${i}`)
      walk(n.children, `${prefix}/${i}`)
    })
  spaces.forEach(s => walk(s.root.children, s.key))
  return out
}

/** The spaces as they will be exported: excluded folders removed, link counts updated. */
export function applyExclusions(spaces: Space[], excluded: Set<string>): Space[] {
  const prune = (node: FolderNode, path: string): FolderNode => ({
    ...node,
    children: node.children.flatMap((c, i): TreeNode[] => {
      const p = `${path}/${i}`
      if (c.type === "link") return [c]
      return excluded.has(p) ? [] : [prune(c, p)]
    }),
  })
  return spaces.map(s => {
    const root = prune(s.root, s.key)
    return { ...s, root, links: countLinks(root) }
  })
}

export const fileName = (name: string) =>
  `arc-bookmarks-${name.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "profile"}.html`

export function download(name: string, html: string) {
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }))
  const a = Object.assign(document.createElement("a"), { href: url, download: name })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`
