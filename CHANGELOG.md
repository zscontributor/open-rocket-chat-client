# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Until 1.0.0, minor versions may carry breaking changes; the gateway API contract this client is built against is versioned separately and travels in [open-rocket-chat-gateway](https://github.com/zscontributor/open-rocket-chat-gateway).

## [0.1.2] — 2026-08-03

Reading a room, and carrying a message out of one. Search results now lead somewhere instead of ending at themselves, a timeline scrolled up stays where it was put, and a message can be quoted where it was said or forwarded to rooms that have not seen it. Client-only: pairs with **gateway 0.1.1**, unchanged.

### Added

- **Quote a message while answering it.** Quote in the hover toolbar stages the message above the message box rather than opening a dialog — the reply is typed where it was always going to be typed, and the strip above it names the author and echoes what is being quoted until it is sent, dismissed, or dismissed with Escape. A quote with nothing typed under it is a message in its own right, so it sends. Quoting and editing exclude each other in both directions: they share one message box, and a quote left staged behind an edit would be dropped silently when the edit saved
- **Forward a message on to other rooms.** Any number of rooms at once, since forwarding the same message to four people one dialog at a time would mean finding it again in a timeline that has since scrolled away. Targets are limited to rooms you may actually post to, and — when the message carries files — to rooms that accept uploads. Rooms are delivered to one at a time and a failure does not stop the ones behind it: what failed is named and becomes the selection, so the button retries exactly the rooms the message is missing from. Uploads are genuinely re-uploaded, because Rocket.Chat binds a file to the room it was posted to
- **A search result takes you to the message in the room.** Clicking one walks the timeline back to it and marks it. The history is loaded a page at a time, up to a budget of twenty pages, after which it says which wall it hit — a room too long to walk, or a message no longer in it. A threaded reply still opens its thread, which is the only place it can be read in context
- **The search term is marked in the results it found.** The server returns the messages and nothing about where inside them the match was, so the term is found again on the client and wrapped in a `<mark>` — inside bold, inside a list, inside a quote, and left alone inside a code span. Search operators (`from:`, `is:`) are dropped from the terms, since they choose which messages come back rather than describe what is in them
- **A way back to the newest message.** A button over the foot of the timeline, appearing at exactly the distance that stops the list following the room, and taking it back to the bottom

### Changed

- Emoji and GIF now open the composer toolbar, ahead of the paperclip, the folder and the formatting menu — the two most-reached-for controls were the furthest from where the hand starts
- The search mark is drawn as a highlighter rather than in the theme's accent. A reader scanning a result is looking for a highlighter, so it is yellow: a soft wash with near-black on top in light, dimmed to gold with pale text in dark, both clearing 5:1 against their own background. Defined beside the syntax colours rather than added to the theme contract, so a theme written before this existed still loads

### Fixed

- **The timeline no longer drifts back to the bottom when scrolled up.** Scroll compensation was applied whenever the virtualiser's total height grew, on the assumption that growth meant a page of older messages had arrived — but the total also grows every time an estimated row is measured for real, and the virtualiser already handles that case. Compensation is now offered only when a page genuinely landed. The scroll anchors are reset when the room changes too, so a list scrolled up in one room no longer opens the next one at the same offset
- **Search results survive backing out of a thread.** Opening a thread from a result unmounted the search panel and took the term with it. The term and the list's scroll offset are now written onto the search tab's own stack entry on the way in, and the results come straight from the query cache

### Notes

Quoting and forwarding both post a Markdown blockquote rather than a Rocket.Chat quote attachment. That attachment is built server-side from a permalink written into the message text, and neither half is reachable from this client: the gateway's send route takes text and attachment ids and nothing else, and it never tells a client the Rocket.Chat URL a permalink would need. The blockquote reads correctly in every client that opens the room afterwards — Rocket.Chat's own included — but it carries no route back to the original, so a reader gets the words without the jump.

## [0.1.1] — 2026-08-02

