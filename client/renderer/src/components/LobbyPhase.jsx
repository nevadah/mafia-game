import { useTranslation } from 'react-i18next';

export default function LobbyPhase({
  currentState, currentPlayerId, me, isHost, canStart,
  runAction, onLeave, onCopyCode, onCopyInviteLink
}) {
  const { t } = useTranslation();

  return (
    <div className="card stack">
      <div className="lobby-header">
        <span className="phase">{t('lobbyPhase')}</span>
        <span className="lobby-meta">
          {t('lobbyPlayerCount', { current: currentState.players.length, max: currentState.settings.maxPlayers })}
          &nbsp;·&nbsp;
          {t('readyCount', { count: currentState.readyCount })}
        </span>
      </div>

      <div>
        <label>{t('gameCodeLabel')}</label>
        <div className="game-code-box">
          <span className="game-code-value">{currentState.id}</span>
          <div className="game-code-actions">
            <button className="copy-btn" onClick={onCopyCode}>
              {t('copyCode')}
            </button>
            <button className="copy-link-btn" onClick={onCopyInviteLink}>
              {t('copyInviteLink')}
            </button>
          </div>
        </div>
      </div>

      <div>
        <label>{t('playersLabel')}</label>
        <div className="players">
          {currentState.players.map((player) => (
            <div key={player.id} className="player">
              <div className="player-name">{player.name}</div>
              <div className="badges">
                {player.id === currentPlayerId && <span className="badge you">{t('youBadge')}</span>}
                {player.id === currentState.hostId && <span className="badge host">{t('hostBadge')}</span>}
                <span className={`badge ${player.isReady ? 'ready' : 'not-ready'}`}>
                  {player.isReady ? t('readyBadge') : t('notReadyBadge')}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="lobby-actions">
        {!me?.isReady
          ? <button onClick={() => runAction(t('actionMarkingReady'), window.mafia.markReady)}>{t('readyButton')}</button>
          : <button onClick={() => runAction(t('actionMarkingUnready'), window.mafia.markUnready)}>{t('unreadyButton')}</button>
        }
        {isHost && (
          <button disabled={!canStart} onClick={() => runAction(t('actionStartingGame'), window.mafia.startGame)}>
            {t('startGame')}
          </button>
        )}
        <button className="btn-secondary" onClick={onLeave}>{t('leaveButton')}</button>
      </div>

      {isHost && !canStart && (
        <p className="lobby-hint">
          {currentState.players.length < currentState.settings.minPlayers
            ? t('needMorePlayers', { count: currentState.settings.minPlayers })
            : t('waitingForReady')}
        </p>
      )}
    </div>
  );
}
