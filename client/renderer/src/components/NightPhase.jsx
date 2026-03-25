import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export default function NightPhase({
  currentState, currentPlayerId, me, isHost, isSpectator,
  runAction, onLeave
}) {
  const { t } = useTranslation();
  const [forceResolve, setForceResolve] = useState(false);
  const [submittedNightKey, setSubmittedNightKey] = useState(null);

  const nightNumber = currentState.round + 1;
  const myRole = me?.role;
  const nightKey = `night-${currentState.round}`;
  const hasSubmitted = submittedNightKey === nightKey;

  const nightTargets = (() => {
    if (!me?.isAlive) return [];
    if (myRole === 'doctor') return currentState.players.filter((p) => p.isAlive);
    if (myRole === 'mafia' || myRole === 'sheriff') {
      return currentState.players.filter((p) => p.isAlive && p.id !== me.id);
    }
    return [];
  })();

  const actionLabel = myRole === 'mafia' ? t('eliminateAction') : myRole === 'doctor' ? t('protectAction') : t('investigateAction');

  const investigation = currentState.investigatedThisRound;
  const investigatedPlayer = investigation
    ? currentState.players.find((p) => p.id === investigation.target)
    : null;

  const deadPlayers = currentState.players.filter((p) => !p.isAlive);

  return (
    <>
      <div className="card stack">
        <div className="day-header">
          <span className="phase">{t('nightPhase', { number: nightNumber })}</span>
          <span className="phase-meta">
            {myRole === 'mafia'   && t('nightMafiaMeta')}
            {myRole === 'doctor'  && t('nightDoctorMeta')}
            {myRole === 'sheriff' && t('nightSheriffMeta')}
            {(!myRole || myRole === 'townsperson') && t('nightTownMeta')}
          </span>
        </div>
        {isSpectator
          ? <p className="meta"><em>{t('spectatingContext')}</em></p>
          : <p className="meta">
              {t('playingAs')} <strong>{me?.name}</strong>
              {myRole && <> · {t('roleLabel')}: <strong>{myRole}</strong></>}
              {isHost && ` · ${t('hostBadge')}`}
            </p>
        }
      </div>

      {myRole === 'sheriff' && investigatedPlayer && (
        <div className="card stack">
          <div className="section-heading">{t('prevInvestigation')}</div>
          <p className="meta">
            <strong>{investigatedPlayer.name}</strong>{' '}
            {t('investigationIs')}{' '}
            <strong className={investigation.result === 'mafia' ? 'role-mafia' : 'role-town'}>
              {t(investigation.result === 'mafia' ? 'investigationMafia' : 'investigationNotMafia')}
            </strong>.
          </p>
        </div>
      )}

      {nightTargets.length > 0 && (
        <div className="card stack">
          <div className="section-heading">
            {myRole === 'mafia'   && t('selectEliminate')}
            {myRole === 'doctor'  && t('selectProtect')}
            {myRole === 'sheriff' && t('selectInvestigate')}
          </div>
          {hasSubmitted ? (
            <p className="lobby-hint">{t('actionSubmitted')}</p>
          ) : (
            <div className="players">
              {nightTargets.map((player) => (
                <div key={player.id} className="player">
                  <div className="player-name">{player.name}</div>
                  <div className="badges">
                    {player.id === currentState.hostId && <span className="badge host">{t('hostBadge')}</span>}
                    {player.role && <span className="badge role-mafia">{player.role}</span>}
                  </div>
                  <button
                    className="vote-btn"
                    onClick={() => runAction(actionLabel, async () => {
                      const result = await window.mafia.nightAction(player.id);
                      setSubmittedNightKey(nightKey);
                      return result;
                    })}
                  >
                    {actionLabel}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {myRole === 'townsperson' && me?.isAlive && (
        <div className="card stack">
          <p className="lobby-hint">{t('townSleepsHint')}</p>
        </div>
      )}

      <div className="card stack">
        <div className="section-heading">{t('playersLabel')}</div>
        <div className="players">
          {currentState.players.filter((p) => p.isAlive).map((player) => (
            <div key={player.id} className="player">
              <div className="player-name">{player.name}</div>
              <div className="badges">
                {player.id === currentPlayerId && <span className="badge you">{t('youBadge')}</span>}
                {player.id === currentState.hostId && <span className="badge host">{t('hostBadge')}</span>}
                {player.id !== currentPlayerId && player.role && <span className="badge role-mafia">{player.role}</span>}
              </div>
            </div>
          ))}
        </div>
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

      {isHost && (
        <div className="card stack">
          <div className="day-controls">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={forceResolve}
                onChange={(e) => setForceResolve(e.target.checked)}
              />
              {t('forceResolve')}
            </label>
            <button onClick={() => runAction(t('actionResolvingNight'), () => window.mafia.resolveNight(forceResolve))}>
              {t('resolveNight')}
            </button>
          </div>
        </div>
      )}

      <div className="controls">
        <button className="btn-secondary" onClick={onLeave}>{t('leaveGame')}</button>
      </div>
    </>
  );
}
