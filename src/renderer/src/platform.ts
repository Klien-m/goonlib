/**
 * Which machine the window is on, read once.
 *
 * Three things differ between platforms once the app is built for all of them:
 * the strip of window the macOS traffic lights sit in, the name of the file
 * manager and the Trash, and the name of the modifier key. The platform comes
 * across the bridge as a plain value rather than being asked for at the moment
 * it is needed, and which words go with it is worked out in shared/platform.ts -
 * as catalogue keys, since the words are translated.
 */

import {
  cloudflaredInstall,
  revealLabelKey,
  revealShortKey,
  trashNameKey,
} from '@shared/platform'
import type { Platform } from '@shared/types'

export const PLATFORM: Platform = window.goonlib?.app?.platform ?? 'darwin'

export const IS_MAC = PLATFORM === 'darwin'
export const IS_WINDOWS = PLATFORM === 'win32'

/**
 * The names this platform gives things, as catalogue keys rather than words.
 *
 * Kept as keys so that `t()` can fill the one currently showing: these are
 * interface text, and a platform name is no reason for a line to be the only
 * English one on a Chinese screen.
 */
export const REVEAL_LABEL_KEY = revealLabelKey(PLATFORM)
export const REVEAL_SHORT_KEY = revealShortKey(PLATFORM)
export const TRASH_NAME_KEY = trashNameKey(PLATFORM)

export const CLOUDFLARED_INSTALL = cloudflaredInstall(PLATFORM)

/**
 * Measures a scrollbar once and publishes it as `--scrollbar`.
 *
 * The library reserves a scrollbar gutter on both edges and works its columns
 * out from what is left; the Continue watching row above it has no scrollbar.
 * Unless the row subtracts the same amount, the two land on different column
 * counts at certain window widths and stop lining up. The width differs by
 * platform and by the `thin` keyword, so it is measured rather than assumed.
 */
export function measureScrollbar(): void {
  const probe = document.createElement('div')
  probe.style.cssText =
    'position:absolute;top:-9999px;width:100px;height:100px;overflow:scroll;scrollbar-width:thin'
  document.body.append(probe)
  const width = probe.offsetWidth - probe.clientWidth
  probe.remove()
  document.documentElement.style.setProperty('--scrollbar', `${width}px`)
}

/**
 * Marks the document with the platform so the stylesheet can lay the chrome out
 * for it. Called before the first render: the top of the window is 22px taller
 * on macOS, and moving it after paint would be visible.
 */
export function markPlatform(): void {
  document.documentElement.dataset['platform'] = PLATFORM
}
