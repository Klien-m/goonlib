import { useCallback, useEffect, useRef, useState } from 'react'

/** The shape this menu needs. Both `Collection` and `Tag` satisfy it. */
export interface NamedList {
  id: number
  name: string
  count: number
}

export interface AddToCollectionProps {
  collections: NamedList[]
  /** Called with an existing id, or a name to create one. */
  onAdd: (target: { id: number } | { name: string }) => void
  label?: string
  placeholder?: string
  emptyText?: string
  /** Rendered with a check beside them, for a list the item already belongs to. */
  activeIds?: ReadonlySet<number>
  /**
   * Takes the item back out of one it is in. Given this, the menu is a
   * multi-select: clicking a ticked entry removes, an unticked one adds, and
   * the menu stays open, so an accidental pick is one click to undo.
   */
  onRemove?: (id: number) => void
}

/**
 * A small menu for filing the current item into a collection or a tag.
 *
 * One box does both jobs: it narrows the list as you type, and what you typed
 * becomes a new entry if you want it. A library with two hundred tags is not
 * a list you scroll, and having typed the name already, being made to scroll
 * for it is the wrong answer - so the box sits at the top, where you are
 * looking, rather than under a list you were never meant to read.
 *
 * Enter on a name that already exists files into that one rather than making
 * a second of it. The database would have matched them anyway, case and all;
 * this just means the menu does not lie about what is happening.
 */
export function AddToCollection(props: AddToCollectionProps): React.JSX.Element {
  const { collections, onAdd } = props

  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const shellRef = useRef<HTMLDivElement | null>(null)

  // Close when clicking anywhere else.
  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: MouseEvent): void => {
      if (!shellRef.current?.contains(event.target as Node)) setOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  const multi = props.onRemove !== undefined

  const needle = draft.trim().toLowerCase()
  const shown = needle ? collections.filter((entry) => entry.name.toLowerCase().includes(needle)) : collections

  /** The entry this exact text already names, if there is one. */
  const already = needle ? collections.find((entry) => entry.name.toLowerCase() === needle) : undefined

  const commit = useCallback(() => {
    const name = draft.trim()
    if (!name) return
    const match = collections.find((entry) => entry.name.toLowerCase() === name.toLowerCase())
    onAdd(match ? { id: match.id } : { name })
    setDraft('')
    if (!multi) setOpen(false)
  }, [draft, onAdd, multi, collections])

  return (
    <div className="addto" ref={shellRef}>
      <button
        type="button"
        className="addto__trigger"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        {props.label ?? 'Add to…'}
      </button>

      {open ? (
        <div className="addto__menu" role="menu" aria-multiselectable={multi || undefined}>
          <div className="addto__new">
            <input
              className="addto__input"
              autoFocus
              placeholder={props.placeholder ?? 'Search or add a collection'}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commit()
                if (event.key === 'Escape') setOpen(false)
                // The lightbox listens for keys at the window; without this its
                // shortcuts would fire while the user is typing a name.
                event.stopPropagation()
              }}
            />
          </div>

          {collections.length === 0 ? (
            <p className="addto__empty">{props.emptyText ?? 'No collections yet.'}</p>
          ) : shown.length === 0 ? (
            // Not an empty list: what was typed is about to become a new one,
            // and saying "nothing matches" would hide that.
            <p className="addto__empty">Enter to add “{draft.trim()}”.</p>
          ) : (
            shown.map((collection) => (
              <button
                key={collection.id}
                type="button"
                className="addto__item"
                role={multi ? 'menuitemcheckbox' : 'menuitem'}
                aria-checked={multi ? (props.activeIds?.has(collection.id) ?? false) : undefined}
                onClick={() => {
                  if (multi && props.activeIds?.has(collection.id)) {
                    props.onRemove?.(collection.id)
                  } else {
                    onAdd({ id: collection.id })
                  }
                  if (!multi) setOpen(false)
                }}
              >
                <span className="addto__check" aria-hidden="true">
                  {props.activeIds?.has(collection.id) ? '✓' : ''}
                </span>
                <span className="addto__name">{collection.name}</span>
                <span className="addto__count">{collection.count}</span>
              </button>
            ))
          )}

          {/* Says which way Enter will go, so it is never a surprise. */}
          {draft.trim() ? (
            <p className="addto__hint">
              {already ? `Enter files this into “${already.name}”.` : `Enter adds “${draft.trim()}”.`}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
