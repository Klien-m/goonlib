/**
 * Content fingerprints: whole-file below the threshold, ends above it.
 *
 * The files here are sparse, so "a film-sized file" costs a few kilobytes on
 * disk rather than gigabytes — the reads are clamped to what the file actually
 * holds, which is also what makes the head-only branch reachable.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  fingerprintFile,
  isSampled,
  SAMPLE_ABOVE_BYTES,
  SAMPLE_BYTES,
  SAMPLE_PREFIX,
} from '../src/main/scan/fingerprint'

const workspace = await mkdtemp(join(tmpdir(), 'goonlib-fingerprint-'))

afterAll(async () => {
  await rm(workspace, { recursive: true, force: true })
})

let counter = 0
async function write(bytes: Buffer, size = bytes.length): Promise<string> {
  counter += 1
  const path = join(workspace, `file-${counter}.bin`)
  await writeFile(path, bytes)

  // Sparse: declaring a size bigger than the bytes written is a metadata change,
  // not an allocation, and the tail reads as zeros.
  if (size > bytes.length) {
    const { truncate } = await import('node:fs/promises')
    await truncate(path, size)
  }

  return path
}

describe('fingerprintFile', () => {
  it('reads a small file whole, and says so', async () => {
    const path = await write(Buffer.from('a small photo'))
    const result = await fingerprintFile(path, 13)

    expect(result.sampled).toBe(false)
    expect(isSampled(result.hash)).toBe(false)
    expect(result.hash).toHaveLength(64)
  })

  it('gives byte-identical small files the same fingerprint', async () => {
    const first = await fingerprintFile(await write(Buffer.from('same bytes')), 10)
    const second = await fingerprintFile(await write(Buffer.from('same bytes')), 10)

    expect(first.hash).toBe(second.hash)
  })

  it('marks a film as sampled rather than reading all of it', async () => {
    const size = SAMPLE_ABOVE_BYTES + 1
    const path = await write(Buffer.alloc(4096), size)
    const result = await fingerprintFile(path, size)

    expect(result.sampled).toBe(true)
    expect(isSampled(result.hash)).toBe(true)
    expect(result.hash.startsWith(SAMPLE_PREFIX)).toBe(true)
  })

  it('gives two films of the same length and the same ends the same fingerprint', async () => {
    const size = SAMPLE_ABOVE_BYTES * 2
    const head = Buffer.alloc(SAMPLE_BYTES, 7)

    const first = await fingerprintFile(await write(head, size), size)
    const second = await fingerprintFile(await write(head, size), size)

    expect(first.hash).toBe(second.hash)
  })

  it('tells two films of the same length apart when their openings differ', async () => {
    const size = SAMPLE_ABOVE_BYTES * 2
    const first = await fingerprintFile(
      await write(Buffer.alloc(SAMPLE_BYTES, 1), size),
      size,
    )
    const second = await fingerprintFile(
      await write(Buffer.alloc(SAMPLE_BYTES, 2), size),
      size,
    )

    expect(first.hash).not.toBe(second.hash)
  })

  it('tells two films with the same ends apart when their lengths differ', async () => {
    const head = Buffer.alloc(SAMPLE_BYTES, 5)

    const first = await fingerprintFile(
      await write(head, SAMPLE_ABOVE_BYTES),
      SAMPLE_ABOVE_BYTES,
    )
    const second = await fingerprintFile(
      await write(head, SAMPLE_ABOVE_BYTES * 3),
      SAMPLE_ABOVE_BYTES * 3,
    )

    expect(first.hash).not.toBe(second.hash)
  })

  it('copes with a film shorter than its recorded size', async () => {
    // What a file still being written to looks like: the walk said gigabytes, the
    // disk has a few bytes. The reads are clamped, so it answers rather than
    // throwing an out-of-range error.
    const path = await write(Buffer.from('only a few bytes'))

    const result = await fingerprintFile(path, SAMPLE_ABOVE_BYTES * 4)

    expect(result.sampled).toBe(true)
    expect(result.hash).toHaveLength(SAMPLE_PREFIX.length + 64)
  })

  it('never lets a sampled digest pass as a whole-file one', async () => {
    const size = SAMPLE_ABOVE_BYTES
    const sampled = await fingerprintFile(await write(Buffer.alloc(1024), size), size)

    // The marker is what keeps a sampled film from ever grouping with a file that
    // was genuinely read from end to end.
    expect(isSampled(sampled.hash)).toBe(true)
    expect(isSampled(null)).toBe(false)
    expect(isSampled('0123456789abcdef')).toBe(false)
  })
})
