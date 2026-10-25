// Logistics Twin - Team Member Invite Endpoint
// POST /api/admin-invite
// Allows organization planners to provision new driver or buyer accounts using the server-side service role key.
// Never exposes the service role key to the browser.
// Planner can only invite members into their own organization.

import { z } from 'zod';
import {
  setCorsHeaders,
  jsonResponse,
  errorResponse,
  checkRateLimit,
  parseBody,
  verifyAuth,
  getSupabaseAdminClient,
  logApiError,
} from './_utils.js';

const inviteSchema = z.object({
  email: z.string().email('Valid email address is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  fullName: z.string().min(1, 'Full name is required'),
  role: z.enum(['driver', 'buyer'], {
    errorMap: () => ({ message: "Invited role must be either 'driver' or 'buyer'" }),
  }),
  vehicleId: z.string().nullable().optional(),
  buyerId: z.string().nullable().optional(),
  preferredLanguage: z.enum(['en', 'hi', 'mr']).default('en'),
});

export default async function handler(req, res) {
  if (setCorsHeaders(req, res)) return;

  if (req.method !== 'POST') {
    return errorResponse(res, 405, 'Method not allowed. Use POST.');
  }

  // 1. Authenticate caller and enforce planner role
  const auth = await verifyAuth(req, ['planner']);
  if (auth.error) {
    return errorResponse(res, auth.status, auth.error);
  }

  // 2. Strict rate limit for admin account creation (max 20 per minute)
  const rate = checkRateLimit(req, `admin-invite-${auth.user.id}`);
  if (!rate.allowed) {
    return errorResponse(res, 429, 'Rate limit exceeded for team invites. Please wait.');
  }

  // 3. Validate request payload
  const body = parseBody(req);
  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) {
    const errorMsg = (parsed.error.issues || parsed.error.errors || []).map((e) => e.message).join('; ');
    return errorResponse(res, 400, `Invalid invite details: ${errorMsg}`);
  }

  const { email, password, fullName, role, vehicleId, buyerId, preferredLanguage } = parsed.data;

  // 4. Retrieve server-side service role admin client
  const adminClient = getSupabaseAdminClient();
  if (!adminClient) {
    return errorResponse(res, 503, 'Supabase service role admin key is not configured on this server.');
  }

  try {
    // 5. Create auth user with service role
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (createError) {
      logApiError('admin-invite-create', createError, { email, role, orgId: auth.orgId });
      return errorResponse(res, 400, `Failed to create user account: ${createError.message}`);
    }

    const newUserId = newUser.user.id;

    // 6. Upsert the authoritative profile into the planner's organization
    const { error: profileError } = await adminClient
      .from('profiles')
      .upsert({
        id: newUserId,
        org_id: auth.orgId,
        full_name: fullName,
        role,
        vehicle_id: role === 'driver' ? vehicleId || null : null,
        buyer_id: role === 'buyer' ? buyerId || null : null,
        preferred_language: preferredLanguage || 'en',
        updated_at: new Date().toISOString(),
      });

    if (profileError) {
      logApiError('admin-invite-profile', profileError, { newUserId, orgId: auth.orgId });
      return errorResponse(res, 500, `User created but failed to link profile: ${profileError.message}`);
    }

    // 7. Record audit log
    await adminClient.from('audit_log').insert({
      org_id: auth.orgId,
      user_id: auth.user.id,
      action: 'INVITE_USER',
      entity: 'profiles',
      entity_id: newUserId,
      details: {
        email,
        role,
        assignedVehicleId: vehicleId || null,
        assignedBuyerId: buyerId || null,
      },
    });

    return jsonResponse(res, 201, {
      success: true,
      user: {
        id: newUserId,
        email,
        fullName,
        role,
        orgId: auth.orgId,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logApiError('admin-invite', err, { email, role, orgId: auth.orgId });
    return errorResponse(res, 500, 'Server encountered an unexpected error provisioning team member.');
  }
}
