import { prisma } from '../prisma/client.js';
import { env } from '../config/env.js';
import { randomDigits, hashOtpCode, verifyOtpCode, hashPassword, verifyPassword } from '../utils/crypto.js';
import { sendEmail } from '../services/emailService.js';
import { sendOtpSms } from '../services/smsService.js';
import { signAccessToken } from '../utils/jwt.js';
import { assignSponsorAndPlaceUser, recalculateQualificationLevel } from '../services/matrixService.js';
import { ensureUserActivityStatus } from '../services/activityService.js';

const COOKIE_NAME = 'access_token';
const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'none',
  secure: true,
  maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
};

function setAuthCookie(_req, res, token) {
  try {
    res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);
  } catch (_) {
    // cookie may fail in some envs; ignore to not block API
  }
}

function assert(condition, message = 'Bad Request', code = 400) {
  if (!condition) {
    const err = new Error(message);
    err.status = code;
    throw err;
  }
}

function nowPlusMs(ms) {
  return new Date(Date.now() + ms);
}

function buildOtpEmail(code) {
  return {
    subject: `${env.APP_NAME} - Your verification code`,
    text: `Your verification code is: ${code}`
  };
}

async function sendOtpEmail(to, code) {
  const { subject, text } = buildOtpEmail(code);
  await sendEmail(to, subject, text);
}

async function findUserByIdentifier(identifier) {
  if (!identifier) return null;
  if (identifier.includes('@')) {
    return prisma.user.findUnique({ where: { email: identifier } });
  }
  return prisma.user.findUnique({ where: { phone: identifier } });
}

// Generic OTP request (EMAIL/PHONE)
export async function requestOtp(req, res, next) {
  try {
    const { type, identifier } = req.body || {};
    assert(type === 'EMAIL' || type === 'PHONE', 'type must be EMAIL or PHONE');
    assert(typeof identifier === 'string' && identifier.trim().length > 3, 'identifier required');

    const code = randomDigits(6);
    const { hash, salt } = hashOtpCode(code);
    const expiresAt = nowPlusMs(10 * 60 * 1000);

    await prisma.oTP.create({
      data: { type, identifier, codeHash: hash, salt, expiresAt }
    });

    if (type === 'EMAIL') await sendOtpEmail(identifier, code);
    else await sendOtpSms(identifier, code);

    res.json({ ok: true, expiresAt });
  } catch (err) { next(err); }
}

// Generic OTP verify (creates user if missing)
export async function verifyOtp(req, res, next) {
  try {
    const { type, identifier, code, referralCode } = req.body || {};
    assert(type === 'EMAIL' || type === 'PHONE', 'type must be EMAIL or PHONE');
    assert(typeof identifier === 'string', 'identifier required');
    assert(typeof code === 'string' && code.length >= 4, 'code required');

    const otp = await prisma.oTP.findFirst({
      where: { type, identifier, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' }
    });
    assert(otp, 'Invalid or expired code', 400);
    assert(verifyOtpCode(code, otp.salt, otp.codeHash), 'Invalid code', 400);
    await prisma.oTP.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });

    let user = await findUserByIdentifier(identifier);
    if (!user) {
      const userData = type === 'EMAIL'
        ? { email: identifier, emailVerifiedAt: new Date() }
        : { phone: identifier, phoneVerifiedAt: new Date() };
      user = await prisma.$transaction(async (tx) => {
        const created = await tx.user.create({ data: userData });
        const placed = await assignSponsorAndPlaceUser({ userId: created.id, referralCode }, tx);
        if (placed?.sponsorId) {
          await recalculateQualificationLevel(placed.sponsorId, tx);
        }
        return placed;
      });
    } else {
      user = await prisma.user.update({
        where: { id: user.id },
        data: type === 'EMAIL' ? { emailVerifiedAt: new Date() } : { phoneVerifiedAt: new Date() }
      });
      if (referralCode) {
        const placed = await assignSponsorAndPlaceUser({ userId: user.id, referralCode });
        if (placed?.sponsorId) {
          await recalculateQualificationLevel(placed.sponsorId);
        }
        user = placed;
      }
    }

    const token = signAccessToken({ id: user.id });
    setAuthCookie(req, res, token);
    res.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        username: user.username,
        activityStatus: user.activityStatus,
        isActive: user.isActive,
        sponsorId: user.sponsorId,
        parentId: user.parentId,
        matrixLevel: user.matrixLevel,
        qualificationLevel: user.qualificationLevel
      },
      token
    });
  } catch (err) { next(err); }
}

