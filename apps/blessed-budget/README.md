# Blessed — Budget with Purpose

A responsive, scripture-inspired, multi-household budget app for NorthStar Ventures.

Production hostname: https://blessed.northstarventures.ca
Cloudflare Worker: `blessed-budget` on the NSV account

## Resources

- D1 database `blessed-budget-db` (binding `DB`)
- Private R2 bucket `blessed-budget-receipts` (binding `RECEIPTS`)
- Workers AI (binding `AI`, Moondream 3.1 vision model)

## Features

- Email + password login, PBKDF2 password derivation, secure HttpOnly sessions and rate limiting
- Household-level permissions, shared household editors, owner-admin and restricted mentoring admins
- Multiple income streams with gross and net pay, weekly / biweekly / monthly / all-time totals
- AI reading of receipt images and pay stubs, receipt item details and a pending category approval queue
- Preset and custom expense categories with monthly planned vs actual spending
- Giving plan based on gross income: tithe 10%, configurable offering %, firstfruits 2.5%, care for the poor 3.33%, future investing 6.7%
- Each giving allocation linked to payday and independently checkable as complete
- Analytics dashboard and downloadable CSV

## First administrator enrollment

**Before the first owner account can be registered**, the Cloudflare Worker requires a secret binding named `OWNER_SETUP_CODE`. Set a unique one-time setup code in the Cloudflare dashboard and use it when registering `rwyers@gmail.com`. The first login or signup using that address with the correct setup code and a new strong password creates the global owner account and its household. Once the owner is enrolled, later logins require only email and password; the setup code is no longer needed. Do not commit the code to GitHub or include it in public client code.

## Installed app and device authentication

- Installable PWA at the production hostname with a manifest, Android/native install prompt where supported, and a manual **Add to Home Screen** guide for iPhone Safari
- Generated BLESSED launcher icons (180px, 192px, 512px) are stored in private R2 under `app/icons/` and served by the Worker at `/icons/icon-*.png`
- Service worker is **network-only** for budget data. It does not cache financial records offline
- Authentication sessions use an HttpOnly, Secure, SameSite=Strict cookie with a 90-day maximum age, so installed apps normally stay signed in
- Optional WebAuthn ES256 passkeys for device user verification (Face ID / Touch ID / Android fingerprint or phone PIN). User must sign in with a password first, then enable a passkey in Settings after re-entering their password
- Device-auth login uses one-time D1 challenges, origin/RP verification, authenticator UV/UP flags, ECDSA signature verification, and sign counter checks. Passkeys can be individually revoked
- The global owner administrator has a dedicated Administration panel to change other users\' temporary passwords. Admin reset invalidates all sessions and deletes saved passkeys for the target. Mentors may reset passwords only for accounts they created
- iOS Home Screen installation requires Safari Share → Add to Home Screen; Apple does not expose an automatic install prompt to websites

## Security and operations

Receipts and paystubs are private R2 objects accessible only through authenticated household-specific API routes. Budgets are scoped by access checks on every operation. Pending reviews are never automatically approved. Admin role assignments and viewing grants are owner-controlled. Password reset invalidates sessions.

This is an initial production deployment; before inviting real households, conduct an end-to-end test including actual photo OCR quality, record separation, admin roles, passwords and account recovery. There is no email-ownership verification or user-initiated password recovery yet, so administrators must assist with resets. Consider adding email verification before public rollout.

This repository folder is the code of record. Worker modules are deployed with Cloudflare's multipart Worker-script upload API. It intentionally does not share any OpenAI API keys from other applications.
