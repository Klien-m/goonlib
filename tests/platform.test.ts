/**
 * What the app calls things on each platform.
 *
 * The renderer binds these to the platform the bridge reports and the main
 * process to its own; what is worth testing is which name is picked. The words
 * themselves are catalogue entries, so that the name of the Trash is translated
 * like everything else - see tests/i18n.test.ts for the other half.
 */

import { describe, expect, it } from 'vitest'
import {
  cloudflaredInstall,
  ffmpegInstallHint,
  revealLabelKey,
  revealShortKey,
  trashNameKey,
} from '../src/shared/platform'
import { catalogueFor } from '../src/shared/i18n'

/** The key, said in English, which is where the original wording lives. */
const en = catalogueFor('en')

describe('naming things the way the platform does', () => {
  it('names the file manager', () => {
    expect(en[revealLabelKey('darwin')]).toBe('Reveal in Finder')
    expect(en[revealLabelKey('win32')]).toBe('Show in Explorer')
    expect(en[revealLabelKey('linux')]).toBe('Show in file manager')
  })

  it('shortens it for a button with no room', () => {
    expect(en[revealShortKey('darwin')]).toBe('Reveal')
    expect(en[revealShortKey('win32')]).toBe('Show')
    expect(en[revealShortKey('linux')]).toBe('Show')
  })

  it('calls the Trash the Recycle Bin on Windows only', () => {
    expect(en[trashNameKey('darwin')]).toBe('Trash')
    expect(en[trashNameKey('linux')]).toBe('Trash')
    expect(en[trashNameKey('win32')]).toBe('Recycle Bin')
  })

  it('gives the cloudflared command only where there is one', () => {
    expect(cloudflaredInstall('darwin')).toBe('brew install cloudflared')
    expect(cloudflaredInstall('win32')).toContain('winget')
    // Every distribution installs it differently, so Linux is told to find it
    // rather than given a command that is wrong on most of them.
    expect(cloudflaredInstall('linux')).toBeNull()
  })

  it('names the package manager that has ffmpeg', () => {
    expect(ffmpegInstallHint('darwin')).toContain('brew')
    expect(ffmpegInstallHint('win32')).toContain('winget')
    expect(ffmpegInstallHint('linux')).toContain('apt')
  })
})
