// Logistics Twin - Real Multi-User Auth Provider
// Supports dual modes:
// 1. Supabase Cloud Auth (Email+Password, Magic Link, Profiles table RBAC)
// 2. Offline Demo Sandbox (Planner, Driver, Buyer personas, localStorage persistence)
// Exports useAuth() with identical public signature to prevent breaking existing components.

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient.js';

export const AuthContext = createContext(null);

const DEMO_PROFILES = {
  planner: {
    id: 'demo-planner-1',
    email: 'planner@demo.reroute',
    full_name: 'Regional Supply Network Planner',
    role: 'planner',
    org_id: 'demo-org',
    org_name: 'Western Corridor Logistics Consortium',
    preferred_language: 'en',
  },
  driver: {
    id: 'demo-driver-1',
    email: 'driver@demo.reroute',
    full_name: 'Driver Suresh Patil',
    role: 'driver',
    org_id: 'demo-org',
    org_name: 'Western Corridor Logistics Consortium',
    vehicle_id: 'veh-nashik-1',
    preferred_language: 'hi',
  },
  buyer: {
    id: 'demo-buyer-1',
    email: 'buyer@demo.reroute',
    full_name: 'Thane Civil Hospital Purchaser',
    role: 'buyer',
    org_id: 'demo-org',
    org_name: 'Western Corridor Logistics Consortium',
    buyer_id: 'buy-thane-med',
    preferred_language: 'en',
  },
};

