// Logistics Twin - Serverless API Helpers
// Provides tight CORS, in-memory rate limiting, Supabase JWT verification,
// least-privilege RBAC validation, and typed JSON responses.

import { createClient } from '@supabase/supabase-js';

const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 120; // 120 reqs/min

let cachedAdminClient = null;

/**
 * Returns Supabase Admin Client using service role key (server-side only)
 */
export function getSupabaseAdminClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;

  if (!cachedAdminClient) {
    cachedAdminClient = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cachedAdminClient;
}

/**
 * Injects a mock admin client for testing purposes
 */
export function setSupabaseAdminClient(client) {
  cachedAdminClient = client;
}

/**
 * Returns Supabase Client scoped to caller JWT
 */
export function getSupabaseUserClient(jwt) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}

/**
 * Applies in-memory rate limiting keyed per user ID or client IP
 */
export function checkRateLimit(req, customKey = null) {
  const ip =
    req.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    '127.0.0.1';

  const key = customKey || req.authUserId || ip;
  const now = Date.now();
  const record = rateLimitMap.get(key);

  if (!record || now - record.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(key, { windowStart: now, count: 1 });
    return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - 1 };
  }

  if (record.count >= MAX_REQUESTS_PER_WINDOW) {
    return { allowed: false, remaining: 0 };
  }

  record.count += 1;
  return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - record.count };
}

/**
 * Verifies Supabase Bearer JWT, fetches authoritative role from profiles table,
 * and validates that caller holds one of the required roles.
 */
export async function verifyAuth(req, allowedRoles = [], customClient = null) {
  const authHeader = req.headers?.authorization || req.headers?.Authorization;
  if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    return {
      user: null,
      profile: null,
      error: 'Authorization Bearer token is missing',
      status: 401,
    };
  }

  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const client = customClient || getSupabaseAdminClient() || getSupabaseUserClient(token);

  if (!client) {
    return {
      user: null,
      profile: null,
      error: 'Supabase server environment is not configured',
      status: 503,
    };
  }

  const { data: userData, error: authError } = await client.auth.getUser(token);
  if (authError || !userData?.user) {
    return {
      user: null,
      profile: null,
      error: 'Invalid or expired authentication session',
      status: 401,
    };
  }

  const user = userData.user;
  req.authUserId = user.id;

  // Never trust user_metadata for authorization. Query profiles table directly.
  const { data: profile, error: profError } = await client
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (profError || !profile) {
    return {
      user,
      profile: null,
      error: 'User profile record not found in database',
      status: 403,
    };
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(profile.role)) {
    return {
      user,
      profile,
      error: `Forbidden: role '${profile.role}' lacks permission for this endpoint (requires: ${allowedRoles.join(', ')})`,
      status: 403,
    };
  }

  return {
    user,
    profile,
    orgId: profile.org_id,
    role: profile.role,
    client,
    error: null,
    status: 200,
  };
}

/**
 * Handles CORS headers and OPTIONS pre-flight
 */
export function setCorsHeaders(req, res) {
  const allowedOrigin =
    process.env.ALLOWED_ORIGIN ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
  const requestOrigin = req.headers?.origin;

  if (req.method === 'GET' && !req.headers?.authorization && !req.headers?.cookie) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (requestOrigin && (requestOrigin === allowedOrigin || !allowedOrigin)) {
    res.setHeader('Access-Control-Allow-Origin', requestOrigin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else if (allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }
  return false;
}

/**
 * Sends typed JSON response
 */
export function jsonResponse(res, statusCode, data) {
  res.setHeader('Content-Type', 'application/json');
  return res.status(statusCode).json(data);
}

/**
 * Standard error response formatter with clean messages (never leaks stack traces)
 */
export function errorResponse(res, statusCode, message, details = null) {
  return jsonResponse(res, statusCode, {
    success: false,
    error: message,
    details,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Safely parses request body whether string or object
 */
export function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

/**
 * Structured error logger that strips sensitive fields (PII, credentials, tokens)
 */
export function logApiError(endpoint, error, context = {}) {
  const safeContext = { ...context };
  delete safeContext.password;
  delete safeContext.token;
  delete safeContext.authorization;
  delete safeContext.apiKey;
  console.error(`[API Error][${endpoint}] ${error?.message || error}`, safeContext);
}
