import { FEATURES } from './lib/features';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useSearchParams } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import { AuthProvider, useAuth } from './lib/auth-context';
import { AcceptInvitePage } from './pages/AcceptInvite';
import { ActionsPage } from './pages/Actions';
import { AssetsPage } from './pages/Assets';
import { AuditLogPage } from './pages/AuditLog';
import { AuditsPage } from './pages/Audits';
import { CompetencePage } from './pages/Competence';
import { ContextPage } from './pages/Context';
import { ContinuityPage } from './pages/Continuity';
import { DashboardPage } from './pages/Dashboard';
import { GapPage } from './pages/Gap';
import { MyAreaPage } from './pages/MyArea';
import { ProgrammePage } from './pages/Programme';
import { DeadlinesPage } from './pages/Deadlines';
import { DocumentsPage } from './pages/Documents';
import { FindingsPage } from './pages/Findings';
import { KpisPage } from './pages/Kpis';
import { IncidentsPage } from './pages/Incidents';
import { LoginPage } from './pages/Login';
import { MeasuresPage } from './pages/Measures';
import { MembersPage } from './pages/Members';
import { ReviewsPage } from './pages/Reviews';
import { AiSystemsPage } from './pages/AiSystems';
import { CockpitPage } from './pages/Cockpit';
import { PrivacyPage } from './pages/Privacy';
import { RisksPage } from './pages/Risks';
import { SoaPage } from './pages/Soa';
import { SettingsPage } from './pages/Settings';
import './styles/index.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 } },
});

/** Die frühere Seite „Kommunikation & Änderungen“ ist heute ein Teil von Organisation & Kontext. */
function PlanningRedirect() {
  const [params] = useSearchParams();
  return <Navigate to={`/context?tab=${params.get('tab') ?? 'communication'}`} replace />;
}

function App() {
  const { ready, session } = useAuth();
  if (!ready) return <Spinner label="Sitzung wird geprüft …" />;

  return (
    <Routes>
      <Route path="/einladung" element={<AcceptInvitePage />} />
      {!session ? (
        <>
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </>
      ) : (
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="programme/iso27001/gap" element={<GapPage />} />
          <Route path="programme/:slug" element={<ProgrammePage />} />
          <Route path="my" element={FEATURES.myArea ? <MyAreaPage /> : <Navigate to="/" replace />} />
          <Route path="deadlines" element={<DeadlinesPage />} />
          <Route path="context" element={<ContextPage />} />
          <Route path="planning" element={<PlanningRedirect />} />
          <Route path="competence" element={<CompetencePage />} />
          <Route path="soa" element={<SoaPage />} />
          <Route path="measures" element={<MeasuresPage />} />
          <Route path="documents" element={<DocumentsPage />} />
          <Route path="assets" element={<AssetsPage />} />
          <Route path="risks" element={<RisksPage />} />
          <Route path="incidents" element={<IncidentsPage />} />
          <Route path="continuity" element={<ContinuityPage />} />
          <Route path="privacy" element={FEATURES.dsgvo ? <PrivacyPage /> : <Navigate to="/" replace />} />
          <Route path="ai" element={FEATURES.euAiAct ? <AiSystemsPage /> : <Navigate to="/" replace />} />
          <Route path="cockpit" element={<CockpitPage />} />
          <Route path="audits" element={<AuditsPage />} />
          <Route path="findings" element={<FindingsPage />} />
          <Route path="actions" element={<ActionsPage />} />
          <Route path="kpis" element={FEATURES.kpis ? <KpisPage /> : <Navigate to="/" replace />} />
          <Route path="reviews" element={<ReviewsPage />} />
          <Route path="members" element={<MembersPage />} />
          <Route path="audit-log" element={<AuditLogPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="persons" element={<Navigate to="/competence?tab=persons" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      )}
    </Routes>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
