import { useRef, useState, type ReactNode } from "react"
import { Upload } from "lucide-react"

import { cn } from "@/lib/utils"

type Props = {
  title: ReactNode
  hint: ReactNode
  onFiles: (files: File[]) => void
  compact?: boolean
}

export function FileDrop({ title, hint, onFiles, compact }: Props) {
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => input.current?.click()}
      onKeyDown={e => (e.key === "Enter" || e.key === " ") && input.current?.click()}
      onDragEnter={e => { e.preventDefault(); setOver(true) }}
      onDragOver={e => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={e => {
        e.preventDefault()
        setOver(false)
        onFiles([...e.dataTransfer.files])
      }}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed bg-card text-center transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        compact ? "px-4 py-6" : "px-6 py-10",
        over ? "border-primary bg-muted/60" : "hover:border-foreground/30",
      )}
    >
      <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
        <Upload className="size-5" />
      </span>
      <span className="font-medium">{title}</span>
      <span className="text-sm text-muted-foreground">{hint}</span>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={e => {
          onFiles([...(e.target.files ?? [])])
          e.target.value = ""
        }}
      />
    </div>
  )
}
