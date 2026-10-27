// GitHub sign-in (OAuth device flow, no server needed) and pull request search.
import { GITHUB_CLIENT_ID } from './config.js'

const form = body => ({
  method: 'POST',
  headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(body),
})

/** Step 1: ask GitHub for a code the user types in at github.com/login/device. */
export async function startDeviceFlow() {
  const res = await fetch('https://github.com/login/device/code', form({ client_id: GITHUB_CLIENT_ID, scope: 'repo' }))
  if (!res.ok) throw new Error(`GitHub sign-in failed (${res.status})`)
  return res.json() // { device_code, user_code, verification_uri, expires_in, interval }
}

/** Step 2: poll until the user approves. Resolves with an access token. */
export async function pollForToken({ device_code, interval = 5, expires_in = 900 }) {
  const deadline = Date.now() + expires_in * 1000
  let wait = interval
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, wait * 1000))
    const res = await fetch(
      'https://github.com/login/oauth/access_token',
      form({ client_id: GITHUB_CLIENT_ID, device_code, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }),
    )
    const data = await res.json()
    if (data.access_token) return data.access_token
    if (data.error === 'slow_down') wait += 5
    else if (data.error !== 'authorization_pending') throw new Error(data.error_description || data.error)
  }
  throw new Error('The sign-in code expired. Try again.')
}

export class AuthError extends Error {}

async function api(token, path) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
  })
  if (res.status === 401) throw new AuthError('GitHub sign-in expired. Sign in again.')
  if (!res.ok) throw new Error(`GitHub returned ${res.status}`)
  return res.json()
}

export const getUser = token => api(token, '/user')

export const ROLES = {
  author: { label: 'Opened by me', query: 'author:@me' },
  review: { label: 'Waiting for my review', query: 'review-requested:@me' },
  assigned: { label: 'Assigned to me', query: 'assignee:@me' },
}

/** "vercel/next.js, my-org" → GitHub search qualifiers. */
export function scopeQualifiers(filter = '') {
  return filter
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(s => (s.includes('/') ? `repo:${s}` : `org:${s}`))
    .join(' ')
}

/** Open PRs matching any of the roles, newest activity first, de-duplicated. */
export async function openPullRequests(token, { roles, filter }) {
  const scope = scopeQualifiers(filter)
  const byUrl = new Map()
  for (const role of roles) {
    const q = ['is:pr', 'is:open', 'archived:false', ROLES[role].query, scope].filter(Boolean).join(' ')
    const data = await api(token, `/search/issues?q=${encodeURIComponent(q)}&sort=updated&order=desc&per_page=50`)
    for (const item of data.items ?? []) byUrl.set(item.html_url, item)
  }
  return [...byUrl.values()]
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .map(pr => {
      const repo = pr.repository_url.split('/').pop()
      return { url: pr.html_url, title: `${pr.draft ? '[Draft] ' : ''}${pr.title} · ${repo}#${pr.number}` }
    })
}
