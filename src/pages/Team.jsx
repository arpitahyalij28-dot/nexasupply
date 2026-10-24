// Logistics Twin - Team & User Management Page (Planner Only)
// Allows planners to invite drivers and buyers into the organization, assigning vehicle_id or buyer_id.
// Uses serverless /api/admin-invite with service role on the server; client never sees the service key.

import React, { useState } from 'react';
import {
  Users,
  UserPlus,
  Mail,
  User,
  Shield,
  Truck,
  ShoppingBag,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { useDataContext } from '../context/DataContext';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';

export default function Team() {
  const { role, isDemoUser, profile } = useAuth();
  const { network = {}, showToast } = useDataContext();
  const { vehicles = [], buyers = [] } = network;

  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [assignedRole, setAssignedRole] = useState('driver'); // 'driver' | 'buyer'
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id || 'veh-nashik-1');
  const [buyerId, setBuyerId] = useState(buyers[0]?.id || 'buy-thane-med');
  const [language, setLanguage] = useState('en');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);

  // Demo team roster
  const [demoMembers, setDemoMembers] = useState([
    {
      id: 'usr-1',
      email: 'planner@demo.reroute',
      fullName: 'Regional Supply Network Planner',
      role: 'planner',
      status: 'active',
      details: 'All Corridors & Control Tower',
    },
    {
      id: 'usr-2',
      email: 'driver@demo.reroute',
      fullName: 'Suresh Patil',
      role: 'driver',
      status: 'active',
      details: 'Vehicle: veh-nashik-1 (10T HCV)',
    },
    {
      id: 'usr-3',
      email: 'buyer@demo.reroute',
      fullName: 'Thane Civil Hospital Purchaser',
      role: 'buyer',
      status: 'active',
      details: 'Buyer Depot: buy-thane-med',
    },
  ]);

  async function handleInvite(e) {
    e.preventDefault();
    if (!email || !fullName) {
      setStatusMessage({ type: 'error', text: 'Email and full name are required.' });
      return;
    }

    setIsSubmitting(true);
    setStatusMessage(null);

    const payload = {
      email: email.trim(),
      fullName: fullName.trim(),
      role: assignedRole,
      vehicleId: assignedRole === 'driver' ? vehicleId : null,
      buyerId: assignedRole === 'buyer' ? buyerId : null,
      preferredLanguage: language,
      orgId: profile?.org_id || 'demo-org',
    };

    if (!isSupabaseConfigured || isDemoUser) {
      // Offline Demo Mode simulation
      setTimeout(() => {
        const newMember = {
          id: `usr-${Date.now()}`,
          email: payload.email,
          fullName: payload.fullName,
          role: payload.role,
          status: 'active',
          details: payload.role === 'driver' ? `Vehicle: ${payload.vehicleId}` : `Buyer Depot: ${payload.buyerId}`,
        };
        setDemoMembers((prev) => [...prev, newMember]);
        setIsSubmitting(false);
        setStatusMessage({
          type: 'success',
          text: `Account for ${payload.fullName} (${payload.role}) created successfully in local demo mode.`,
        });
        showToast?.(`User ${payload.fullName} invited successfully!`, 'success');
        setEmail('');
        setFullName('');
      }, 400);
      return;
    }

    // Live Serverless API Invocation
    try {
      const session = (await supabase?.auth.getSession())?.data?.session;
      const res = await fetch('/api/admin-invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify(payload),
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || 'Failed to provision team member');
      }

      setStatusMessage({
        type: 'success',
        text: `Invitation sent to ${payload.email}. Account created with role '${payload.role}'.`,
      });
      showToast?.(`Invitation dispatched to ${payload.email}`, 'success');
      setEmail('');
      setFullName('');
    } catch (err) {
      setStatusMessage({ type: 'error', text: err.message || 'Error inviting member' });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <Users className="w-6 h-6 text-blue-600" />
            <span>Team & Role Management</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage multi-tenant user access and link drivers to vehicles and buyers to demand points.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="px-3 py-1 rounded-full bg-blue-50 text-blue-700 font-bold border border-blue-200">
            {profile?.org_name || 'Western Corridor Consortium'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Invite Form */}
        <div className="lg:col-span-1 bg-white border border-slate-200 rounded-3xl p-6 shadow-soft space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <UserPlus className="w-5 h-5 text-blue-600" />
            <h2 className="text-sm font-bold text-slate-900">Invite New User</h2>
          </div>

          {statusMessage && (
            <div
              className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                  : 'bg-rose-50 text-rose-900 border border-rose-200'
              }`}
            >
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{statusMessage.text}</span>
            </div>
          )}

          <form onSubmit={handleInvite} className="space-y-3.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Full Name</label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Ramesh Kulkarni"
                  className="w-full min-h-[44px] pl-9 pr-3 rounded-xl border border-slate-300 text-xs outline-none focus:border-blue-600 bg-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Corporate Email</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ramesh@logistics.in"
                  className="w-full min-h-[44px] pl-9 pr-3 rounded-xl border border-slate-300 text-xs outline-none focus:border-blue-600 bg-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Role</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAssignedRole('driver')}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    assignedRole === 'driver'
                      ? 'bg-blue-50 border-blue-300 text-blue-700 shadow-2xs'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Truck className="w-3.5 h-3.5" />
                  <span>Driver</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAssignedRole('buyer')}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    assignedRole === 'buyer'
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-700 shadow-2xs'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <ShoppingBag className="w-3.5 h-3.5" />
                  <span>Buyer</span>
                </button>
              </div>
            </div>

            {assignedRole === 'driver' && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Assign Fleet Vehicle</label>
                <select
                  value={vehicleId}
                  onChange={(e) => setVehicleId(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 text-xs outline-none focus:border-blue-600 bg-white"
                >
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.id} — {v.type} ({v.capacity} units)
                    </option>
                  ))}
                </select>
              </div>
            )}

            {assignedRole === 'buyer' && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Assign Buyer Facility</label>
                <select
                  value={buyerId}
                  onChange={(e) => setBuyerId(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 text-xs outline-none focus:border-blue-600 bg-white"
                >
                  {buyers.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.id} — {b.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Preferred Language</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 text-xs outline-none focus:border-blue-600 bg-white"
              >
                <option value="en">English (en)</option>
                <option value="hi">Hindi (hi)</option>
                <option value="mr">Marathi (mr)</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full min-h-[44px] rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm disabled:opacity-50 mt-2"
            >
              {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              <span>{isSubmitting ? 'Provisioning...' : 'Provision User Account'}</span>
            </button>
          </form>
        </div>

        {/* Right Column: Active Members List */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-3xl p-6 shadow-soft space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-900">Current Organization Members</h2>
            <span className="text-xs text-slate-500 font-semibold">{demoMembers.length} Accounts</span>
          </div>

          <div className="space-y-2.5">
            {demoMembers.map((m) => (
              <div
                key={m.id}
                className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold shrink-0 ${
                      m.role === 'planner'
                        ? 'bg-blue-600'
                        : m.role === 'driver'
                        ? 'bg-amber-600'
                        : 'bg-emerald-600'
                    }`}
                  >
                    {m.role === 'planner' ? '👔' : m.role === 'driver' ? '🚚' : '📦'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">{m.fullName}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          m.role === 'planner'
                            ? 'bg-blue-100 text-blue-800'
                            : m.role === 'driver'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {m.role}
                      </span>
                    </div>
                    <span className="text-slate-500 text-[11px] block">{m.email}</span>
                  </div>
                </div>

                <div className="text-right sm:border-l sm:border-slate-200 sm:pl-4 text-[11px] text-slate-600">
                  <span className="font-semibold block">{m.details}</span>
                  <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 font-bold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Active RLS
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
