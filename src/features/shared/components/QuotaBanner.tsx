/**
 * QuotaBanner — app-wide strip under the top bar, shown when a NORMAL
 * user's monthly token quota is exhausted. Offers the "claim quota"
 * action, which emails the administration a top-up request.
 */
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/presentation/AuthProvider';
import { useQuota, useClaimQuota } from '../hooks/use-quota';

export function QuotaBanner() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const token = user?.accessToken ?? null;
  const { data: quota } = useQuota(token);
  const { claimState, claim } = useClaimQuota(token);

  if (!quota || quota.unlimited || !quota.exhausted) return null;

  return (
    <div className="flex shrink-0 items-center justify-center gap-3 border-b border-(--danger)/30 bg-(--danger)/10 px-4 py-2">
      <span className="text-(--app-fs-small) font-semibold text-(--danger)">
        {t('quotaExhaustedTitle')}
      </span>
      <span className="hidden text-(--app-fs-small) text-muted sm:inline">
        {t('quotaExhaustedBody', { used: quota.used.toLocaleString(), limit: quota.limit.toLocaleString() })}
      </span>
      {claimState === 'sent' ? (
        <span className="flex items-center gap-1.5 text-(--app-fs-small) font-semibold text-(--accent)">
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
            <path d="M7.6 13.2 4.4 10l-1.1 1.1 4.3 4.3 8.1-8.1-1.1-1.1-7 7Z" />
          </svg>
          {t('quotaClaimed')}
        </span>
      ) : (
        <button
          type="button"
          onClick={() => void claim()}
          disabled={claimState === 'sending'}
          className="button button--primary"
        >
          {claimState === 'sending' ? t('quotaClaimSending') : t('quotaClaim')}
        </button>
      )}
    </div>
  );
}
