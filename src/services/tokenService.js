import { env } from '../config/env.js';

const TOKEN_VALUE_INR = Number(env.TOKEN_VALUE_INR || 10);

export function getTokenValueInr() {
  return TOKEN_VALUE_INR;
}

export function inrToTokens(amountInr) {
  const value = Number(amountInr) || 0;
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Number((value / TOKEN_VALUE_INR).toFixed(4));
}

export function tokensToInr(tokenCount, perTokenValue = TOKEN_VALUE_INR) {
  const tokens = Number(tokenCount) || 0;
  const value = Number(perTokenValue) || TOKEN_VALUE_INR;
  if (!Number.isFinite(tokens) || tokens <= 0) return 0;
  return Number((tokens * value).toFixed(2));
}
