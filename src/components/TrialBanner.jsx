// Logistics Twin - Non-Blocking Trial Expiry Banner (src/components/TrialBanner.jsx)
// Displays when 30-day trial reaches expiration.
// Non-blocking: core demo flow and all buttons remain 100% accessible to evaluators.

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowRight, X, Sparkles } from 'lucide-react';
import { usePlan, PLAN_PRICE_FORMATTED } from '../lib/plan';
import { useReRoute } from '../context/ReRouteContext';

export default function TrialBanner() {
  const { isExpired, upgrade } = usePlan();
  const { showToast } = useReRoute();
  const [isDismissed, setIsDismissed] = useState(false);

  if (!isExpired || isDismissed) {
    return null;
  }

  const handleContinue = () => {
    upgrade();
    showToast?.(`Upgraded to Logistics Twin Pro (${PLAN_PRICE_FORMATTED}/mo Demo). Full access continued!`, 'success');
  };

  return (
    <aside
      aria-label="Subscription Trial Status"
      className="bg-gradient-to-r from-amber-600 to-amber-700 text-white px-4 py-2.5 shadow-sm text-xs border-b border-amber-800/40 relative z-30"
    >
      <div className="max-w-[1680px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-amber-200" />
          <p className="font-semibold text-amber-50">
            <span>Trial ended, continue with Pro at {PLAN_PRICE_FORMATTED}/month</span>{' '}
            <span className="opacity-80 font-normal hidden md:inline">
              (Demo simulation — no real payment is taken, core demo remains unlocked)
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleContinue}
            className="px-3 py-1.5 rounded-lg bg-white text-amber-900 font-extrabold hover:bg-amber-50 transition-colors shadow-xs flex items-center gap-1 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
            <span>Continue (demo)</span>
          </button>

          <Link
            to="/pricing"
            className="px-3 py-1.5 rounded-lg bg-amber-800/60 hover:bg-amber-800 text-amber-100 font-semibold transition-colors flex items-center gap-1"
          >
            <span>View Plan</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>

          <button
            type="button"
            onClick={() => setIsDismissed(true)}
            className="p-1 rounded-md hover:bg-amber-800/50 text-amber-200 hover:text-white transition-colors cursor-pointer"
            title="Dismiss notification"
            aria-label="Dismiss banner"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
