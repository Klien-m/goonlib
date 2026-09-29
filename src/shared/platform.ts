/**
 * What the app calls things on each platform.
 *
 * Three platforms means three names for the same thing in a handful of places -
 * the file manager, the Trash, the way a tunnel is installed - and the wording
 * has to match whichever machine the window is on. Keeping the words here, as
 * functions of a platform rather than of the machine this process happens to be
 * running on, means both sides can use them and both can be tested.
 *
 * What they return is a catalogue key rather than the words themselves: the
 * names are part of the interface, so they are translated like everything else,
 * and a `{place}` is what says which platform's name to put in it. The key is
 * picked by platform, the sentence by language.
 */

import type { Platform } from './types'

/** What "show me this file" is called. */
export function revealLabelKey(platform: Platform): string {
  if (platform === 'darwin') return 'Platform.reveal.mac'
  if (platform === 'win32') return 'Platform.reveal.windows'
  return 'Platform.reveal.linux'
}

/** The short version, for a button with no room for the rest. */
export function revealShortKey(platform: Platform): string {
  return platform === 'darwin' ? 'Platform.revealShort.mac' : 'Platform.revealShort.other'
}

/** Where a deleted file goes, by name. */
export function trashNameKey(platform: Platform): string {
  return platform === 'win32' ? 'Platform.trash.windows' : 'Platform.trash.other'
}

/**
 * How cloudflared is installed here, or null where there is no single command
 * to give. It is the tunnel Watch Together reaches for first; on Linux it is a
 * different command on every distribution, so there it is named rather than
 * typed out.
 */
export function cloudflaredInstall(platform: Platform): string | null {
  if (platform === 'darwin') return 'brew install cloudflared'
  if (platform === 'win32') return 'winget install --id Cloudflare.cloudflared'
  return null
}

/** How ffmpeg is usually installed here, for the message that asks for it. */
export function ffmpegInstallHint(platform: Platform): string {
  if (platform === 'darwin') return 'e.g. `brew install ffmpeg`'
  if (platform === 'win32') return 'e.g. `winget install ffmpeg`'
  return 'e.g. `apt install ffmpeg`'
}
