<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/logo.png">
    <source media="(prefers-color-scheme: light)" srcset="docs/logo-light.png">
    <img src="docs/logo-light.png" alt="Open Rocket.Chat Client" width="420">
  </picture>
</p>

# Open Rocket.Chat Client

**English** · [Tiếng Việt](README.vi.md) · [日本語](README.ja.md)

An independent, community-driven frontend for [Rocket.Chat](https://rocket.chat)-compatible servers. React 19, Vite, Tailwind — built as static files you can serve from anywhere.

It exists so that the interface your users learn is yours to own: decoupled from Rocket.Chat's bundled UI, versioned separately from the server it talks to, and able to hold several Rocket.Chat servers in one signed-in session.

> **Not affiliated with, endorsed by, or supported by Rocket.Chat Technologies Corp.**
> This is a community project. "Rocket.Chat" is a trademark of its respective owner and is used here only to describe compatibility.

![The client in light and dark themes](docs/screenshot-light.png)

It talks to the [Open Rocket.Chat Gateway](https://github.com/zscontributor/open-rocket-chat-gateway), which fronts your Rocket.Chat server with a stable API and keeps the Rocket.Chat auth token out of the browser entirely — the page only ever holds an opaque `HttpOnly` session cookie.

## Why this exists

[Z-SOFT](https://z-soft.com.vn) runs Rocket.Chat in production and open-sourced this client for the reasons below. If you deploy Rocket.Chat for other people, they are probably your reasons too.

**The upstream UI is not a boundary you can build on.** Rocket.Chat's own frontend lives inside its monorepo and is coupled to Meteor. Changing how chat _looks_ — white-labelling it, embedding it, rethinking the layout — means taking on the whole codebase, and every customisation is a patch you carry forward yourself. This is the frontend on its own: a static bundle — around 400 kB gzipped on first load, and about 580 kB once the lazy chunks for emoji data and syntax highlighting are pulled in — with no Meteor, no server runtime, and a documented API boundary you can build against.

**A server upgrade should not be a UI change for your users.** When Rocket.Chat ships a new version, its bundled frontend changes with it — screens move, components are restyled, workflows are reorganised. For an organisation that has trained its people on one interface, written its documentation against one set of screenshots, and shipped its own branding on top, that arrives as unplanned retraining. Here the UI is a separate artifact on its own release cycle: you upgrade the Rocket.Chat server for the security fixes and the server-side features, and what your users see changes only when _you_ decide to change it. The [gateway](https://github.com/zscontributor/open-rocket-chat-gateway) absorbs the difference — it speaks to Rocket.Chat's API and presents this client with a versioned contract, so upstream API churn is a gateway concern rather than something that reaches the browser.

**Several servers, one sign-in.** Most Rocket.Chat frontends assume one server per deployment, which leaves anyone working across a company workspace, a customer's server and a community server juggling tabs and signing in again each time they switch. Here multi-server is a scope rather than a mode: one session holds a live connection to each server at once, the switcher rail moves between them instantly with no re-authentication, and unread and mention badges keep counting on the servers you are not currently looking at, because a single realtime socket carries every server's events. Signing out of one leaves the others untouched. The mechanics are in [Layout](#layout).

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│  Browser · apps/web                                            │
│  React 19 static bundle. Holds one opaque HttpOnly session     │
│  cookie — never a Rocket.Chat token.                           │
│                                                                │
│   ┌───┐  server rail     query cache            one WebSocket  │
│   │ A │◀── active        ['server', <id>, …]    for every      │
│   │ B │                                         server         │
│   └───┘                                                        │
└──────────────────────┬───────────────────────┬─────────────────┘
                       │                       │
             HTTPS /api/v1                 WSS /ws
      session cookie + X-Server-Id      session cookie
                       │                       │
                       ▼                       ▼
┌────────────────────────────────────────────────────────────────┐
│  Gateway · apps/gateway                                        │
│  NestJS + Fastify, a single Node process                       │
│                                                                │
│  session store — in memory, or Redis for more than one         │
│  instance:   cookie ──▶ { A: X-Auth-Token, B: X-Auth-Token }   │
│                                                                │
│  one upstream connection per session per server, shared by     │
│  every tab that session has open                               │
└────────┬───────────────────────┬───────────────────────┬───────┘
         │                       │                       │
   REST + DDP              REST + DDP              REST + DDP
  X-Auth-Token            X-Auth-Token            X-Auth-Token
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Rocket.Chat A  │     │  Rocket.Chat B  │     │  Rocket.Chat …  │
│    + MongoDB    │     │    + MongoDB    │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

Four properties follow from that shape:

- **The Rocket.Chat token never reaches the browser.** The page holds a cookie it cannot read; the gateway is what maps that cookie to an `X-Auth-Token` per server. Images and attachments are proxied for the same reason — an `<img>` cannot carry a token.
- **Several servers, one session.** Signing in again with the same cookie _adds_ a server instead of replacing one. Switching in the rail is a client-side scope change: no round trip, no second sign-in. Signing out of one server leaves the others connected.
- **One socket carries every server.** Each event names its `serverId` and is folded into that server's slice of the query cache, which is what keeps unread counts moving on servers you are not looking at. Upstream, one Rocket.Chat connection per session per server is shared by every tab, so five open tabs cost Rocket.Chat one connection rather than five.
- **The Rocket.Chat servers are ordinary, unmodified deployments.** They know nothing about each other, or about this arrangement. That is also why room ids are only unique within one server, and why the server is part of every path here.

## Status

Working today.

**Sign-in and account**

- Password sign-in with two-factor, and the OAuth providers a server offers — the buttons are rendered from what `auth/servers` reports, so nothing is hard-coded per provider
- Session held server-side; sign out of one server or of every server at once from the account menu
- Presence — online, away, busy, invisible — and a status message, set per server
- Change your picture, or drop it and go back to initials, per server

**Rooms**

- Channels, private groups and direct messages in one sidebar, grouped with favourites, and filtered by name with `⌘K` / `Ctrl+K`
- Create a channel or group, open a direct message, edit a room, leave it, hide it, favourite it, mark it unread
- Give a room a picture — shown in the sidebar and its info panel — or clear it again
- Contextual bar: room info, members, add members, user cards, files, pinned, starred and mention collections, threads, per-room notification preferences, prune, and a keyboard shortcut reference
- Search within a room

**Messages**

- Infinite scroll back through history, with day separators and author grouping
- Send, edit and delete; Markdown, with a formatting menu and `⌘B` / `⌘I` / `⌘U` style shortcuts
- Emoji reactions and a picker that includes the server's custom emoji
- Threads, pinning and starring
- Autocomplete for `@user`, `#channel` and `/command`, and slash commands run against the server
- File upload by drag-and-drop or from the attachment tray, an image lightbox, GIF search, and voice messages — recorded, staged in the tray, and playable before anyone else hears them

**Notifications and unread state**

- Desktop notifications with the permission flow and a sound, following Rocket.Chat's own rules for when a message deserves interrupting: window focus, whether it is the room already on screen, presence, and the per-room preference
- Unread badges that count _every_ unread message and let mentions decide only the colour — the same rule Rocket.Chat applies, so a badge never says "1" to somebody with twelve unread messages
- Unread and mention counts keep moving on the servers you are not currently looking at

**Realtime**

- Messages, typing indicators and presence over one WebSocket, with automatic reconnect and a banner while the link is degraded

**Appearance, language and extensions**

- Light, dark and system themes. A theme is a plain token object rather than a stylesheet — see [docs/theming.md](docs/theming.md) and `@open-rocket-chat/theme`
- English, Vietnamese and Japanese — see [docs/i18n.md](docs/i18n.md)
- A plugin SDK (`@open-rocket-chat/plugin-sdk`) for sidebar items, message actions, composer actions and settings panels

**Multi-server**

- Several Rocket.Chat servers connected at once, with a switcher rail, per-server unread badges, and no second sign-in when you switch
- Deep links to rooms (`/servers/:serverId/rooms/:roomId`)

Not built yet: read receipts, an installable offline build (the web manifest and icons ship, but there is no service worker), and desktop packaging.
Direct-to-Rocket.Chat mode is not planned at all; see below for why.

### Omnichannel is not included

Rocket.Chat's **Omnichannel** (Livechat) — the agent-facing side of customer conversations — is not implemented here. There is no queue, no routing or serving a chat, no departments, no transfers, no canned responses, no closing with a transcript, and no visitor or contact panel. The visitor-facing chat widget that goes on your own website is a separate Rocket.Chat product and is out of scope entirely.

What does work, because it comes along with the ordinary room handling: an Omnichannel room the signed-in account is already subscribed to appears in the sidebar and reads, sends and reacts like any other room, and the Livechat system messages — chat started, closed, transferred, put on hold, transcript sent — render with proper labels rather than as raw event names. Member management is correctly hidden for those rooms, since an Omnichannel room has no membership to manage.

This is a gap rather than a refusal. Z-SOFT built the client for internal team chat, where Omnichannel never came up, and shipping a half-built agent console would have been worse than shipping none. **If you need it, build it and open a pull request** — the architecture has a place for it. It starts in the [gateway](https://github.com/zscontributor/open-rocket-chat-gateway), which today exposes no Livechat routes at all: the schemas go in `packages/api-contract`, the normalisation in `packages/rc-adapter`, the routes in `apps/gateway`, and only then does the UI here have something to call. [CONTRIBUTING.md](CONTRIBUTING.md) covers how a change spanning both repositories is reviewed. An incremental slice — say, the queue and taking a chat, with transfers left for later — is far more likely to be merged than one pull request carrying the whole product.

## Quick start

You need the gateway and a Rocket.Chat server. The gateway repository ships a Docker Compose file for the latter.

```bash
# 1. Rocket.Chat + MongoDB, then the gateway (in the gateway checkout)
pnpm install && pnpm run build
pnpm run rc:up
cp apps/gateway/.env.example apps/gateway/.env
pnpm --filter @open-rocket-chat/gateway dev      # http://localhost:4000

# 2. This repository
pnpm install
pnpm --filter @open-rocket-chat/web dev          # http://localhost:5173
```

Sign in with `admin` / `admin-password-123` — the credentials the Compose file seeds.

The two repositories are developed side by side. This one resolves `@open-rocket-chat/api-contract` from a sibling checkout via a pnpm `link:` override, so both must sit in the same parent directory until the packages are published to npm. See [CONTRIBUTING.md](CONTRIBUTING.md).

### GIF search

The message box searches [GIPHY](https://giphy.com/), which needs an API key.
Get a free one from the [GIPHY developer dashboard](https://developers.giphy.com/dashboard/) and either

- set `VITE_GIPHY_API_KEY` in `apps/web/.env`, so it ships with the build, or
- paste it under **Settings → GIFs**, which keeps it in that browser only.

Without a key, everything else works and the GIF button explains what is
missing. The chosen GIF is downloaded and uploaded to the room like any other
attachment, so it renders even where link previews are switched off.

## The gateway is not optional

This client talks to Rocket.Chat only through the gateway. There is no mode that
connects a browser straight to a Rocket.Chat server, and that is a decision
rather than a gap.

Rocket.Chat's REST API authenticates with an `X-Auth-Token` header. A browser
talking to it directly has to hold that token, and the token grants full access
to the account — reading every room, posting as the user, changing their
profile. One XSS bug anywhere on the page, in any dependency, hands it over.

Routing through the gateway means the browser holds an opaque session cookie it
cannot even read, and the Playwright suite asserts exactly that on every run:

```ts
expect(exposed.local).not.toMatch(/authToken|X-Auth-Token/i);
```

Supporting both would mean that assertion could only hold for half the users,
two transports to keep at parity forever, and a security property that depends
on which mode somebody happened to configure. The gateway is a single Node
process with a Docker image and a Compose file; requiring it is a smaller cost
than giving up the guarantee.

If you need a static deployment with no backend of your own, run the gateway
once for your organisation and point every client at it — that is the same
shape, and it keeps the token server-side.

## Building for production

```bash
pnpm run build
```

`apps/web/dist` is a static bundle: serve it with Nginx, a CDN, or any static host. No Node.js runtime is required.

Set `VITE_GATEWAY_URL` at build time to the gateway's public origin. If the gateway is on a different site from the app, it must also run with `SESSION_COOKIE_SAMESITE=none` over HTTPS and list this app's origin in `CORS_ORIGINS`. Same-site deployments need neither.

In development, Vite proxies `/api` and `/ws` to the gateway, which keeps the session cookie same-origin and avoids that configuration entirely.

## Layout

```
apps/web/
├── src/features/     auth, rooms, messages, notifications, realtime — one folder per domain
├── src/ui/           presentational primitives (Radix + Tailwind)
├── src/stores/       Zustand: UI state and toasts
├── src/i18n/         one JSON namespace per feature, per language
└── src/lib/          SDK instance, query client, cache keys and persistence
packages/client-sdk/  typed gateway calls and the reconnecting realtime channel
packages/theme/       the theme contract, the themes that ship, and applying them
packages/plugin-sdk/  contribution points and the plugin registry
e2e/                  Playwright tests against the real stack
```

**State is split deliberately.** Server data — rooms, messages, profiles — lives in TanStack Query and nowhere else; realtime events are folded into that same cache, so components never care whether a value arrived over HTTP or the socket. Zustand holds only what the server has no opinion about: theme, composer drafts, which thread is open, who is typing. Mirroring server data into Zustand is the mistake this split exists to prevent.

**Routing** is a few lines against the History API rather than a router library. With two views there is nothing for a router to do; introduce one when settings and admin screens arrive. The server is part of the path because Rocket.Chat ids are only unique within one server — `/rooms/:roomId` on its own is ambiguous once you are connected to several, though old links still resolve against whichever server is active.

**Multi-server** is a scope, not a mode. One session can hold connections to several Rocket.Chat servers; `<ServerScope>` binds the tree below it to one of them, and every hook reads its client and its cache keys from there rather than being handed a server id. Cache keys are `['server', <id>, …]` throughout, so switching servers costs nothing — the one you left keeps its data. The realtime socket is deliberately _outside_ the scope: one socket carries every server, each event names the server it came from, and it folds into that server's cache even while you are looking at another. That is what keeps unread counts moving on the servers you are not watching.

## Testing

```bash
pnpm run typecheck
pnpm run test         # unit tests: theme contract, locale parity, notification rules, unread maths
pnpm run test:e2e     # Playwright, against a running stack
```

The unit tests cover the pieces worth stating without a browser — the rules deciding when a notification reaches the screen, what an unread badge shows, whether every locale still matches English, and whether a theme satisfies the contract.

The Playwright suite drives the whole stack — app, gateway and a real Rocket.Chat — because the things most likely to break only exist where the parts meet: cookie flags, WebSocket upgrades, proxied media. It asserts, among other things, that no Rocket.Chat token is reachable from the page, and that a message sent in one browser context reaches another over the realtime channel.

## Dependencies and licences

Every direct runtime dependency, with what it is there for. Versions live in `package.json`; this table is about what is in the bundle and under what terms.

| Package                                           | What it does                                      | Licence    |
| ------------------------------------------------- | ------------------------------------------------- | ---------- |
| `react` · `react-dom`                             | The UI runtime                                    | MIT        |
| `@tanstack/react-query` · `-persist-client`       | Server state, and its IndexedDB cache             | MIT        |
| `@tanstack/react-virtual`                         | Virtualised message and member lists              | MIT        |
| `zustand`                                         | Client-owned state: UI, toasts                    | MIT        |
| `@radix-ui/react-*`                               | Accessible dialog, popover, menu, tooltip, switch | MIT        |
| `@phosphor-icons/react`                           | Icons                                             | MIT        |
| `react-markdown` · `remark-gfm`                   | Message rendering                                 | MIT        |
| `emojibase-data`                                  | Unicode emoji data for the picker                 | MIT        |
| `i18next` · `react-i18next` · `-languagedetector` | Translation and language detection                | MIT        |
| `date-fns`                                        | Day separators and timestamps                     | MIT        |
| `tailwind-merge` · `clsx`                         | Class composition                                 | MIT        |
| `class-variance-authority`                        | Component variants                                | Apache-2.0 |
| `idb-keyval`                                      | IndexedDB access behind the query persister       | Apache-2.0 |
| `zod`                                             | Theme contract validation                         | MIT        |

Build and test only — none of this reaches a browser:

| Package                                  | What it does                | Licence    |
| ---------------------------------------- | --------------------------- | ---------- |
| `vite` · `@vitejs/plugin-react`          | Bundler and dev server      | MIT        |
| `tailwindcss`                            | Styling                     | MIT        |
| `typescript`                             | Types                       | Apache-2.0 |
| `vitest`                                 | Unit tests                  | MIT        |
| `@playwright/test`                       | Browser tests               | Apache-2.0 |
| `storybook`                              | Component workshop          | MIT        |
| `eslint` · `prettier` · `turbo` · `tsup` | Linting, formatting, builds | MIT        |

**The whole production tree is 174 packages**: 169 MIT, three Apache-2.0 (`class-variance-authority`, `idb-keyval`, `typescript`), one ISC (`@ungap/structured-clone`) and one 0BSD (`tslib`). No copyleft licence appears anywhere in it, so the bundle you serve carries permissive terms only.

Including build and test tooling the tree is 606 packages, still overwhelmingly MIT, with a handful of MPL-2.0 (`lightningcss`, `axe-core`) and CC-BY-4.0 (`caniuse-lite`) entries that are compilers and datasets used during the build and never shipped.

Regenerate either list rather than trusting this table if a licence matters to you:

```bash
pnpm licenses list --prod          # what ships
pnpm licenses list                 # everything, tooling included
```

This project itself is MIT. Contributions are accepted under the same terms.

## Contributing

Patches are welcome. The repository follows Git Flow: branch from `develop`, open a pull request against it, and let a reviewer merge — `main` holds released versions only. [CONTRIBUTING.md](CONTRIBUTING.md) has the branching model, the commit convention and the checks to run first; [docs/branch-protection.md](docs/branch-protection.md) records how those rules are enforced on GitHub.

Vulnerabilities go to [SECURITY.md](SECURITY.md), not to a public issue or pull request.

## Licence

MIT © [Z-SOFT Co., Ltd.](https://z-soft.com.vn) See [LICENSE](LICENSE).
