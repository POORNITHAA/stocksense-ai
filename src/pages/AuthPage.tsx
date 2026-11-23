import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Lock, Mail, RefreshCw, User } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

type AuthMode = 'login' | 'register' | 'reset';

export function AuthPage() {
  const {
    firebaseUser,
    isVerified,
    authReady,
    authError,
    clearAuthError,
    loginWithGoogle,
    loginWithEmail,
    registerWithEmail,
    sendResetEmail,
    resendVerification,
    refreshAuthUser,
    logout,
  } = useAuth();

  const [mode, setMode] = useState<AuthMode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  if (authReady && firebaseUser && isVerified) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);
    clearAuthError();
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await loginWithEmail(email, password);
      } else if (mode === 'register') {
        await registerWithEmail(name, email, password);
        setStatusMessage(
          'Account created. Please check your inbox and verify your email before accessing the dashboard.'
        );
      } else {
        await sendResetEmail(email);
        setStatusMessage('Password reset instructions have been sent to your email address.');
      }
    } catch {
      // Error surfaced via AuthContext
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setStatusMessage(null);
    clearAuthError();
    setSubmitting(true);
    try {
      await loginWithGoogle();
    } catch {
      // Error surfaced via AuthContext
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Left Brand / Warehouse Visual Column */}
      <div className="hidden lg:flex flex-col justify-between bg-slate-900 text-white p-10 relative overflow-hidden">
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-teal-600 flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-white" aria-hidden="true">
              <path
                d="M3 9.5L12 4L21 9.5V20H3V9.5Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
              <path
                d="M7.5 16.5L10.5 13.5L13 15.5L16.5 11.5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <span className="font-display text-xl font-bold tracking-tight">StockSense AI</span>
        </div>

        <div className="relative z-10 my-8 rounded-xl overflow-hidden border border-slate-700/60">
          <img
            src="/src/assets/images/auth_warehouse_hero_1795355350016.jpg"
            alt="Automated retail warehouse and grocery fulfillment center"
            referrerPolicy="no-referrer"
            className="w-full h-72 object-cover"
          />
        </div>

        <div className="relative z-10 space-y-3 max-w-lg">
          <h1 className="font-display text-3xl font-bold leading-tight text-balance">
            Intelligent Inventory &amp; Demand Forecasting for Modern Retail
          </h1>
          <p className="text-sm text-slate-300 leading-relaxed">
            Track SKU stock levels in real time, prevent stockouts with statistical demand
            forecasting, streamline supplier purchase orders, and query store performance with
            grounded Gemini analytics.
          </p>
        </div>
      </div>

      {/* Right Authentication Form Column */}
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 sm:p-8 space-y-6">
          <div className="space-y-1">
            <div className="lg:hidden font-display text-lg font-bold text-slate-900 dark:text-white mb-2">
              StockSense AI
            </div>
            <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
              {firebaseUser && !isVerified
                ? 'Verify Your Email'
                : mode === 'login'
                ? 'Sign in to your store'
                : mode === 'register'
                ? 'Create manager account'
                : 'Reset password'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {firebaseUser && !isVerified
                ? 'Email verification is required before accessing store inventory records.'
                : 'New self-registered accounts default to the Inventory Manager role.'}
            </p>
          </div>

          {firebaseUser && !isVerified ? (
            <div className="space-y-4">
              <div className="p-3.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300 space-y-1">
                <div className="font-semibold">Verification Pending for {firebaseUser.email}</div>
                <p>Click the verification link sent to your email, then click Refresh Status below.</p>
              </div>
              <div className="flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={refreshAuthUser}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  Refresh Verification Status
                </button>
                <button
                  type="button"
                  onClick={resendVerification}
                  className="w-full px-4 py-2 text-sm font-medium border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Resend Verification Email
                </button>
                <button
                  type="button"
                  onClick={logout}
                  className="w-full px-4 py-2 text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                >
                  Sign out and use another account
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Primary Google Sign-In */}
              <button
                type="button"
                disabled={submitting}
                onClick={handleGoogleSignIn}
                className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 text-sm font-medium bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 rounded-lg transition-colors disabled:opacity-60"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M21.35 11.1H12v2.98h5.35c-.48 2.4-2.56 3.92-5.35 3.92a5.5 5.5 0 1 1 3.55-9.7l2.14-2.14A8.5 8.5 0 1 0 12 20.5c4.92 0 8.2-3.45 8.2-8.3 0-.55-.05-.75-.15-1.1Z"
                  />
                </svg>
                Continue with Google
              </button>

              <div className="relative flex items-center py-1">
                <div className="flex-grow border-t border-slate-200 dark:border-slate-800" />
                <span className="shrink mx-3 text-[11px] text-slate-400">or with email</span>
                <div className="flex-grow border-t border-slate-200 dark:border-slate-800" />
              </div>

              {authError && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{authError}</span>
                </div>
              )}

              {statusMessage && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{statusMessage}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {mode === 'register' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Full Name
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Ananya Krishnan"
                        className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Work Email
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="manager@freshmart.in"
                      className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                </div>

                {mode !== 'reset' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Password
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="password"
                        required
                        minLength={6}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full px-4 py-2.5 text-sm font-medium bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors disabled:opacity-60"
                >
                  {submitting
                    ? 'Please wait...'
                    : mode === 'login'
                    ? 'Sign In'
                    : mode === 'register'
                    ? 'Create Account'
                    : 'Send Reset Link'}
                </button>
              </form>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800">
                {mode === 'login' ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        clearAuthError();
                        setStatusMessage(null);
                        setMode('register');
                      }}
                      className="text-teal-600 dark:text-teal-400 font-medium hover:underline"
                    >
                      Create account
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        clearAuthError();
                        setStatusMessage(null);
                        setMode('reset');
                      }}
                      className="hover:text-slate-800 dark:hover:text-slate-200 hover:underline"
                    >
                      Forgot password?
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      clearAuthError();
                      setStatusMessage(null);
                      setMode('login');
                    }}
                    className="text-teal-600 dark:text-teal-400 font-medium hover:underline"
                  >
                    Back to sign in
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
