import crypto from 'crypto';
import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 12;

export function randomDigits(length = 6) {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += Math.floor(Math.random() * 10).toString();
  }
  return code;
}

function sha256Hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function hashOtpCode(code) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = sha256Hex(code + salt);
  return { salt, hash };
}

export function verifyOtpCode(code, salt, expectedHash) {
  return sha256Hex(code + salt) === expectedHash;
}

export async function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain, hash) {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
}

