import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildEvent, optedOut, readRef, referringDomain } from '../src/analytics.js'

const base = { key: 'phc_test', sessionId: 's1', path: '/', ref: null, referringDomain: null, now: new Date('2026-11-28T00:00:00Z') }

test('Do Not Track and Global Privacy Control turn tracking off', () => {
  assert.equal(optedOut({ doNotTrack: '1' }), true)
  assert.equal(optedOut({ msDoNotTrack: '1' }), true)
  assert.equal(optedOut({ doNotTrack: null }, { doNotTrack: '1' }), true)
  assert.equal(optedOut({ doNotTrack: 'unspecified', globalPrivacyControl: true }), true)
  assert.equal(optedOut({ doNotTrack: '0' }), false)
  assert.equal(optedOut({ doNotTrack: null }), false)
  assert.equal(optedOut(undefined), true)
})

test('ref is limited to known channels', () => {
  assert.equal(readRef('?ref=reddit'), 'reddit')
  assert.equal(readRef('?ref=HN'), 'hn')
  assert.equal(readRef('?utm_source=x&ref=li'), 'li')
  assert.equal(readRef('?ref=someone@example.com'), 'other')
  assert.equal(readRef(''), null)
  assert.equal(readRef('?ref='), null)
})

test('referring domain drops path, query and own site', () => {
  assert.equal(referringDomain('https://www.reddit.com/r/ArcBrowser/comments/abc?x=1', 'arc-to-chrome.vercel.app'), 'www.reddit.com')
  assert.equal(referringDomain('https://arc-to-chrome.vercel.app/', 'arc-to-chrome.vercel.app'), null)
  assert.equal(referringDomain('', 'arc-to-chrome.vercel.app'), null)
  assert.equal(referringDomain('not a url', 'arc-to-chrome.vercel.app'), null)
})

test('events carry no person profile and only allowed properties', () => {
  const e = buildEvent({
    ...base,
    event: 'profile_file_downloaded',
    ref: 'reddit',
    referringDomain: 'www.reddit.com',
    props: { source: 'bundle', spaces: 3, links: 41.7, first_in_session: true, title: 'My Work Space', url: 'https://secret.example/x' },
  })
  assert.equal(e.api_key, 'phc_test')
  assert.equal(e.distinct_id, 's1')
  assert.equal(e.timestamp, '2026-11-28T00:00:00.000Z')
  assert.deepEqual(e.properties, {
    $process_person_profile: false,
    $current_url: 'https://arc-to-chrome.vercel.app/',
    $pathname: '/',
    ref: 'reddit',
    $referring_domain: 'www.reddit.com',
    source: 'bundle',
    spaces: 3,
    links: 42,
    first_in_session: true,
  })
})

test('unknown events and a missing key send nothing', () => {
  assert.equal(buildEvent({ ...base, event: 'bookmark_title' }), null)
  assert.equal(buildEvent({ ...base, key: '', event: '$pageview' }), null)
  assert.ok(buildEvent({ ...base, event: '$pageview' }))
})
