import { useEffect, useRef, useState } from "react"
import { Building2, EllipsisVertical, Pencil, Plus, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { plural, type Profile } from "@/lib/model"
import { cn } from "@/lib/utils"

export function ProfileAvatar({ profile, size = "md" }: { profile: Profile; size?: "sm" | "md" | "lg" }) {
  const dims = { sm: "size-5 text-[0.65rem]", md: "size-8 text-sm", lg: "size-20 text-3xl" }[size]
  return (
    <span className="relative inline-flex shrink-0">
      <span
        aria-hidden
        className={cn("grid place-items-center rounded-full font-semibold text-white uppercase ring-1 ring-foreground/15 ring-inset", dims)}
        style={{ background: profile.color }}
      >
        {(profile.name.trim()[0] ?? "?").toUpperCase()}
      </span>
      {profile.managed && size === "lg" && (
        <span
          title="Managed by an organisation"
          className="absolute -right-1 -bottom-1 grid size-8 place-items-center rounded-full border-2 border-card bg-muted text-muted-foreground"
        >
          <Building2 className="size-4" />
        </span>
      )}
    </span>
  )
}

type CardProps = {
  profile: Profile
  spaces: string[]
  links: number
  canRemove: boolean
  onRename: (name: string) => void
  onRemove: () => void
}

/** Mirrors the cards on Chrome's own profile picker. */
export function ProfileCard({ profile, spaces, links, canRemove, onRename, onRemove }: CardProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(profile.name)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) input.current?.select()
  }, [editing])

  const commit = () => {
    const name = draft.trim()
    if (name) onRename(name)
    else setDraft(profile.name)
    setEditing(false)
  }

  return (
    <div className="group relative flex min-h-56 flex-col items-center rounded-xl border bg-card px-4 pt-4 pb-5 text-center text-card-foreground">
      <div className="flex h-8 w-full items-center justify-center px-7">
        {editing ? (
          <Input
            ref={input}
            value={draft}
            maxLength={40}
            aria-label="Profile name"
            className="h-8 text-center font-medium"
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={e => {
              if (e.key === "Enter") commit()
              if (e.key === "Escape") {
                setDraft(profile.name)
                setEditing(false)
              }
            }}
          />
        ) : (
          <span className="truncate font-medium" title={profile.name}>
            {profile.name}
          </span>
        )}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon-sm" className="absolute top-3 right-2 text-muted-foreground" aria-label={`Options for ${profile.name}`} />
          }
        >
          <EllipsisVertical />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-36">
          <DropdownMenuItem onClick={() => { setDraft(profile.name); setEditing(true) }}>
            <Pencil /> Rename
          </DropdownMenuItem>
          {canRemove && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={onRemove}>
                <Trash2 /> Remove
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="my-4">
        <ProfileAvatar profile={profile} size="lg" />
      </div>

      <div className="min-h-5 truncate text-sm text-muted-foreground" title={profile.account}>
        {profile.account}
      </div>
      <div className={cn("mt-auto pt-3 text-xs", spaces.length ? "text-foreground" : "text-muted-foreground")}>
        {spaces.length ? `${plural(spaces.length, "space")} · ${plural(links, "link")}` : "No spaces yet"}
      </div>
    </div>
  )
}

export function AddProfileCard({ onAdd }: { onAdd: () => void }) {
  return (
    <button
      type="button"
      onClick={onAdd}
      className="flex min-h-56 flex-col items-center rounded-xl border border-dashed px-4 pt-4 pb-5 text-foreground transition-colors outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="flex h-8 items-center font-medium">Add</span>
      <span className="my-4 grid size-20 place-items-center rounded-full bg-muted text-muted-foreground">
        <Plus className="size-8" />
      </span>
    </button>
  )
}
