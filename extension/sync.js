// Make a bookmark folder's links match a list, in order. Live folders own their contents,
// like in Arc: links that are no longer in the list are removed. Sub-folders are left alone.
//
// `api` is chrome.bookmarks (or a stand-in with the same promise-based methods, for tests).
export async function syncFolder(api, folderId, items) {
  const children = await api.getChildren(folderId)
  const wanted = new Map(items.map(i => [i.url, i]))

  for (const child of children) {
    if (child.url && !wanted.has(child.url)) await api.remove(child.id)
  }

  const existing = new Map()
  for (const child of await api.getChildren(folderId)) {
    if (child.url) existing.set(child.url, child)
  }

  let added = 0
  for (const item of items) {
    const node = existing.get(item.url)
    if (!node) {
      await api.create({ parentId: folderId, title: item.title, url: item.url })
      added++
    } else if (node.title !== item.title) {
      await api.update(node.id, { title: item.title })
    }
  }

  // Put links in list order at the top; anything else the user added sits below them.
  // Positions shift as we go, so read them fresh before each move.
  for (const [index, item] of items.entries()) {
    const current = (await api.getChildren(folderId)).find(c => c.url === item.url)
    if (current && current.index !== index) await api.move(current.id, { parentId: folderId, index })
  }
  return { added, total: items.length }
}

/** The Bookmarks bar, even with Chrome's newer split local/account bookmark storage. */
export async function bookmarksBarId(api) {
  const [root] = await api.getTree()
  const bars = root.children.filter(n => n.folderType === 'bookmarks-bar')
  return (bars.find(n => n.syncing) ?? bars[0] ?? root.children[0]).id
}
