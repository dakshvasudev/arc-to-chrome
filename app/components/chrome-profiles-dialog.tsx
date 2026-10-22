import { useEffect, useState } from "react"
import { Check, ClipboardPaste, Copy, ShieldCheck, UserRoundSearch } from "lucide-react"

import { FileDrop } from "@/components/file-drop"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

// Read-only: prints the "profile" section of Chrome's Local State and copies it to the clipboard.
// Both use tools built into the OS, so nothing needs installing.
const COMMANDS = {
  mac: String.raw`plutil -extract profile json -o - ~/Library/Application\ Support/Google/Chrome/Local\ State | pbcopy`,
  win: String.raw`(Get-Content "$env:LOCALAPPDATA\Google\Chrome\User Data\Local State" -Raw | ConvertFrom-Json).profile | ConvertTo-Json -Depth 6 -Compress | Set-Clipboard`,
}

type Props = {
  onFiles: (files: File[]) => Promise<boolean>
  onText: (text: string) => boolean
  error?: string
}

function CommandBox({ command }: { command: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex items-start gap-2 rounded-lg border bg-muted/50 p-2 pl-3">
      <code className="min-w-0 flex-1 py-1 font-mono text-xs leading-relaxed break-all">{command}</code>
      <Button
        size="sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(command)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          } catch {}
        }}
      >
        {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  )
}

export function ChromeProfilesDialog({ onFiles, onText, error }: Props) {
  const [open, setOpen] = useState(false)
  const [pasteError, setPasteError] = useState("")
  const isWindows = typeof navigator !== "undefined" && /Win/.test(navigator.platform)

  const accept = (text: string) => {
    if (onText(text)) {
      setPasteError("")
      setOpen(false)
    } else {
      setPasteError("That doesn't look like the command's output. Run it again, then paste.")
    }
  }

  // ⌘V / Ctrl+V anywhere in the dialog picks up the profiles.
  useEffect(() => {
    if (!open) return
    const onPaste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData("text") ?? ""
      if (!text.trim()) return
      e.preventDefault()
      accept(text)
    }
    window.addEventListener("paste", onPaste)
    return () => window.removeEventListener("paste", onPaste)
  })

  return (
    <Dialog open={open} onOpenChange={o => { setOpen(o); setPasteError("") }}>
      <DialogTrigger render={<Button variant="outline" />}>
        <UserRoundSearch /> Use my real Chrome profiles
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Load your Chrome profiles</DialogTitle>
          <DialogDescription>
            Browsers don't let websites see your Chrome profiles, so one quick command copies the list for you. It only
            reads it, and changes nothing.
          </DialogDescription>
        </DialogHeader>

        <ol className="space-y-4 text-sm">
          <li className="space-y-2">
            <div><span className="font-semibold">1.</span> Copy this command</div>
            <CommandBox command={isWindows ? COMMANDS.win : COMMANDS.mac} />
          </li>
          <li>
            <span className="font-semibold">2.</span>{" "}
            {isWindows
              ? <>Open <span className="font-medium">PowerShell</span>, paste it and press Enter.</>
              : <>Open <span className="font-medium">Terminal</span> (⌘ Space, type “Terminal”), paste it and press Return.</>}
          </li>
          <li className="space-y-2">
            <div>
              <span className="font-semibold">3.</span> Come back here and press{" "}
              <kbd className="rounded border px-1.5 font-mono text-xs">{isWindows ? "Ctrl V" : "⌘ V"}</kbd>
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={async () => {
                try {
                  accept(await navigator.clipboard.readText())
                } catch {
                  setPasteError(`Your browser blocked reading the clipboard. Press ${isWindows ? "Ctrl V" : "⌘ V"} instead.`)
                }
              }}
            >
              <ClipboardPaste /> Paste profiles
            </Button>
            {(pasteError || error) && <p className="text-destructive">{pasteError || error}</p>}
          </li>
        </ol>

        <details className="text-sm text-muted-foreground">
          <summary className="cursor-pointer select-none hover:text-foreground">Prefer not to use Terminal? Drop the file instead</summary>
          <div className="mt-3 space-y-3">
            <p>
              {isWindows
                ? <>Open <code className="font-mono text-xs">%LOCALAPPDATA%\Google\Chrome\User Data\</code></>
                : <>In Finder press ⌘ ⇧ G and go to <code className="font-mono text-xs">~/Library/Application Support/Google/Chrome/</code></>}
              , then drag the file named <span className="font-medium text-foreground">Local State</span> here.
            </p>
            <FileDrop
              compact
              title="Drop “Local State” here"
              hint="or click to choose it"
              onFiles={async files => { if (await onFiles(files)) setOpen(false) }}
            />
          </div>
        </details>

        <p className="flex gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="size-4 shrink-0" />
          Read in your browser only. The page just takes each profile's name, account name and colour, and nothing is
          uploaded.
        </p>
      </DialogContent>
    </Dialog>
  )
}
