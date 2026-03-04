import { HashRouter, Routes, Route } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import DashboardOverview from '@/pages/DashboardOverview';
import AdminPage from '@/pages/AdminPage';
import KursePage from '@/pages/KursePage';
import RaeumePage from '@/pages/RaeumePage';
import DozentenPage from '@/pages/DozentenPage';
import TeilnehmerPage from '@/pages/TeilnehmerPage';
import AnmeldungenPage from '@/pages/AnmeldungenPage';

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<DashboardOverview />} />
          <Route path="kurse" element={<KursePage />} />
          <Route path="raeume" element={<RaeumePage />} />
          <Route path="dozenten" element={<DozentenPage />} />
          <Route path="teilnehmer" element={<TeilnehmerPage />} />
          <Route path="anmeldungen" element={<AnmeldungenPage />} />
          <Route path="admin" element={<AdminPage />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}