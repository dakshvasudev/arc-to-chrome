// Anonymous usage counting for the web page. Pure functions only, so they can be tested with
// node --test; app/lib/analytics.ts wires them to the browser.
//
// What is sent: an event name, the page path, a "ref" tag from the link the visitor came from
// (for example ?ref=reddit), the referring site's domain, and a few counts. Never bookmarks, URLs
// from the user's data, profile names, file names or anything typed.

/** Events the page may send. Anything else is dropped. */
export const EVENTS = Object.freeze([
  '$pageview',
  'data_pasted', // the copy command's output was pasted (or the sample was loaded)
  'export_file_dropped', // an Arc export file was dropped or chosen
  'profile_file_downloaded', // a Chrome bookmarks file was downloaded: a completed migration
])

/** Allowed ?ref= values. Unknown values become "other" so free text can't be smuggled in. */
export const REFS = Object.freeze(['hn', 'reddit', 'alt', 'li', 'x', 'forum'])

/**
 * True when the visitor has asked not to be tracked (Do Not Track or Global Privacy Control).
 * @param {{ doNotTrack?: string | null, globalPrivacyControl?: boolean, msDoNotTrack?: string } | undefined} nav
 * @param {{ doNotTrack?: string | null } | undefined} [win]
 */
export function optedOut(nav, win) {
  if (!nav) return true
  const yes = v => v === '1' || v === 'yes' || v === true
  return yes(nav.doNotTrack) || yes(nav.msDoNotTrack) || yes(win?.doNotTrack) || nav.globalPrivacyControl === true
}

/**
 * Reads the ref tag from a query string such as "?ref=reddit".
 * @param {string} search
 * @returns {string | null}
 */
export function readRef(search) {
  const raw = new URLSearchParams(search || '').get('ref')
  if (!raw) return null
  const ref = raw.trim().toLowerCase()
  return REFS.includes(ref) ? ref : 'other'
}

/**
 * The referring site's domain only (no path or query), or null for direct visits and same-site moves.
 * @param {string} referrer
 * @param {string} ownHost
 */
export function referringDomain(referrer, ownHost) {
  if (!referrer) return null
  try {
    const host = new URL(referrer).hostname
    return host && host !== ownHost ? host : null
  } catch {
    return null
  }
}

/** Keeps only small whole numbers and short known strings in event properties. */
function cleanProps(props) {
  const out = {}
  for (const [k, v] of Object.entries(props || {})) {
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.max(0, Math.round(v))
    else if (typeof v === 'boolean') out[k] = v
    else if (typeof v === 'string' && /^[a-z0-9_-]{1,24}$/.test(v)) out[k] = v
  }
  return out
}

/**
 * Builds the JSON body for PostHog's capture endpoint, or null if the event isn't allowed.
 * The session id is random per page load and never stored, so visits can't be linked together;
 * $process_person_profile: false tells PostHog not to build a person profile.
 * @param {{ key: string, event: string, sessionId: string, origin?: string, path: string, ref: string | null,
 *           referringDomain: string | null, props?: Record<string, unknown>, now?: Date }} o
 */
export function buildEvent({ key, event, sessionId, origin, path, ref, referringDomain, props, now = new Date() }) {
  if (!key || !EVENTS.includes(event)) return null
  return {
    api_key: key,
    event,
    distinct_id: sessionId,
    timestamp: now.toISOString(),
    properties: {
      $process_person_profile: false,
      $current_url: `${origin || 'https://arc-to-chrome.vercel.app'}${path || '/'}`,
      $pathname: path || '/',
      ...(ref ? { ref } : {}),
      ...(referringDomain ? { $referring_domain: referringDomain } : {}),
      ...cleanProps(props),
    },
  }
}
