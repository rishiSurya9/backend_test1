import { env } from '../config/env.js';

let twilioClientPromise = null;
async function getTwilioClient() {
  if (!twilioClientPromise) {
    twilioClientPromise = (async () => {
      try {
        if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN) {
          const twilioMod = await import('twilio');
          return twilioMod.default(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
        }
      } catch (_) {
        // optional dependency not installed or failed; use dev fallback
      }
      return null;
    })();
  }
  return twilioClientPromise;
}

export async function sendOtpSms(phone, code) {
  const body = `Your verification code is: ${code}`;
  const client = await getTwilioClient();
  if (client && env.TWILIO_FROM_NUMBER) {
    try {
      return await client.messages.create({
        from: env.TWILIO_FROM_NUMBER,
        to: phone,
        body
      });
    } catch (e) {
      // Fall back for local/testing if Twilio rejects (e.g., trial unverified number)
      console.warn(`[SMS:TWILIO-ERROR] to=${phone} err=${e?.message || e}`);
      console.log(`[SMS:DEV] to=${phone} body="${body}"`);
      return { sid: 'dev-sms', status: 'queued', note: 'twilio-fallback' };
    }
  }
  // Fallback for dev environments
  console.log(`[SMS:DEV] to=${phone} body="${body}"`);
  return { sid: 'dev-sms', status: 'queued' };
}
