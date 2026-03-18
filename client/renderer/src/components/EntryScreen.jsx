import { useTranslation } from 'react-i18next';

export default function EntryScreen({
  joinMode, setJoinMode,
  playerName, setPlayerName,
  gameIdInput, setGameIdInput,
  serverUrl, setServerUrl,
  settings, onSettingChange,
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

        {!joinMode && (
          <details className="advanced-section">
            <summary>{t('gameSettings')}</summary>
            <div className="settings-grid">
              <div className="field">
                <label>{t('minPlayers')}</label>
                <input
                  type="number" min="4" max="12"
                  value={settings.minPlayers}
                  onChange={(e) => onSettingChange('minPlayers', Number(e.target.value))}
                />
              </div>
              <div className="field">
                <label>{t('maxPlayers')}</label>
                <input
                  type="number" min="4" max="12"
                  value={settings.maxPlayers}
                  onChange={(e) => onSettingChange('maxPlayers', Number(e.target.value))}
                />
              </div>
              <div className="field">
                <label>{t('mafiaRatio')}</label>
                <select
                  value={settings.mafiaRatio}
                  onChange={(e) => onSettingChange('mafiaRatio', Number(e.target.value))}
                >
                  <option value={0.25}>25%</option>
                  <option value={0.33}>33%</option>
                  <option value={0.4}>40%</option>
                </select>
              </div>
              <div className="field settings-checkboxes">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={settings.hasDoctor}
                    onChange={(e) => onSettingChange('hasDoctor', e.target.checked)}
                  />
                  {t('hasDoctor')}
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={settings.hasSheriff}
                    onChange={(e) => onSettingChange('hasSheriff', e.target.checked)}
                  />
                  {t('hasSheriff')}
                </label>
              </div>
            </div>
          </details>
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