Uploads. A staged file used to sit under a bare spinner from the moment send was pressed until the message existed, however long that took. Pairs with **gateway 0.1.1**, which fixes the upload failing outright against a Rocket.Chat that is not on localhost.

### Added

- **Upload progress.** The composer tile now shows a percentage and a bar while the file's bytes are leaving the browser. `fetch` reports nothing about a request body until the response starts arriving, so a call asking for progress goes through `XMLHttpRequest` instead, which is the only thing in a browser that reports it; everything else keeps using `fetch`. The XHR path is written to be indistinguishable from the other one — session cookie, multipart boundary, network and gateway errors, and aborts all behave identically — and outside a browser it falls back to `fetch`, so asking for progress is never the difference between an upload and an error
- **The wait after the bytes have gone is named rather than guessed at.** Once the file has left the browser, what remains is Rocket.Chat receiving it, storing it and making a message of it — a stretch that cannot be measured from here at all, and that is most of the wait when the gateway is the near thing and Rocket.Chat the distant one. The tile says so. A bar frozen at 100% reads as stuck, and a spinner appearing from nowhere reads as the progress having vanished. Labels for English, Vietnamese and Japanese

### Changed

- `files.upload` writes `description`, `text` and `threadId` before the file. The gateway relays the file to Rocket.Chat as it arrives rather than holding it, and a multipart part is only readable once everything before it has been consumed, so a caption written after the file would not exist yet when the relay begins. The gateway reads trailing fields as a fallback, so either order works

### Notes

Progress measures the browser-to-gateway leg, which is the whole journey only where the gateway is the far end — the deployment this is built for. Running the gateway on localhost against a distant Rocket.Chat inverts that: the bar fills at once and the named wait that follows is the real one.

## [0.1.0] — 2026-08-02

