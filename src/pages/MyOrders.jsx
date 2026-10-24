// Logistics Twin - Buyer Consignment Orders View (/my-orders)
// Displays inbound shipment status for the authenticated buyer facility.
// Shows needed vs on the way vs delivered vs late, with plain-language explanations.

import React, { useState } from 'react';
import {
  ShoppingBag,
  Package,
  Clock,
  CheckCircle2,
  AlertCircle,
  Truck,
  ShieldCheck,
  Calendar,
} from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { useDataContext } from '../context/DataContext';

export default function MyOrders() {
  const { profile, role, isDemoUser } = useAuth();
  const { network = {} } = useDataContext();

  const assignedBuyerId = profile?.buyer_id || 'buy-thane-med';
  const buyerEntity = network.buyers?.find((b) => b.id === assignedBuyerId) || {
    id: assignedBuyerId,
    name: 'Thane Civil Hospital Emergency Supplies',
    demandQty: 200,
    deadline: 6.0,
    priority: 'high',
  };

  const [orders] = useState([
    {
      id: 'ORD-THANE-01',
      buyerId: assignedBuyerId,
      product: 'Critical Hospital Medical Supplies & ICU Kits',
      demandQty: 200,
      deliveredQty: 200,
      onWayQty: 0,
      deadlineHours: buyerEntity.deadline || 6.0,
      etaHours: 3.4,
      status: 'delivered', // 'needed' | 'on_the_way' | 'delivered' | 'late'
      dispatchedFrom: 'Bhiwandi Super-Fulfillment Depot',
      assignedTruck: 'veh-nashik-1 (10T HCV)',
      reason: 'Delivered on-time via Murbad-Kalyan bypass corridor, avoiding Kasara Ghat closure.',
    },
    {
      id: 'ORD-THANE-02',
      buyerId: assignedBuyerId,
      product: 'Perishable Pharmaceuticals & Cold Chain Drugs',
      demandQty: 100,
      deliveredQty: 0,
      onWayQty: 100,
      deadlineHours: 8.0,
      etaHours: 5.2,
      status: 'on_the_way',
      dispatchedFrom: 'Central Nashik Consolidated Depot (Satpur)',
      assignedTruck: 'veh-nashik-3 (LCV 3.5T)',
      reason: 'In-transit along NH 160. ETA is well within the 8.0h deadline window.',
    },
  ]);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Buyer Facility Banner */}
      <div className="p-6 bg-white border border-slate-200 rounded-3xl shadow-soft flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white font-bold text-xl shadow-sm">
            📦
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-slate-900 tracking-tight">Buyer Order Portal</h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 uppercase">
                Priority: {buyerEntity.priority}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Receiving Facility: <strong className="text-slate-800">{buyerEntity.name}</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 font-semibold text-slate-700">
            Facility ID: <code className="font-bold text-blue-600">{assignedBuyerId}</code>
          </span>
        </div>
      </div>

      {/* Orders Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-soft">
          <span className="text-[10px] font-bold text-slate-400 uppercase block">Total Demand</span>
          <span className="text-xl font-black text-slate-900 mt-1 block">300 Units</span>
        </div>
        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-soft">
          <span className="text-[10px] font-bold text-emerald-600 uppercase block">Delivered</span>
          <span className="text-xl font-black text-emerald-700 mt-1 block">200 Units</span>
        </div>
        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-soft">
          <span className="text-[10px] font-bold text-blue-600 uppercase block">On The Way</span>
          <span className="text-xl font-black text-blue-700 mt-1 block">100 Units</span>
        </div>
        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-soft">
          <span className="text-[10px] font-bold text-slate-400 uppercase block">Late / Shortfall</span>
          <span className="text-xl font-black text-slate-400 mt-1 block">0 Units</span>
        </div>
      </div>

      {/* Order Cards */}
      <div className="space-y-4">
        <h2 className="text-sm font-bold text-slate-900 px-1">Active Inbound Consignments</h2>

        {orders.map((ord) => (
          <div
            key={ord.id}
            className="p-6 bg-white border border-slate-200 rounded-3xl shadow-soft space-y-4"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                  {ord.id}
                </span>
                <strong className="text-xs text-slate-900">{ord.product}</strong>
              </div>

              <div>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                    ord.status === 'delivered'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : ord.status === 'on_the_way'
                      ? 'bg-blue-50 text-blue-800 border border-blue-200'
                      : 'bg-amber-50 text-amber-800 border border-amber-200'
                  }`}
                >
                  {ord.status.replace('_', ' ')}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-slate-50 p-4 rounded-2xl border border-slate-200">
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Dispatched From</span>
                <span className="font-bold text-slate-800 block mt-0.5">{ord.dispatchedFrom}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Vehicle Assigned</span>
                <span className="font-bold text-slate-800 block mt-0.5">{ord.assignedTruck}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">ETA vs Deadline</span>
                <span className="font-bold text-emerald-700 block mt-0.5">
                  {ord.etaHours}h / {ord.deadlineHours}h Deadline
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-600 bg-slate-100/70 p-3 rounded-xl border border-slate-200">
              💡 <strong className="text-slate-800">Twin Optimization Audit:</strong> {ord.reason}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
