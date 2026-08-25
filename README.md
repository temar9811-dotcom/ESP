# EVE Status Perception (ESP)

A lightweight desktop companion for EVE Online. ESP keeps an eye on your
characters' skill queues, wallets and activity while you play (or sleep),
and nudges you exactly when something matters.

Built with Electron and the EVE ESI API.

## Current Features (v1.2.0A)

### Character Management & Tracking
- **EVE SSO login** for multiple characters
- **Scope-choice add-character modal** — Essential (minimum) or future-proof Full access scopes
- **Automatic + manual refresh** of character data, batched to stay under ESI connection limits
- **Active skill training** with live progress bar and completion countdown
- **Full skill queue table** — positions, SP costs, start/finish times and totals
- **Recently completed skills** — collapsible last-7-days list on each Overview (auto-collapsed above 5 entries)
- **Wallet tracking** — balance plus a 7-day wallet journal with ISK in/out summary
- **Clone locations & implants** — Assets tab shows active clone detection, standby clones with expandable implant lists, implant slot numbers and ISK valuations, local clone nicknames
- **Location & ship** shown directly on each character row
- **Corporation & alliance** names in the character header

### Organisation & UI
- **Account groups** with custom names (e.g. "Main account", "Industry alts")
- **Primary character star** — collapsed groups show the primary; expanded groups sort it to the top
- **Collapsible groups** and a collapsible Ungrouped section
- **Per-character tabs** — Overview, Skill Queue, Wallet, Skill Plans, Assets
- **Per-character notes** — editable Notes tab on each character sheet, saved locally
- **Cross-character skill search** — search box in topbar, autocomplete dropdown, popup showing all characters' levels for a skill, with minimize to a pill
- **Window remembers size and position** between sessions
- **System tray** integration with a live training-status tooltip
- **Single-instance app** and a live EVE time clock

### Notifications & Alerts
- **Click-through toast bubbles** that appear above the taskbar
- **Skill complete alerts** with an ascending chime
- **Wallet activity alerts** with a double-blip chime (new activity only)
- **Queue-running-dry warning** with its own descending chime — toggle and lead time configurable in Settings
- **Granular controls** — per-type toggles, mute sounds, minimum ISK threshold

### Skill Plans
- **Clipboard import** of EVE client skill plans
- **Friendly empty-clipboard message** with Try again when no plan is found
- **Global or character-specific** plans
- **SP cost and estimated training time per skill**, with plan totals
- **Visual indicators** when a plan is already trained or in the queue

### Settings & System
- **Start with Windows** and **start minimized to tray**
- **Hide primary character when a group is collapsed** (optional)
- **Legacy import** from the old EVE Skill Tray app

## Roadmap

### Core Data & ESI Features
- Market Jita price lookup
- Asset search
- Contracts tab (active contracts + completion notifications)
- Industry tab (active jobs)
- Market orders tab (active buy/sell orders)
- Ship loss notifications (public ESI killmails)
- Skill browser with trained / prerequisites met / not trained status

### UI, Notifications & Quality of Life
- Implant-aware training time estimates (real SP/hour)
- Per-character mute
- Streamer mode (blur ISK values and character names)
- Copy debug log button for tester reports
- ESI status badge
- Two characters side-by-side on wide windows
- Extra notification settings (bubble duration, max bubbles, refresh interval, position)

### App Capabilities & Polish
- Create skill plans in-app and export to the game
- Auto-update feature
- What's-new popup after updates

## Updates / Alpha Builds

This repository tracks the latest development (alpha) code. If you want to run the bleeding edge before an official release is built, pull the `main` branch and run:


**Currently tracked version: v1.2.0A**

### Changelog
- **v1.2.0A** — Interface rebuild: Overview, Skill Queue, Wallet, Skill Plan and Assets are now primary tabs across the top; characters are vertical secondary tabs in a side rail (single-column at narrow widths, two-wide at 1080px+). Skill Queue renamed to Skills: all trained skills listed by group under the queue info, with collapsible groups and a collapse-all toggle; groups flow 1-wide up to 4-wide as the window widens and never shrink below their skill text (characters go 2-wide in the rail first, then the skill groups add columns). The queue stat cards wrap to two lines (Total Queue Time drops under Total Queue SP Cost) as the window narrows, and the window can be resized down to 700x700. ESI activity (skills pulls, sequencer lock) logs to the command prompt while the test module is enabled in test/test-mode.json. Skills ESI pulls are now sequenced (skills first at startup, one section at a time), batched 10 calls at a time to stay under CCP rate limits for 40+ character rosters, saved to a local cache file, and refreshed every 15 minutes.
- **v1.1.14-beta** — Local clone nicknames: hover any clone to assign a custom name stored locally per jump_clone_id; nickname persists across refreshes.
- **v1.1.13-beta** — Assets tab: clone locations & implants; diff-based active clone detection; implant slot numbers via dogma attributes; market price valuations; lazy fetch on tab open. Existing users must re-add characters with Full scopes.
- **v1.1.12-beta** — Cross-character skill search; window remembers size and position; fixed ESI field names for skill levels and SP (queue costs now accurate); fixed notes not saving.
- **v1.1.11-beta** — Per-character notes: editable Notes tab on each character sheet, saved locally per character.
- **v1.1.10-beta** — Recently completed skills list (last 7 days) on the Overview; collapsible with auto-collapse above 5 entries; Will only list skills completed after character is added to the app
- **v1.1.9-beta** — Overview next-skill detection fixed for queues where ESI removes completed entries without renumbering.
- **v1.1.8-beta** — Batched character refresh plus ESI rate-limit cooldown with automatic back-off; Refresh button locks during refreshes and cooldowns.
- **v1.1.7-beta** — Queue-running-dry warning with configurable lead time and its own descending chime; expanded self-test suite; first beta build.
- **v1.1.6** — Add-character modal with scope choice (Essential vs. future-proof Full access); SSO scope list cleaned and split.
- **v1.1.5** — SP cost + estimated training time in skill plans; fixed skill rank lookup via ESI dogma attributes.
- **v1.1.4** — Friendly "No skill plan found" clipboard message with Try again.
- **v1.1.3** — Notification settings (mute, per-type toggles, minimum ISK threshold); start minimized to tray.
- **v1.1.2** — Hide primary in collapsed groups; start with Windows.
- **v1.1.1** — Renderer code split into modules.
- **v1.1.0** — First tester build.

---

*ESP is developed against the Tranquility server using EVE SSO and ESI.
EVE Online and the EVE logo are the registered trademarks of CCP hf.*