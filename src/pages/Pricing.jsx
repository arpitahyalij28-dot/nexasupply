// Logistics Twin - Plan & Pricing Page (/pricing)
// Track 3-05: Disruption-Aware Logistics Twin for Regional Supply Networks
// Features "Logistics Twin Pro" at Rs 4,999/month with 30-day free trial.
// 100% client-side demo simulation with NO real payment taken.

import React from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle2,
  Sparkles,
  ShieldCheck,
  Zap,
  ArrowRight,
  HelpCircle,
  RotateCcw,
  Truck,
  Layers,
  Activity,
  AlertTriangle,
  Clock,
  ChevronRight,
  FileCheck,
} from 'lucide-react';
import { usePlan, PLAN_PRICE_FORMATTED } from '../lib/plan';
import { useReRoute } from '../context/ReRouteContext';

export default function Pricing() {
  const {
    status,
    isTrial,
    isPro,
    isExpired,
    daysLeft,
    startTrial,
    upgrade,
    resetPlan,
  } = usePlan();

  const { showToast } = useReRoute();

  const handleStartTrial = () => {
    startTrial();
    showToast?.('30-Day Free Trial Activated! Welcome to Logistics Twin Pro (Demo).', 'success');
  };

  const handleUpgrade = () => {
    upgrade();
    showToast?.('Upgraded to Logistics Twin Pro! Subscription active (Demo).', 'success');
  };

  const handleReset = () => {
    resetPlan();
    showToast?.('Subscription reset to initial trial state (Demo).', 'info');
  };

  // Features verified in actual codebase
  const REAL_FEATURES = [
    {
      title: 'Interactive Regional Supply Network View',
      desc: 'Topological visualizer of depots, buffer warehouses, buyers, and connecting freight corridors.',
    },
    {
      title: 'Real-Time Disruption & Problem Simulator',
      desc: 'Simulate severe weather, road blockages, landslide closures, and depot stock drops in 1 click.',
    },
    {
      title: 'Automated Recovery Plan Engine',
      desc: 'Constrained multi-commodity flow solver that re-routes disrupted cargo allocations in <400ms.',
    },
    {
      title: '3-Way Comparative Plan Analysis',
      desc: 'Side-by-side comparison of Normal Baseline, Disrupted Basic, and Optimized Recovery plans.',
    },
    {
      title: 'Dispatch Plan Integrity Validator',
      desc: 'Automated 6-item pre-departure audit enforcing truck payload limits and buyer deadlines.',
    },
    {
      title: 'Transparent Operational Explainability Breakdown',
      desc: 'Factor-level decision math explaining detour km, ETA buffer, capacity utilization, and cost yield.',
    },
    {
      title: 'Driver Console & Buyer Consignment Portals',
      desc: 'Dedicated touch interfaces for mobile drivers (/my-trips) and receiving buyer depots (/my-orders).',
    },
    {
      title: 'Kuhn-Munkres Fleet Assignment Optimizer',
      desc: 'Combinatorial Hungarian matching between N trucks and M shipments with zero return empty km.',
    },
    {
      title: 'Scope 1 GHG Carbon & Rupee Accounting',
      desc: 'Verified GHG Protocol Scope 1 diesel emissions calculations and net rupee savings per backhaul.',
    },
  ];

  const COMING_SOON_FEATURES = [
    {
      title: 'FASTag Electronic Toll Pass-Through Reconciliation',
      desc: 'Automatic highway toll reconciliation across NHAI corridors.',
    },
    {
      title: 'Multi-Modal Rail-Container Handoff Solver',
      desc: 'Intermodal freight transfer matching with CONCOR rakes.',
    },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-12 py-4 sm:py-8 px-2 sm:px-4">
      {/* 1. HERO SECTION */}
      <div className="text-center space-y-4">
        {/* Prominent Demo Badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-50 border border-amber-300 text-amber-900 text-xs font-bold shadow-xs">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          <span>DEMO SIMULATION • NO REAL PAYMENT IS TAKEN</span>
        </div>

        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-900 tracking-tight">
          Resilient logistics planning for regional supply networks
        </h1>
        <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
          Arm your dispatchers and fleet planners with sub-second disruption simulation, automated contingency re-routing, and verifiable Scope 1 carbon accounting.
        </p>
      </div>

      {/* 2. THE PRO PLAN CARD */}
      <div className="max-w-xl mx-auto">
        <div className="relative bg-white border-2 border-blue-600 rounded-3xl p-6 sm:p-8 shadow-xl shadow-blue-500/10 space-y-6">
          {/* Top Badges */}
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-blue-50 text-blue-700 border border-blue-200">
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              <span>Full-Featured Edition</span>
            </span>

            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-500 text-white shadow-xs">
              First month free
            </span>
          </div>

          {/* Plan Name & Price */}
          <div className="space-y-2 border-b border-slate-100 pb-5">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">
              Logistics Twin Pro
            </h2>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl sm:text-5xl font-black text-slate-900 tracking-tight">
                {PLAN_PRICE_FORMATTED}
              </span>
              <span className="text-base font-bold text-slate-500">/ month</span>
            </div>
            <p className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200 inline-block">
              Rs 0 today, Rs 4,999 from day 31. Cancel anytime.
            </p>
          </div>

          {/* Current Status Pill */}
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
            <span className="text-slate-600 font-medium">Your Current Status:</span>
            {isTrial && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-100 text-blue-800 font-bold">
                <Clock className="w-3.5 h-3.5 text-blue-600" />
                <span>Trial: {daysLeft} {daysLeft === 1 ? 'day' : 'days'} left</span>
              </span>
            )}
            {isPro && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 font-bold">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Pro Plan Active (Demo)</span>
              </span>
            )}
            {isExpired && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-100 text-rose-800 font-bold">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                <span>Trial Ended</span>
              </span>
            )}
            {!isTrial && !isPro && !isExpired && (
              <span className="text-slate-700 font-bold">Not Started (Free Trial Available)</span>
            )}
          </div>

          {/* Action CTAs */}
          <div className="space-y-2.5">
            {!isTrial && !isPro && !isExpired && (
              <button
                type="button"
                onClick={handleStartTrial}
                className="w-full min-h-[52px] px-6 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-base transition-all shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Start 30-Day Free Trial</span>
                <ArrowRight className="w-5 h-5" />
              </button>
            )}

            {isTrial && (
              <div className="space-y-2">
                <div className="min-h-[50px] px-4 rounded-2xl bg-blue-50 border border-blue-200 text-blue-900 font-bold text-sm flex items-center justify-center gap-2 text-center">
                  <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>Free Trial Active — Full Pro Features Unlocked</span>
                </div>
                <button
                  type="button"
                  onClick={handleUpgrade}
                  className="w-full min-h-[46px] px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Simulate Instant Upgrade to Pro ({PLAN_PRICE_FORMATTED}/mo)</span>
                </button>
              </div>
            )}

            {isExpired && (
              <button
                type="button"
                onClick={handleUpgrade}
                className="w-full min-h-[52px] px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-base transition-all shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Continue with Pro at {PLAN_PRICE_FORMATTED}/month (Demo)</span>
                <ArrowRight className="w-5 h-5" />
              </button>
            )}

            {isPro && (
              <div className="min-h-[50px] px-4 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-900 font-bold text-sm flex items-center justify-center gap-2 text-center">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>Active Subscription: Logistics Twin Pro</span>
              </div>
            )}

            {/* Demo Reset Link */}
            {(isTrial || isPro || isExpired) && (
              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-xs text-slate-500 hover:text-slate-800 underline inline-flex items-center gap-1 cursor-pointer font-medium"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset plan simulation (demo)</span>
                </button>
              </div>
            )}

            <p className="text-[11px] text-center text-slate-400">
              Simulation only • Zero real financial charges • Instant activation
            </p>
          </div>

          {/* Included Features List (from real verified code) */}
          <div className="space-y-3.5 pt-4 border-t border-slate-100">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">
              Verified Capabilities Included in Pro:
            </h3>

            <ul className="space-y-3">
              {REAL_FEATURES.map((feat) => (
                <li key={feat.title} className="flex items-start gap-2.5 text-xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-slate-900 block font-bold leading-tight">
                      {feat.title}
                    </strong>
                    <span className="text-slate-500 leading-normal block mt-0.5">
                      {feat.desc}
                    </span>
                  </div>
                </li>
              ))}

              {COMING_SOON_FEATURES.map((feat) => (
                <li key={feat.title} className="flex items-start gap-2.5 text-xs opacity-60">
                  <Clock className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <strong className="text-slate-700 font-bold">{feat.title}</strong>
                      <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 text-[9px] font-bold uppercase">
                        Coming soon
                      </span>
                    </div>
                    <span className="text-slate-500 block mt-0.5">{feat.desc}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* 3. HOW BILLING WORKS 3-STEP STRIP */}
      <div className="space-y-4">
        <div className="text-center">
          <h2 className="text-xl font-bold text-slate-900">How Billing Works</h2>
          <p className="text-xs text-slate-500 mt-1">Simple, predictable subscription model with zero upfront risk</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-6 bg-white border border-slate-200 rounded-3xl space-y-2 shadow-soft">
            <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 font-black text-sm flex items-center justify-center">
              1
            </div>
            <h3 className="text-sm font-bold text-slate-900">Start Free Trial</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Instant 30-day trial of all Pro tools. Rs 0 charged today with zero credit card or bank details needed.
            </p>
          </div>

          <div className="p-6 bg-white border border-slate-200 rounded-3xl space-y-2 shadow-soft">
            <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 font-black text-sm flex items-center justify-center">
              2
            </div>
            <h3 className="text-sm font-bold text-slate-900">Use for 30 Days</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Model your supply network nodes, simulate corridor closures, and solve automated contingency dispatch plans.
            </p>
          </div>

          <div className="p-6 bg-white border border-slate-200 rounded-3xl space-y-2 shadow-soft">
            <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 font-black text-sm flex items-center justify-center">
              3
            </div>
            <h3 className="text-sm font-bold text-slate-900">Auto-Continue at {PLAN_PRICE_FORMATTED}/mo</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Continue with ongoing network intelligence starting day 31. Cancel or restart anytime with one click.
            </p>
          </div>
        </div>
      </div>

      {/* 4. VALUE STRIP: Cost of 1 disruption vs Rs 4,999 (No fabricated stats, clean placeholders) */}
      <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-slate-900 to-blue-950 text-white space-y-3 shadow-xl">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 text-xs font-bold border border-blue-400/30">
          <ShieldCheck className="w-4 h-4 text-blue-400" />
          <span>ROI & Cost Resilience</span>
        </div>

        <h2 className="text-xl sm:text-2xl font-black tracking-tight">
          Cost of 1 disruption vs Rs 4,999
        </h2>

        <p className="text-xs sm:text-sm text-slate-300 max-w-3xl leading-relaxed">
          A single highway closure or severe weather bottleneck along freight arteries like the Thal Ghat can stall{' '}
          <span className="font-mono bg-blue-900/60 px-1.5 py-0.5 rounded text-blue-200 font-bold border border-blue-700/50">
            [add real figure]
          </span>{' '}
          metric tonnes of perishable agro and medical freight. Transporters routinely face idle vehicle detention fees of{' '}
          <span className="font-mono bg-blue-900/60 px-1.5 py-0.5 rounded text-blue-200 font-bold border border-blue-700/50">
            [add real figure]
          </span>{' '}
          per day, driver overtime, and late SLA penalties.
        </p>

        <p className="text-xs text-slate-400 pt-1">
          For Rs 4,999/month, Logistics Twin keeps your operations resilient by resolving contingency flow in under 400ms.
        </p>
      </div>

      {/* 5. FAQ SECTION (4 specific items) */}
      <div className="space-y-4">
        <div className="text-center">
          <h2 className="text-xl font-bold text-slate-900">Frequently Asked Questions</h2>
          <p className="text-xs text-slate-500 mt-1">Clear answers on how the subscription simulation functions</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-5 bg-white border border-slate-200 rounded-2xl space-y-1.5 shadow-soft">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-blue-600 shrink-0" />
              <span>What happens after the 30-day free trial?</span>
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed pl-6">
              After day 30, the status transitions to expired. A non-blocking banner prompts you to continue with Pro at Rs 4,999/month. Core features remain accessible for evaluators.
            </p>
          </div>

          <div className="p-5 bg-white border border-slate-200 rounded-2xl space-y-1.5 shadow-soft">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-blue-600 shrink-0" />
              <span>Can I cancel or pause anytime?</span>
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed pl-6">
              Yes, absolutely. You can cancel or reset your trial anytime from Settings or the Pricing page with zero penalty and zero lock-in period.
            </p>
          </div>

          <div className="p-5 bg-white border border-slate-200 rounded-2xl space-y-1.5 shadow-soft">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-blue-600 shrink-0" />
              <span>Is my supply network data safe?</span>
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed pl-6">
              Yes. All nodes, routes, vehicle telemetry, and disruption scenarios are strictly isolated to your organization via local browser storage or multi-tenant Supabase PostgreSQL with Row-Level Security (RLS).
            </p>
          </div>

          <div className="p-5 bg-white border border-slate-200 rounded-2xl space-y-1.5 shadow-soft">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-blue-600 shrink-0" />
              <span>Is this a real payment charge?</span>
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed pl-6">
              No. This is a demonstration pricing tier and subscription simulation. No real payment gateway is integrated and zero actual money is collected.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
