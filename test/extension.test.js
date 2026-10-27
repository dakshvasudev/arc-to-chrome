import { test } from 'node:test'
import assert from 'node:assert/strict'
import { syncFolder, bookmarksBarId } from '../extension/sync.js'
import { scopeQualifiers, openPullRequests } from '../extension/github.js'

// In-memory stand-in for chrome.bookmarks with the same promise API.
function fakeBookmarks(children) {
  let nextId = 100
  const nodes = children.map((c, i) => ({ id: String(nextId++), parentId: 'F', index: i, ...c }))
  const reindex = () => nodes.forEach((n, i) => { n.index = i })
  return {
    nodes,
    getChildren: async () => nodes.map(n => ({ ...n })),
    remove: async id => { nodes.splice(nodes.findIndex(n => n.id === id), 1); reindex() },
    create: async ({ index = nodes.length, title, url }) => { nodes.splice(index, 0, { id: String(nextId++), parentId: 'F', title, url }); reindex() },
    update: async (id, { title }) => { nodes.find(n => n.id === id).title = title },
    move: async (id, { index }) => {
      const [n] = nodes.splice(nodes.findIndex(x => x.id === id), 1)
      nodes.splice(index, 0, n)
      reindex()
    },
  }
}

test('syncFolder adds, removes, renames and reorders; leaves sub-folders alone', async () => {
  const api = fakeBookmarks([
    { title: 'old PR', url: 'https://github.com/a/b/pull/1' },
    { title: 'Notes' }, // a folder the user made inside
    { title: 'stale title', url: 'https://github.com/a/b/pull/2' },
  ])
  const result = await syncFolder(api, 'F', [
    { title: 'New PR', url: 'https://github.com/a/b/pull/3' },
    { title: 'Fresh title', url: 'https://github.com/a/b/pull/2' },
  ])
  assert.deepEqual(result, { added: 1, total: 2 })
  assert.deepEqual(api.nodes.map(n => n.title), ['New PR', 'Fresh title', 'Notes'])
})

test('bookmarksBarId prefers the synced bookmarks bar', async () => {
  const api = { getTree: async () => [{ children: [
    { id: '1', folderType: 'bookmarks-bar', syncing: false },
    { id: '2', folderType: 'other' },
    { id: '5', folderType: 'bookmarks-bar', syncing: true },
  ] }] }
  assert.equal(await bookmarksBarId(api), '5')
})

test('scopeQualifiers turns repos and orgs into search filters', () => {
  assert.equal(scopeQualifiers('vercel/next.js, my-org'), 'repo:vercel/next.js org:my-org')
  assert.equal(scopeQualifiers(''), '')
})

test('openPullRequests merges roles, de-duplicates and sorts by activity', async () => {
  const pr = (n, updated, draft = false) => ({
    html_url: `https://github.com/acme/web/pull/${n}`, title: `PR ${n}`, number: n, draft,
    updated_at: updated, repository_url: 'https://api.github.com/repos/acme/web',
  })
  const queries = []
  globalThis.fetch = async url => {
    const q = new URL(url).searchParams.get('q')
    queries.push(q)
    const items = q.includes('author:@me') ? [pr(1, '2026-01-01T00:00:00Z'), pr(2, '2026-03-01T00:00:00Z', true)] : [pr(2, '2026-03-01T00:00:00Z', true), pr(3, '2026-02-01T00:00:00Z')]
    return { ok: true, status: 200, json: async () => ({ items }) }
  }
  const items = await openPullRequests('t', { roles: ['author', 'review'], filter: 'acme' })
  assert.equal(queries.length, 2)
  assert.ok(queries.every(q => q.includes('is:pr is:open') && q.includes('org:acme')))
  assert.deepEqual(items.map(i => i.title), ['[Draft] PR 2 · web#2', 'PR 3 · web#3', 'PR 1 · web#1'])
})
