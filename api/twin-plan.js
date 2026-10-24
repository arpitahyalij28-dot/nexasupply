// Logistics Twin - Trusted Serverless Plan Solver Endpoint
// POST /api/twin-plan
// Computes baseline, disrupted, and recovery plans server-side from DB network state.
// Only accessible to users with the 'planner' role.

import { z } from 'zod';
import {
  setCorsHeaders,
  jsonResponse,
  errorResponse,
  checkRateLimit,
  parseBody,
  verifyAuth,
  logApiError,
} from './_utils.js';
import { generatePlanComparison } from '../src/engine/planner.js';
import { validateDispatchPlan } from '../src/engine/validation.js';
import { calculateResilienceScore } from '../src/engine/resilience.js';
import { getDemoNetwork } from '../src/data/networkDemo.js';
import { mapDbToNetwork } from '../src/data/twinRepository.js';

const requestSchema = z.object({
  scenarioConfig: z.record(z.any()).default({}),
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

  // 2. Rate limit check (keyed to user ID)
  const rate = checkRateLimit(req, auth.user.id);
  if (!rate.allowed) {
    return errorResponse(res, 429, 'Rate limit exceeded for planning solver. Please wait.');
  }

  // 3. Validate request payload
  const body = parseBody(req);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    const errorMsg = (parsed.error.issues || parsed.error.errors || []).map((e) => e.message).join('; ');
    return errorResponse(res, 400, `Invalid request payload: ${errorMsg}`);
  }

  const { scenarioConfig } = parsed.data;

  try {
    const client = auth.client;

    // 4. Load authoritative network from DB for this org (never trust client network)
    const [supRes, whRes, buyRes, routeRes, vehRes] = await Promise.all([
      client.from('suppliers').select('*').eq('org_id', auth.orgId),
      client.from('warehouses').select('*').eq('org_id', auth.orgId),
      client.from('buyers').select('*').eq('org_id', auth.orgId),
      client.from('routes').select('*').eq('org_id', auth.orgId),
      client.from('vehicles').select('*').eq('org_id', auth.orgId),
    ]);

    let network;
    if (!whRes.data || whRes.data.length === 0) {
      network = getDemoNetwork();
    } else {
      network = mapDbToNetwork({
        suppliers: supRes.data || [],
        warehouses: whRes.data || [],
        buyers: buyRes.data || [],
        routes: routeRes.data || [],
        vehicles: vehRes.data || [],
      });
    }

    // 5. Execute pure engine planning comparison
    const comparison = generatePlanComparison(network, scenarioConfig);
    const normalPlan = comparison.plans.normal;
    const disruptedPlan = comparison.plans.disruptionBasic;
    const recoveryPlan = comparison.plans.recovery;

    // 6. Validate generated dispatch plans
    const normalValidation = validateDispatchPlan(normalPlan, network);
    const recoveryValidation = validateDispatchPlan(recoveryPlan, network);

    // 7. Calculate resilience score
    const resilience = calculateResilienceScore(
      recoveryPlan,
      network,
      disruptedPlan
    );

    // 8. Persist scenario into disruption_scenarios table
    const { data: scenarioRecord, error: scnErr } = await client
      .from('disruption_scenarios')
      .insert({
        org_id: auth.orgId,
        name: scenarioConfig.name || 'Simulated Disruption Scenario',
        config: scenarioConfig,
        is_active: true,
        created_by: auth.user.id,
      })
      .select()
      .single();

    const scenarioId = scenarioRecord?.id || null;

    // 9. Persist the 3 plans (normal, disruption_basic, recovery)
    const planRecords = [
      {
        org_id: auth.orgId,
        scenario_id: scenarioId,
        plan_type: 'normal',
        plan: normalPlan,
        totals: normalPlan.totals,
        validation: normalValidation,
        published: false,
        created_by: auth.user.id,
      },
      {
        org_id: auth.orgId,
        scenario_id: scenarioId,
        plan_type: 'disruption_basic',
        plan: disruptedPlan,
        totals: disruptedPlan.totals,
        published: false,
        created_by: auth.user.id,
      },
      {
        org_id: auth.orgId,
        scenario_id: scenarioId,
        plan_type: 'recovery',
        plan: recoveryPlan,
        totals: recoveryPlan.totals,
        resilience,
        validation: recoveryValidation,
        published: false,
        created_by: auth.user.id,
      },
    ];

    const { data: savedPlans, error: plansErr } = await client
      .from('plans')
      .insert(planRecords)
      .select();

    const recoveryPlanId = savedPlans?.find((p) => p.plan_type === 'recovery')?.id || null;

    return jsonResponse(res, 200, {
      success: true,
      comparison: {
        ...comparison,
        normalPlan,
        disruptedPlan,
        recoveryPlan,
        resilience,
        validation: {
          normal: normalValidation,
          recovery: recoveryValidation,
        },
      },
      scenarioId,
      recoveryPlanId,
      plansSaved: savedPlans?.length || 0,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logApiError('twin-plan', err, { orgId: auth.orgId, userId: auth.user.id });
    return errorResponse(res, 500, 'Planning computation encountered an internal failure');
  }
}
