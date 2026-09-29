/**
 * Sampled fingerprints against a real database.
 *
 * The parts worth pinning down are the ones a user would only notice when it was
 * too late: that "identical" stops being claimed for films fingerprinted from
 * their ends, that the two schemes never group together, and that the re-read
 * pass queues the films that need it and then stops queueing anything.
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const workspace = await mkdtemp(join(tmpdir(), 'goonlib-dupes-'))

vi.mock('electron', () => ({
  app: { getPath: () => workspace },
}))

const { initDb, closeDb, getDb } = await import('../src/main/db')
const { addRoot } = await import('../src/main/db/queries')
const {
  applyHashResult,
  claimPending,
  queueOutdatedFingerprints,
  upsertMediaBatch,
} = await import('../src/main/db/media')
const { findExactDuplicates, fingerprintGap } = await import('../src/main/db/duplicates')
const { SAMPLE_ABOVE_BYTES, SAMPLE_PREFIX } = await import('../src/main/scan/fingerprint')

const FILM = SAMPLE_ABOVE_BYTES
const PHOTO = 1024

let rootId: number
const ids: Record<string, number> = {}

function entry(name: string, size: number): Parameters<typeof upsertMediaBatch>[1][number] {
  const video = name.endsWith('.mp4')
  return {
    relPath: name,
    name,
    ext: video ? '.mp4' : '.jpg',
    kind: video ? 'video' : 'image',
    size,
    mtime: 1,
  }
}

beforeAll(() => {
  initDb(join(workspace, 'test.db'))
  rootId = addRoot(workspace).id
  upsertMediaBatch(
    rootId,
    [entry('film-a.mp4', FILM), entry('film-b.mp4', FILM), entry('photo.jpg', PHOTO)],
    Date.now(),
  )

  const rows = getDb().prepare('SELECT id, name FROM media').all() as Array<{
    id: number
    name: string
  }>
  for (const row of rows) ids[row.name] = row.id
})

afterAll(async () => {
  closeDb()
  await rm(workspace, { recursive: true, force: true })
})

describe('exact duplicates from sampled fingerprints', () => {
  it('reports two films read from their ends as an exact group, and says so', () => {
    applyHashResult(ids['film-a.mp4']!, {
      contentHash: `${SAMPLE_PREFIX}deadbeef`,
      sampled: true,
      phash: null,
    })
    applyHashResult(ids['film-b.mp4']!, {
      contentHash: `${SAMPLE_PREFIX}deadbeef`,
      sampled: true,
      phash: null,
    })
    applyHashResult(ids['photo.jpg']!, { contentHash: 'cafe', sampled: false, phash: null })

    const [group] = findExactDuplicates()

    expect(group).toBeDefined()
    expect(group?.kind).toBe('exact')
    expect(group?.sampled).toBe(true)
    expect(group?.items.map((item) => item.name).sort()).toEqual([
      'film-a.mp4',
      'film-b.mp4',
    ])
  })

  it('never groups a film fingerprinted from its ends with one read whole', () => {
    // The marker in the digest is what makes this impossible rather than
    // unlikely: two schemes that never produce the same string never group.
    const rows = getDb().prepare('SELECT id, name FROM media').all() as Array<{
      id: number
      name: string
    }>
    expect(rows).toHaveLength(3)

    applyHashResult(ids['photo.jpg']!, {
      contentHash: `${SAMPLE_PREFIX}deadbeef`,
      sampled: false,
      phash: null,
    })

    // Stored whole-file, so it cannot join the sampled group even though the
    // digests look alike.
    expect(findExactDuplicates()).toHaveLength(1)
  })

  it('keeps the content hash a bare digest, with the scheme in its own column', () => {
    const stored = getDb()
      .prepare<[number], { content_hash: string; content_sampled: number }>(
        'SELECT content_hash, content_sampled FROM media WHERE id = ?',
      )
      .get(ids['photo.jpg']!)!

    // Stored stripped of the prefix it arrived with, exactly as the scan would
    // have produced it.
    expect(stored.content_hash).toBe('deadbeef')
    expect(stored.content_sampled).toBe(0)
  })
})

describe('the re-read pass', () => {
  it('queues films whose stored fingerprint is not the one today would produce', () => {
    getDb()
      .prepare("UPDATE media SET content_hash = 'old', content_sampled = 0, hash_state = 'done'")
      .run()

    // Both films and the photo: all three were hashed whole, and the films
    // should not have been.
    expect(queueOutdatedFingerprints()).toBe(2)
    expect(claimPending('hash_state', 10).map((item) => item.id).sort()).toEqual(
      [ids['film-a.mp4'], ids['film-b.mp4']].sort(),
    )

    // The photo was already right, so it was left alone.
    const photo = getDb()
      .prepare<[number], { hash_state: string }>('SELECT hash_state FROM media WHERE id = ?')
      .get(ids['photo.jpg']!)!
    expect(photo.hash_state).toBe('done')
  })

  it('is free once every row has been fingerprinted the current way', () => {
    for (const name of ['film-a.mp4', 'film-b.mp4']) {
      applyHashResult(ids[name]!, {
        contentHash: `${SAMPLE_PREFIX}abc`,
        sampled: true,
        phash: null,
      })
    }
    getDb()
      .prepare("UPDATE media SET content_hash = 'x', content_sampled = 0, hash_state = 'done'")
      .run()
    queueOutdatedFingerprints()

    for (const name of ['film-a.mp4', 'film-b.mp4']) {
      applyHashResult(ids[name]!, {
        contentHash: `${SAMPLE_PREFIX}abc`,
        sampled: true,
        phash: null,
      })
    }

    expect(queueOutdatedFingerprints()).toBe(0)
  })

  it('counts what is missing, split by whether it was ever hashed', () => {
    getDb()
      .prepare("UPDATE media SET content_hash = NULL, content_sampled = 0, hash_state = 'done'")
      .run()
    getDb()
      .prepare(
        "UPDATE media SET content_hash = 'old', content_sampled = 0, hash_state = 'done' WHERE size >= ?",
      )
      .run(SAMPLE_ABOVE_BYTES)
    getDb()
      .prepare("UPDATE media SET hash_state = 'pending' WHERE name = 'photo.jpg'")
      .run()

    expect(fingerprintGap()).toEqual({ pending: 1, outdated: 2 })
  })
})
