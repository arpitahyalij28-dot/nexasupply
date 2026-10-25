// Logistics Twin - Unit Test Suite for Plan & Subscription Simulation (src/lib/plan.js)
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getPlanState,
  startTrial,
  upgrade,
  resetPlan,
  PLAN_STORAGE_KEY,
  PLAN_PRICE_INR,
  PLAN_PRICE_FORMATTED,
} from '../plan.js';

describe('Plan & Free Trial Engine (src/lib/plan.js)', () => {
  let store = {};

  beforeEach(() => {
    store = {};
    globalThis.localStorage = {
      getItem: (key) => store[key] || null,
      setItem: (key, val) => { store[key] = String(val); },
      removeItem: (key) => { delete store[key]; },
      clear: () => { store = {}; },
    };
  });

  it('1. New user: returns uninitialized state when no plan exists', () => {
    const state = getPlanState();

    expect(state.plan).toBe('none');
    expect(state.status).toBe('none');
    expect(state.isTrial).toBe(false);
    expect(state.isPro).toBe(false);
    expect(state.isExpired).toBe(false);
    expect(state.daysLeft).toBe(0);
    expect(state.trialStart).toBeNull();
    expect(state.trialEnd).toBeNull();
    expect(state.formattedPrice).toBe(PLAN_PRICE_FORMATTED);
    expect(state.priceInr).toBe(PLAN_PRICE_INR);
  });

  it('2. Start trial: establishes 30-day trial with ISO timestamps', () => {
    const t0 = new Date('2026-10-25T00:00:00.000Z');
    const state = startTrial(t0);

    expect(state.plan).toBe('pro');
    expect(state.status).toBe('trial');
    expect(state.isTrial).toBe(true);
    expect(state.isPro).toBe(false);
    expect(state.isExpired).toBe(false);
    expect(state.daysLeft).toBe(30);
    expect(state.trialStart).toBe('2026-10-25T00:00:00.000Z');
    expect(state.trialEnd).toBe('2026-11-24T00:00:00.000Z');

    // Verifies persistence in localStorage
    const raw = globalThis.localStorage.getItem(PLAN_STORAGE_KEY);
    expect(raw).toBeTruthy();
    const stored = JSON.parse(raw);
    expect(stored.status).toBe('trial');
    expect(stored.plan).toBe('pro');
  });

  it('3. Mid-trial: correctly calculates days remaining', () => {
    const t0 = new Date('2026-10-25T00:00:00.000Z');
    startTrial(t0);

    // 15 days in
    const t15 = new Date('2026-11-09T00:00:00.000Z');
    const state15 = getPlanState(t15);
    expect(state15.status).toBe('trial');
    expect(state15.isTrial).toBe(true);
    expect(state15.isExpired).toBe(false);
    expect(state15.daysLeft).toBe(15);

    // 29 days in (1 day left)
    const t29 = new Date('2026-11-23T00:00:00.000Z');
    const state29 = getPlanState(t29);
    expect(state29.status).toBe('trial');
    expect(state29.daysLeft).toBe(1);
  });

  it('4. Day 30 boundary: marks plan as expired when trialEnd is reached or surpassed', () => {
    const t0 = new Date('2026-10-25T00:00:00.000Z');
    startTrial(t0);

    // Exact boundary at trialEnd (2026-11-24T00:00:00.000Z)
    const tEnd = new Date('2026-11-24T00:00:00.000Z');
    const stateEnd = getPlanState(tEnd);
    expect(stateEnd.status).toBe('expired');
    expect(stateEnd.isTrial).toBe(false);
    expect(stateEnd.isExpired).toBe(true);
    expect(stateEnd.daysLeft).toBe(0);
  });

  it('5. Expired: post-30 days returns expired state without locking', () => {
    const t0 = new Date('2026-10-25T00:00:00.000Z');
    startTrial(t0);

    // Day 35 (past trial)
    const t35 = new Date('2026-11-29T00:00:00.000Z');
    const state35 = getPlanState(t35);
    expect(state35.status).toBe('expired');
    expect(state35.isExpired).toBe(true);
    expect(state35.isTrial).toBe(false);
    expect(state35.isPro).toBe(false);
    expect(state35.daysLeft).toBe(0);
  });

  it('6. Upgraded: transitions to full Pro subscription with isPro flag', () => {
    const t0 = new Date('2026-10-25T00:00:00.000Z');
    startTrial(t0);

    // Upgrade at day 10
    const t10 = new Date('2026-11-04T00:00:00.000Z');
    const upgradedState = upgrade(t10);

    expect(upgradedState.plan).toBe('pro');
    expect(upgradedState.status).toBe('pro');
    expect(upgradedState.isPro).toBe(true);
    expect(upgradedState.isTrial).toBe(false);
    expect(upgradedState.isExpired).toBe(false);

    // Later inspection remains pro
    const laterState = getPlanState(new Date('2026-12-01T00:00:00.000Z'));
    expect(laterState.status).toBe('pro');
    expect(laterState.isPro).toBe(true);
  });

  it('7. Reset plan: clears subscription back to uninitialized state', () => {
    const t0 = new Date('2026-10-25T00:00:00.000Z');
    startTrial(t0);
    expect(getPlanState(t0).status).toBe('trial');

    const resetState = resetPlan();
    expect(resetState.status).toBe('none');
    expect(resetState.plan).toBe('none');
    expect(resetState.isTrial).toBe(false);
    expect(resetState.isPro).toBe(false);
    expect(globalThis.localStorage.getItem(PLAN_STORAGE_KEY)).toBeNull();
  });
});
