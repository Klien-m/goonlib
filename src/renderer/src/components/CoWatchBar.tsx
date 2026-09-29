import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { COWATCH_REACTIONS } from '@shared/types'
import type { CoWatchView } from '../state/useCoWatch'
import { t } from '../i18n'

export interface CoWatchBarProps {
  cowatch: CoWatchView
  /** Opens the session panel, for the link, approvals and stopping. */
  onOpenPanel: () => void
  /**
   * Changes whenever something was refused because someone else is in
   * control, so the bar can draw the eye to the button that asks for it.
   */
  nudge?: number
}

/**
 * The always-there strip along the bottom while a session is running.
 *
 * Chat lived in the session panel first, which was wrong twice over: the panel
 * is modal, so talking meant covering the thing you were both watching, and it
 * is the place you go to *manage* a session rather than to be in one. This sits
 * above the viewer instead, so a message during a film costs nothing.
 *
 * Collapsed it is one row. Expanding shows the log; either way the bar reports
 * its own height into a custom property, and the viewer insets itself by that
 * much — an overlay that covered the player's controls would be its own bug.
 */
export function CoWatchBar({ cowatch, onOpenPanel, nudge = 0 }: CoWatchBarProps): React.JSX.Element {
  const { session } = cowatch
  const { control } = session
  const request = control.requests[0]
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [readCount, setReadCount] = useState(session.chat.length)

  const barRef = useRef<HTMLDivElement | null>(null)
  const logRef = useRef<HTMLDivElement | null>(null)

  const unread = Math.max(0, session.chat.length - readCount)

  // Publish the bar's height so the viewer can inset itself by exactly it,
  // whether the log is open, closed, or wrapped onto two lines.
  useLayoutEffect(() => {
    const bar = barRef.current
    if (!bar) return

    const publish = (): void => {
      document.documentElement.style.setProperty('--cowatch-bar-h', `${bar.offsetHeight}px`)
    }

    publish()
    const observer = new ResizeObserver(publish)
    observer.observe(bar)

    return () => {
      observer.disconnect()
      document.documentElement.style.removeProperty('--cowatch-bar-h')
    }
  }, [])

  // Follow the conversation while it is visible.
  useEffect(() => {
    if (!open) return
    setReadCount(session.chat.length)
    const log = logRef.current
    if (log) log.scrollTop = log.scrollHeight
  }, [open, session.chat.length])

  const send = useCallback(() => {
    if (!draft.trim()) return
    cowatch.say(draft)
    setDraft('')
    setOpen(true)
  }, [cowatch, draft])

  const latest = session.chat[session.chat.length - 1]
  const waiting = session.playback.waiting ? session.playback.waitingFor : []

  return (
    <div className="cwbar" ref={barRef}>
      {open ? (
        <div className="cwbar__log" ref={logRef}>
          {session.chat.length === 0 ? (
            <p className="cwbar__quiet">{t('CoWatch.nothingSaid')}</p>
          ) : (
            session.chat.map((message) => (
              <p key={message.id} className="cwbar__msg">
                <b>{message.from}</b> {message.text}
              </p>
            ))
          )}
        </div>
      ) : null}

      <div className="cwbar__row">
        <button
          type="button"
          className="cwbar__toggle"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          title={open ? t('CoWatch.hideChat') : t('CoWatch.showChat')}
        >
          {open ? '▾' : '▴'}
          {!open && unread > 0 ? <span className="cwbar__unread">{unread}</span> : null}
        </button>

        <button
          type="button"
          className="cwbar__who"
          onClick={onOpenPanel}
          title={t('CoWatch.bar.title')}
        >
          {session.guests.length === 0 ? (
            <span className="cwbar__quiet">{t('CoWatch.nobodyJoined')}</span>
          ) : (
            session.guests.map((guest) => (
              <span key={guest.id} className="cwbar__pip">
                <span
                  className={`cowatch__dot cowatch__dot--${
                    !guest.connected ? 'off' : !guest.ready ? 'busy' : 'on'
                  }`}
                />
                {guest.name}
              </span>
            ))
          )}
          {session.knocking.length > 0 ? (
            <span className="cwbar__knocking">
              {t('CoWatch.waitingToJoin', { count: session.knocking.length })}
            </span>
          ) : null}
        </button>

        {/* Who is driving, and the one way to change that: asking. Keyed on the
            nudge so a refused action replays the flash that points here. */}
        <div key={nudge} className={nudge > 0 ? 'cwbar__control cwbar__control--nudge' : 'cwbar__control'}>
          {control.inControl && request ? (
            <>
              <span className="cwbar__control-text">
                <b>{request.name}</b> {t('CoWatch.wantsControlSuffix')}
              </span>
              <button
                type="button"
                className="cwbar__control-button cwbar__control-button--primary"
                onClick={() => cowatch.answerControl(request.id, true)}
              >
                {t('CoWatch.handOver')}
              </button>
              <button
                type="button"
                className="cwbar__control-button"
                onClick={() => cowatch.answerControl(request.id, false)}
              >
                {t('CoWatch.keep')}
              </button>
            </>
          ) : control.inControl ? (
            <span className="cwbar__control-text">{t('CoWatch.inControl')}</span>
          ) : control.requested ? (
            <>
              <span className="cwbar__control-text">
                {t('CoWatch.asked', { name: control.controller ?? '' })}
              </span>
              <button
                type="button"
                className="cwbar__control-button"
                onClick={cowatch.cancelControlRequest}
              >
                {t('Folder.cancel')}
              </button>
            </>
          ) : (
            <>
              <span className="cwbar__control-text">
                <b>{control.controller}</b> {t('CoWatch.isInControlSuffix')}
              </span>
              <button
                type="button"
                className="cwbar__control-button cwbar__control-button--primary"
                onClick={cowatch.requestControl}
              >
                {t('CoWatch.askControl')}
              </button>
            </>
          )}
        </div>

        {waiting.length > 0 ? (
          <span className="cwbar__holding">
            {t('CoWatch.holding', { names: waiting.join(', ') })}
          </span>
        ) : !open && latest ? (
          // Collapsed, the bar still shows the last thing said — otherwise a
          // message during a film is invisible until you go looking for it.
          <span className="cwbar__latest">
            <b>{latest.from}</b> {latest.text}
          </span>
        ) : (
          <span className="cwbar__latest" />
        )}

        <form
          className="cwbar__say"
          onSubmit={(event) => {
            event.preventDefault()
            send()
          }}
        >
          <input
            className="cwbar__input"
            value={draft}
            maxLength={500}
            placeholder={t('CoWatch.say')}
            aria-label={t('CoWatch.message')}
            onChange={(event) => setDraft(event.target.value)}
            // The viewer listens for keys on the window, so Space would pause
            // the video mid-sentence and Delete would bin the thing on screen.
            onKeyDown={(event) => event.stopPropagation()}
          />
        </form>

        <div className="cwbar__reacts">
          {COWATCH_REACTIONS.map((reaction) => (
            <button
              key={reaction.id}
              type="button"
              className="cwbar__react"
              onClick={() => cowatch.react(reaction.id)}
              aria-label={reaction.id}
            >
              {reaction.glyph}
            </button>
          ))}
        </div>

        {/* Ends the whole session: everyone out, the link dead, the port shut. */}
        <button
          type="button"
          className="cwbar__stop"
          onClick={cowatch.stop}
          title={t('CoWatch.stop')}
        >
          <span aria-hidden="true">×</span> {t('CoWatch.stopShort')}
        </button>
      </div>
    </div>
  )
}