// Signup: create account, send phone OTP to verify phone, no token yet
export async function signup(req, res, next) {
  try {
    const { username, email, phone, password, referralCode } = req.body || {};
    assert(username && typeof username === 'string', 'username required');
    assert(email || phone, 'email or phone required');
    assert(password, 'password required');

    const passwordHash = await hashPassword(password);
    const data = { username, passwordHash };
    if (email) data.email = email;
    if (phone) data.phone = phone;

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({ data });
      const placed = await assignSponsorAndPlaceUser({ userId: created.id, referralCode }, tx);
      if (placed?.sponsorId) {
        await recalculateQualificationLevel(placed.sponsorId, tx);
      }
      return placed;
    });

    if (phone) {
      const code = randomDigits(6);
      const { hash, salt } = hashOtpCode(code);
      const expiresAt = nowPlusMs(10 * 60 * 1000);
      await prisma.oTP.create({ data: { type: 'PHONE', identifier: phone, codeHash: hash, salt, expiresAt, userId: user.id } });
      await sendOtpSms(phone, code);
    }

    res.status(201).json({
      ok: true,
      next: 'verify_phone',
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        username: user.username,
        sponsorId: user.sponsorId,
        parentId: user.parentId,
        matrixLevel: user.matrixLevel,
        activityStatus: user.activityStatus,
        isActive: user.isActive,
        qualificationLevel: user.qualificationLevel
      }
    });
  } catch (err) {
    if (err.code === 'P2002') {
      err.status = 409;
      err.message = 'Username/email/phone already in use';
    }
    next(err);
  }
}

// Verify phone OTP: mark phone as verified and return JWT to allow set-pin
export async function verifyPhoneOtp(req, res, next) {
  try {
    const { phone, code } = req.body || {};
    assert(typeof phone === 'string', 'phone required');
    assert(typeof code === 'string', 'code required');

    const user = await prisma.user.findUnique({ where: { phone } });
    assert(user, 'User not found', 404);

    const otp = await prisma.oTP.findFirst({
      where: { type: 'PHONE', identifier: phone, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' }
    });
    assert(otp, 'Invalid or expired code', 400);
    assert(verifyOtpCode(code, otp.salt, otp.codeHash), 'Invalid code', 400);
    await prisma.oTP.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });

    const updated = await prisma.user.update({ where: { id: user.id }, data: { phoneVerifiedAt: new Date() } });
    const token = signAccessToken({ id: updated.id });
    setAuthCookie(req, res, token);
    res.json({ ok: true, next: 'set_transaction_pin', token });
  } catch (err) { next(err); }
}

// Set 4-digit transaction PIN (auth required, phone must be verified)
export async function setTransactionPin(req, res, next) {
  try {
    const { pin } = req.body || {};
    assert(typeof pin === 'string' && /^\d{4}$/.test(pin), 'pin must be 4 digits');

    const me = await prisma.user.findUnique({ where: { id: req.user.id } });
    assert(me, 'Unauthorized', 401);
    assert(me.phoneVerifiedAt, 'Phone not verified');

    const pinHash = await hashPassword(pin);
    await prisma.user.update({ where: { id: me.id }, data: { pinHash } });
    res.json({ ok: true });
  } catch (err) { next(err); }
}

// Login with password or OTP (email/phone based on identifier)
export async function login(req, res, next) {
  try {
    const { identifier, password, code } = req.body || {};
    assert(identifier, 'identifier required');

    const user = await findUserByIdentifier(identifier);
    assert(user, 'Invalid credentials', 401);

    if (password) {
      assert(await verifyPassword(password, user.passwordHash), 'Invalid credentials', 401);
    } else if (code) {
      const type = identifier.includes('@') ? 'EMAIL' : 'PHONE';
      const otp = await prisma.oTP.findFirst({
        where: { type, identifier, consumedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' }
      });
      assert(otp, 'Invalid or expired code', 400);
      assert(verifyOtpCode(code, otp.salt, otp.codeHash), 'Invalid code', 400);
      await prisma.oTP.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
    } else {
      assert(false, 'password or code required');
    }

    await ensureUserActivityStatus(user.id);
    const freshUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        phone: true,
        username: true,
        activityStatus: true,
        isActive: true,
        qualificationLevel: true,
        matrixLevel: true,
        sponsorId: true,
        parentId: true
      }
    });

    const token = signAccessToken({ id: user.id });
    setAuthCookie(req, res, token);
    res.json({
      ok: true,
      user: freshUser,
      token
    });
  } catch (err) { next(err); }
}

