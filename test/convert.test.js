import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseSidebar, parseMarkdown, toNetscapeHTML, groupByProfile } from '../src/convert.js'

const tab = (id, parentID, url, title = null) => ({
  id, parentID, title, childrenIds: [], data: { tab: { savedURL: url, savedTitle: `Saved ${id}` } },
})

const sidebar = {
  sidebar: {
    containers: [
      { global: {} },
      {
        topAppsContainerIDs: [{ default: true }, 'favs', { custom: { _0: { directoryBasename: 'Profile 2' } } }, 'favs2'],
        spaces: [
          'space1',
          { id: 'space1', title: 'Personal', profile: { default: true }, containerIDs: ['pinned', 'p1', 'unpinned', 'u1'] },
        ],
        items: [
          { id: 'favs', childrenIds: ['f1'], data: { itemContainer: {} } },
          tab('f1', 'favs', 'https://mail.google.com', 'Gmail'),
          { id: 'favs2', childrenIds: ['f2'], data: { itemContainer: {} } },
          tab('f2', 'favs2', 'https://orphan.example'),
          { id: 'p1', childrenIds: ['folder', 't1'], data: { itemContainer: {} } },
          { id: 'folder', title: 'Docs <&>', childrenIds: ['t2'], data: { list: {} } },
          tab('t1', 'p1', 'https://a.example/?x=1&y=2'),
          tab('t2', 'folder', 'https://b.example'),
          { id: 'u1', childrenIds: ['t3'], data: { itemContainer: {} } },
          tab('t3', 'u1', 'https://open.example'),
        ],
      },
    ],
  },
}

test('parseSidebar builds spaces with favorites, folders and unpinned tabs', () => {
  const { spaces, stats } = parseSidebar(sidebar, { profileNames: { 'Profile 2': 'Old' } })
  assert.equal(stats.links, 5)
  const [personal, orphan] = spaces
  assert.deepEqual(personal.root.children.map(n => n.title), [
    'Favorites', 'Docs <&>', 'Saved t1', 'Open tabs (unpinned)',
  ])
  assert.equal(personal.root.children[0].children[0].title, 'Gmail')
  assert.equal(orphan.title, 'Old (no space)')
})

test('parseSidebar can skip unpinned tabs', () => {
  const { spaces } = parseSidebar(sidebar, { includeUnpinned: false })
  assert.ok(!spaces[0].root.children.some(n => n.title === 'Open tabs (unpinned)'))
})

test('parseMarkdown nests headings and reads links', () => {
  const { spaces, stats } = parseMarkdown(
    '# Space\n\n## Favorites\n- https://a.example\n\n### Sub\n- [B](https://b.example)\n\n# Empty\n',
  )
  assert.equal(stats.links, 2)
  assert.equal(spaces.length, 2)
  const favs = spaces[0].root.children[0]
  assert.equal(favs.title, 'Favorites')
  assert.equal(favs.children[1].title, 'Sub')
  assert.equal(favs.children[1].children[0].title, 'B')
})

test('toNetscapeHTML escapes titles and URLs', () => {
  const { spaces } = parseSidebar(sidebar)
  const html = toNetscapeHTML(groupByProfile(spaces)[0].nodes, { addDate: 1 })
  assert.match(html, /^<!DOCTYPE NETSCAPE-Bookmark-file-1>/)
  assert.match(html, /<H3 ADD_DATE="1">Docs &lt;&amp;&gt;<\/H3>/)
  assert.match(html, /HREF="https:\/\/a\.example\/\?x=1&amp;y=2"/)
})

test('prettyTitle makes readable names from bare URLs', async () => {
  const { prettyTitle } = await import('../src/convert.js')
  assert.equal(prettyTitle('https://mail.google.com'), 'Gmail')
  assert.equal(prettyTitle('https://drive.google.com/file/d/1riaSEARxxMUS01x55VK04xh0Q0VCAD7n/view'), 'Google Drive file · 1riaSE')
  assert.equal(prettyTitle('https://github.com/vercel/next.js/pull/1482'), 'next.js PR #1482')
  assert.equal(prettyTitle('https://news.ycombinator.com/submit'), 'news.ycombinator.com › submit')
  assert.equal(prettyTitle('https://www.japan-guide.com/e/e2164.html'), 'japan-guide.com')
  assert.equal(prettyTitle('not a url'), 'not a url')
})
