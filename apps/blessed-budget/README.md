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

## Security and operations

Receipts and paystubs are private R2 objects accessible only through authenticated household-specific API routes. Budgets are scoped by access checks on every operation. Pending reviews are never automatically approved. Admin role assignments and viewing grants are owner-controlled. Password reset invalidates sessions.

This is an initial production deployment; before inviting real households, conduct an end-to-end test including actual photo OCR quality, record separation, admin roles, passwords and account recovery. There is no email-ownership verification or user-initiated password recovery yet, so administrators must assist with resets. Consider adding email verification before public rollout.

This repository folder is the code of record. Worker modules are deployed with Cloudflare's multipart Worker-script upload API. It intentionally does not share any OpenAI API keys from other applications.