// Request login OTP by identifier
export async function loginRequestOtp(req, res, next) {
  try {
    const { identifier } = req.body || {};
    assert(identifier, 'identifier required');
    const user = await findUserByIdentifier(identifier);
    assert(user, 'User not found', 404);

    const type = identifier.includes('@') ? 'EMAIL' : 'PHONE';
    const code = randomDigits(6);
    const { hash, salt } = hashOtpCode(code);
    const expiresAt = nowPlusMs(10 * 60 * 1000);
    await prisma.oTP.create({ data: { type, identifier, codeHash: hash, salt, expiresAt, userId: user.id } });
    if (type === 'EMAIL') await sendOtpEmail(identifier, code);
    else await sendOtpSms(identifier, code);
    res.json({ ok: true, expiresAt });
  } catch (err) { next(err); }
}

// Logout: clear cookie and respond ok
export async function logout(req, res, next) {
  try {
    try { res.clearCookie('access_token'); } catch (_) {}
    res.json({ ok: true });
  } catch (err) { next(err); }
}

// Forgot Password: request OTP to identifier
export async function forgotPasswordRequestOtp(req, res, next) {
  try {
    const { identifier } = req.body || {};
    assert(identifier, 'identifier required');
    const user = await findUserByIdentifier(identifier);
    assert(user, 'User not found', 404);
    const type = identifier.includes('@') ? 'EMAIL' : 'PHONE';
    const code = randomDigits(6);
    const { hash, salt } = hashOtpCode(code);
    const expiresAt = nowPlusMs(10 * 60 * 1000);
    await prisma.oTP.create({ data: { type, identifier, codeHash: hash, salt, expiresAt, userId: user.id } });
    if (type === 'EMAIL') await sendOtpEmail(identifier, code); else await sendOtpSms(identifier, code);
    res.json({ ok: true, expiresAt });
  } catch (err) { next(err); }
}

// Forgot Password: confirm reset
export async function resetPassword(req, res, next) {
  try {
    const { identifier, code, newPassword } = req.body || {};
    assert(identifier && code && newPassword, 'identifier, code and newPassword required');
    const user = await findUserByIdentifier(identifier);
    assert(user, 'User not found', 404);
    const type = identifier.includes('@') ? 'EMAIL' : 'PHONE';

    const otp = await prisma.oTP.findFirst({ where: { type, identifier, consumedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } });
    assert(otp, 'Invalid or expired code', 400);
    assert(verifyOtpCode(code, otp.salt, otp.codeHash), 'Invalid code', 400);
    await prisma.oTP.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });

    const passwordHash = await hashPassword(newPassword);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
    res.json({ ok: true });
  } catch (err) { next(err); }
}

// Forgot PIN: request OTP to identifier
export async function forgotPinRequestOtp(req, res, next) {
  try {
    const { identifier } = req.body || {};
    assert(identifier, 'identifier required');
    const user = await findUserByIdentifier(identifier);
    assert(user, 'User not found', 404);
    const type = identifier.includes('@') ? 'EMAIL' : 'PHONE';
    const code = randomDigits(6);
    const { hash, salt } = hashOtpCode(code);
    const expiresAt = nowPlusMs(10 * 60 * 1000);
    await prisma.oTP.create({ data: { type, identifier, codeHash: hash, salt, expiresAt, userId: user.id } });
    if (type === 'EMAIL') await sendOtpEmail(identifier, code); else await sendOtpSms(identifier, code);
    res.json({ ok: true, expiresAt });
  } catch (err) { next(err); }
}

// Forgot PIN: confirm reset (4 digits)
export async function resetPin(req, res, next) {
  try {
    const { identifier, code, newPin } = req.body || {};
    assert(identifier && code && newPin, 'identifier, code and newPin required');
    assert(/^\d{4}$/.test(newPin), 'newPin must be 4 digits');
    const user = await findUserByIdentifier(identifier);
    assert(user, 'User not found', 404);
    const type = identifier.includes('@') ? 'EMAIL' : 'PHONE';

    const otp = await prisma.oTP.findFirst({ where: { type, identifier, consumedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } });
    assert(otp, 'Invalid or expired code', 400);
    assert(verifyOtpCode(code, otp.salt, otp.codeHash), 'Invalid code', 400);
    await prisma.oTP.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });

    const pinHash = await hashPassword(newPin);
    await prisma.user.update({ where: { id: user.id }, data: { pinHash } });
    res.json({ ok: true });
  } catch (err) { next(err); }
}
