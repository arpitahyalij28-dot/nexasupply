// Logistics Twin - Plan & Subscription Simulation Engine (src/lib/plan.js)
// Client-side demo simulation of "Logistics Twin Pro" (Rs 4,999/month, 30-day free trial).
// Pure, deterministic functions with custom now-injection for unit testing.

import React, { useState, useEffect } from 'react';

export const PLAN_STORAGE_KEY = 'logistics_twin_plan';
export const PLAN_PRICE_INR = 4999;
export const PLAN_PRICE_FORMATTED = 'Rs 4,999';
export const TRIAL_DAYS_DURATION = 30;

/**
 * Safe accessor for localStorage across browser and test environments
 */
function getStorage() {
  if (typeof globalThis !== 'undefined' && globalThis.localStorage) return globalThis.localStorage;
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  return null;
}

/**
 * Normalizes input date/timestamp to Date object
 */
function parseNow(now) {
  if (!now) return new Date();
  if (now instanceof Date) return now;
  return new Date(now);
}

/**
 * Returns the current plan state.
 * @param {Date|string|number} [now] Optional reference time (defaults to new Date())
 * @returns {object} Plan state object
 */
export function getPlanState(now = new Date()) {
  const currentDate = parseNow(now);
  let record = null;

  try {
    const storage = getStorage();
    if (storage) {
      const raw = storage.getItem(PLAN_STORAGE_KEY);
      if (raw) {
        record = JSON.parse(raw);
      }
    }
  } catch (err) {
    console.warn('[plan] Failed to read localStorage:', err);
  }

  // 1. Uninitialized / No plan record
  if (!record || !record.status) {
    return {
      plan: 'none',
      status: 'none',
      isTrial: false,
      isPro: false,
      isExpired: false,
      daysLeft: 0,
      trialStart: null,
      trialEnd: null,
      formattedPrice: PLAN_PRICE_FORMATTED,
      priceInr: PLAN_PRICE_INR,
    };
  }

  // 2. Upgraded to Pro
  if (record.status === 'pro') {
    return {
      plan: 'pro',
      status: 'pro',
      isTrial: false,
      isPro: true,
      isExpired: false,
      daysLeft: 0,
      trialStart: record.trialStart || null,
      trialEnd: record.trialEnd || null,
      upgradedAt: record.upgradedAt || null,
      formattedPrice: PLAN_PRICE_FORMATTED,
      priceInr: PLAN_PRICE_INR,
    };
  }

  // 3. Trial evaluation
  const trialEnd = new Date(record.trialEnd);
  const trialStart = new Date(record.trialStart);

  // Time remaining in milliseconds
  const diffMs = trialEnd.getTime() - currentDate.getTime();

  // If expired
  if (diffMs <= 0 || record.status === 'expired') {
    return {
      plan: 'pro',
      status: 'expired',
      isTrial: false,
      isPro: false,
      isExpired: true,
      daysLeft: 0,
      trialStart: record.trialStart,
      trialEnd: record.trialEnd,
      formattedPrice: PLAN_PRICE_FORMATTED,
      priceInr: PLAN_PRICE_INR,
    };
  }

  // Mid-trial (ceil ensures 1-30 days left)
  const daysLeft = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

  return {
    plan: 'pro',
    status: 'trial',
    isTrial: true,
    isPro: false,
    isExpired: false,
    daysLeft,
    trialStart: record.trialStart,
    trialEnd: record.trialEnd,
    formattedPrice: PLAN_PRICE_FORMATTED,
    priceInr: PLAN_PRICE_INR,
  };
}

/**
 * Starts a 30-day free trial.
 * @param {Date|string|number} [now]
 * @returns {object} updated plan state
 */
export function startTrial(now = new Date()) {
  const startDate = parseNow(now);
  const endDate = new Date(startDate.getTime() + TRIAL_DAYS_DURATION * 24 * 60 * 60 * 1000);

  const record = {
    plan: 'pro',
    status: 'trial',
    trialStart: startDate.toISOString(),
    trialEnd: endDate.toISOString(),
  };

  try {
    const storage = getStorage();
    if (storage) {
      storage.setItem(PLAN_STORAGE_KEY, JSON.stringify(record));
    }
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('plan_updated', { detail: record }));
    }
  } catch (err) {
    console.warn('[plan] Failed to write localStorage:', err);
  }

  return getPlanState(startDate);
}

/**
 * Upgrades subscription to Pro.
 * @param {Date|string|number} [now]
 * @returns {object} updated plan state
 */
export function upgrade(now = new Date()) {
  const currentDate = parseNow(now);
  let existing = null;

  try {
    const storage = getStorage();
    if (storage) {
      const raw = storage.getItem(PLAN_STORAGE_KEY);
      if (raw) existing = JSON.parse(raw);
    }
  } catch {}

  const record = {
    plan: 'pro',
    status: 'pro',
    trialStart: existing?.trialStart || null,
    trialEnd: existing?.trialEnd || null,
    upgradedAt: currentDate.toISOString(),
  };

  try {
    const storage = getStorage();
    if (storage) {
      storage.setItem(PLAN_STORAGE_KEY, JSON.stringify(record));
    }
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('plan_updated', { detail: record }));
    }
  } catch (err) {
    console.warn('[plan] Failed to write localStorage:', err);
  }

  return getPlanState(currentDate);
}

/**
 * Resets plan state in localStorage (demo simulation restart).
 * @returns {object}
 */
export function resetPlan() {
  try {
    const storage = getStorage();
    if (storage) {
      storage.removeItem(PLAN_STORAGE_KEY);
    }
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('plan_updated', { detail: null }));
    }
  } catch (err) {
    console.warn('[plan] Failed to reset localStorage:', err);
  }

  return getPlanState();
}

/**
 * React hook to listen for live subscription changes across tabs and components
 */
export function usePlan() {
  const [planState, setPlanState] = useState(() => getPlanState());

  useEffect(() => {
    const handleUpdate = () => {
      setPlanState(getPlanState());
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('plan_updated', handleUpdate);
      window.addEventListener('storage', handleUpdate);
      return () => {
        window.removeEventListener('plan_updated', handleUpdate);
        window.removeEventListener('storage', handleUpdate);
      };
    }
  }, []);

  return {
    ...planState,
    startTrial: (now) => {
      const res = startTrial(now);
      setPlanState(res);
      return res;
    },
    upgrade: (now) => {
      const res = upgrade(now);
      setPlanState(res);
      return res;
    },
    resetPlan: () => {
      const res = resetPlan();
      setPlanState(res);
      return res;
    },
  };
}
