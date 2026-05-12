// Stage 17 — family hostname authentication.
//
// Two credentials, either of which grants access:
//   1. HTTP Basic auth — username + bcrypt-hashed password stored in app_settings.
//   2. Token URL — ?t=<token> sets a long-lived signed cookie; subsequent
//      requests work via the cookie without re-supplying ?t=.
//
// Auth result records "password" or "token" in added_by / updated_by columns.

import type { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import { randomBytes, createHmac } from "node:crypto";
import { getSetting, setSetting, KEY } from "./app-settings";

const IS_PROD = process.env.NODE_ENV === "production";

// Cookie name for the signed family token cookie.
// __Host- prefix requires Secure + no Domain so it's scoped correctly in prod.
export const FAMILY_COOKIE_NAME = IS_PROD ? "__Host-buoy-family-sid" : "buoy-family-sid";

const FAMILY_COOKIE_MAX_AGE = 365 * 24 * 60 * 60 * 1000; // 1 year in ms

// Signing key derived from the family token — rotates when token rotates.
function cookieSigningKey(): string {
  return getSetting(KEY.FAMILY_CALENDAR_TOKEN) ?? "no-token";
}

function signCookieValue(tokenHash: string): string {
  const sig = createHmac("sha256", cookieSigningKey()).update(tokenHash).digest("base64url");
  return `${tokenHash}.${sig}`;
}

function verifyCookieValue(raw: string): boolean {
  const dot = raw.lastIndexOf(".");
  if (dot < 0) return false;
  const payload = raw.slice(0, dot);
  const expected = signCookieValue(payload);
  // Constant-time compare
  if (raw.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < raw.length; i++) diff |= raw.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

// Returns "password" | "token" | null
export function checkFamilyAuth(req: Request): "password" | "token" | null {
  // 1. Check ?t= param or cookie for token-based auth
  const tokenParam = (req.query?.t as string | undefined) || "";
  const storedToken = getSetting(KEY.FAMILY_CALENDAR_TOKEN) ?? "";

  if (tokenParam && storedToken && tokenParam === storedToken) {
    return "token";
  }

  // Check signed cookie
  const cookieVal = (req.cookies as Record<string, string>)[FAMILY_COOKIE_NAME];
  if (cookieVal && verifyCookieValue(cookieVal)) {
    return "token";
  }

  // 2. HTTP Basic auth
  const authHeader = req.header("authorization") ?? "";
  if (authHeader.toLowerCase().startsWith("basic ")) {
    const b64 = authHeader.slice(6).trim();
    let decoded: string;
    try {
      decoded = Buffer.from(b64, "base64").toString("utf8");
    } catch {
      return null;
    }
    const colon = decoded.indexOf(":");
    if (colon < 0) return null;
    const user = decoded.slice(0, colon);
    const pass = decoded.slice(colon + 1);

    const storedUser = getSetting(KEY.FAMILY_CALENDAR_USER) ?? "";
    const storedHash = getSetting(KEY.FAMILY_CALENDAR_PASSWORD_HASH) ?? "";
    if (!storedUser || !storedHash) return null;
    if (user !== storedUser) return null;
    try {
      if (bcrypt.compareSync(pass, storedHash)) return "password";
    } catch {
      return null;
    }
  }

  return null;
}

// Middleware: require family auth.  On success, attaches req.familyAuthBy and
// sets the signed cookie if auth was via token URL.
export function requireFamilyAuth(req: Request, res: Response, next: NextFunction): void {
  const familyEnabled = getSetting(KEY.FAMILY_CALENDAR_ENABLED) === "1";
  if (!familyEnabled) {
    return void res.status(404).send("Not Found");
  }

  const result = checkFamilyAuth(req);
  if (!result) {
    res.setHeader("WWW-Authenticate", 'Basic realm="Buoy family"');
    return void res.status(401).send("Unauthorised");
  }

  (req as any).familyAuthBy = result;

  // If authenticated via token URL param, set long-lived signed cookie
  if (result === "token" && req.query?.t) {
    const tokenHash = createHmac("sha256", "buoy-family-cookie").update(req.query.t as string).digest("base64url");
    const signed = signCookieValue(tokenHash);
    res.cookie(FAMILY_COOKIE_NAME, signed, {
      httpOnly: true,
      secure: IS_PROD,
      sameSite: IS_PROD ? "none" : "lax",
      path: "/",
      maxAge: FAMILY_COOKIE_MAX_AGE,
    });
  }

  next();
}

// Middleware: require availability token.
// Returns 404 (not 401) on missing/wrong token to not advertise the endpoint.
export function requireAvailabilityAuth(req: Request, res: Response, next: NextFunction): void {
  const publicEnabled = getSetting(KEY.PUBLIC_CALENDAR_ENABLED) === "1";
  if (!publicEnabled) {
    return void res.status(404).send("Not Found");
  }

  const storedToken = getSetting(KEY.PUBLIC_CALENDAR_TOKEN) ?? "";

  // Check ?t= param
  const tokenParam = (req.query?.t as string | undefined) ?? "";
  if (tokenParam && storedToken && tokenParam === storedToken) {
    // Set signed cookie for subsequent requests
    const signed = signAvailCookie(tokenParam);
    res.cookie(AVAIL_COOKIE_NAME, signed, {
      httpOnly: true,
      secure: IS_PROD,
      sameSite: IS_PROD ? "none" : "lax",
      path: "/",
      maxAge: FAMILY_COOKIE_MAX_AGE,
    });
    return next();
  }

  // Check cookie (HTML page only — ICS must re-supply ?t= each time)
  const cookieVal = (req.cookies as Record<string, string>)[AVAIL_COOKIE_NAME];
  if (cookieVal && verifyAvailCookie(cookieVal, storedToken)) {
    return next();
  }

  return void res.status(404).send("Not Found");
}

// Availability cookie (same signing pattern)
export const AVAIL_COOKIE_NAME = IS_PROD ? "__Host-buoy-avail-sid" : "buoy-avail-sid";

function signAvailCookie(token: string): string {
  const sig = createHmac("sha256", token).update("avail").digest("base64url");
  return `avail.${sig}`;
}

function verifyAvailCookie(raw: string, storedToken: string): boolean {
  if (!storedToken) return false;
  const expected = signAvailCookie(storedToken);
  if (raw.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < raw.length; i++) diff |= raw.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

// ICS-only token check (no cookie — calendar apps don't carry cookies)
export function checkAvailabilityToken(req: Request): boolean {
  const storedToken = getSetting(KEY.PUBLIC_CALENDAR_TOKEN) ?? "";
  if (!storedToken) return false;
  const t = (req.query?.t as string | undefined) ?? "";
  return t === storedToken;
}
