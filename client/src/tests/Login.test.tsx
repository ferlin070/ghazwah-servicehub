import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../lib/auth.tsx';
import { ToastProvider } from '../lib/toast.tsx';
import Login from '../pages/Login.tsx';

function renderLogin() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <AuthProvider>
          <Login />
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

// Default fetch mock: /auth/me returns 401 (not logged in), other calls return empty 200.
function mockFetch(url: string, init?: RequestInit): Promise<Response> {
  if (url === '/api/auth/me') {
    return Promise.resolve({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: 'Not authenticated' }),
    } as Response);
  }
  if (url === '/api/auth/login' || url === '/api/auth/register') {
    const body = init?.body ? JSON.parse(init.body as string) : {};
    if (body.email === 'bad@test.com') {
      return Promise.resolve({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'Invalid email or password' }),
      } as Response);
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ user: { id: '1', email: body.email, name: 'Test', role: 'admin' }, token: 'tok' }),
    } as Response);
  }
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response);
}

describe('Login page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    global.fetch = vi.fn(mockFetch) as unknown as typeof fetch;
  });

  it('renders login form with email and password inputs', () => {
    renderLogin();
    expect(screen.getByText('Ghazwah ServiceHub')).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i, { selector: 'input' })).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i, { selector: 'input' })).toBeInTheDocument();
  });

  it('shows demo credentials', () => {
    renderLogin();
    expect(screen.getByText(/admin@ghazwah.test/)).toBeInTheDocument();
  });

  it('switches to register mode', () => {
    renderLogin();
    fireEvent.click(screen.getByText('Register'));
    expect(screen.getByLabelText(/name/i, { selector: 'input' })).toBeInTheDocument();
  });

  it('calls API on login submit', async () => {
    const mockFn = vi.mocked(fetch);
    renderLogin();
    fireEvent.change(screen.getByLabelText(/email/i, { selector: 'input' }), { target: { value: 'test@test.com' } });
    fireEvent.change(screen.getByLabelText(/password/i, { selector: 'input' }), { target: { value: 'Test1234' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Login' }).slice(-1)[0]!);

    await waitFor(() => {
      expect(mockFn).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({
        method: 'POST',
      }));
    });
  });

  it('shows error toast on failed login', async () => {
    renderLogin();
    fireEvent.change(screen.getByLabelText(/email/i, { selector: 'input' }), { target: { value: 'bad@test.com' } });
    fireEvent.change(screen.getByLabelText(/password/i, { selector: 'input' }), { target: { value: 'Bad12345' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Login' }).slice(-1)[0]!);

    await waitFor(() => {
      expect(screen.getByText('Invalid email or password')).toBeInTheDocument();
    }, { timeout: 3000 });
  });
});
