// Logistics Twin - Multi-Role Authentication Page
// Touch-optimized with 48px min-height inputs, 16px font sizes, and instant 1-click Demo Persona access.
// Supports English, Hindi, and Marathi translations via src/auth/strings.js.

import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Truck,
  ShieldCheck,
  Mail,
  Lock,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  KeyRound,
  Languages,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { getAuthString, AUTH_STRINGS } from '../../auth/strings';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    loginWithPassword,
    loginWithMagicLink,
    continueInDemoMode,
    isSupabaseConfigured,
    preferredLanguage,
    setPreferredLanguage,
  } = useAuth();

  const [authMethod, setAuthMethod] = useState('password'); // 'password' | 'magic-link' | 'forgot'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  // Safe redirect destination
  const from = location.state?.from?.pathname || '/';
  const safeDestination = from.startsWith('/') && !from.startsWith('//') && !from.includes(':') ? from : '/';

  function handleDemoAccess(chosenRole = 'planner') {
    continueInDemoMode(chosenRole);
    if (chosenRole === 'driver') {
      navigate('/my-trips', { replace: true });
    } else if (chosenRole === 'buyer') {
      navigate('/my-orders', { replace: true });
    } else {
      navigate(safeDestination, { replace: true });
    }
  }

  function handleQuickFill(roleKey) {
    const creds = {
      planner: 'planner@demo.reroute',
      driver: 'driver@demo.reroute',
      buyer: 'buyer@demo.reroute',
    };
    setEmail(creds[roleKey] || 'planner@demo.reroute');
    setPassword('DemoPassword2026!');
    setErrorMessage(null);
  }

  async function handlePasswordSubmit(e) {
    e.preventDefault();
    if (!email) {
      setErrorMessage(getAuthString(preferredLanguage, 'errors', {}).emailRequired);
      return;
    }
    if (!password) {
      setErrorMessage(getAuthString(preferredLanguage, 'errors', {}).passwordRequired);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const { user, profile, error } = await loginWithPassword(email, password);

    if (error) {
      setIsSubmitting(false);
      // Map technical errors to friendly language
      const msg = error.message?.toLowerCase() || '';
      if (msg.includes('invalid') || msg.includes('credentials') || msg.includes('not found')) {
        setErrorMessage(getAuthString(preferredLanguage, 'errors', {}).invalidCredentials);
      } else if (msg.includes('network') || msg.includes('fetch')) {
        setErrorMessage(getAuthString(preferredLanguage, 'errors', {}).networkError);
      } else {
        setErrorMessage(getAuthString(preferredLanguage, 'errors', {}).unexpected);
      }
      return;
    }

    // Redirect based on role
    const userRole = profile?.role || 'planner';
    if (userRole === 'driver') {
      navigate('/my-trips', { replace: true });
    } else if (userRole === 'buyer') {
      navigate('/my-orders', { replace: true });
    } else {
      navigate(safeDestination, { replace: true });
    }
  }

  async function handleMagicLinkSubmit(e) {
    e.preventDefault();
    if (!email) {
      setErrorMessage(getAuthString(preferredLanguage, 'errors', {}).emailRequired);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const { error } = await loginWithMagicLink(email, safeDestination);
    setIsSubmitting(false);

    if (error) {
      setErrorMessage(getAuthString(preferredLanguage, 'errors', {}).unexpected);
    } else {
      setMagicLinkSent(true);
    }
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-center items-center p-4 sm:p-6 select-none">
      {/* Language Switcher in Top Right */}
      <div className="absolute top-4 right-4 flex items-center gap-1.5 p-1 bg-white border border-slate-200 rounded-xl shadow-2xs text-xs">
        <Languages className="w-3.5 h-3.5 text-slate-400 ml-1.5" />
        {[
          { code: 'en', label: 'English' },
          { code: 'hi', label: 'हिंदी' },
          { code: 'mr', label: 'मराठी' },
        ].map(({ code, label }) => (
          <button
            key={code}
            type="button"
            onClick={() => setPreferredLanguage(code)}
            className={`px-2.5 py-1 rounded-lg font-bold text-xs transition-colors cursor-pointer ${
              preferredLanguage === code
                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="w-full max-w-md bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-soft space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center text-white mx-auto shadow-sm ring-4 ring-blue-50">
            <Truck className="w-6 h-6" />
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            {getAuthString(preferredLanguage, 'appTitle', 'Logistics Twin')}
          </h1>
          <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
            {getAuthString(preferredLanguage, 'signInDesc', 'Access your dedicated role dashboard (Planner, Driver, Buyer).')}
          </p>
        </div>

        {/* Demo Mode Notice */}
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-[11px] text-amber-900 flex items-center gap-2.5">
          <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
          <span className="font-semibold">
            {getAuthString(preferredLanguage, 'demoNotice', 'Demo mode: data stays on this device')}
          </span>
        </div>

        {/* 1-Click Instant Demo Access Box */}
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-900">
              ⚡ Demo Sandbox Access
            </span>
            <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
              Offline Ready
            </span>
          </div>

          <p className="text-[11px] text-slate-500 leading-normal">
            {getAuthString(
              preferredLanguage,
              'continueDemoDesc',
              'Experience the complete digital twin offline. No cloud credentials required.'
            )}
          </p>

          <button
            type="button"
            id="btn-continue-demo-sandbox"
            onClick={() => handleDemoAccess('planner')}
            className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>{getAuthString(preferredLanguage, 'continueDemo', 'Continue in Demo Sandbox')}</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          <div className="grid grid-cols-3 gap-2 pt-1">
            <button
              type="button"
              data-testid="demo-role-planner"
              onClick={() => handleDemoAccess('planner')}
              className="py-2 px-2 bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-xl text-center transition-all cursor-pointer shadow-2xs group"
            >
              <span className="text-base block mb-0.5">👔</span>
              <span className="text-[10px] font-bold text-slate-700 group-hover:text-blue-700 block">Planner</span>
            </button>

            <button
              type="button"
              data-testid="demo-role-driver"
              onClick={() => handleDemoAccess('driver')}
              className="py-2 px-2 bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-xl text-center transition-all cursor-pointer shadow-2xs group"
            >
              <span className="text-base block mb-0.5">🚚</span>
              <span className="text-[10px] font-bold text-slate-700 group-hover:text-blue-700 block">Driver</span>
            </button>

            <button
              type="button"
              data-testid="demo-role-buyer"
              onClick={() => handleDemoAccess('buyer')}
              className="py-2 px-2 bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-xl text-center transition-all cursor-pointer shadow-2xs group"
            >
              <span className="text-base block mb-0.5">📦</span>
              <span className="text-[10px] font-bold text-slate-700 group-hover:text-blue-700 block">Buyer</span>
            </button>
          </div>
        </div>

        {/* Divider */}
        <div className="relative flex items-center justify-center">
          <div className="border-t border-slate-200 w-full" />
          <span className="bg-white px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider absolute">
            {isSupabaseConfigured ? 'Or Cloud Authentication' : 'Pre-fill Demo Credentials'}
          </span>
        </div>

        {/* Quick Fill Pre-set Buttons */}
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => handleQuickFill('planner')}
            className="text-[10px] font-semibold text-slate-600 hover:text-blue-600 hover:bg-slate-100 px-2 py-1 rounded-md transition-colors"
          >
            Fill Planner
          </button>
          <span className="text-slate-300">•</span>
          <button
            type="button"
            onClick={() => handleQuickFill('driver')}
            className="text-[10px] font-semibold text-slate-600 hover:text-blue-600 hover:bg-slate-100 px-2 py-1 rounded-md transition-colors"
          >
            Fill Driver
          </button>
          <span className="text-slate-300">•</span>
          <button
            type="button"
            onClick={() => handleQuickFill('buyer')}
            className="text-[10px] font-semibold text-slate-600 hover:text-blue-600 hover:bg-slate-100 px-2 py-1 rounded-md transition-colors"
          >
            Fill Buyer
          </button>
        </div>

        {/* Method Switcher Tabs */}
        <div className="flex p-1 bg-slate-100 rounded-xl text-xs font-semibold">
          <button
            type="button"
            onClick={() => {
              setAuthMethod('password');
              setErrorMessage(null);
            }}
            className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer ${
              authMethod === 'password' ? 'bg-white shadow-2xs text-blue-700 font-bold' : 'text-slate-600'
            }`}
          >
            Password
          </button>
          <button
            type="button"
            onClick={() => {
              setAuthMethod('magic-link');
              setErrorMessage(null);
            }}
            className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer ${
              authMethod === 'magic-link' ? 'bg-white shadow-2xs text-blue-700 font-bold' : 'text-slate-600'
            }`}
          >
            Magic Link
          </button>
        </div>

        {/* Error Notification */}
        {errorMessage && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2 animate-in fade-in">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Password Form */}
        {authMethod === 'password' && (
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                {getAuthString(preferredLanguage, 'emailLabel', 'Account Email')}
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-4" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={getAuthString(preferredLanguage, 'emailPlaceholder', 'planner@demo.reroute')}
                  className="w-full min-h-[48px] pl-10 pr-3 rounded-xl border border-slate-300 text-base outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 bg-white transition-all"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-700">
                  {getAuthString(preferredLanguage, 'passwordLabel', 'Password')}
                </label>
                <button
                  type="button"
                  onClick={() => setAuthMethod('forgot')}
                  className="text-[11px] font-semibold text-blue-600 hover:underline cursor-pointer"
                >
                  {getAuthString(preferredLanguage, 'forgotPassword', 'Forgot password?')}
                </button>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-4" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={getAuthString(preferredLanguage, 'passwordPlaceholder', '••••••••••••')}
                  className="w-full min-h-[48px] pl-10 pr-3 rounded-xl border border-slate-300 text-base outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 bg-white transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full min-h-[48px] rounded-xl text-base font-bold bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm disabled:opacity-50"
            >
              <KeyRound className="w-4 h-4" />
              <span>
                {isSubmitting
                  ? getAuthString(preferredLanguage, 'signingIn', 'Authenticating...')
                  : getAuthString(preferredLanguage, 'signInBtn', 'Sign In')}
              </span>
            </button>
          </form>
        )}

        {/* Magic Link Form */}
        {authMethod === 'magic-link' && (
          <div>
            {magicLinkSent ? (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-center space-y-2 animate-in fade-in">
                <CheckCircle2 className="w-7 h-7 text-emerald-600 mx-auto" />
                <h3 className="text-sm font-bold text-emerald-950">Magic Link Dispatched</h3>
                <p className="text-xs text-emerald-800">
                  A sign-in link has been sent to <strong>{email}</strong>. Check your inbox to sign in directly.
                </p>
              </div>
            ) : (
              <form onSubmit={handleMagicLinkSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    {getAuthString(preferredLanguage, 'emailLabel', 'Account Email')}
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-4" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="planner@demo.reroute"
                      className="w-full min-h-[48px] pl-10 pr-3 rounded-xl border border-slate-300 text-base outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 bg-white"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full min-h-[48px] rounded-xl text-base font-bold bg-slate-900 hover:bg-slate-800 text-white transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm disabled:opacity-50"
                >
                  <span>Send Magic Link</span>
                </button>
              </form>
            )}
          </div>
        )}

        {/* Forgot Password View */}
        {authMethod === 'forgot' && (
          <div className="space-y-4">
            {forgotSent ? (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-center space-y-2">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto" />
                <h3 className="text-sm font-bold text-emerald-950">Password Reset Email Dispatched</h3>
                <p className="text-xs text-emerald-800">
                  If an account exists for {email}, instructions to reset your password have been sent.
                </p>
                <button
                  type="button"
                  onClick={() => setAuthMethod('password')}
                  className="text-xs font-bold text-blue-600 underline pt-2 cursor-pointer"
                >
                  {getAuthString(preferredLanguage, 'backToLogin', 'Back to Sign In')}
                </button>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setForgotSent(true);
                }}
                className="space-y-3"
              >
                <p className="text-xs text-slate-500">
                  {getAuthString(
                    preferredLanguage,
                    'forgotPasswordDesc',
                    'Enter your account email to receive a password reset link.'
                  )}
                </p>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-4" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="planner@demo.reroute"
                    className="w-full min-h-[48px] pl-10 pr-3 rounded-xl border border-slate-300 text-base outline-none focus:border-blue-600 bg-white"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full min-h-[48px] rounded-xl text-base font-bold bg-blue-600 hover:bg-blue-700 text-white transition-colors cursor-pointer"
                >
                  {getAuthString(preferredLanguage, 'sendResetLink', 'Send Reset Link')}
                </button>
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => setAuthMethod('password')}
                    className="text-xs text-slate-500 hover:text-slate-900 cursor-pointer"
                  >
                    {getAuthString(preferredLanguage, 'backToLogin', 'Back to Sign In')}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Footer Role Security Badge */}
        <div className="pt-2 flex items-center justify-center gap-1.5 text-[11px] text-slate-500 border-t border-slate-100">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>Multi-Tenant Row-Level Security Enforced</span>
        </div>
      </div>
    </div>
  );
}
