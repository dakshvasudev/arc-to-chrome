import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowRight, ChevronDown, CircleCheck, ClipboardPaste, ShieldCheck, Download, FlaskConical, KeyRound, Lock, RefreshCw, Star, Upload } from "lucide-react"

import { BookmarkTree } from "@/components/bookmark-tree"
import { ChromeProfilesDialog } from "@/components/chrome-profiles-dialog"
import { CommandBox } from "@/components/command-box"
import { CopyText } from "@/components/copy-text"
import { FileDrop } from "@/components/file-drop"
import { AddProfileCard, ProfileAvatar, ProfileCard } from "@/components/profile-card"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  SKIP,
  applyExclusions,
  bookmarksHTML,
  classify,
  defaultAssignment,
  download,
  fileName,
  liveFolderPaths,
  loadArc,
  loadChromeProfiles,
  placeholderProfile,
  plural,
  type ArcSource,
  type Loaded,
  type Profile,
} from "@/lib/model"
import { FAQ } from "@/lib/faq"
import { cn } from "@/lib/utils"

const REPO = "https://github.com/dakshvasudev/arc-to-chrome"
const COPY_COMMAND = "curl -fsSL https://arc-to-chrome.vercel.app/copy.pl | perl"
const isWindows = typeof navigator !== "undefined" && /Win/.test(navigator.platform)
const PROFILES_KEY = "arc-to-chrome:profiles"

function savedProfiles(): Profile[] {
  try {
    const p = JSON.parse(localStorage.getItem(PROFILES_KEY) ?? "null")
    if (Array.isArray(p) && p.length) return p
  } catch {}
  return [placeholderProfile(0)]
}

function StarButton({ size = "default" }: { size?: "default" | "lg" }) {
  return (
    <a
      href={REPO}
      target="_blank"
      rel="noopener"
      className={cn(buttonVariants({ size }), "gap-2 font-semibold shadow-sm", size === "lg" && "h-10 px-4 text-base")}
    >
      <Star className="fill-yellow-400 text-yellow-400" /> Star on GitHub
    </a>
  )
}

