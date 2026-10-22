import { useState } from "react"
import { Check, Copy } from "lucide-react"

import { Button } from "@/components/ui/button"

/** Inline code with a copy button, for paths and chrome:// URLs users must paste. */
export function CopyText({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-md bg-muted py-0.5 pr-0.5 pl-2 align-middle font-mono text-[0.8rem]">
      <span className="truncate">{text}</span>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Copy ${text}`}
        onClick={async e => {
          e.stopPropagation()
          try {
            await navigator.clipboard.writeText(text)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          } catch {}
        }}
      >
        {copied ? <Check /> : <Copy />}
      </Button>
    </span>
  )
}
