import { type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.tsx';

const navItems = {
  admin: [
    { to: '/dashboard', label: 'Dashboard', icon: '📊' },
    { to: '/customers', label: 'Customers', icon: '👥' },
    { to: '/devices', label: 'Devices', icon: '💻' },
    { to: '/work-orders', label: 'Work Orders', icon: '🔧' },
    { to: '/inventory', label: 'Inventory', icon: '📦' },
    { to: '/invoices', label: 'Invoices', icon: '🧾' },
    { to: '/search', label: 'Search', icon: '🔍' },
  ],
  staff: [
    { to: '/dashboard', label: 'Dashboard', icon: '📊' },
    { to: '/devices', label: 'Devices', icon: '💻' },
    { to: '/work-orders', label: 'Work Orders', icon: '🔧' },
    { to: '/inventory', label: 'Inventory', icon: '📦' },
    { to: '/invoices', label: 'Invoices', icon: '🧾' },
  ],
  customer: [
    { to: '/dashboard', label: 'Dashboard', icon: '📊' },
    { to: '/work-orders', label: 'My Repairs', icon: '🔧' },
    { to: '/invoices', label: 'My Invoices', icon: '🧾' },
  ],
};

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;
  const items = navItems[user.role] ?? navItems.customer;

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 text-gray-100 flex flex-col fixed h-full">
        <div className="px-5 py-5 border-b border-gray-800">
          <h1 className="text-lg font-bold text-brand-400">Ghazwah ServiceHub</h1>
        </div>
        <nav className="flex-1 py-4 space-y-1">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-5 py-2.5 text-sm font-medium transition-colors ${
                  isActive ? 'bg-brand-700 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`
              }
            >
              <span>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-5 py-4 border-t border-gray-800">
          <div className="text-sm text-gray-300">{user.name}</div>
          <div className="text-xs text-gray-500 capitalize">{user.role}</div>
          <button
            onClick={() => { logout(); navigate('/login'); }}
            className="mt-2 text-xs text-gray-400 hover:text-white"
          >
            Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 ml-64">
        <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">ServiceHub</h2>
          <div className="text-sm text-gray-500">{user.email}</div>
        </header>
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