function Step({ n, title, description, action, children }: {
  n: number; title: string; description?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader className="flex flex-wrap items-start gap-3">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{n}</span>
        <div className="min-w-0 flex-1 basis-60">
          <CardTitle className="text-base">{title}</CardTitle>
          {description && <CardDescription className="mt-1">{description}</CardDescription>}
        </div>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

export default function App() {
  const [arc, setArc] = useState<ArcSource>({ md: null, sidebar: null, bundle: null })
  const [includeUnpinned, setIncludeUnpinned] = useState(true)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [profiles, setProfiles] = useState<Profile[]>(savedProfiles)
  const [assign, setAssign] = useState<Record<string, string>>({})
  const [error, setError] = useState("")
  const [chromeError, setChromeError] = useState("")
  const [downloaded, setDownloaded] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [sourceName, setSourceName] = useState("")
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const replaceInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try { localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles)) } catch {}
  }, [profiles])

  // Re-parse whenever the Arc input changes, and route spaces from scratch.
  useEffect(() => {
    if (!arc.md && !arc.sidebar && !arc.bundle) return
    try {
      const next = loadArc(arc, includeUnpinned)
      const live = liveFolderPaths(next.spaces)
      // The copy command brings the real Chrome profiles along.
      const targets = next.chromeProfiles.length ? next.chromeProfiles : profiles
      if (next.chromeProfiles.length) setProfiles(targets)
      setLoaded(next)
      setExcluded(live)
      setAssign(defaultAssignment(applyExclusions(next.spaces, live), targets))
      setError("")
    } catch (e) {
      setError((e as Error).message)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arc, includeUnpinned])

  function useProfiles(next: Profile[]) {
    setProfiles(next)
    if (loaded) setAssign(defaultAssignment(applyExclusions(loaded.spaces, excluded), next))
  }

  // The whole page is a drop target: a near-miss shouldn't make the browser open the file instead.
  useEffect(() => {
    let depth = 0
    const hasFiles = (e: DragEvent) => [...(e.dataTransfer?.types ?? [])].includes("Files")
    const enter = (e: DragEvent) => { e.preventDefault(); depth++; if (hasFiles(e)) setDragging(true) }
    const over = (e: DragEvent) => e.preventDefault()
    const leave = () => { depth = Math.max(0, depth - 1); if (!depth) setDragging(false) }
    // Capture phase runs before the drop box, which stops the event once it has handled it.
    const reset = () => { depth = 0; setDragging(false) }
    const drop = (e: DragEvent) => {
      e.preventDefault()
      onArcFiles([...(e.dataTransfer?.files ?? [])])
    }
    window.addEventListener("dragenter", enter)
    window.addEventListener("dragover", over)
    window.addEventListener("dragleave", leave)
    window.addEventListener("drop", reset, true)
    window.addEventListener("drop", drop)
    return () => {
      window.removeEventListener("drop", reset, true)
      window.removeEventListener("dragenter", enter)
      window.removeEventListener("dragover", over)
      window.removeEventListener("dragleave", leave)
      window.removeEventListener("drop", drop)
    }
  })

  // ⌘V anywhere on the page loads what the copy command put on the clipboard.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData("text") ?? ""
      const target = e.target as HTMLElement | null
      if (target?.closest("input, textarea")) return
      try {
        if (classify(text) !== "bundle") return
      } catch {
        return
      }
      e.preventDefault()
      loadBundle(text)
    }
    window.addEventListener("paste", onPaste)
    return () => window.removeEventListener("paste", onPaste)
  })

  function loadBundle(text: string) {
    setArc({ md: null, sidebar: null, bundle: text })
    setSourceName("Your Arc sidebar")
    setError("")
  }

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText()
      if (classify(text) === "bundle") return loadBundle(text)
      setError("The clipboard doesn't hold the command's output yet. Run the command, then paste.")
    } catch {
      setError("Your browser blocked reading the clipboard. Press ⌘V instead.")
    }
  }

  async function readFiles(files: File[]) {
    const out: { kind: ReturnType<typeof classify>; text: string; name: string }[] = []
    for (const f of files) {
      const text = await f.text()
      out.push({ kind: classify(text), text, name: f.name })
    }
    return out
  }

  async function onArcFiles(files: File[]) {
    // Some apps (e.g. a browser's downloads list) drag a link, not the file itself.
    if (!files.length) {
      setError("Couldn't read a file from that drop. Drag the file from Finder, or click the box to choose it.")
      return
    }
    try {
      const read = await readFiles(files)
      const chrome = read.find(r => r.kind === "chrome")
      if (chrome) useProfiles(loadChromeProfiles(chrome.text))
      const bundleFile = read.find(r => r.kind === "bundle")
      if (bundleFile) return loadBundle(bundleFile.text)
      const mdFile = read.find(r => r.kind === "arc-md")
      const sidebarFile = read.find(r => r.kind === "arc-sidebar")
      if (mdFile || sidebarFile) {
        setArc(prev => ({ md: mdFile?.text ?? prev.md, sidebar: sidebarFile?.text ?? prev.sidebar, bundle: null }))
        setSourceName([mdFile, sidebarFile].filter(Boolean).map(f => f!.name).join(" + "))
      }
    } catch (e) {
      setError((e as Error).message)
    }
  }

  function onChromeText(text: string) {
    try {
      if (classify(text) !== "chrome") return false
      useProfiles(loadChromeProfiles(text))
      setChromeError("")
      return true
    } catch {
      return false
    }
  }

  async function onChromeFiles(files: File[]) {
    try {
      const read = await readFiles(files)
      const chrome = read.find(r => r.kind === "chrome")
      if (!chrome) throw new Error("That isn't Chrome's “Local State” file. Look for the file with exactly that name.")
      useProfiles(loadChromeProfiles(chrome.text))
      setChromeError("")
      return true
    } catch (e) {
      setChromeError((e as Error).message)
      return false
    }
  }

  async function trySample() {
    const md = await (await fetch("/examples/sample-export.md")).text()
    setArc({ md, sidebar: null, bundle: null })
    setSourceName("Sample data")
    setTimeout(() => document.getElementById("routing")?.scrollIntoView({ behavior: "smooth" }), 50)
  }

  const exported = useMemo(() => (loaded ? applyExclusions(loaded.spaces, excluded) : []), [loaded, excluded])
  const spacesFor = (id: string) => exported.filter(s => assign[s.key] === id)
  const linksFor = (id: string) => spacesFor(id).reduce((n, s) => n + s.links, 0)
  const realProfiles = profiles.some(p => p.real)

  function removeProfile(id: string) {
    const rest = profiles.filter(p => p.id !== id)
    setProfiles(rest)
    setAssign(a => Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v === id ? rest[0].id : v])))
  }

  const profileLabel = (id: string) => {
    const p = profiles.find(x => x.id === id)
    if (!p) return <span className="text-muted-foreground">Don't import</span>
    return <><ProfileAvatar profile={p} size="sm" /><span className="truncate">{p.name}</span></>
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-40 grid place-items-center bg-background/80 p-6 backdrop-blur-sm">
          <div className="rounded-2xl border-2 border-dashed border-primary bg-card px-10 py-12 text-center shadow-lg">
            <Upload className="mx-auto size-8 text-muted-foreground" />
            <div className="mt-3 text-lg font-semibold">Drop it anywhere</div>
            <div className="text-sm text-muted-foreground">Arc Data Export.md, StorableSidebar.json or Chrome's Local State</div>
          </div>
        </div>
      )}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          Arc <ArrowRight aria-hidden className="size-7 text-muted-foreground sm:size-8" /><span className="sr-only">to</span> Chrome
        </h1>
        <StarButton size="lg" />
      </header>
      <p className="mt-3 max-w-2xl text-pretty text-muted-foreground">
        Move your Arc spaces, pinned tabs, folders and favorites into Chrome, and send each space to the right
        Chrome profile.
      </p>
      <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
        <Lock className="size-3.5" /> Runs entirely in your browser. Nothing is uploaded.
      </p>

      <div className="mt-8 space-y-4">
        <Step
          n={1}
          title="Get your Arc data"
          description={loaded
            ? "Loaded. To use different data, paste again, click Replace or drop a file anywhere on the page."
            : isWindows
              ? <>In Arc, open <span className="font-medium text-foreground">Settings → Advanced → Export data</span>, then drop the file it saves.</>
              : "Copies your spaces, real tab names and icons straight from Arc, plus your Chrome profiles."}
        >
          {loaded ? (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 p-3">
              <CircleCheck className="size-5 shrink-0 text-green-600" />
              <div className="min-w-0 flex-1 basis-48">
                <div className="truncate font-medium" title={sourceName}>{sourceName || "Arc export"}</div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Badge variant="outline">{plural(loaded.stats.links, "link")}</Badge>
                  <Badge variant="outline">{plural(loaded.stats.folders, "folder")}</Badge>
                  <Badge variant="outline">{plural(loaded.spaces.length, "space")}</Badge>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => replaceInput.current?.click()}>
                <RefreshCw /> Replace
              </Button>
              <input
                ref={replaceInput}
                type="file"
                multiple
                hidden
                onChange={e => { onArcFiles([...(e.target.files ?? [])]); e.target.value = "" }}
              />
            </div>
          ) : (
            <>
              {isWindows ? (
                <FileDrop title="Drop “Arc Data Export.md” here" hint="or click to choose the file" onFiles={onArcFiles} />
              ) : (
                <>
                  <ol className="space-y-4 text-sm">
                    <li className="space-y-2">
                      <div><span className="font-semibold">1.</span> Copy this command</div>
                      <CommandBox command={COPY_COMMAND} />
                    </li>
                    <li>
                      <span className="font-semibold">2.</span> Open <span className="font-medium">Terminal</span> (⌘ Space, type “Terminal”), paste it and press Return.
                    </li>
                    <li className="flex flex-wrap items-center gap-3">
                      <span><span className="font-semibold">3.</span> Come back and press <kbd className="rounded border px-1.5 font-mono text-xs">⌘ V</kbd></span>
                      <Button variant="outline" size="sm" onClick={pasteFromClipboard}><ClipboardPaste /> Paste</Button>
                    </li>
                  </ol>
                  <p className="mt-4 flex gap-2 text-xs text-muted-foreground">
                    <ShieldCheck className="size-4 shrink-0" />
                    <span>
                      Read-only and open source (<a href="/copy.pl" target="_blank" rel="noopener" className="underline underline-offset-2">see what it does</a>).
                      It changes nothing and sends nothing anywhere; your data only goes to your clipboard and this page.
                    </span>
                  </p>
                  <details className="mt-4 text-sm text-muted-foreground">
                    <summary className="cursor-pointer select-none hover:text-foreground">Prefer not to use Terminal? Drop Arc's export file instead</summary>
                    <div className="mt-3 space-y-3">
                      <p>
                        In Arc, open <span className="font-medium text-foreground">Settings → Advanced → Export data</span> and drop the file here.
                        That file only has links, so bookmarks get names made from each link and no icons.
                      </p>
                      <FileDrop compact title="Drop “Arc Data Export.md” here" hint="or click to choose the file" onFiles={onArcFiles} />
                    </div>
                  </details>
                </>
              )}
              <Button variant="link" className="mt-3 h-auto p-0" onClick={trySample}>
                <FlaskConical /> Just looking? Try it with sample data
              </Button>
            </>
          )}
          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
          {loaded && (
            <div className="mt-5">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3">
                <h3 className="font-medium">What's in it</h3>
                <p className="text-xs text-muted-foreground">
                  Untick a folder to leave it out.{excluded.size > 0 && ` ${plural(excluded.size, "folder")} left out, including live folders, which Arc refills by itself.`}
                </p>
              </div>
              <BookmarkTree
                key={loaded.spaces.map(s => s.title).join("|") + loaded.stats.links}
                spaces={loaded.spaces}
                excluded={excluded}
                onToggleExcluded={path => setExcluded(prev => {
                  const next = new Set(prev)
                  if (next.has(path)) next.delete(path)
                  else next.add(path)
                  return next
                })}
              />
            </div>
          )}
          {loaded?.rich && (
            <label className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={includeUnpinned} onChange={e => setIncludeUnpinned(e.target.checked)} className="accent-primary" />
              Include open (unpinned) tabs
            </label>
          )}
        </Step>

        {loaded && (
          <>
            <div id="routing" className="scroll-mt-4">
              <Step
                n={2}
                title="Your Chrome profiles"
                description={realProfiles
                  ? "Loaded from your Chrome. Spaces with matching names are routed automatically."
                  : "Add one card per Chrome profile you use, or load your real ones."}
                action={<ChromeProfilesDialog onFiles={onChromeFiles} onText={onChromeText} error={chromeError} />}
              >
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {profiles.map(p => (
                    <ProfileCard
                      key={p.id}
                      profile={p}
                      spaces={spacesFor(p.id).map(s => s.title)}
                      links={linksFor(p.id)}
                      canRemove={profiles.length > 1}
                      onRename={name => setProfiles(ps => ps.map(x => (x.id === p.id ? { ...x, name } : x)))}
                      onRemove={() => removeProfile(p.id)}
                    />
                  ))}
                  <AddProfileCard onAdd={() => setProfiles(ps => [...ps, placeholderProfile(ps.length)])} />
                </div>
              </Step>
            </div>

            <Step n={3} title="Send each space to a profile">
              <ul className="divide-y">
                {exported.map(s => (
                  <li key={s.key} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{s.title}</div>
                      <div className="text-xs text-muted-foreground">{plural(s.links, "link")}</div>
                    </div>
                    <Select
                      value={assign[s.key] ?? SKIP}
                      onValueChange={v => setAssign(a => ({ ...a, [s.key]: String(v) }))}
                    >
                      <SelectTrigger className="w-44 sm:w-56" aria-label={`Chrome profile for ${s.title}`}>
                        <SelectValue>{(v: string) => profileLabel(v)}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {profiles.map(p => (
                          <SelectItem key={p.id} value={p.id}>
                            <ProfileAvatar profile={p} size="sm" /> {p.name}
                          </SelectItem>
                        ))}
                        <SelectSeparator />
                        <SelectItem value={SKIP}>Don't import</SelectItem>
                      </SelectContent>
                    </Select>
                  </li>
                ))}
              </ul>
            </Step>

            <Step n={4} title="Download and import">
              <div className="space-y-2">
                {profiles.map(p => {
                  const spaces = spacesFor(p.id)
                  return (
                    <div key={p.id} className={cn("flex flex-wrap items-center gap-3 rounded-lg border p-3", !spaces.length && "opacity-60")}>
                      <ProfileAvatar profile={p} />
                      <div className="min-w-0 flex-1 basis-40">
                        <div className="truncate font-medium">{p.name}</div>
                        <div className="truncate text-sm text-muted-foreground">
                          {spaces.length ? `${spaces.map(s => s.title).join(", ")} · ${plural(linksFor(p.id), "link")}` : "No spaces assigned"}
                        </div>
                      </div>
                      <Button disabled={!spaces.length} onClick={() => { download(fileName(p.name), bookmarksHTML(spaces)); setDownloaded(true) }}>
                        <Download /> Download
                      </Button>
                    </div>
                  )
                })}
              </div>
              <ol className="mt-4 ml-5 list-decimal space-y-1.5 text-sm text-muted-foreground">
                <li>Switch Chrome to that profile (your profile picture, top right).</li>
                <li>Go to <CopyText text="chrome://settings/importData" /></li>
                <li>
                  In the dropdown at the top (it shows another browser, like “Mozilla Firefox” or “Safari”), pick{" "}
                  <span className="font-medium text-foreground">Bookmarks HTML File</span>. Don't press Import yet, or Chrome copies that browser's data.
                </li>
                <li>Click <span className="font-medium text-foreground">Choose file</span> and pick that profile's file.</li>
              </ol>
              {downloaded && (
                <div className="mt-5 flex flex-wrap items-center gap-4 rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-4">
                  <Star className="size-8 shrink-0 fill-yellow-400 text-yellow-500" />
                  <div className="min-w-0 flex-1 basis-56">
                    <div className="font-semibold">Did this save you an evening?</div>
                    <div className="text-sm text-muted-foreground">A star on GitHub helps other Arc users find it. It takes one click.</div>
                  </div>
                  <StarButton />
                </div>
              )}
            </Step>

          </>
        )}
      </div>

      <section className="mt-12 space-y-3 text-sm text-muted-foreground">
        <h2 className="text-base font-semibold text-foreground">Good to know</h2>
        <p>Bookmarks keep your Arc names, icons and folders. In each Chrome profile, the first space's Favorites folder and folders land on the bookmarks bar, and any extra spaces become folders. If the bar already has bookmarks, Chrome wraps the import in one “Imported” folder.</p>
        <p className="flex gap-2">
          <KeyRound className="mt-0.5 size-4 shrink-0" />
          <span>Passwords: export them from <CopyText text="arc://settings/passwords" /> as CSV, import at <CopyText text="chrome://password-manager/settings" />, then delete the CSV.</span>
        </p>
      </section>

      <section className="mt-12" aria-labelledby="faq">
        <h2 id="faq" className="text-base font-semibold">Questions</h2>
        <div className="mt-3 divide-y rounded-xl border bg-card">
          {FAQ.map(({ q, a }) => (
            <details key={q} className="group px-4 py-3">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-medium select-none [&::-webkit-details-marker]:hidden">
                <h3 className="text-sm">{q}</h3>
                <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <p className="mt-2 text-sm text-muted-foreground">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <footer className="mt-12 space-y-1 border-t pt-6 text-sm text-muted-foreground">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
          <span className="text-foreground">Free and open source. If it helped, leave a star.</span>
          <StarButton />
        </div>
        <p className="text-foreground">
          Made by{" "}
          <a href="https://github.com/dakshvasudev" target="_blank" rel="noopener" className="font-semibold underline underline-offset-4">Daksh Vasudev</a>{" "}
          while switching from Arc to Chrome.
        </p>
        <p>
          Open source on <a href={REPO} target="_blank" rel="noopener" className="underline underline-offset-4">GitHub</a> · Prefer the terminal?{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">npx arc-to-chrome</code>
        </p>
      </footer>
    </div>
  )
}
