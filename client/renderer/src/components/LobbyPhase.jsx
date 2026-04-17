import { useTranslation } from 'react-i18next';

export default function LobbyPhase({
  currentState, currentPlayerId, me, isHost, canStart, isSpectator,
  runAction, onLeave, onCopyCode, onCopyInviteLink, onCopySpectateLink
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
            <button className="copy-link-btn" onClick={onCopySpectateLink}>
              {t('copySpectateLink')}
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
                {!player.isConnected && <span className="badge disconnected">{t('disconnectedBadge')}</span>}
                <span className={`badge ${player.isReady ? 'ready' : 'not-ready'}`}>
                  {player.isReady ? t('readyBadge') : t('notReadyBadge')}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {(currentState.spectators ?? []).length > 0 && (
        <div>
          <label>{t('spectatorsLabel')}</label>
          <div className="players">
            {(currentState.spectators ?? []).map((spectator) => (
              <div key={spectator.id} className="player">
                <div className="player-name">{spectator.name}</div>
                <div className="badges">
                  {spectator.id === currentPlayerId && <span className="badge you">{t('youBadge')}</span>}
                  <span className="badge spectating">{t('spectatingBadge')}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!isSpectator && (
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
      )}

      {isSpectator && (
        <div className="lobby-actions">
          <button className="btn-secondary" onClick={onLeave}>{t('leaveButton')}</button>
        </div>
      )}

      {isHost && !canStart && !isSpectator && (
        <p className="lobby-hint">
          {currentState.players.length < currentState.settings.minPlayers
            ? t('needMorePlayers', { count: currentState.settings.minPlayers })
            : t('waitingForReady')}
        </p>
      )}
    </div>
  );
}
