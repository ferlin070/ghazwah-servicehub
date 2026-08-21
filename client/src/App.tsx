import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth.tsx';
import { ToastProvider } from './lib/toast.tsx';
import Layout from './components/Layout.tsx';
import Login from './pages/Login.tsx';
import Dashboard from './pages/Dashboard.tsx';
import Customers from './pages/Customers.tsx';
import Devices from './pages/Devices.tsx';
import WorkOrders from './pages/WorkOrders.tsx';
import Inventory from './pages/Inventory.tsx';
import Invoices from './pages/Invoices.tsx';
import Search from './pages/Search.tsx';

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
          <Route path="/customers" element={<Protected><Customers /></Protected>} />
          <Route path="/devices" element={<Protected><Devices /></Protected>} />
          <Route path="/work-orders" element={<Protected><WorkOrders /></Protected>} />
          <Route path="/work-orders/:id" element={<Protected><WorkOrders /></Protected>} />
          <Route path="/inventory" element={<Protected><Inventory /></Protected>} />
          <Route path="/invoices" element={<Protected><Invoices /></Protected>} />
          <Route path="/invoices/:id" element={<Protected><Invoices /></Protected>} />
          <Route path="/search" element={<Protected><Search /></Protected>} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}
