import { useTranslation } from 'react-i18next';

export default function EntryScreen({
  joinMode, setJoinMode,
  playerName, setPlayerName,
  gameIdInput, setGameIdInput,
  serverUrl, setServerUrl,
  onCreate, onJoin, onBrowse
}) {
  const { t } = useTranslation();

  return (
    <div className="entry-screen">
      <p className="entry-subtitle">{t('entrySubtitle')}</p>

      <div className="card entry-card">
        <div className="mode-tabs">
          <button
            className={`mode-tab${!joinMode ? ' active' : ''}`}
            onClick={() => setJoinMode(false)}
          >
            {t('newGame')}
          </button>
          <button
            className={`mode-tab${joinMode ? ' active' : ''}`}
            onClick={() => setJoinMode(true)}
          >
            {t('joinGame')}
          </button>
        </div>

        <div className="field">
          <label>{t('yourName')}</label>
          <input
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder={t('namePlaceholder')}
            onKeyDown={(e) => e.key === 'Enter' && (joinMode ? onJoin() : onCreate())}
            autoFocus
          />
        </div>

        {joinMode && (
          <div className="field">
            <label>{t('gameCodeLabel')}</label>
            <input
              value={gameIdInput}
              onChange={(e) => setGameIdInput(e.target.value)}
              placeholder={t('gameCodePlaceholder')}
              onKeyDown={(e) => e.key === 'Enter' && onJoin()}
            />
          </div>
        )}

        <button className="btn-full" onClick={joinMode ? onJoin : onCreate}>
          {joinMode ? t('joinGame') : t('createGame')}
        </button>

        {!joinMode && (
          <button className="btn-full btn-secondary" onClick={onBrowse}>
            {t('browseGames')}
          </button>
        )}

        <details className="advanced-section">
          <summary>{t('advanced')}</summary>
          <div className="field">
            <label>{t('serverUrl')}</label>
            <input value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} />
          </div>
        </details>
      </div>
    </div>
  );
}
