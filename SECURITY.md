# Security Policy

## Reporting a vulnerability

Please report privately rather than opening a public issue: use GitHub's
[private vulnerability reporting](https://github.com/zscontributor/open-rocket-chat-client/security/advisories/new)
on this repository.

Please include the affected version or commit, what an attacker can achieve, and steps to reproduce.

We aim to acknowledge within a few days. This is a volunteer-maintained project, so please be patient with fixes.

## Scope

This repository is a browser client. Two neighbours have their own reporting channels:

- The gateway, including sessions, cookies and the media proxy — [open-rocket-chat-gateway](https://github.com/zscontributor/open-rocket-chat-gateway/security/policy).
- Rocket.Chat itself — [Rocket.Chat's security team](https://docs.rocket.chat/docs/security).

In scope here:

- **Cross-site scripting.** Message bodies, room names, status messages and file names are all attacker-controlled and rendered. Anything that escapes Markdown rendering into HTML or script execution is the highest-severity report this project can receive.
- **Any path that puts a Rocket.Chat auth token in the page**, in `localStorage`, or in a URL. The client is built so this cannot happen; a way to make it happen is a bug in the property the whole architecture exists for.
- **Cache leakage between accounts.** Rooms and messages are persisted to IndexedDB; another account on the same browser reading them after a sign-out is in scope.
- **Sending a message, or acting, on the wrong server.** One session holds several Rocket.Chat servers at once and every request carries the server it acts on. A path that crosses those boundaries is a real finding, not a cosmetic one.
- Clickjacking, open redirects, and leaking a room's contents through a third-party request (GIF search, link previews, avatars).

## Why the token is never in the browser

Rocket.Chat's REST API authenticates with an `X-Auth-Token` header, and that token grants full account access — reading every room, posting as the user, changing their profile. A browser client talking to Rocket.Chat directly must hold it, so a single XSS bug anywhere on the page, in any dependency, hands over the account.

This client therefore talks only to the [gateway](https://github.com/zscontributor/open-rocket-chat-gateway) and holds nothing but an opaque `HttpOnly` session cookie. There is no mode that connects straight to Rocket.Chat, and pull requests adding one will be declined — the property cannot hold "sometimes". The Playwright suite asserts it on every run:

```ts
expect(exposed.local).not.toMatch(/authToken|X-Auth-Token/i);
```

XSS in this client is still serious: an attacker can act as the user for as long as the page is open, and the cookie rides along with every request the page makes. What they cannot do is walk away with a credential that outlives the tab.

## What this project does not protect against

Authorisation is Rocket.Chat's. The client hides actions a server would refuse, but hiding a button is a usability decision, not a security boundary — anything the session is permitted to do, it can do. A compromised or hostile gateway sees everything the user does; deploy one you control.

## Deployment notes

- Serve over HTTPS. A cross-site gateway needs `SESSION_COOKIE_SAMESITE=none`, which browsers honour only over HTTPS.
- `docker/nginx.conf` sets `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` and a `Referrer-Policy`. If you serve `dist/` with something else, carry those over.
- It does **not** set a Content-Security-Policy, because a useful one names your gateway's origin in `connect-src` and `img-src` and there is no correct default for that. Adding one tailored to your deployment is the single biggest hardening step available to you, and it is the difference between an XSS bug being exploitable and being contained.
- `VITE_GIPHY_API_KEY` ships inside the bundle. GIPHY browser keys are meant to be public, but the key identifies your deployment — use one issued for it, not a key shared with anything else.
- Set `VITE_BUILD_ID` per build. It keys the IndexedDB cache, so a stale cache from an older build is discarded rather than restored into code that no longer expects its shape.
