import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DuplicateGroup, DuplicateReport, MediaItem } from '@shared/types'
import { formatBytes, formatCount, formatDuration } from '../format'
import { REVEAL_LABEL_KEY, REVEAL_SHORT_KEY, TRASH_NAME_KEY } from '../platform'
import { markAllButLargest } from '../selection'
import { HeartIcon } from './Toolbar'
import { t } from '../i18n'

export interface DuplicatesProps {
  onChanged: () => void
}

/**
 * Grouped duplicate review.
 *
 * Nothing is ever selected for you. The app will happily tell you which copy is
 * biggest, but choosing what to delete is the user's call — an automatic
 * "keep the best one" would eventually be wrong about somebody's only copy.
 */
export function Duplicates({ onChanged }: DuplicatesProps): React.JSX.Element {
  const [report, setReport] = useState<DuplicateReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setReport(await window.goonlib.duplicates.find())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const toggle = useCallback((id: number) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const groups = useMemo(
    () => (report ? [...report.exact, ...report.near] : []),
    [report],
  )

  // What the library is missing to make this report complete. Counted together
  // because the sentence is about the same thing either way: some files have no
  // fingerprint yet, or one from before films stopped being read whole.
  const gap = useMemo(
    () => ({
      pending: report?.pending.pending ?? 0,
      outdated: report?.pending.outdated ?? 0,
    }),
    [report],
  )

  const selectedBytes = useMemo(() => {
    // One file can legitimately appear in more than one group — an exact copy of
    // one thing and a near-copy of another — but it only frees its bytes once.
    const counted = new Set<number>()
    let total = 0

    for (const group of groups) {
      for (const item of group.items) {
        if (!selected.has(item.id) || counted.has(item.id)) continue
        counted.add(item.id)
        total += item.size
      }
    }

    return total
  }, [groups, selected])

  const selectAllButLargest = useCallback(
    (within: DuplicateGroup[]) =>
      setSelected((current) => markAllButLargest(current, within, groups)),
    [groups],
  )

  const trashSelected = useCallback(async () => {
    if (selected.size === 0) return
    setBusy(true)
    try {
      const removed = await window.goonlib.media.trash([...selected])
      if (removed > 0) {
        setSelected(new Set())
        await load()
        onChanged()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }, [selected, load, onChanged])

  if (loading) {
    return (
      <div className="empty">
        <h2 className="empty__title">{t('Dupes.loading')}</h2>
      </div>
    )
  }

  if (error) {
    return (
      <div className="empty" role="alert">
        <h2 className="empty__title">{t('Dupes.error')}</h2>
        <p className="empty__body">{error}</p>
      </div>
    )
  }

  if (groups.length === 0) {
    return (
      <div className="empty">
        <h2 className="empty__title">{t('Dupes.none')}</h2>
        <p className="empty__body">
          {gap.pending > 0
            ? t('Dupes.none.pending', { count: formatCount(gap.pending) })
            : gap.outdated > 0
              ? t('Dupes.none.outdated', { count: formatCount(gap.outdated) })
              : t('Dupes.none.distinct')}
        </p>
        <button type="button" className="button" onClick={() => void load()}>
          {t('Dupes.rescan')}
        </button>
      </div>
    )
  }

  const reclaimable = groups.reduce((total, group) => total + group.reclaimable, 0)

  /*
   * The hearted copies standing in for the largest.
   *
   * In those groups the biggest file is the one going to the Trash, which is
   * worth saying out loud rather than leaving to be noticed. Counted rather
   * than assumed: a copy only belongs here if it is favourited and really is
   * unselected right now.
   */
  const keptFavorites = new Set<number>()
  for (const group of groups) {
    for (const item of group.items) {
      if (item.favoritedAt !== null && !selected.has(item.id)) keptFavorites.add(item.id)
    }
  }

  return (
    <div className="dupes">
      <div className="dupes__bar">
        <div className="dupes__title">
          <h2 className="dupes__heading">{t('Dupes.title')}</h2>
          <span className="dupes__summary">
            {t('Dupes.found', { count: formatCount(groups.length) })} ·{' '}
            {t('Dupes.reclaimable', { size: formatBytes(reclaimable) })}
          </span>
        </div>

        {gap.pending > 0 ? (
          <span className="dupes__warn">
            {t('Dupes.pending', { count: formatCount(gap.pending) })}
          </span>
        ) : null}

        {gap.outdated > 0 ? (
          <span className="dupes__warn" title={t('Dupes.outdated.title')}>
            {t('Dupes.outdated', { count: formatCount(gap.outdated) })}
          </span>
        ) : null}

        <span className="dupes__spacer" />

        {selected.size > 0 ? (
          <span className="muted">
            {t('Dupes.selected', { count: formatCount(selected.size) })} ·{' '}
            {formatBytes(selectedBytes)}
            {keptFavorites.size > 0 ? (
              <>
                {' · '}
                <span
                  className="dupes__spared"
                  title={t('Dupes.spared.title')}
                >
                  {t('Dupes.spared', { count: formatCount(keptFavorites.size) })}
                </span>
              </>
            ) : null}
          </span>
        ) : null}

        <button
          type="button"
          className="button button--quiet"
          disabled={busy}
          onClick={() => {
            setSelected(new Set())
            void load()
          }}
          title={t('Dupes.rescan.title')}
        >
          {t('Dupes.rescan')}
        </button>

        <button
          type="button"
          className="button button--quiet"
          disabled={busy}
          onClick={() => selectAllButLargest(groups)}
          title={t('Dupes.selectAll.title')}
        >
          {t('Dupes.selectAll')}
        </button>

        {selected.size > 0 ? (
          <button
            type="button"
            className="button button--quiet"
            disabled={busy}
            onClick={() => setSelected(new Set())}
          >
            {t('Dupes.clear')}
          </button>
        ) : null}

        <button
          type="button"
          className="button"
          disabled={selected.size === 0 || busy}
          onClick={() => void trashSelected()}
          title={t('Dupes.move.title')}
        >
          {busy ? t('Dupes.moving') : t('Dupes.move', { trash: t(TRASH_NAME_KEY) })}
        </button>
      </div>

      <div className="dupes__list">
        {groups.map((group) => (
          <Group
            key={group.key}
            group={group}
            selected={selected}
            onToggle={toggle}
            // Keep the largest and mark the rest — the common intent, but still
            // only a suggestion the user has to act on.
            onSelectAllButFirst={() => selectAllButLargest([group])}
          />
        ))}
      </div>
    </div>
  )
}

function Group({
  group,
  selected,
  onToggle,
  onSelectAllButFirst,
}: {
  group: DuplicateGroup
  selected: Set<number>
  onToggle: (id: number) => void
  onSelectAllButFirst: () => void
}): React.JSX.Element {
  return (
    <section className="dupe-group">
      <header className="dupe-group__head">
        <span className={group.kind === 'exact' ? 'tag tag--exact' : 'tag tag--near'}>
          {group.kind === 'exact'
            ? t('Dupes.identical')
            : t('Dupes.similar', { distance: group.distance })}
        </span>
        {group.sampled ? (
          // These are films, so the group is also the largest thing on the
          // screen — worth saying that "identical" here means the ends matched
          // rather than every byte.
          <span className="dupes__sampled" title={t('Dupes.sampled.title')}>
            {t('Dupes.sampled')}
          </span>
        ) : null}
        <span className="muted">
          {t('Dupes.copies', { count: group.items.length, size: formatBytes(group.reclaimable) })}
        </span>
        <span className="dupes__spacer" />
        <button type="button" className="button button--quiet" onClick={onSelectAllButFirst}>
          {t('Dupes.allButLargest')}
        </button>
      </header>

      <div className="dupe-group__items">
        {group.items.map((item, index) => (
          <Candidate
            key={item.id}
            item={item}
            isLargest={index === 0}
            checked={selected.has(item.id)}
            onToggle={() => onToggle(item.id)}
          />
        ))}
      </div>
    </section>
  )
}

function Candidate({
  item,
  isLargest,
  checked,
  onToggle,
}: {
  item: MediaItem
  isLargest: boolean
  checked: boolean
  onToggle: () => void
}): React.JSX.Element {
  return (
    <div className={checked ? 'candidate candidate--on' : 'candidate'}>
      <label className="candidate__pick">
        <input type="checkbox" checked={checked} onChange={onToggle} />
      </label>

      <div className="candidate__thumb">
        {item.thumbState === 'done' ? (
          <img src={`media://thumb/${item.id}?m=${item.mtime}`} alt="" loading="lazy" />
        ) : null}
      </div>

      <div className="candidate__info">
        <div className="candidate__name" title={item.relPath}>
          {item.favoritedAt !== null ? (
            // Said here because this screen is where copies get trashed.
            <span className="candidate__heart" title={t('Dupes.favorite.title')}>
              <HeartIcon filled size={12} />
            </span>
          ) : null}
          {item.name}
        </div>
        <div className="candidate__meta">
          {formatBytes(item.size)}
          {item.width && item.height ? ` · ${item.width}×${item.height}` : ''}
          {item.durationMs ? ` · ${formatDuration(item.durationMs)}` : ''}
          {isLargest ? ` · ${t('Dupes.largest')}` : ''}
        </div>
        <div className="candidate__path" title={item.relPath}>
          <bdi>{item.relPath}</bdi>
        </div>
      </div>

      <button
        type="button"
        className="button button--quiet"
        onClick={() => void window.goonlib.media.reveal(item.id)}
        title={t(REVEAL_LABEL_KEY)}
      >
        {t(REVEAL_SHORT_KEY)}
      </button>
    </div>
  )
}
