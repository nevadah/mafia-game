import { useTranslation } from 'react-i18next';

export default function DisconnectedBanner({ onRetry, onLeave }) {
  const { t } = useTranslation();

  return (
    <div className="disconnected-banner">
      <span className="disconnected-banner-message">{t('disconnectedBannerMessage')}</span>
      <div className="disconnected-banner-actions">
        <button onClick={onRetry}>{t('reconnectButton')}</button>
        <button className="btn-secondary" onClick={onLeave}>{t('leaveGame')}</button>
      </div>
    </div>
  );
}
