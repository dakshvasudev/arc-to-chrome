// Keeps live folders in sync and handles GitHub sign-in for the popup.
import { REFRESH_MINUTES } from './config.js'
import { AuthError, getUser, openPullRequests, pollForToken, startDeviceFlow } from './github.js'
import { bookmarksBarId, syncFolder } from './sync.js'

const ALARM = 'refresh-live-folders'

// Storage shape (chrome.storage.local):
//   token:   GitHub access token, never leaves this browser except to api.github.com
//   user:    { login, avatar_url }
//   pending: in-progress device flow, so sign-in survives the worker being restarted
//   folders: [{ id, name, folderId, roles, filter, count, lastSync, error }]
const get = keys => chrome.storage.local.get(keys)
const set = values => chrome.storage.local.set(values)

async function updateFolder(id, patch) {
  const { folders = [] } = await get('folders')
  await set({ folders: folders.map(f => (f.id === id ? { ...f, ...patch } : f)) })
}

async function refreshOne(folder, token) {
  try {
    const items = await openPullRequests(token, folder)
    await syncFolder(chrome.bookmarks, folder.folderId, items)
    await updateFolder(folder.id, { count: items.length, lastSync: Date.now(), error: null })
  } catch (err) {
    if (err instanceof AuthError) {
      await chrome.storage.local.remove(['token', 'user'])
    }
    await updateFolder(folder.id, { error: err.message })
  }
}

let running = null
async function refreshAll() {
  // One refresh at a time; a second request just waits for the first.
  running ??= (async () => {
    const { token, folders = [] } = await get(['token', 'folders'])
    if (!token) return
    for (const folder of folders) await refreshOne(folder, token)
  })().finally(() => { running = null })
  return running
}

async function createLiveFolder({ name, roles, filter }) {
  const parentId = await bookmarksBarId(chrome.bookmarks)
  const node = await chrome.bookmarks.create({ parentId, title: name })
  const folder = { id: crypto.randomUUID(), name, folderId: node.id, roles, filter, count: 0, lastSync: null, error: null }
  const { folders = [] } = await get('folders')
  await set({ folders: [...folders, folder] })
  const { token } = await get('token')
  if (token) await refreshOne(folder, token)
  return folder
}

async function removeLiveFolder(id) {
  const { folders = [] } = await get('folders')
  const folder = folders.find(f => f.id === id)
  await set({ folders: folders.filter(f => f.id !== id) })
  if (folder) await chrome.bookmarks.removeTree(folder.folderId).catch(() => {})
}

async function finishSignIn(pending) {
  try {
    const token = await pollForToken(pending)
    const user = await getUser(token)
    await set({ token, user: { login: user.login, avatar_url: user.avatar_url } })
    await chrome.storage.local.remove('pending')
    await refreshAll()
  } catch (err) {
    await set({ pending: { ...pending, error: err.message } })
  }
}

async function startSignIn() {
  const flow = await startDeviceFlow()
  const pending = { ...flow, startedAt: Date.now(), error: null }
  await set({ pending })
  finishSignIn(pending)
  return pending
}

// A worker restart mid sign-in picks the polling back up.
async function resumeSignIn() {
  const { pending } = await get('pending')
  if (pending && !pending.error && Date.now() < pending.startedAt + pending.expires_in * 1000) finishSignIn(pending)
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(ALARM, { periodInMinutes: REFRESH_MINUTES })
  refreshAll()
})
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(ALARM, { periodInMinutes: REFRESH_MINUTES })
  refreshAll()
})
chrome.alarms.onAlarm.addListener(alarm => alarm.name === ALARM && refreshAll())

// Deleting a live folder in Chrome's bookmarks deletes the live folder, as in Arc.
chrome.bookmarks.onRemoved.addListener(async id => {
  const { folders = [] } = await get('folders')
  if (folders.some(f => f.folderId === id)) await set({ folders: folders.filter(f => f.folderId !== id) })
})

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  const handlers = {
    signIn: startSignIn,
    signOut: () => chrome.storage.local.remove(['token', 'user', 'pending']),
    cancelSignIn: () => chrome.storage.local.remove('pending'),
    refresh: refreshAll,
    create: () => createLiveFolder(msg.folder),
    remove: () => removeLiveFolder(msg.id),
  }
  const run = handlers[msg.type]
  if (!run) return false
  run().then(result => reply({ ok: true, result }), err => reply({ ok: false, error: err.message }))
  return true // reply asynchronously
})

resumeSignIn()
