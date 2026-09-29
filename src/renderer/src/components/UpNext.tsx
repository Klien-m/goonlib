import { useEffect, useState } from 'react'
import type { MediaItem } from '@shared/types'
import { t } from '../i18n'

/**
 * The session's queue, as a card beside the viewer: what is lined up, with
 * Play to open one for everyone and × to take it off. The same list and
 * buttons the guests' page has, so both sides can manage it.
 */
export function UpNext(props: {
  queue: number[]
  /** Whether Play can open things right now; watching along, it cannot. */
  canPlay: boolean
  onPlay: (mediaId: number) => void
  onRemove: (index: number) => void
  className?: string
}): React.JSX.Element | null {
  const items = useItems(props.queue)
  if (props.queue.length === 0) return null

  return (
    <aside
      className={['mediainfo upnext', props.className].filter(Boolean).join(' ')}
      aria-label={t('UpNext.aria')}
    >
      <section className="mediainfo__section">
        <h3 className="mediainfo__title">{t('UpNext.title')}</h3>
        <ol className="upnext__list">
          {props.queue.map((id, index) => {
            const item = items.get(id)
            return (
              <li key={`${id}:${index}`} className="upnext__row">
                <img
                  className="upnext__thumb"
                  src={`media://thumb/${id}${item ? `?m=${item.mtime}` : ''}`}
                  alt=""
                  loading="lazy"
                />
                <span className="upnext__name" title={item?.name}>
                  {item?.name ?? t('UpNext.item', { id })}
                </span>
                <button
                  type="button"
                  className="upnext__button"
                  disabled={!props.canPlay}
                  onClick={() => props.onPlay(id)}
                  title={props.canPlay ? t('UpNext.play.title') : t('UpNext.play.ask')}
                >
                  {t('UpNext.play')}
                </button>
                <button
                  type="button"
                  className="upnext__button"
                  onClick={() => props.onRemove(index)}
                  aria-label={t('UpNext.remove')}
                  title={t('UpNext.remove')}
                >
                  ×
                </button>
              </li>
            )
          })}
        </ol>
      </section>
    </aside>
  )
}

/** The queued items, fetched once each and kept while they stay queued. */
function useItems(ids: number[]): Map<number, MediaItem> {
  const [items, setItems] = useState<Map<number, MediaItem>>(new Map())
  const key = ids.join(',')

  useEffect(() => {
    let current = true
    const wanted = [...new Set(ids)]
    void Promise.all(wanted.map((id) => window.goonlib.library.get(id).catch(() => null))).then((found) => {
      if (!current) return
      const next = new Map<number, MediaItem>()
      for (const item of found) if (item) next.set(item.id, item)
      setItems(next)
    })
    return () => {
      current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by the ids themselves
  }, [key])

  return items
}
