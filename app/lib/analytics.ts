// Sends anonymous usage events to PostHog when VITE_POSTHOG_KEY is set at build time.
// No key, Do Not Track or Global Privacy Control: nothing is sent and nothing is loaded.
// There is no PostHog script on the page; each event is one small POST (see src/analytics.js
// for exactly what it contains).
import { buildEvent, optedOut, readRef, referringDomain } from "../../src/analytics.js"

const KEY: string = import.meta.env.VITE_POSTHOG_KEY ?? ""
const HOST: string = (import.meta.env.VITE_POSTHOG_HOST || "https://eu.i.posthog.com").replace(/\/+$/, "")

type Source = "bundle" | "md" | "sidebar" | "sample"

let ctx: { sessionId: string; ref: string | null; referringDomain: string | null } | null = null
// Counted separately so trying the sample first doesn't hide the real migration that follows.
const downloads = { sample: 0, real: 0 }

function context() {
  if (ctx) return ctx
  ctx = {
    // Random per page load, kept only in memory: two visits can't be tied together.
    sessionId: crypto.randomUUID(),
    ref: readRef(location.search),
    referringDomain: referringDomain(document.referrer, location.hostname),
  }
  return ctx
}

export const trackingEnabled = () =>
  typeof window !== "undefined" && Boolean(KEY) && !optedOut(navigator as never, window as never)

function track(event: string, props?: Record<string, string | number | boolean>) {
  if (!trackingEnabled()) return
  const c = context()
  const body = buildEvent({ key: KEY, event, ...c, origin: location.origin, path: location.pathname, props })
  if (!body) return
  // text/plain keeps this a "simple" request (no CORS preflight); keepalive lets it finish if the
  // page closes right after a download.
  fetch(`${HOST}/i/v0/e/`, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(body),
    keepalive: true,
    credentials: "omit",
  }).catch(() => {})
}

export const trackPageview = () => track("$pageview")

/** The copy command's output was pasted. */
export const trackPasted = () => track("data_pasted", { source: "bundle" })

/** An Arc export file was dropped or chosen. */
export const trackFileDropped = (source: Source) => track("export_file_dropped", { source })

/**
 * A Chrome bookmarks file was downloaded. This is the event that counts a user (one completed
 * migration). Filter out source = "sample", and count first_in_session = true for unique migrations;
 * first_in_session is tracked separately for sample and real data.
 */
export function trackDownload(source: Source, spaces: number, links: number) {
  const kind = source === "sample" ? "sample" : "real"
  downloads[kind]++
  track("profile_file_downloaded", { source, spaces, links, first_in_session: downloads[kind] === 1 })
}
