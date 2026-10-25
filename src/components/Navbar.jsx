// Logistics Twin - Navigation Bar
// Role-based top navigation tabs connecting all system pages with demo continuity.

import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Truck,
  Package,
  Layers,
  Zap,
  Leaf,
  Sliders,
  Database,
  Users,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useReRoute } from '../context/ReRouteContext';

const PLANNER_NAV_ITEMS = [
  { path: '/', label: 'Supply Network', icon: LayoutDashboard },
  { path: '/disruptions', label: 'Problem Simulator', icon: Zap },
  { path: '/assignments', label: 'Recovery Plan', icon: Layers },
  { path: '/fleet', label: 'Fleet & Dispatch', icon: Truck },
  { path: '/loads', label: 'Loads Pool', icon: Package },
  { path: '/analytics', label: 'Resilience Analytics', icon: Leaf },
  { path: '/pricing', label: 'Pricing', icon: Sparkles },
  { path: '/team', label: 'Team', icon: Users },
  { path: '/settings', label: 'Settings', icon: Sliders },
  { path: '/data', label: 'Data Management', icon: Database },
];

export default function Navbar() {
  const { role, isDemoUser } = useAuth();
  const { isJudgeMode } = useReRoute();

  let visibleItems = [];

  if (role === 'driver') {
    visibleItems = [
      { path: '/my-trips', label: 'My Assigned Trips', icon: Truck },
      { path: '/pricing', label: 'Pricing', icon: Sparkles },
    ];
  } else if (role === 'buyer') {
    visibleItems = [
      { path: '/my-orders', label: 'My Consignment Orders', icon: Package },
      { path: '/pricing', label: 'Pricing', icon: Sparkles },
    ];
  } else {
    // Planner
    visibleItems = isJudgeMode
      ? PLANNER_NAV_ITEMS.filter((item) => item.path !== '/settings' && item.path !== '/data')
      : PLANNER_NAV_ITEMS;

    // In demo mode, also allow planners to easily preview Driver and Buyer views
    if (isDemoUser) {
      visibleItems = [
        ...visibleItems,
        { path: '/my-trips', label: 'Driver View', icon: Truck },
        { path: '/my-orders', label: 'Buyer View', icon: Package },
      ];
    }
  }

  return (
    <nav className="bg-white border-b border-[#E2E8F0] shadow-xs w-full overflow-hidden">
      <div className="max-w-[1680px] mx-auto px-3 sm:px-6 lg:px-8 flex items-center gap-1.5 overflow-x-auto py-2 no-scrollbar">
        {visibleItems.map(({ path, label, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) =>
              `flex items-center gap-2 px-3 py-2 min-h-[44px] rounded-xl text-xs font-bold transition-all shrink-0 ${
                isActive
                  ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-xs'
                  : 'text-[#64748B] hover:text-[#0F172A] hover:bg-slate-50'
              }`
            }
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
