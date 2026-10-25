// Logistics Twin - Health Check Endpoint
// GET /api/health
// Reports service status, version, and database reachability (true/false) without leaking secrets.

import { setCorsHeaders, jsonResponse, checkRateLimit, errorResponse } from './_utils.js';
import { supabase, isSupabaseConfigured } from '../src/lib/supabaseClient.js';

const startTime = Date.now();

export default async function handler(req, res) {
  if (setCorsHeaders(req, res)) return;

  const rateCheck = checkRateLimit(req);
  if (!rateCheck.allowed) {
    return errorResponse(res, 429, 'Rate limit exceeded. Please wait.');
  }

  let dbReachable = false;
  let dbLatencyMs = null;

  if (isSupabaseConfigured && supabase) {
    const dbStart = performance.now();
    try {
      // Light ping query to verify connectivity
      const { error } = await supabase.from('networks').select('id', { head: true, count: 'exact' });
      dbLatencyMs = Number((performance.now() - dbStart).toFixed(2));
      dbReachable = !error;
    } catch {
      dbReachable = false;
    }
  }

  return jsonResponse(res, 200, {
    status: 'healthy',
    service: 'Logistics Twin Serverless API',
    version: '2.0.0',
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
    database: {
      configured: isSupabaseConfigured,
      reachable: dbReachable,
      latencyMs: dbLatencyMs,
    },
    system: {
      nodeVersion: process.version,
    },
    timestamp: new Date().toISOString(),
  });
}
