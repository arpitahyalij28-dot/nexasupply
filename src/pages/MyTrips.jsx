// Logistics Twin - Driver Assigned Trips View (/my-trips)
// Displays active dispatched assignments for the authenticated driver's vehicle.
// Features big touch cards (48px targets, 16px+ text) and milestone transitions.

import React, { useState } from 'react';
import {
  Truck,
  MapPin,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  Navigation,
} from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { useDataContext } from '../context/DataContext';

export default function MyTrips() {
  const { profile, role, isDemoUser } = useAuth();
  const { network = {}, showToast } = useDataContext();

  const assignedVehicleId = profile?.vehicle_id || 'veh-nashik-1';

  // Demo fallback trip data
  const [trips, setTrips] = useState([
    {
      id: 'TRIP-DEMO-101',
      vehicleId: assignedVehicleId,
      vehicleType: '10T Heavy Commercial Vehicle (Tata Signa)',
      warehouseName: 'Bhiwandi Super-Fulfillment Depot',
      buyerName: 'Pune Auto Manufacturing Cluster',
      quantity: 150,
      etaHours: 3.2,
      cost: 4200,
      onTime: true,
      routeDescription: 'NH 48 Bypass (Avoided Closed Ghat)',
      status: 'planned', // planned | accepted | in_transit | delivered | failed
    },
    {
      id: 'TRIP-DEMO-102',
      vehicleId: assignedVehicleId,
      vehicleType: '10T Heavy Commercial Vehicle (Tata Signa)',
      warehouseName: 'Satpur MIDC Freight Hub, Nashik',
      buyerName: 'Thane Civil Hospital Critical Care',
      quantity: 120,
      etaHours: 2.1,
      cost: 3100,
      onTime: true,
      routeDescription: 'NH 160 Direct Arterial Corridor',
      status: 'delivered',
    },
  ]);

  function handleUpdateStatus(tripId, nextStatus) {
    setTrips((prev) =>
      prev.map((t) => (t.id === tripId ? { ...t, status: nextStatus } : t))
    );
    showToast?.(`Trip status updated to: ${nextStatus.toUpperCase()}`, 'success');
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Driver Header */}
      <div className="p-6 bg-white border border-slate-200 rounded-3xl shadow-soft flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center text-white font-bold text-xl shadow-sm">
            🚚
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-slate-900 tracking-tight">Driver Console</h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                Vehicle: {assignedVehicleId}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Assigned Driver: <strong className="text-slate-800">{profile?.full_name || 'Suresh Patil'}</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Live Dispatch Sync
          </span>
        </div>
      </div>

      {/* Trips List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-bold text-slate-900">Assigned Corridors & Trips</h2>
          <span className="text-xs text-slate-500 font-semibold">{trips.length} Dispatches</span>
        </div>

        {trips.map((trip) => (
          <div
            key={trip.id}
            className="p-6 bg-white border border-slate-200 rounded-3xl shadow-soft space-y-5"
          >
            {/* Header info */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
                  {trip.id}
                </span>
                <span className="text-xs text-slate-500 font-semibold">{trip.vehicleType}</span>
              </div>

              <div>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                    trip.status === 'delivered'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : trip.status === 'in_transit'
                      ? 'bg-blue-50 text-blue-800 border border-blue-200 animate-pulse'
                      : trip.status === 'accepted'
                      ? 'bg-amber-50 text-amber-800 border border-amber-200'
                      : 'bg-slate-100 text-slate-700 border border-slate-200'
                  }`}
                >
                  {trip.status.replace('_', ' ')}
                </span>
              </div>
            </div>

            {/* Route & Cargo Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="space-y-2 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Origin Depot</span>
                    <strong className="text-slate-900 text-sm block">{trip.warehouseName}</strong>
                  </div>
                </div>

                <div className="border-l-2 border-dashed border-slate-300 ml-2 h-4 my-0.5" />

                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Delivery Buyer Destination</span>
                    <strong className="text-slate-900 text-sm block">{trip.buyerName}</strong>
                  </div>
                </div>
              </div>

              <div className="space-y-3 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Shipped Volume:</span>
                  <strong className="text-slate-900 font-bold text-sm">{trip.quantity} Units</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Estimated Duration:</span>
                  <strong className="text-blue-600 font-bold text-sm">{trip.etaHours} Hours</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Contingency Corridor:</span>
                  <span className="text-slate-700 font-semibold">{trip.routeDescription}</span>
                </div>
              </div>
            </div>

            {/* Action Buttons with 48px Touch Targets */}
            <div className="pt-2 flex flex-wrap items-center gap-2 sm:gap-3">
              {trip.status === 'planned' && (
                <button
                  type="button"
                  onClick={() => handleUpdateStatus(trip.id, 'accepted')}
                  className="min-h-[48px] px-6 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer flex-1"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Accept Dispatch Assignment</span>
                </button>
              )}

              {trip.status === 'accepted' && (
                <button
                  type="button"
                  onClick={() => handleUpdateStatus(trip.id, 'in_transit')}
                  className="min-h-[48px] px-6 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer flex-1"
                >
                  <Navigation className="w-4 h-4" />
                  <span>Start Transit (En-route)</span>
                </button>
              )}

              {trip.status === 'in_transit' && (
                <button
                  type="button"
                  onClick={() => handleUpdateStatus(trip.id, 'delivered')}
                  className="min-h-[48px] px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer flex-1"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Confirm Cargo Delivered</span>
                </button>
              )}

              {trip.status !== 'delivered' && (
                <button
                  type="button"
                  onClick={() => handleUpdateStatus(trip.id, 'failed')}
                  className="min-h-[48px] px-4 rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 font-bold text-xs transition-colors cursor-pointer"
                >
                  Report Delay / Disruption
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
