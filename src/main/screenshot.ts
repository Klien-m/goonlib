/**
 * Keeping a frame of a video as a picture in its own right.
 *
 * The frame is pulled with ffmpeg rather than off a canvas in the window. A
 * canvas would only ever hold what is on screen - scaled to the player, and at
 * whatever the browser decided to decode - while ffmpeg gives the frame at the
 * source's own resolution, and does it without the window having to be showing
 * anything at all.
 *
 * The file lands beside the video it came from. That is the folder the library
 * already watches, so it belongs to the same source, survives a rescan, and is
 * somewhere the user can find it without being told where it went.
 */

import { readdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import sharp from 'sharp'
import { generateThumbnail } from './scan/thumbs'
import { applyProbeResult, setStageState, upsertMediaBatch } from './db/media'
import { getDb } from './db/index'
import { applyClassification, listAnnotations } from './db/labels'
import { getMediaLocation, listRoots } from './db/queries'
import { resolveWithinRoot } from './protocol/confine'
import { uniqueName } from './relocate'
import { runFfmpegCapture } from './media/ffmpeg-run'
import { findOrCreateTag, tagMedia } from './db/tags'

/** What the caller gets back: the new item, or why there isn't one. */
export interface ScreenshotResult {
  ok: boolean
  mediaId: number | null
  name: string | null
  message: string | null
}

const FAILED: ScreenshotResult = { ok: false, mediaId: null, name: null, message: null }

/** One decoded frame. Even 8K RGBA lands far under this. */
const MAX_BYTES = 256 * 1024 * 1024

/**
 * Saves the frame at `positionMs` next to the video, and files it like its
 * parent.
 *
 * PNG, because the point of a screenshot is the frame as it is - putting it
 * through a lossy encoder to save a few megabytes would be losing the thing
 * that was asked for.
 */
export async function screenshotVideo(mediaId: number, positionMs: number): Promise<ScreenshotResult> {
  const source = getMediaLocation(mediaId)
  if (!source) return { ...FAILED, message: 'That item is not in the library any more.' }
  if (source.kind !== 'video') return { ...FAILED, message: 'Only a video has frames to keep.' }

  const from = await resolveWithinRoot(source.rootPath, source.relPath)
  if (!from) return { ...FAILED, message: 'That file is not there any more.' }

  const root = listRoots().find((entry) => entry.path === source.rootPath)
  if (!root) return { ...FAILED, message: 'That source is not in the library any more.' }

  const current = source.relPath.split('/').pop() ?? source.relPath
  const dot = current.lastIndexOf('.')
  const stem = dot > 0 ? current.slice(0, dot) : current

  const dir = dirname(from)
  let taken: Set<string>
  try {
    taken = new Set(await readdir(dir))
  } catch (err) {
    return { ...FAILED, message: err instanceof Error ? err.message : String(err) }
  }

  // Never over something, even a screenshot of the same frame taken a minute
  // ago: two grabs of one video are two pictures, not one picture twice.
  const name = uniqueName(taken, `${stem}_screenshot.png`)
  const to = join(dir, name)

  let frame: Buffer
  try {
    frame = await capture(from, positionMs)
  } catch (err) {
    return { ...FAILED, message: err instanceof Error ? err.message : String(err) }
  }
  if (frame.length === 0) return { ...FAILED, message: 'Nothing came back for that frame.' }

  try {
    await writeFile(to, frame)
  } catch (err) {
    return { ...FAILED, message: err instanceof Error ? err.message : String(err) }
  }

  const relDir = source.relPath.includes('/')
    ? source.relPath.slice(0, source.relPath.lastIndexOf('/'))
    : ''
  const relPath = relDir === '' ? name : `${relDir}/${name}`

  const now = Date.now()
  let size = frame.length
  let mtime = now
  try {
    const info = await stat(to)
    size = info.size
    mtime = Math.round(info.mtimeMs)
  } catch {
    // The numbers above are close enough; the next scan corrects them.
  }

  upsertMediaBatch(root.id, [{ relPath, name, ext: '.png', kind: 'image', size, mtime }], now)

  const row = getDb()
    .prepare<[number, string], { id: number }>('SELECT id FROM media WHERE root_id = ? AND rel_path = ?')
    .get(root.id, relPath)
  if (!row) return { ...FAILED, message: 'The picture was saved but could not be filed.' }

  await inherit(mediaId, row.id, to)
  return { ok: true, mediaId: row.id, name, message: null }
}

/** The frame itself, as PNG bytes. */
async function capture(absPath: string, positionMs: number): Promise<Buffer> {
  // Seeking before -i is both the fast way and, since ffmpeg 2.1, the accurate
  // one: it jumps to the keyframe before the mark and decodes forward from
  // there. Which matters, because the frame asked for is the frame on screen.
  const at = Math.max(0, positionMs) / 1000

  return runFfmpegCapture(
    [
      '-v',
      'error',
      '-ss',
      at.toFixed(3),
      '-i',
      absPath,
      '-frames:v',
      '1',
      '-c:v',
      'png',
      '-f',
      'image2pipe',
      'pipe:1',
    ],
    { timeoutMs: 60_000, maxBytes: MAX_BYTES },
  )
}

/**
 * Gives the picture everything about the video that is still true of it.
 *
 * Tags and the model's reading of the content carry over: the frame is that
 * content, so whatever described the video describes this too. Its own size
 * comes from the file rather than from the video, and nothing derived from the
 * video's bytes - hashes, the sprite sheet - comes with it, because none of it
 * describes a picture.
 *
 * Favourites deliberately do not carry over. Hearting is something the user
 * did to one file, not a property of what is in the frame.
 */
async function inherit(sourceId: number, newId: number, absPath: string): Promise<void> {
  const annotations = listAnnotations(sourceId)
  const guessed = annotations.labels.filter((label) => label.source === 'ai')
  const chosen = annotations.labels.filter((label) => label.source !== 'ai')

  /*
   * A tag keeps the standing it had. Copying every tag by id would have put
   * the model's guesses on the picture as though the user had applied them by
   * hand, which is exactly what the AI pill exists to tell apart - so the
   * guesses go through the classification path and keep their confidence,
   * and only the user's own tags are attached as the user's own.
   */
  if (guessed.length > 0 || annotations.caption !== null) {
    try {
      applyClassification(newId, {
        labels: guessed.map((label) => ({ label: label.label, confidence: label.confidence ?? 0 })),
        caption: annotations.caption,
      })
    } catch (err) {
      console.error('[screenshot] could not carry the classification over', err)
    }
  }

  for (const label of chosen) {
    try {
      tagMedia(findOrCreateTag(label.label), [newId])
    } catch (err) {
      console.error('[screenshot] could not carry a tag over', err)
    }
  }

  try {
    const meta = await sharp(absPath).metadata()
    applyProbeResult(newId, {
      width: meta.width ?? null,
      height: meta.height ?? null,
      durationMs: null,
      vcodec: null,
      acodec: null,
      fps: null,
      playbackTier: null,
    })
  } catch (err) {
    console.error('[screenshot] could not read the picture back', err)
  }

  // A thumbnail now rather than at the next scan, so the grid has something to
  // show the moment the user goes looking for what they just took.
  try {
    await generateThumbnail({ id: newId, absPath, kind: 'image', durationMs: null })
    setStageState(newId, 'thumb_state', 'done')
  } catch (err) {
    console.error('[screenshot] could not make a thumbnail', err)
    setStageState(newId, 'thumb_state', 'pending')
  }
}
