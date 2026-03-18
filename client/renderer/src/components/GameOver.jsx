import { useTranslation } from 'react-i18next';

export default function GameOver({ currentState, currentPlayerId, onBackToMenu }) {
  const { t } = useTranslation();

  return (
    <>
      <div className="card stack">
        <div className="day-header">
          <span className="phase">{t('gameOver')}</span>
          <span className="phase-meta">
            {currentState.winner === 'town' ? t('townWins') : t('mafiaWins')}
          </span>
        </div>
      </div>

      <div className="card stack">
        <div className="section-heading">{t('finalStandings')}</div>
        <div className="players">
          {currentState.players.map((player) => (
            <div key={player.id} className={`player${player.isAlive ? '' : ' dead'}`}>
              <div className="player-name">{player.name}</div>
              <div className="badges">
                {player.id === currentPlayerId && <span className="badge you">{t('youBadge')}</span>}
                {player.role && <span className="badge">{player.role}</span>}
                <span className={`badge ${player.isAlive ? 'ready' : 'dead'}`}>
                  {player.isAlive ? t('survivedBadge') : t('eliminated')}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="controls">
        <button onClick={onBackToMenu}>{t('backToMenu')}</button>
      </div>
    </>
  );
}
