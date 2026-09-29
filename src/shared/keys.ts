/**
 * Every keyboard shortcut, in one list.
 *
 * The keys used to be written into the handlers that answer them, which meant
 * nothing could show them and nothing could change them. Here each one is an
 * action with a default, the handlers ask this what an event means, and the
 * Shortcuts page both lists them and sets them.
 *
 * A binding is written the way it is read: "Space", "Shift+ArrowLeft",
 * "Mod+Z" — Mod being Cmd on a Mac and Ctrl everywhere else.
 */

/** Where a shortcut applies. A viewer one is dead while the viewer is closed. */
export type KeyContext = 'library' | 'viewer'

export interface KeyAction {
  id: string
  /**
   * A catalogue key, not the words. The list is built once at import, before
   * anything knows which language is showing, and the Shortcuts page is the
   * only place these are read.
   */
  label: string
  context: KeyContext
  /** Bindings this action answers to unless it has been changed. */
  defaults: string[]
  /** The catalogue key of the heading it sits under on the Shortcuts page. */
  group: string
}

export const KEY_ACTIONS: KeyAction[] = [
  // --- the library
  { id: 'library.search', label: 'Keys.library.search', context: 'library', defaults: ['Mod+F'], group: 'Keys.group.library' },
  { id: 'library.filters', label: 'Keys.library.filters', context: 'library', defaults: ['F'], group: 'Keys.group.library' },
  { id: 'library.kindAll', label: 'Keys.library.kindAll', context: 'library', defaults: ['1'], group: 'Keys.group.library' },
  { id: 'library.kindImages', label: 'Keys.library.kindImages', context: 'library', defaults: ['2'], group: 'Keys.group.library' },
  { id: 'library.kindVideos', label: 'Keys.library.kindVideos', context: 'library', defaults: ['3'], group: 'Keys.group.library' },
  { id: 'library.selectAll', label: 'Keys.library.selectAll', context: 'library', defaults: ['Mod+A'], group: 'Keys.group.library' },
  { id: 'library.trash', label: 'Keys.library.trash', context: 'library', defaults: ['Backspace', 'Delete'], group: 'Keys.group.library' },
  { id: 'library.undo', label: 'Keys.library.undo', context: 'library', defaults: ['Mod+Z'], group: 'Keys.group.library' },
  { id: 'library.redo', label: 'Keys.library.redo', context: 'library', defaults: ['Mod+Shift+Z', 'Mod+Y'], group: 'Keys.group.library' },

  // --- the viewer
  { id: 'viewer.close', label: 'Keys.viewer.close', context: 'viewer', defaults: ['Escape'], group: 'Keys.group.viewer' },
  { id: 'viewer.next', label: 'Keys.viewer.next', context: 'viewer', defaults: ['ArrowRight', ']'], group: 'Keys.group.viewer' },
  { id: 'viewer.previous', label: 'Keys.viewer.previous', context: 'viewer', defaults: ['ArrowLeft', '['], group: 'Keys.group.viewer' },
  { id: 'viewer.favorite', label: 'Keys.viewer.favorite', context: 'viewer', defaults: ['H'], group: 'Keys.group.viewer' },
  { id: 'viewer.trash', label: 'Keys.viewer.trash', context: 'viewer', defaults: ['Backspace', 'Delete'], group: 'Keys.group.viewer' },
  { id: 'viewer.shuffle', label: 'Keys.viewer.shuffle', context: 'viewer', defaults: ['S'], group: 'Keys.group.viewer' },
  { id: 'viewer.random', label: 'Keys.viewer.random', context: 'viewer', defaults: ['R'], group: 'Keys.group.viewer' },
  { id: 'viewer.loop', label: 'Keys.viewer.loop', context: 'viewer', defaults: ['O'], group: 'Keys.group.viewer' },
  { id: 'viewer.details', label: 'Keys.viewer.details', context: 'viewer', defaults: ['I'], group: 'Keys.group.viewer' },

  // --- playing
  { id: 'player.playPause', label: 'Keys.player.playPause', context: 'viewer', defaults: ['Space', 'K'], group: 'Keys.group.playing' },
  { id: 'player.back', label: 'Keys.player.back', context: 'viewer', defaults: ['J'], group: 'Keys.group.playing' },
  { id: 'player.forward', label: 'Keys.player.forward', context: 'viewer', defaults: ['L'], group: 'Keys.group.playing' },
  { id: 'player.backShort', label: 'Keys.player.backShort', context: 'viewer', defaults: ['Shift+ArrowLeft'], group: 'Keys.group.playing' },
  { id: 'player.forwardShort', label: 'Keys.player.forwardShort', context: 'viewer', defaults: ['Shift+ArrowRight'], group: 'Keys.group.playing' },
  { id: 'player.frameBack', label: 'Keys.player.frameBack', context: 'viewer', defaults: [','], group: 'Keys.group.playing' },
  { id: 'player.frameForward', label: 'Keys.player.frameForward', context: 'viewer', defaults: ['.'], group: 'Keys.group.playing' },
  { id: 'player.slower', label: 'Keys.player.slower', context: 'viewer', defaults: ['Shift+,'], group: 'Keys.group.playing' },
  { id: 'player.faster', label: 'Keys.player.faster', context: 'viewer', defaults: ['Shift+.'], group: 'Keys.group.playing' },
  { id: 'player.volumeUp', label: 'Keys.player.volumeUp', context: 'viewer', defaults: ['ArrowUp'], group: 'Keys.group.playing' },
  { id: 'player.volumeDown', label: 'Keys.player.volumeDown', context: 'viewer', defaults: ['ArrowDown'], group: 'Keys.group.playing' },
  { id: 'player.mute', label: 'Keys.player.mute', context: 'viewer', defaults: ['M'], group: 'Keys.group.playing' },
  { id: 'player.fullscreen', label: 'Keys.player.fullscreen', context: 'viewer', defaults: ['F'], group: 'Keys.group.playing' },

  // --- the toy, wherever you are
  { id: 'toy.stop', label: 'Keys.toy.stop', context: 'library', defaults: ['X'], group: 'Keys.group.toy' },

  // --- this list
  { id: 'app.shortcuts', label: 'Keys.app.shortcuts', context: 'library', defaults: ['?'], group: 'Keys.group.help' },
]

