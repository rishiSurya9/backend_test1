import { prisma } from '../prisma/client.js';
import { env } from '../config/env.js';
import { inrToTokens, getTokenValueInr } from './tokenService.js';

export const PLAN_NAMES = {
  STARTER: 'Starter',
  GROWTH: 'Growth',
  PRO: 'Pro',
  ELITE: 'Elite'
};

export function usdToInr(amountUsd) {
  const usd = Number(amountUsd) || 0;
  const rate = Number(env.USD_INR_RATE || 1);
  return Math.round(usd * rate * 100) / 100;
}

export function usdToTokens(amountUsd) {
  const amountInr = usdToInr(amountUsd);
  return inrToTokens(amountInr);
}

export async function ensurePlansSeeded() {
  const specs = [
    { key: 'STARTER', name: PLAN_NAMES.STARTER, usd: env.PLAN_STARTER_USD },
    { key: 'GROWTH', name: PLAN_NAMES.GROWTH, usd: env.PLAN_GROWTH_USD },
    { key: 'PRO', name: PLAN_NAMES.PRO, usd: env.PLAN_PRO_USD },
    { key: 'ELITE', name: PLAN_NAMES.ELITE, usd: env.PLAN_ELITE_USD }
  ];

  for (const s of specs) {
    const priceUsd = Number(s.usd) || 0;
    const tokens = usdToTokens(priceUsd);
    const existing = await prisma.plan.findUnique({ where: { name: s.name } });
    if (!existing) {
      await prisma.plan.create({ data: { name: s.name, priceUsd, tokens } });
    } else {
      await prisma.plan.update({ where: { id: existing.id }, data: { priceUsd, tokens, active: true } });
    }
  }
}

export async function listActivePlans() {
  return prisma.plan.findMany({ where: { active: true }, orderBy: { priceUsd: 'asc' } });
}

export function describePlanPricing(plan) {
  const priceUsd = Number(plan.priceUsd);
  const amountInr = usdToInr(priceUsd);
  const tokens = usdToTokens(priceUsd);
  return {
    priceUsd,
    amountInr,
    tokens,
    tokenValueInr: getTokenValueInr()
  };
}
