import { useState } from 'react';
import { useAuth } from '../lib/auth.tsx';
import { useToast } from '../lib/toast.tsx';

export default function Login() {
  const { login, register } = useAuth();
  const { toast } = useToast();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login(email, password);
        toast('Welcome back!', 'success');
      } else {
        await register(email, name, password);
        toast('Account created!', 'success');
      }
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-brand-700">Ghazwah ServiceHub</h1>
          <p className="text-gray-500 mt-2">Computer &amp; Laptop Service Management</p>
        </div>

        <div className="card">
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setMode('login')}
              className={`flex-1 py-2 text-sm font-medium rounded-lg ${mode === 'login' ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600'}`}
            >
              Login
            </button>
            <button
              onClick={() => setMode('register')}
              className={`flex-1 py-2 text-sm font-medium rounded-lg ${mode === 'register' ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600'}`}
            >
              Register
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
            )}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input id="password" type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
            </div>
            <button type="submit" className="btn-primary w-full" disabled={submitting}>
              {submitting ? 'Please wait...' : mode === 'login' ? 'Login' : 'Create Account'}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-gray-100 text-xs text-gray-500">
            <p className="font-medium mb-1">Demo credentials:</p>
            <p>admin@ghazwah.test / Password123</p>
            <p>staff1@ghazwah.test / Password123</p>
            <p>cust1@ghazwah.test / Password123</p>
          </div>
        </div>
      </div>
    </div>
  );
}