const STORAGE_KEYS = {
  DEMO_ROLE: 'logistics_twin_demo_role',
  DEMO_MODE: 'logistics_twin_is_demo_user',
  LANGUAGE: 'logistics_twin_language',
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [role, setRole] = useState(() => {
    return localStorage.getItem(STORAGE_KEYS.DEMO_ROLE) || 'planner';
  });
  const [loading, setLoading] = useState(true);
  const [isDemoUser, setIsDemoUser] = useState(() => {
    if (!isSupabaseConfigured) return true;
    const stored = localStorage.getItem(STORAGE_KEYS.DEMO_MODE);
    return stored !== null ? stored === 'true' : true;
  });
  const [preferredLanguage, setPreferredLanguageState] = useState(() => {
    return localStorage.getItem(STORAGE_KEYS.LANGUAGE) || 'en';
  });

  const setPreferredLanguage = useCallback((lang) => {
    setPreferredLanguageState(lang);
    try {
      localStorage.setItem(STORAGE_KEYS.LANGUAGE, lang);
    } catch {}
  }, []);

  // Set cosmetic Demo Role (Planner / Driver / Buyer) for sandbox demo
  const setDemoRole = useCallback((newRole) => {
    const validRole = DEMO_PROFILES[newRole] ? newRole : 'planner';
    setRole(validRole);
    const demoProf = DEMO_PROFILES[validRole];
    setProfile(demoProf);
    setUser({ id: demoProf.id, email: demoProf.email });
    setIsDemoUser(true);
    try {
      localStorage.setItem(STORAGE_KEYS.DEMO_ROLE, validRole);
      localStorage.setItem(STORAGE_KEYS.DEMO_MODE, 'true');
    } catch {}
  }, []);

  // Load profile from Supabase profiles table (Strict DB RBAC)
  const loadSupabaseProfile = useCallback(async (sessionUser) => {
    if (!sessionUser || !supabase) return null;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', sessionUser.id)
        .single();

      if (error || !data) {
        console.warn('Could not fetch user profile from DB, falling back to minimal record:', error?.message);
        const fallbackProfile = {
          id: sessionUser.id,
          email: sessionUser.email,
          full_name: sessionUser.email?.split('@')[0] || 'User',
          role: 'buyer', // least privileged fallback
          org_id: 'demo-org',
        };
        setProfile(fallbackProfile);
        setRole(fallbackProfile.role);
        return fallbackProfile;
      }

      setProfile(data);
      // Strictly set role from the database profiles table
      const validatedRole = ['planner', 'driver', 'buyer', 'dispatcher', 'shipper', 'admin'].includes(data.role)
        ? (data.role === 'dispatcher' ? 'planner' : data.role === 'shipper' ? 'buyer' : data.role)
        : 'buyer';

      setRole(validatedRole);
      if (data.preferred_language) {
        setPreferredLanguage(data.preferred_language);
      }
      return data;
    } catch (err) {
      console.error('Error fetching Supabase profile:', err);
      return null;
    }
  }, [setPreferredLanguage]);

  // Session initialization
  useEffect(() => {
    let mounted = true;

    async function initSession() {
      if (!isSupabaseConfigured || !supabase) {
        // Fallback to Demo Mode
        const initialRole = localStorage.getItem(STORAGE_KEYS.DEMO_ROLE) || 'planner';
        const demoProf = DEMO_PROFILES[initialRole] || DEMO_PROFILES.planner;
        if (mounted) {
          setUser({ id: demoProf.id, email: demoProf.email });
          setProfile(demoProf);
          setRole(demoProf.role);
          setIsDemoUser(true);
          setLoading(false);
        }
        return;
      }

      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error || !session?.user) {
          // No active cloud session; check if user explicitly requested demo mode
          const storedDemo = localStorage.getItem(STORAGE_KEYS.DEMO_MODE);
          if (storedDemo === 'true' || storedDemo === null) {
            const initialRole = localStorage.getItem(STORAGE_KEYS.DEMO_ROLE) || 'planner';
            const demoProf = DEMO_PROFILES[initialRole] || DEMO_PROFILES.planner;
            if (mounted) {
              setUser({ id: demoProf.id, email: demoProf.email });
              setProfile(demoProf);
              setRole(demoProf.role);
              setIsDemoUser(true);
            }
          }
        } else if (mounted) {
          setUser(session.user);
          setIsDemoUser(false);
          await loadSupabaseProfile(session.user);
        }
      } catch (err) {
        console.warn('Session initialization warning:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    initSession();

    // Listen for auth state changes (login, logout, token refresh)
    let authSubscription = null;
    if (isSupabaseConfigured && supabase) {
      const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (!mounted) return;

        if (event === 'SIGNED_IN' && session?.user) {
          setUser(session.user);
          setIsDemoUser(false);
          localStorage.setItem(STORAGE_KEYS.DEMO_MODE, 'false');
          await loadSupabaseProfile(session.user);
          setLoading(false);
        } else if (event === 'SIGNED_OUT') {
          // Return to demo mode
          const demoProf = DEMO_PROFILES.planner;
          setUser({ id: demoProf.id, email: demoProf.email });
          setProfile(demoProf);
          setRole('planner');
          setIsDemoUser(true);
          localStorage.setItem(STORAGE_KEYS.DEMO_MODE, 'true');
          setLoading(false);
        }
      });
      authSubscription = data.subscription;
    }

    return () => {
      mounted = false;
      authSubscription?.unsubscribe?.();
    };
  }, [loadSupabaseProfile]);

  // Login with Password
  const loginWithPassword = useCallback(async (email, password) => {
    if (!isSupabaseConfigured || !supabase) {
      // In offline demo mode, accept any valid demo credentials or matching role
      const matchedRole = Object.keys(DEMO_PROFILES).find(
        (r) => DEMO_PROFILES[r].email.toLowerCase() === email.trim().toLowerCase()
      ) || 'planner';
      setDemoRole(matchedRole);
      return { user: DEMO_PROFILES[matchedRole], error: null };
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) throw error;

      setUser(data.user);
      setIsDemoUser(false);
      localStorage.setItem(STORAGE_KEYS.DEMO_MODE, 'false');
      const loadedProfile = await loadSupabaseProfile(data.user);
      return { user: data.user, profile: loadedProfile, error: null };
    } catch (err) {
      return { user: null, error: err };
    } finally {
      setLoading(false);
    }
  }, [loadSupabaseProfile, setDemoRole]);

  // Login with Magic Link
  const loginWithMagicLink = useCallback(async (email, redirectTo = null) => {
    if (!isSupabaseConfigured || !supabase) {
      setDemoRole('planner');
      return { error: null };
    }

    // Protect against open redirects: only internal paths allowed
    const safeRedirect = redirectTo && redirectTo.startsWith('/') && !redirectTo.startsWith('//') && !redirectTo.includes(':')
      ? `${window.location.origin}${redirectTo}`
      : window.location.origin;

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: safeRedirect },
    });

    return { error };
  }, [setDemoRole]);

  // Logout
  const logout = useCallback(async () => {
    if (isSupabaseConfigured && supabase && !isDemoUser) {
      try {
        await supabase.auth.signOut();
      } catch (e) {
        console.warn('SignOut note:', e);
      }
    }
    setDemoRole('planner');
  }, [isDemoUser, setDemoRole]);

  // Continue in Demo Mode directly
  const continueInDemoMode = useCallback((desiredRole = 'planner') => {
    setDemoRole(desiredRole);
  }, [setDemoRole]);

  const value = {
    user,
    profile,
    role,
    loading,
    isDemoUser,
    isSupabaseConfigured,
    preferredLanguage,
    setPreferredLanguage,
    loginWithPassword,
    loginWithMagicLink,
    logout,
    setDemoRole,
    continueInDemoMode,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    // Graceful fallback for components rendered outside AuthProvider
    return {
      user: DEMO_PROFILES.planner,
      profile: DEMO_PROFILES.planner,
      role: 'planner',
      loading: false,
      isDemoUser: true,
      isSupabaseConfigured: false,
      preferredLanguage: 'en',
      setPreferredLanguage: () => {},
      loginWithPassword: async () => ({ user: DEMO_PROFILES.planner }),
      loginWithMagicLink: async () => {},
      logout: async () => {},
      setDemoRole: () => {},
      continueInDemoMode: () => {},
    };
  }
  return context;
}

export default AuthProvider;
