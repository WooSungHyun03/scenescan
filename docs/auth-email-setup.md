# Supabase Auth email and password recovery setup

SceneScan keeps passwords inside Supabase Auth. The application never stores a password, recovery code, or recovery token in React state, browser storage, application logs, API payloads, or project tables. The committed templates and local configuration are safe defaults for development; production Dashboard, SMTP provider, DNS, and real-delivery verification remain the deployment owner's work.

## Callback allow-list

Local `supabase/config.toml` already permits these exact callbacks:

- `http://127.0.0.1:3000/auth/callback`
- `http://localhost:3000/auth/callback`
- `http://127.0.0.1:3111/auth/callback`
- `http://127.0.0.1:3000/auth/recovery`
- `http://localhost:3000/auth/recovery`
- `http://127.0.0.1:3111/auth/recovery`

For production, set the Site URL to the canonical HTTPS origin and add exactly:

- `https://<production-domain>/auth/callback`
- `https://<production-domain>/auth/recovery`

Add preview domains only when the team deliberately supports Auth on them. Do not use an unrestricted wildcard. `/auth/callback` handles signup/confirmation; `/auth/recovery` accepts only password-recovery callbacks. Both exchange the one-time value server-side, set private/no-store cookies, and redirect to a clean URL that contains no code or token.

## Production SMTP checklist

Configure these fields in Supabase Auth SMTP settings using values issued by the chosen provider (for example Resend). Do not commit any credential:

| Field | Required value |
| --- | --- |
| Enable custom SMTP | On |
| Host | Provider SMTP hostname |
| Port | Provider-supported TLS/STARTTLS port, commonly 465 or 587 |
| Username | Provider SMTP username |
| Password | Provider SMTP credential/API key; secret storage only |
| Sender email | Address on a verified sending domain |
| Sender name | `SceneScan` |
| Minimum email interval | At least 60 seconds |

The deployment owner must verify the sending domain and publish the provider's SPF and DKIM records. Add a DMARC policy appropriate for the team domain, then test alignment before tightening it. Supabase's default SMTP is development-oriented and may deliver only to project-team addresses with strict limits; do not treat Mailpit or the default sender as production delivery proof.

The Korean source templates are:

- `supabase/templates/confirmation.html`
- `supabase/templates/recovery.html`
- `supabase/templates/password-changed.html`

Local Supabase reads these paths from `supabase/config.toml`. In the hosted Dashboard, copy the reviewed template contents into the corresponding **Confirm signup**, **Reset password**, and **Password changed notification** templates. Keep `{{ .ConfirmationURL }}` intact in confirmation and recovery buttons; it preserves Supabase's one-time verification and the application-supplied allow-listed redirect.

## Local Mailpit recovery test

Docker must be running for the local Supabase stack.

1. Run `pnpm supabase:start`.
2. Run `pnpm test:e2e:auth`.
3. Optional manual inspection: open `http://127.0.0.1:54324` for Mailpit and use the app at `http://127.0.0.1:3111` while the Playwright server is running.
4. Run `pnpm supabase:stop` when finished.

The automated flow creates a unique user, confirms signup through Mailpit, requests recovery, follows the newest recovery email, verifies the clean `/recovery` URL, changes the password, checks that the prior password fails, and logs in with the new password. It also covers account-security reauthentication and another password change. Local Auth users remain in the disposable local database until the stack is stopped/reset.

## Session policy

After either recovery or an authenticated password change, SceneScan requests a global Supabase sign-out and sends the user to login. This revokes refreshable sessions across devices; already-issued access tokens can remain valid only until their normal expiry according to Supabase session behavior. If the global sign-out call cannot be confirmed, SceneScan still clears the local browser session and explicitly warns the user that other devices may need manual review.

Production completion requires the deployment owner to verify Site URL/redirect entries, SMTP credentials, SPF/DKIM/DMARC, sender reputation, rate limits, and one real received message for every enabled template. This repository change does not modify the hosted Dashboard.
