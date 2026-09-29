/**
 * Content fingerprints, sized to the file they are for.
 *
 * A whole-file SHA-256 is the only thing that can say "byte-for-byte identical"
 * with no false positives, and for photos and short clips it is cheap enough to
 * keep. For a feature-length film it means reading several gigabytes to answer a
 * question the file's own length has already answered: two files that differ in
 * length are not identical, and no amount of hashing changes that.
 *
 * So anything at or above SAMPLE_ABOVE_BYTES is fingerprinted from its length
 * plus its first and last SAMPLE_BYTES instead of all of it. A film is four
 * gigabytes; that is 16MB of reading rather than 4GB. It is not a guess about
 * which parts matter — a video's opening and closing are the parts it shares
 * with nothing else.
 *
 * Stated plainly, because it matters: a sampled fingerprint can, in principle,
 * call two different files the same — two cuts of one film that agree for their
 * first and last 8MB. It cannot *miss* a duplicate: files that really are
 * identical still fingerprint identically. That is the direction worth being
 * sure about, since the duplicates screen offers to delete what it finds.
 */

import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { open } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'

/**
 * Files this size or larger are sampled rather than read whole.
 *
 * One gigabyte: below it the full read costs a second or two even on a spinning
 * disk, which is not worth trading exactness for. Above it the read is where the
 * scan's time goes — 300GB of films is minutes to an hour of pure I/O against
 * seconds when only the ends are read.
 */
export const SAMPLE_ABOVE_BYTES = 1024 ** 3

/** How much of each end a sampled fingerprint covers. */
export const SAMPLE_BYTES = 8 * 1024 ** 2

/**
 * Marks a fingerprint taken from a file's ends rather than all of it.
 *
 * Stored as part of the value, so a library fingerprinted one way and later the
 * other way never reads as a mismatch — the two schemes simply never collide.
 */
export const SAMPLE_PREFIX = 's1:'

export interface ContentFingerprint {
  /** A full-file SHA-256 digest, or a sampled one with SAMPLE_PREFIX in front. */
  hash: string
  /** True when the value came from the ends of the file rather than all of it. */
  sampled: boolean
}

/** Whether a stored fingerprint value is a sampled one. */
export function isSampled(hash: string | null): boolean {
  return hash !== null && hash.startsWith(SAMPLE_PREFIX)
}

/** Streams the whole file through SHA-256 without holding it in memory. */
async function hashWholeFile(absPath: string, signal?: AbortSignal): Promise<string> {
  const digest = createHash('sha256')
  await pipeline(createReadStream(absPath), digest, { signal })
  return digest.digest('hex')
}

/** The file's length, then its head, then its tail, as one digest input. */
async function hashEnds(absPath: string, size: number): Promise<string> {
  const handle = await open(absPath, 'r')
  try {
    // Both reads are clamped to what is actually there, so a file that shrank
    // since the walk (or is still being written) yields an answer rather than an
    // out-of-range error.
    const head = Buffer.alloc(Math.min(SAMPLE_BYTES, size))
    const headRead = await handle.read(head, 0, head.length, 0)

    if (size <= SAMPLE_BYTES * 2) {
      // Short enough that the two ends would overlap; the head is the file.
      return digestOf(size, [head.subarray(0, headRead.bytesRead)])
    }

    const tail = Buffer.alloc(SAMPLE_BYTES)
    const tailRead = await handle.read(tail, 0, tail.length, size - SAMPLE_BYTES)

    return digestOf(size, [
      head.subarray(0, headRead.bytesRead),
      tail.subarray(0, tailRead.bytesRead),
    ])
  } finally {
    await handle.close()
  }
}

function digestOf(size: number, ends: Buffer[]): string {
  const digest = createHash('sha256')
  // The length goes in first, so a file that only agrees on its ends cannot
  // collide with a longer one that agrees on the same ends.
  digest.update(String(size))
  for (const end of ends) digest.update(end)
  return digest.digest('hex')
}

/**
 * The fingerprint for one file.
 *
 * `size` is the one the walk recorded, and it decides which scheme applies. If
 * the file's ends cannot be read — it went away between the walk and now — this
 * throws, and the stage leaves the row pending for the next pass rather than
 * inventing a digest from nothing.
 */
export async function fingerprintFile(
  absPath: string,
  size: number,
  signal?: AbortSignal,
): Promise<ContentFingerprint> {
  if (size < SAMPLE_ABOVE_BYTES) {
    return { hash: await hashWholeFile(absPath, signal), sampled: false }
  }

  signal?.throwIfAborted()
  return { hash: `${SAMPLE_PREFIX}${await hashEnds(absPath, size)}`, sampled: true }
}
