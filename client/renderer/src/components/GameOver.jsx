import { useTranslation } from 'react-i18next';

export default function GameOver({ currentState, currentPlayerId, onBackToMenu }) {
  const { t } = useTranslation();

  const eliminations = currentState.eliminations ?? [];
  const nightKills   = eliminations.filter((e) => e.by === 'mafia');
  const dayElims     = eliminations.filter((e) => e.by === 'town');
  const correctVotes = dayElims.filter((e) => e.role === 'mafia').length;

  const me = currentState.players.find((p) => p.id === currentPlayerId);
  const iWon = me
    ? (me.role === 'mafia') === (currentState.winner === 'mafia')
    : null;

  return (
    <>
      {/* ── Winner banner ── */}
      <div className="card stack game-over-banner">
        <div className={`game-over-winner ${currentState.winner}`}>
          {currentState.winner === 'town' ? t('townWins') : t('mafiaWins')}
        </div>
        <div className="game-over-condition">
          {currentState.winner === 'town' ? t('winConditionTown') : t('winConditionMafia')}
        </div>
        {iWon !== null && (
          <div className={`game-over-outcome ${iWon ? 'won' : 'lost'}`}>
            {iWon ? t('youWon') : t('youLost')}
          </div>
        )}
      </div>

      {/* ── Stats ── */}
      <div className="card stack">
        <div className="section-heading">{t('gameRecap')}</div>
        <div className="game-over-stats">
          <div className="stat-cell">
            <span className="stat-value">{currentState.round}</span>
            <span className="stat-label">{t('recapRounds', { count: currentState.round })}</span>
          </div>
          <div className="stat-cell">
            <span className="stat-value">{nightKills.length}</span>
            <span className="stat-label">{t('recapNightKills', { count: nightKills.length })}</span>
          </div>
          <div className="stat-cell">
            <span className="stat-value">{dayElims.length}</span>
            <span className="stat-label">{t('recapDayElims', { count: dayElims.length })}</span>
          </div>
          {dayElims.length > 0 && (
            <div className="stat-cell">
              <span className="stat-value">{correctVotes}/{dayElims.length}</span>
              <span className="stat-label">{t('recapTownAccuracy', { correct: correctVotes, total: dayElims.length })}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Final standings ── */}
      <div className="card stack">
        <div className="section-heading">{t('finalStandings')}</div>
        <div className="players">
          {currentState.players.map((player) => {
            const elim = eliminations.find((e) => e.playerId === player.id);
            return (
              <div key={player.id} className={`player${player.isAlive ? '' : ' dead'}`}>
                <div className="player-name">{player.name}</div>
                <div className="badges">
                  {player.id === currentPlayerId && (
                    <span className="badge you">{t('youBadge')}</span>
                  )}
                  {player.role && (
                    <span className={`badge role-${player.role}`}>{player.role}</span>
                  )}
                  <span className={`badge ${player.isAlive ? 'ready' : 'dead'}`}>
                    {player.isAlive ? t('survivedBadge') : t('eliminated')}
                  </span>
                  {elim && (
                    <span className="badge elim-by">
                      {elim.by === 'mafia' ? '🌙' : '⚖️'}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="controls">
        <button onClick={onBackToMenu}>{t('backToMenu')}</button>
      </div>
    </>
  );
}
