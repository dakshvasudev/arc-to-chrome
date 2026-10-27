import { GITHUB_CLIENT_ID } from './config.js'
import { ROLES } from './github.js'

const app = document.getElementById('app')
const account = document.getElementById('account')
const send = msg => chrome.runtime.sendMessage(msg)
let creating = false

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

function ago(ts) {
  if (!ts) return 'not synced yet'
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 60) return 'updated just now'
  if (s < 3600) return `updated ${Math.round(s / 60)} min ago`
  return `updated ${Math.round(s / 3600)} h ago`
}

function signedOutView(pending) {
  if (pending && !pending.error) {
    return `
      <p>Enter this code on GitHub to connect your account:</p>
      <div class="code">${esc(pending.user_code)}</div>
      <button class="primary" id="open">Copy code and open GitHub</button>
      <p class="muted small">Waiting for you to approve on GitHub…</p>
      <button class="link" id="cancel">Cancel</button>`
  }
  return `
    <p><strong>Arc-style live folders for Chrome.</strong> A bookmark folder of your open pull requests that
      keeps itself up to date: new PRs appear, merged and closed ones disappear.</p>
    <button class="primary" id="signin">Sign in with GitHub</button>
    ${pending?.error ? `<p class="error">${esc(pending.error)}</p>` : ''}
    <p class="muted small">Your GitHub token stays in this browser and is only sent to GitHub.</p>`
}

function folderCard(f) {
  const roles = f.roles.map(r => ROLES[r].label.toLowerCase()).join(', ')
  return `
    <div class="card folder">
      <div class="info">
        <div class="name">${esc(f.name)}</div>
        <div class="muted small">${f.count ?? 0} PRs · ${ago(f.lastSync)}</div>
        <div class="muted small">${esc(roles)}${f.filter ? ` · ${esc(f.filter)}` : ''}</div>
        ${f.error ? `<div class="error">${esc(f.error)}</div>` : ''}
      </div>
      <div class="actions"><button data-remove="${f.id}" title="Delete this live folder and its bookmark folder">Delete</button></div>
    </div>`
}

function createForm() {
  return `
    <form id="create" class="card" style="display:grid;gap:10px">
      <label>Folder name <input type="text" name="name" value="Pull Requests" required maxlength="60"></label>
      <fieldset>
        <legend>Show open pull requests…</legend>
        ${Object.entries(ROLES).map(([key, r]) => `
          <label class="check"><input type="checkbox" name="roles" value="${key}" checked> ${r.label}</label>`).join('')}
      </fieldset>
      <label>Only these repos or orgs <span class="muted small" style="font-weight:400">(optional)</span>
        <input type="text" name="filter" placeholder="e.g. vercel/next.js, my-org">
      </label>
      <div class="row"><button type="button" id="cancel-create">Cancel</button><button class="primary" type="submit">Create</button></div>
    </form>`
}

function signedInView(folders) {
  return `
    ${folders.length ? folders.map(folderCard).join('') : '<p class="muted empty">No live folders yet.</p>'}
    ${creating ? createForm() : `
      <div class="row">
        <button class="primary" id="new">+ New live folder</button>
        ${folders.length ? '<button id="refresh">Refresh now</button>' : ''}
      </div>`}
    <p class="muted small">Folders appear on your bookmarks bar and refresh every few minutes. Delete one here or in Chrome's bookmarks.</p>`
}

async function render() {
  if (GITHUB_CLIENT_ID.startsWith('REPLACE')) {
    app.innerHTML = '<p class="error">This build has no GitHub app configured yet (config.js).</p>'
    return
  }
  const { token, user, pending, folders = [] } = await chrome.storage.local.get(['token', 'user', 'pending', 'folders'])
  account.innerHTML = user
    ? `<img src="${esc(user.avatar_url)}" alt=""> ${esc(user.login)} <button class="link" id="signout">Sign out</button>`
    : ''
  app.innerHTML = token ? signedInView(folders) : signedOutView(pending)
}

document.addEventListener('click', async e => {
  const t = e.target.closest('button')
  if (!t) return
  if (t.id === 'signin') { t.disabled = true; const r = await send({ type: 'signIn' }); if (!r.ok) alertError(r.error) }
  if (t.id === 'open') {
    const { pending } = await chrome.storage.local.get('pending')
    await navigator.clipboard.writeText(pending.user_code).catch(() => {})
    chrome.tabs.create({ url: pending.verification_uri })
  }
  if (t.id === 'cancel') await send({ type: 'cancelSignIn' })
  if (t.id === 'signout') await send({ type: 'signOut' })
  if (t.id === 'new') { creating = true; render() }
  if (t.id === 'cancel-create') { creating = false; render() }
  if (t.id === 'refresh') { t.disabled = true; t.textContent = 'Refreshing…'; await send({ type: 'refresh' }); render() }
  if (t.dataset.remove) {
    if (t.dataset.confirm) await send({ type: 'remove', id: t.dataset.remove })
    else { t.dataset.confirm = '1'; t.textContent = 'Sure?' }
  }
})

document.addEventListener('submit', async e => {
  e.preventDefault()
  const data = new FormData(e.target)
  const roles = data.getAll('roles')
  if (!roles.length) return alertError('Pick at least one kind of pull request.')
  e.target.querySelector('[type=submit]').disabled = true
  const r = await send({ type: 'create', folder: { name: data.get('name').trim(), roles, filter: data.get('filter').trim() } })
  if (!r.ok) return alertError(r.error)
  creating = false
  render()
})

function alertError(message) {
  app.insertAdjacentHTML('afterbegin', `<p class="error">${esc(message)}</p>`)
}

chrome.storage.onChanged.addListener(() => { if (!creating) render() })
render()
