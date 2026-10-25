// Logistics Twin - Role-Based Route Guard (<RequireRole>)
// Enforces RBAC permissions per route.
// If unauthorized, renders a helpful, friendly explanation with quick-action recovery.

import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert, ArrowRight, RefreshCw, KeyRound, Truck, ShoppingBag, LayoutDashboard } from 'lucide-react';
import { useAuth } from './AuthProvider';
import { getAuthString } from './strings';

export default function RequireRole({ roles = [], children }) {
  const { role, loading, isDemoUser, setDemoRole, preferredLanguage } = useAuth();

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3 text-slate-500">
        <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
        <span className="text-xs font-semibold">Validating security permissions...</span>
      </div>
    );
  }

  // Planner has super-admin visibility over all operational views
  const isAuthorized = role === 'planner' || (Array.isArray(roles) && roles.includes(role));

  if (!isAuthorized) {
    const defaultRoute = role === 'driver' ? '/my-trips' : role === 'buyer' ? '/my-orders' : '/';

    return (
      <div className="max-w-xl mx-auto my-12 p-8 bg-white border border-slate-200 rounded-3xl shadow-soft text-center space-y-6 animate-in fade-in">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto text-amber-600 shadow-xs">
          <ShieldAlert className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            {getAuthString(preferredLanguage, 'unauthorizedTitle', 'Access Restricted')}
          </h2>
          <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
            {getAuthString(
              preferredLanguage,
              'unauthorizedDesc',
              'This view is restricted to specific supply chain roles. Your current active role is'
            )}{' '}
            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 font-bold border border-slate-200 uppercase text-[10px]">
              {role}
            </span>
            .
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Link
            to={defaultRoute}
            className="w-full sm:w-auto px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>{getAuthString(preferredLanguage, 'unauthorizedAction', 'Go to Authorized View')}</span>
            <ArrowRight className="w-4 h-4" />
          </Link>

          {isDemoUser && (
            <div className="w-full sm:w-auto flex items-center gap-1.5 p-1 bg-slate-100 border border-slate-200 rounded-xl text-xs">
              <span className="text-[11px] font-semibold text-slate-500 pl-2">Switch Demo Persona:</span>
              {roles.map((r) => (
                <button
                  key={r}
                  onClick={() => setDemoRole(r)}
                  className="px-2.5 py-1.5 bg-white text-blue-700 font-bold rounded-lg shadow-2xs hover:bg-blue-50 border border-slate-200 text-xs transition-colors cursor-pointer capitalize"
                >
                  {r}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return children;
}
