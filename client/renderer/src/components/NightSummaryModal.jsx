import { useTranslation } from 'react-i18next';

export default function NightSummaryModal({ currentState, me, onDismiss }) {
  const { t } = useTranslation();

  const victim = currentState.eliminatedThisRound
    ? currentState.players.find((p) => p.id === currentState.eliminatedThisRound)
    : null;

  const protected_ = currentState.doctorProtectedThisRound
    ? currentState.players.find((p) => p.id === currentState.doctorProtectedThisRound)
    : null;

  const investigation = currentState.investigatedThisRound;
  const investigatedPlayer = investigation
    ? currentState.players.find((p) => p.id === investigation.target)
    : null;

  return (
    <div className="night-summary-overlay">
      <div className="night-summary-modal">
        <div className="night-summary-title">
          {t('nightSummaryTitle', { round: currentState.round })}
        </div>
        <p className={victim ? 'night-summary-kill' : 'night-summary-no-kill'}>
          {victim
            ? t('nightSummaryEliminated', { name: victim.name })
            : t('nightSummaryNoKill')}
        </p>
        {me?.role === 'doctor' && protected_ && (
          <p className="night-summary-role-note">
            {t('nightSummaryDoctorProtected', { name: protected_.name })}
          </p>
        )}
        {me?.role === 'sheriff' && investigatedPlayer && (
          <p className="night-summary-role-note">
            {t('nightSummaryInvestigated', {
              name: investigatedPlayer.name,
              result: t(investigation.result === 'mafia' ? 'investigationMafia' : 'investigationNotMafia')
            })}
          </p>
        )}
        <button onClick={onDismiss}>
          {t('nightSummaryDismiss')}
        </button>
      </div>
    </div>
  );
}
