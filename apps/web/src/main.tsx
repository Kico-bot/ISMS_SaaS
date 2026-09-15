import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import { AuthProvider, useAuth } from './lib/auth-context';
import { AcceptInvitePage } from './pages/AcceptInvite';
import { ActionsPage } from './pages/Actions';
import { AssetsPage } from './pages/Assets';
import { DashboardPage } from './pages/Dashboard';
import { IncidentsPage } from './pages/Incidents';
import { LoginPage } from './pages/Login';
import { MeasuresPage } from './pages/Measures';
import { MembersPage } from './pages/Members';
import { RisksPage } from './pages/Risks';
import { SoaPage } from './pages/Soa';
import './styles/index.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 } },
});

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
          <Route path="soa" element={<SoaPage />} />
          <Route path="measures" element={<MeasuresPage />} />
          <Route path="assets" element={<AssetsPage />} />
          <Route path="risks" element={<RisksPage />} />
          <Route path="incidents" element={<IncidentsPage />} />
          <Route path="actions" element={<ActionsPage />} />
          <Route path="members" element={<MembersPage />} />
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
