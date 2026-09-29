/**
 * Applying the current schema to a library that predates it.
 *
 * The upgrade path is the one thing that can't be tested by starting fresh: an
 * existing user's database already has rows, and a migration that drops or
 * mis-defaults them loses real data. This builds a database at the previous
 * version, fills it the way a real one would be filled, and runs what an update
 * runs.
 */

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterAll, describe, expect, it } from 'vitest'
import { migrations } from '../src/main/db/migrations'

const workspace = mkdtempSync(join(tmpdir(), 'goonlib-migrations-'))
const LATEST = Math.max(...migrations.map((migration) => migration.version))

/** A database as it stood at `version` ago, with one row in it. */
function atVersion(version: number): Database.Database {
  const db = new Database(join(workspace, `v${version}.db`))
  for (const migration of migrations.filter((m) => m.version <= version)) {
    db.exec(migration.sql)
    db.pragma(`user_version = ${migration.version}`)
  }

  db.prepare("INSERT INTO roots (path, enabled, added_at) VALUES ('/library', 1, 1)").run()
  // A film, fingerprinted whole the way the version it was scanned under did.
  db.prepare(
    `INSERT INTO media
       (root_id, rel_path, name, ext, kind, size, mtime, content_hash, phash, hash_state, added_at, seen_at)
     VALUES (1, 'film.mp4', 'film.mp4', '.mp4', 'video', 2000000000, 1, 'abc123', 'ff00', 'done', 1, 1)`,
  ).run()

  return db
}

afterAll(() => {
  // Kept on disk for the run; removed with the temp directory the OS manages.
})

describe('the schema an update applies', () => {
  it('leaves an existing library intact and marks old hashes as whole-file', () => {
    const db = atVersion(LATEST - 1)

    for (const migration of migrations.filter((m) => m.version === LATEST)) {
      db.exec(migration.sql)
      db.pragma(`user_version = ${migration.version}`)
    }

    const row = db
      .prepare('SELECT content_hash, content_sampled, hash_state FROM media')
      .get() as { content_hash: string; content_sampled: number; hash_state: string }

    // Nothing was lost, and the row says it was hashed whole — which is what the
    // scan reads to know this film has to be fingerprinted again.
    expect(row).toEqual({ content_hash: 'abc123', content_sampled: 0, hash_state: 'done' })
    expect(db.pragma('user_version', { simple: true })).toBe(LATEST)

    db.close()
  })

  it('defaults the column for rows inserted after the upgrade', () => {
    const db = atVersion(LATEST)

    db.prepare(
      `INSERT INTO media
         (root_id, rel_path, name, ext, kind, size, mtime, added_at, seen_at)
       VALUES (1, 'new.jpg', 'new.jpg', '.jpg', 'image', 100, 1, 1, 1)`,
    ).run()

    const row = db
      .prepare("SELECT content_sampled FROM media WHERE name = 'new.jpg'")
      .get() as { content_sampled: number }

    expect(row.content_sampled).toBe(0)
    db.close()
  })
})
