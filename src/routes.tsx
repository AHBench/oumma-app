import { type ReactElement, } from 'react';
import { Navigate, Route, Routes as ReactRouterRoutes } from 'react-router-dom';
import { RequireAuth } from './App';
import { useAuth } from './features/auth/presentation/AuthProvider';
import { effectiveDesigner } from './features/process-design/domain/user-mode';
import { SplashPage } from './features/auth/presentation/pages/SplashPage';
import { LoginPage } from './features/auth/presentation/pages/LoginPage';
import { MyProcessPage } from './features/process-apps/presentation/pages/MyProcessPage';
import { ProcessWorkspace } from './features/process-page/presentation/pages/ProcessWorkspace';
import { HealthCheckPage } from './features/health/presentation/pages/HealthCheckPage';
import { MesDossiersTab } from './features/process-page/presentation/tabs/MesDossiersTab';
import { MyProcessesTab } from './features/process-page/presentation/tabs/MyProcessesTab';
import { DocumentsTab } from './features/process-page/presentation/tabs/DocumentsTab';
import { RequestTab } from './features/process-page/presentation/tabs/RequestTab';
import { SearchDossierTab } from './features/process-page/presentation/tabs/SearchDossierTab';
import { CreateFormTab } from './features/process-page/presentation/tabs/CreateFormTab';
import { ProcessDesignPage } from './features/process-design/presentation/components/ProcessDesignPage';

/**
 * Route map — mirrors lib/routes.dart (+ the /splash route from main.dart).
 * The workspace sub-tabs are nested routes under /myprocesses/:processId.
 */
export function Routes() {
  return (
    <ReactRouterRoutes>
      <Route path="/" element={<Navigate to="/splash" replace />} />
      <Route path="/splash" element={<SplashPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/myprocesses"
        element={
          <RequireAuth>
            <MyProcessPage />
          </RequireAuth>
        }
      />
      <Route
        path="/myprocesses/:processId"
        element={
          <RequireAuth>
            <ProcessWorkspace />
          </RequireAuth>
        }
      >
        <Route index element={<WorkspaceIndexRedirect />} />
        <Route
          path="my-tasks"
          element={<DesignerGated children={<MesDossiersTab />} />}
        />
        <Route
          path="my-processes"
          element={<DesignerGated children={<MyProcessesTab />} />}
        />
        <Route path="documents" element={<DocumentsTab />} />
        <Route path="request" element={<RequestTab />} />
        <Route path="search-dossier" element={<SearchDossierTab />} />
        <Route path="create-form" element={<CreateFormTab />} />
        <Route path="design" element={<NonDesignerGated children={<ProcessDesignPage />} />} />
      </Route>

      {/* Health check endpoints for Kubernetes */}
      <Route path="/health" element={<HealthCheckPage checkType="health" />} />
      <Route path="/liveness" element={<HealthCheckPage checkType="liveness" />} />
      <Route path="/readiness" element={<HealthCheckPage checkType="readiness" />} />

      <Route path="*" element={<Navigate to="/splash" replace />} />
    </ReactRouterRoutes>
  );
}

// Designers (in designer mode) land on the Process Design tab; everyone
// else on My Tasks.
function WorkspaceIndexRedirect() {
  const { user } = useAuth();
  return <Navigate to={effectiveDesigner(user) ? 'design' : 'my-tasks'} replace />;
}

// Designers (in designer mode) never see My Tasks / Mes Dossiers — those
// routes bounce to the Process Design view instead.
function DesignerGated({ children }: { children: ReactElement }) {
  const { user } = useAuth();
  if (effectiveDesigner(user)) return <Navigate to="design" replace />;
  return children;
}

// The Process Design view is exclusive to the Designer group in designer
// mode — everyone else is sent back to My Tasks.
function NonDesignerGated({ children }: { children: ReactElement }) {
  const { user } = useAuth();
  if (!effectiveDesigner(user)) return <Navigate to="my-tasks" replace />;
  return children;
}
