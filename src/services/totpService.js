import speakeasy from 'speakeasy';
import qrcode from 'qrcode';
import { env } from '../config/env.js';

export function generateSecret(label) {
  const secret = speakeasy.generateSecret({
    name: `${env.APP_NAME} (${label})`,
    length: 20
  });
  return secret; // {ascii, hex, base32, otpauth_url}
}

export function verifyToken(base32Secret, token) {
  return speakeasy.totp.verify({
    secret: base32Secret,
    encoding: 'base32',
    token,
    window: 1
  });
}

export async function otpauthToDataURL(otpauthUrl) {
  return qrcode.toDataURL(otpauthUrl);
}

