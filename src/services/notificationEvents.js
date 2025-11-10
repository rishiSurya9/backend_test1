import { eventBus } from '../events/eventBus.js';
import { EVENTS } from '../events/eventTypes.js';
import { createNotification } from './notificationService.js';
import { getTokenValueInr, tokensToInr } from './tokenService.js';

let registered = false;

export function registerNotificationHandlers() {
  if (registered) return;
  registered = true;

  eventBus.on(EVENTS.WALLET_CREDITED, async ({ userId, amount, currency } = {}) => {
    if (!userId) return;
    const formattedAmount = typeof amount === 'number' && amount > 0
      ? `${currency || 'INR'} ${amount.toFixed(2)}`
      : null;
    const message = formattedAmount
      ? `Funds added successfully. Amount: ${formattedAmount}.`
      : 'Funds added successfully.';
    try {
      await createNotification({
        userId,
        type: 'WALLET_CREDIT',
        title: 'Funds added successfully',
        message
      });
    } catch (err) {
      console.error('[NotificationEvents] wallet credit handler failed', err?.message || err);
    }
  });

  eventBus.on(EVENTS.TOKEN_PURCHASED, async ({ userId, tokens, planName, tokenValueInr } = {}) => {
    if (!userId) return;
    const perTokenValue = Number(tokenValueInr) || getTokenValueInr();
    const messageParts = ['Token credited'];
    if (typeof tokens === 'number' && tokens > 0) {
      messageParts.push(`Tokens: ${tokens}`);
      const inrValue = tokensToInr(tokens, perTokenValue);
      if (inrValue > 0) {
        messageParts.push(`Value: INR ${inrValue.toFixed(2)}`);
      }
    }
    if (planName) {
      messageParts.push(`Plan: ${planName}`);
    }
    try {
      await createNotification({
        userId,
        type: 'TOKEN_PURCHASE',
        title: 'Token credited',
        message: messageParts.join('. ') + '.'
      });
    } catch (err) {
      console.error('[NotificationEvents] token purchase handler failed', err?.message || err);
    }
  });

  eventBus.on(EVENTS.WITHDRAW_REQUESTED, async ({ userId, amount, currency, status } = {}) => {
    if (!userId) return;
    const formattedAmount = typeof amount === 'number' && amount > 0
      ? `${currency || 'INR'} ${amount.toFixed(2)}`
      : null;
    const statusText = status ? `Status: ${status}.` : '';
    const message = [
      'Withdrawal under review.',
      formattedAmount ? `Amount: ${formattedAmount}.` : null,
      statusText
    ].filter(Boolean).join(' ');
    try {
      await createNotification({
        userId,
        type: 'WITHDRAW_REQUEST',
        title: 'Withdrawal under review',
        message
      });
    } catch (err) {
      console.error('[NotificationEvents] withdraw request handler failed', err?.message || err);
    }
  });
}
