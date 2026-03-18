import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import NightSummaryModal from './NightSummaryModal';

export default function DayPhase({
  currentState, currentPlayerId, me, isHost,
  dismissedNightSummaryRound, onDismissNightSummary,
  runAction, onLeave
}) {
  const { t } = useTranslation();
  const [forceResolve, setForceResolve] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef(null);

  const messages = currentState.messages ?? [];

  useEffect(() => {
    chatEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [messages.length]);

  const myVote = currentState.votes[currentPlayerId];
  const pendingVoters = currentState.players.filter(
    (p) => p.isAlive && !currentState.votes[p.id]
  );
  const alivePlayers = currentState.players.filter((p) => p.isAlive);
  const deadPlayers  = currentState.players.filter((p) => !p.isAlive);

  return (
    <>
      {currentState.round > 0 && dismissedNightSummaryRound !== currentState.round && (
        <NightSummaryModal
          currentState={currentState}
          me={me}
          onDismiss={() => onDismissNightSummary(currentState.round)}
        />
      )}

      <div className="card stack">
        <div className="day-header">
          <span className="phase">{t('dayPhase', { round: currentState.round })}</span>
          <span className="phase-meta">{t('dayMeta')}</span>
        </div>
        <p className="meta">
          {t('playingAs')} <strong>{me?.name}</strong>
          {me?.role && <> · {t('roleLabel')}: <strong>{me.role}</strong></>}
          {isHost && ` · ${t('hostBadge')}`}
        </p>
      </div>

      <div className="card stack">
        <div className="section-heading">{t('castYourVote')}</div>
        <div className="players">
          {alivePlayers.map((player) => {
            const isMe      = player.id === currentPlayerId;
            const voteCount = Object.values(currentState.votes).filter((v) => v === player.id).length;
            const iVotedFor = myVote === player.id;

            return (
              <div key={player.id} className={`player${iVotedFor ? ' voted-for' : ''}`}>
                <div className="player-name">{player.name}</div>
                <div className="badges">
                  {isMe      && <span className="badge you">{t('youBadge')}</span>}
                  {player.id === currentState.hostId && <span className="badge host">{t('hostBadge')}</span>}
                  {!isMe && player.role && <span className="badge role-mafia">{player.role}</span>}
                  {voteCount > 0 && (
                    <span className="badge vote-count">
                      {t('voteCount', { count: voteCount })}
                    </span>
                  )}
                  {iVotedFor && <span className="badge your-vote">{t('yourVote')}</span>}
                </div>
                {!isMe && me?.isAlive && !myVote && (
                  <button
                    className="vote-btn"
                    onClick={() => runAction(t('actionCastingVote'), () => window.mafia.castVote(player.id))}
                  >
                    {t('voteButton')}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {pendingVoters.length > 0 && (
          <p className="lobby-hint">
            {t('waitingToVote', { names: pendingVoters.map((p) => p.name).join(', ') })}
          </p>
        )}

        {isHost && (
          <div className="day-controls">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={forceResolve}
                onChange={(e) => setForceResolve(e.target.checked)}
              />
              {t('forceResolve')}
            </label>
            <button onClick={() => runAction(t('actionResolvingDay'), () => window.mafia.resolveVotes(forceResolve))}>
              {t('resolveDay')}
            </button>
          </div>
        )}
      </div>

      {deadPlayers.length > 0 && (
        <div className="card stack">
          <div className="section-heading">{t('eliminated')}</div>
          <div className="players">
            {deadPlayers.map((player) => (
              <div key={player.id} className="player dead">
                <div className="player-name">{player.name}</div>
                <div className="badges">
                  <span className="badge dead">{t('eliminated')}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card stack">
        <div className="section-heading">{t('chatHeading')}</div>
        <div className="chat-messages">
          {messages.length === 0
            ? <p className="chat-empty">{t('chatEmpty')}</p>
            : messages.map((msg, i) => (
              <div
                key={i}
                className={`chat-message${msg.senderId === currentPlayerId ? ' chat-message-mine' : ''}`}
              >
                <span className="chat-sender">{msg.senderName}</span>
                <span className="chat-text">{msg.text}</span>
              </div>
            ))
          }
          <div ref={chatEndRef} />
        </div>
        {me?.isAlive && (
          <div className="chat-input-row">
            <input
              className="chat-input"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && chatInput.trim()) {
                  runAction('', () => window.mafia.sendChat(chatInput.trim()));
                  setChatInput('');
                }
              }}
              placeholder={t('chatPlaceholder')}
              maxLength={200}
            />
            <button
              className="chat-send-btn"
              disabled={!chatInput.trim()}
              onClick={() => {
                if (!chatInput.trim()) return;
                runAction('', () => window.mafia.sendChat(chatInput.trim()));
                setChatInput('');
              }}
            >
              {t('chatSend')}
            </button>
          </div>
        )}
      </div>

      <div className="controls">
        <button className="btn-secondary" onClick={onLeave}>{t('leaveGame')}</button>
      </div>
    </>
  );
}
