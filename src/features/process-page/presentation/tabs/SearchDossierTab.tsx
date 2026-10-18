import { useTranslation } from 'react-i18next';
import { useWorkspaceContext } from '../hooks/use-workspace-context';
import { Spinner } from '../../../shared/components/ui';
import { DossierSearchTable } from '../../../process-forms/presentation/components/DossierSearchTable';

/**
 * "Search Dossier" tab — standalone full-dossier search
 * (searchSavedForms endpoint, with view/launch actions).
 */
export function SearchDossierTab() {
  const { t } = useTranslation();
  const { process, user, token, groups, stepId } = useWorkspaceContext();

  if (!process || !user || !token) return <Spinner label={t('loadingProcess')} />;

  return (
    <div className="h-full">
      <DossierSearchTable
        process={process}
        user={user}
        token={token}
        stepId={stepId}
        groups={groups}
        forceSearchEndpoint
        showActions
        showViewDossier
      />
    </div>
  );
}
