import { useTranslation } from 'react-i18next';

const LANGS = ['en', 'de', 'es', 'fr'];

export default function AppHeader({ theme, onToggleTheme, isSpectator }) {
  const { t, i18n } = useTranslation();

  function handleLangChange(lang) {
    i18n.changeLanguage(lang);
    localStorage.setItem('mafia-language', lang);
  }

  return (
    <div className="app-header">
      <h1>Mafia{isSpectator && <span className="badge spectating">{t('spectatingBadge')}</span>}</h1>
      <div className="header-controls">
        <div className="lang-switcher">
          {LANGS.map((lang) => (
            <button
              key={lang}
              className={`lang-btn${i18n.language === lang ? ' active' : ''}`}
              onClick={() => handleLangChange(lang)}
            >
              {lang.toUpperCase()}
            </button>
          ))}
        </div>
        <button className="theme-toggle" onClick={onToggleTheme}>
          {theme === 'dark' ? t('lightMode') : t('darkMode')}
        </button>
      </div>
    </div>
  );
}
