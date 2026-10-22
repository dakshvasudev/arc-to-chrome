import { useState } from "react"
import { ShieldCheck, UserRoundSearch } from "lucide-react"

import { CopyText } from "@/components/copy-text"
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

const PATHS = {
  mac: "~/Library/Application Support/Google/Chrome/",
  win: "%LOCALAPPDATA%\\Google\\Chrome\\User Data\\",
}

export function ChromeProfilesDialog({ onFiles, error }: { onFiles: (files: File[]) => Promise<boolean>; error?: string }) {
  const [open, setOpen] = useState(false)
  const isWindows = typeof navigator !== "undefined" && /Win/.test(navigator.platform)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
        <UserRoundSearch /> Use my real Chrome profiles
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Load your Chrome profiles</DialogTitle>
          <DialogDescription>
            Websites can't see your Chrome profiles, but Chrome lists them in a file called{" "}
            <span className="font-medium text-foreground">Local State</span>. Drop it here to get your real
            profile names and colours.
          </DialogDescription>
        </DialogHeader>

        <ol className="ml-5 list-decimal space-y-2 text-sm">
          {isWindows ? (
            <li>
              Press <kbd className="rounded border px-1">Win R</kbd> and open <CopyText text={PATHS.win} />
            </li>
          ) : (
            <li>
              In Finder press <kbd className="rounded border px-1">⌘ ⇧ G</kbd> and go to <CopyText text={PATHS.mac} />
            </li>
          )}
          <li>
            Drag the file named <span className="font-medium">Local State</span> onto the box below.
          </li>
        </ol>

        <FileDrop
          compact
          title="Drop “Local State” here"
          hint="or click to choose it"
          onFiles={async files => {
            if (await onFiles(files)) setOpen(false)
          }}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}

        <p className="flex gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="size-4 shrink-0" />
          Read in your browser only. The page just takes each profile's name, account name and colour, and
          nothing is uploaded.
        </p>
      </DialogContent>
    </Dialog>
  )
}