export type KeyBindings = Record<string, string[]>

/** The bindings as they come out of the box. */
export function defaultBindings(): KeyBindings {
  const out: KeyBindings = {}
  for (const action of KEY_ACTIONS) out[action.id] = [...action.defaults]
  return out
}

/** Stored bindings laid over the defaults, dropping anything unreadable. */
export function mergeBindings(stored: unknown): KeyBindings {
  const bindings = defaultBindings()
  if (!stored || typeof stored !== 'object') return bindings

  for (const [id, value] of Object.entries(stored as Record<string, unknown>)) {
    if (!KEY_ACTIONS.some((action) => action.id === id)) continue
    const keys = (Array.isArray(value) ? value : [value])
      .filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
      .map(normalizeBinding)
    bindings[id] = keys
  }
  return bindings
}

/**
 * One binding, written the way this file writes them: modifiers in a fixed
 * order, then the key, with single letters upper-cased.
 */
export function normalizeBinding(binding: string): string {
  const parts = binding.split('+').map((part) => part.trim()).filter(Boolean)
  const key = parts.pop() ?? ''
  const mods = new Set(parts.map((part) => part.toLowerCase()))

  const order = ['mod', 'alt', 'shift']
  const prefix = order.filter((mod) => mods.has(mod)).map((mod) => (mod === 'mod' ? 'Mod' : mod === 'alt' ? 'Alt' : 'Shift'))
  return [...prefix, key.length === 1 ? key.toUpperCase() : key].join('+')
}

/** What a keyboard event would be written as, or null for a modifier on its own. */
export function bindingFromEvent(event: {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
}): string | null {
  if (['Meta', 'Control', 'Alt', 'Shift'].includes(event.key)) return null

  const parts: string[] = []
  if (event.metaKey || event.ctrlKey) parts.push('Mod')
  if (event.altKey) parts.push('Alt')
  // Shift is part of the key for printable characters — Shift+/ is "?" — so it
  // is only named for the keys where it is not.
  const named = event.key === ' ' ? 'Space' : event.key
  if (event.shiftKey && (named.length > 1 || parts.length > 0)) parts.push('Shift')

  parts.push(named.length === 1 ? named.toUpperCase() : named)
  return parts.join('+')
}

/** How a binding should be read out: ⌘ on a Mac, Ctrl elsewhere. */
export function describeBinding(binding: string, mac: boolean): string {
  return binding
    .split('+')
    .map((part) => {
      if (part === 'Mod') return mac ? '⌘' : 'Ctrl'
      if (part === 'Shift') return mac ? '⇧' : 'Shift'
      if (part === 'Alt') return mac ? '⌥' : 'Alt'
      if (part === 'ArrowLeft') return '←'
      if (part === 'ArrowRight') return '→'
      if (part === 'ArrowUp') return '↑'
      if (part === 'ArrowDown') return '↓'
      return part
    })
    .join(mac ? '' : '+')
}

/** The action a keyboard event triggers in one context, or null. */
export function actionFor(
  bindings: KeyBindings,
  context: KeyContext,
  event: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean },
): string | null {
  const pressed = bindingFromEvent(event)
  if (pressed === null) return null

  for (const action of KEY_ACTIONS) {
    if (action.context !== context) continue
    if ((bindings[action.id] ?? []).includes(pressed)) return action.id
  }
  return null
}

/** Actions already answering to a binding, for warning about a clash. */
export function clashesWith(bindings: KeyBindings, context: KeyContext, binding: string, exceptId: string): string[] {
  return KEY_ACTIONS.filter(
    (action) =>
      action.id !== exceptId && action.context === context && (bindings[action.id] ?? []).includes(binding),
  ).map((action) => action.id)
}
