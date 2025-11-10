import { listActivePlans, describePlanPricing } from '../services/planService.js';

export async function getPlans(_req, res, next) {
  try {
    const plans = await listActivePlans();
    const payload = plans.map((plan) => {
      const pricing = describePlanPricing(plan);
      return {
        id: plan.id,
        name: plan.name,
        active: plan.active,
        priceUsd: pricing.priceUsd,
        priceInr: pricing.amountInr,
        tokens: pricing.tokens,
        tokenValueInr: pricing.tokenValueInr
      };
    });
    res.json({ ok: true, plans: payload });
  } catch (err) { next(err); }
}