First public release. An independent, community-driven frontend for [Rocket.Chat](https://rocket.chat)-compatible servers: React 19 and Vite, built as static files you can serve from anywhere, talking to Rocket.Chat only through the [Open Rocket.Chat Gateway](https://github.com/zscontributor/open-rocket-chat-gateway) so no Rocket.Chat auth token ever reaches the browser.

Pairs with **gateway 0.1.0**. This is a `0.x` release: it has run in production at [Z-SOFT](https://z-soft.com.vn) for internal team chat, but the API contract between the two repositories is not frozen yet.

> Not affiliated with, endorsed by, or supported by Rocket.Chat Technologies Corp. "Rocket.Chat" is a trademark of its respective owner, used here only to describe compatibility.

### Added

**Sign-in and account**

- Password sign-in with two-factor, plus whatever OAuth providers a server offers — buttons are rendered from what `auth/servers` reports, so no provider is hard-coded
- Session held server-side; sign out of one server or of every server at once
- Presence (online, away, busy, invisible) and a status message, set per server
- Change your picture, or drop it and go back to initials, per server

**Rooms**

- Channels, private groups and direct messages in one sidebar, grouped with favourites, filtered by name with `⌘K` / `Ctrl+K`
- Create a channel or group, open a direct message, edit a room, leave, hide, favourite, mark unread
- Room pictures, shown in the sidebar and the info panel
- Contextual bar: room info, members, add members, user cards, files, pinned, starred and mention collections, threads, per-room notification preferences, prune, and a keyboard shortcut reference
- Search within a room

**Messages**

- Infinite scroll back through history, with day separators and author grouping
- Send, edit and delete; Markdown with a formatting menu and `⌘B` / `⌘I` / `⌘U` shortcuts
- Emoji reactions, with a picker that includes the server's custom emoji
- Threads, pinning and starring
- Autocomplete for `@user`, `#channel` and `/command`; slash commands run against the server
- File upload by drag-and-drop or from the attachment tray, an image lightbox, GIF search (GIPHY, needs an API key), and voice messages — recorded, staged in the tray, and playable before anyone else hears them

**Notifications and unread state**

- Desktop notifications with the permission flow and a sound, following Rocket.Chat's own rules for when a message deserves interrupting: window focus, whether the room is already on screen, presence, and the per-room preference
- Unread badges that count every unread message and let mentions decide only the colour — the same rule Rocket.Chat applies, so a badge never says "1" to somebody with twelve unread messages

**Realtime**

- Messages, typing indicators and presence over one WebSocket, with automatic reconnect and a banner while the link is degraded

**Multi-server**

- Several Rocket.Chat servers connected in one session, with a switcher rail and no second sign-in when you switch
- Unread and mention counts keep moving on the servers you are not currently looking at, because a single socket carries every server's events
- Deep links to rooms (`/servers/:serverId/rooms/:roomId`)

**Appearance, language and extensions**

- Light, dark and system themes. A theme is a plain token object rather than a stylesheet — `@open-rocket-chat/theme`, documented in [docs/theming.md](docs/theming.md)
- English, Vietnamese and Japanese — [docs/i18n.md](docs/i18n.md)
- A plugin SDK (`@open-rocket-chat/plugin-sdk`) with contribution points for sidebar items, message actions, composer actions and settings panels

**Packages published from this repository at 0.1.0**

| Package                        | What it is                                                  |
| ------------------------------ | ----------------------------------------------------------- |
| `@open-rocket-chat/client-sdk` | Typed gateway calls and the reconnecting realtime channel   |
| `@open-rocket-chat/theme`      | The theme contract, the themes that ship, and applying them |
| `@open-rocket-chat/plugin-sdk` | Contribution points and the plugin registry                 |

**Build, deployment and tooling**

- Static production build (`apps/web/dist`) — around 400 kB gzipped on first load, about 580 kB once the lazy chunks for emoji data and syntax highlighting are pulled in. No Node.js runtime required to serve it
- `docker/web.Dockerfile` and an Nginx config for containerised deployment
- Vitest unit tests over the theme contract, locale parity, notification rules and unread maths
- A Playwright suite driving the real stack — app, gateway and an actual Rocket.Chat — which asserts, among other things, that no Rocket.Chat token is reachable from the page. It runs locally, not in CI
- Storybook for the UI primitives
- GitHub Actions for formatting, linting, types, build, unit tests, a dependency audit, CodeQL, and the Git Flow branch policy

### Requirements

- Node.js >= 20.11, pnpm 10.28.2
- An [Open Rocket.Chat Gateway](https://github.com/zscontributor/open-rocket-chat-gateway) 0.1.0 instance in front of a Rocket.Chat server (tested end-to-end against Rocket.Chat 8.6.1)
- Until the shared packages are published to npm, this repository resolves `@open-rocket-chat/api-contract` from a sibling gateway checkout via a pnpm `link:` override, so both repositories must sit in the same parent directory. See [CONTRIBUTING.md](CONTRIBUTING.md)

### Not included

- **Omnichannel (Livechat)** — no queue, routing, departments, transfers, canned responses, transcripts or visitor panel. Omnichannel rooms the account is already subscribed to do appear in the sidebar and read, send and react like any other room, and Livechat system messages render with proper labels. This is a gap rather than a refusal; the work starts in the gateway
- Read receipts
- An installable offline build — the web manifest and icons ship, but there is no service worker
- Desktop packaging
- A direct-to-Rocket.Chat mode, which is not planned at all: it would put a full-access `X-Auth-Token` in the browser, which is the thing the gateway exists to prevent

### Licence

MIT © [Z-SOFT Co., Ltd.](https://z-soft.com.vn) The whole production dependency tree is 174 packages under permissive terms only — no copyleft licence appears in what you serve.

[0.1.2]: https://github.com/zscontributor/open-rocket-chat-client/releases/tag/v0.1.2
[0.1.1]: https://github.com/zscontributor/open-rocket-chat-client/releases/tag/v0.1.1
[0.1.0]: https://github.com/zscontributor/open-rocket-chat-client/releases/tag/v0.1.0
