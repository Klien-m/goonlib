/**
 * Stage 5 of the scan: hashes for duplicate detection.
 *
 * Two hashes per item:
 *
 *  - `contentHash` answers "identical file". For everything under a gigabyte it
 *    is a straight SHA-256 of the whole file, streamed, with no false positives.
 *    For a film it is a SHA-256 of the file's length and its first and last 8MB
 *    instead — the trade and its one caveat are argued in fingerprint.ts, which
 *    is where the decision lives. Either way the value says which it is.
 *
 *  - `phash` is perceptual, computed from the thumbnail we already generated, and
 *    catches re-encodes and rescales that a content hash cannot.
 */

import sharp from 'sharp'
import { fingerprintFile } from './fingerprint'
import { HASH_SIZE, perceptualHash } from './phash'

export interface HashResult {
  contentHash: string
  /** True when contentHash covers the file's ends rather than all of it. */
  sampled: boolean
  phash: string | null
}

/**
 * Perceptual hash of an already-generated thumbnail.
 *
 * Hashing the thumbnail rather than the source is deliberate: it's a fixed-size
 * decode of a small file instead of re-decoding a video, and both files having
 * been through the same thumbnail pipeline removes a source of variation.
 */
export async function hashThumbnail(thumbPath: string): Promise<string | null> {
  const pixels = await sharp(thumbPath)
    .greyscale()
    // `fill` on purpose: aspect ratio is not what we're comparing, and letterbox
    // padding would dominate the low frequencies the hash is built from.
    .resize(HASH_SIZE, HASH_SIZE, { fit: 'fill' })
    .raw()
    .toBuffer()

  return perceptualHash(pixels)
}

/**
 * Both hashes for one item. A missing or unreadable thumbnail yields a null
 * perceptual hash rather than failing the whole stage — the content hash is the
 * more important of the two.
 */
export async function hashItem(
  absPath: string,
  size: number,
  thumbPath: string | null,
  signal?: AbortSignal,
): Promise<HashResult> {
  const { hash: contentHash, sampled } = await fingerprintFile(absPath, size, signal)

  let phash: string | null = null
  if (thumbPath) {
    try {
      phash = await hashThumbnail(thumbPath)
    } catch {
      phash = null
    }
  }

  return { contentHash, sampled, phash }
}
