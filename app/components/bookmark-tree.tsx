import { useMemo, useState } from "react"
import { ChevronRight, Folder, PanelLeft, Search, Star } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { countLinks, type Space, type TreeNode } from "@/lib/model"
import { cn } from "@/lib/utils"

const domainOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}
// Stable hue per domain, so links from the same site share a badge colour.
const hue = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 360

function matches(node: TreeNode, q: string): boolean {
  if (!q) return true
  if (node.type === "link") return `${node.title} ${node.url}`.toLowerCase().includes(q)
  return node.children.some(c => matches(c, q))
}

function Highlight({ text, q }: { text: string; q: string }) {
  const i = q ? text.toLowerCase().indexOf(q) : -1
  if (i < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-sm bg-yellow-200/70 text-inherit dark:bg-yellow-500/30">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  )
}

const row = "flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"

function initialOpen(spaces: Space[]) {
  const open = new Set<string>()
  spaces.forEach(s => {
    open.add(s.key)
    s.root.children.forEach((c, i) => c.type === "folder" && open.add(`${s.key}/${i}`))
  })
  return open
}

export function BookmarkTree({ spaces }: { spaces: Space[] }) {
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(() => initialOpen(spaces))
  const q = query.trim().toLowerCase()

  const allPaths = useMemo(() => {
    const paths: string[] = []
    const walk = (nodes: TreeNode[], prefix: string) =>
      nodes.forEach((n, i) => {
        if (n.type !== "folder") return
        paths.push(`${prefix}/${i}`)
        walk(n.children, `${prefix}/${i}`)
      })
    spaces.forEach(s => { paths.push(s.key); walk(s.root.children, s.key) })
    return paths
  }, [spaces])

  const toggle = (path: string, value: boolean) =>
    setOpen(prev => {
      const next = new Set(prev)
      if (value) next.add(path)
      else next.delete(path)
      return next
    })

  const renderNodes = (nodes: TreeNode[], prefix: string, depth: number) => {
    const visible = nodes.map((n, i) => [n, i] as const).filter(([n]) => matches(n, q))
    if (!visible.length) return <div className="py-1 pl-9 text-xs text-muted-foreground italic">Empty</div>
    return (
      <ul className={cn(depth > 0 && "ml-[17px] border-l pl-2")}>
        {visible.map(([n, i]) => {
          const path = `${prefix}/${i}`
          if (n.type === "link") {
            const d = domainOf(n.url)
            return (
              <li key={path}>
                <a href={n.url} target="_blank" rel="noopener noreferrer" title={n.url} className={row}>
                  <span className="w-4 shrink-0" />
                  <span
                    className="grid size-4.5 shrink-0 place-items-center rounded-[5px] text-[0.6rem] font-bold text-white uppercase"
                    style={{ background: `hsl(${hue(d)} 55% 48%)` }}
                  >
                    {d[0] ?? "?"}
                  </span>
                  <span className="min-w-0 flex-1 truncate"><Highlight text={n.title} q={q} /></span>
                  <span className="hidden max-w-[40%] shrink-0 truncate text-xs text-muted-foreground sm:block">{d}</span>
                </a>
              </li>
            )
          }
          const isOpen = q ? true : open.has(path)
          const Icon = n.title === "Favorites" ? Star : Folder
          return (
            <li key={path}>
              <Collapsible open={isOpen} onOpenChange={v => toggle(path, v)}>
                <CollapsibleTrigger className={cn(row, "w-full text-left")}>
                  <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-90")} />
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{n.title}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{countLinks(n)}</span>
                </CollapsibleTrigger>
                <CollapsibleContent>{renderNodes(n.children, path, depth + 1)}</CollapsibleContent>
              </Collapsible>
            </li>
          )
        })}
      </ul>
    )
  }

  const shown = spaces.filter(s => matches(s.root, q))

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-48">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Filter links…"
            aria-label="Filter links"
            className="pl-8"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
        <Button variant="outline" onClick={() => setOpen(new Set(allPaths))}>Expand all</Button>
        <Button variant="outline" onClick={() => setOpen(new Set(spaces.map(s => s.key)))}>Collapse</Button>
      </div>

      {shown.length ? (
        <ul>
          {shown.map(s => {
            const isOpen = q ? true : open.has(s.key)
            return (
              <li key={s.key}>
                <Collapsible open={isOpen} onOpenChange={v => toggle(s.key, v)}>
                  <CollapsibleTrigger className={cn(row, "w-full text-left font-semibold")}>
                    <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-90")} />
                    <PanelLeft className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{s.title}</span>
                    <span className="text-xs font-normal text-muted-foreground tabular-nums">{s.links}</span>
                  </CollapsibleTrigger>
                  <CollapsibleContent>{renderNodes(s.root.children, s.key, 1)}</CollapsibleContent>
                </Collapsible>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="px-2 py-3 text-sm text-muted-foreground">No links match “{query}”.</p>
      )}
    </div>
  )
}
