import type { ScrapeProgress } from '@shared/types'
import { formatBytes, formatCount } from '../format'
import { t } from '../i18n'

export interface ScrapeBarProps {
  progress: ScrapeProgress
  onCancel: () => void
  onDismiss: () => void
}

/**
 * Progress for a thread download.
 *
 * Deliberately shaped like the scan bar rather than a modal: a scrape is
 * background work, and blocking the library while it runs would stop you
 * browsing what the last one pulled in.
 */
export function ScrapeBar({ progress, onCancel, onDismiss }: ScrapeBarProps): React.JSX.Element | null {
  const active = progress.phase === 'fetching' || progress.phase === 'downloading'
  const finished = progress.phase === 'done' || progress.phase === 'cancelled'

  if (!active && !finished && progress.phase !== 'error') return null

  if (progress.phase === 'error') {
    return (
      <div className="scanbar scanbar--error" role="alert">
        <span className="scanbar__label">{t('Scrape.failed')}</span>
        <span className="scanbar__detail">{progress.message}</span>
        <button type="button" className="scanbar__cancel" onClick={onDismiss}>
          {t('Scrape.dismiss')}
        </button>
      </div>
    )
  }

  return (
    <div className="scanbar" role="status" aria-live="polite">
      {active ? <span className="scanbar__spinner" aria-hidden="true" /> : null}
      <span className="scanbar__label">{describe(progress)}</span>
      <span className="scanbar__detail">{detail(progress)}</span>
      <button type="button" className="scanbar__cancel" onClick={active ? onCancel : onDismiss}>
        {active ? t('Scan.stop') : t('Scrape.dismiss')}
      </button>
    </div>
  )
}

function describe(progress: ScrapeProgress): string {
  switch (progress.phase) {
    case 'fetching':
      return t('Scrape.reading')
    case 'downloading':
      return t('Scrape.downloading', { title: progress.title ?? t('Scrape.thread') })
    case 'cancelled':
      return t('Scrape.stopped')
    default:
      return t('Scrape.downloaded', { title: progress.title ?? t('Scrape.thread') })
  }
}

function detail(progress: ScrapeProgress): string {
  if (progress.phase === 'fetching') return progress.url ?? ''

  const parts = [
    t('Scrape.progress', {
      done: formatCount(progress.downloaded),
      total: formatCount(progress.total),
    }),
  ]

  if (progress.bytes > 0) parts.push(formatBytes(progress.bytes))
  if (progress.skipped > 0) parts.push(t('Scan.skipped', { count: formatCount(progress.skipped) }))
  if (progress.failed > 0) parts.push(t('Scan.errors', { count: formatCount(progress.failed) }))

  return parts.join(' · ')
}
