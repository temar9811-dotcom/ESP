# EVE Status Perception (ESP)

A lightweight desktop companion for EVE Online. ESP keeps an eye on your
characters' skill queues, wallets and activity while you play (or sleep),
and nudges you exactly when something matters.

Built with Electron and the EVE ESI API.



## Current Features (v1.1.0)

### Character Management & Tracking
- **EVE SSO login** for multiple characters
- **Automatic + manual refresh** of character data
- **Active skill training** with live progress bar and completion countdown
- **Full skill queue table** — positions, SP costs, start/finish times and totals
- **Wallet tracking** — balance plus a 7-day wallet journal with ISK in/out summary
- **Location & ship** shown directly on each character row
- **Corporation & alliance** names in the character header

### Organisation & UI
- **Account groups** with custom names (e.g. "Main account", "Industry alts")
- **Primary character star** — collapsed groups show the primary; expanded groups sort it to the top
- **Collapsible groups** and a collapsible Ungrouped section
- **Per-character tabs** — Overview, Skill Queue, Wallet, Skill Plans
- **System tray** integration with a live training-status tooltip
- **Single-instance app** and a live **EVE time clock**

### Notifications & Alerts
- **Click-through toast bubbles** that appear above the taskbar
- **Skill complete alerts** with an ascending chime
- **Wallet activity alerts** with a double-blip chime (new activity only)
- **Granular controls** — per-type toggles, mute sounds, minimum ISK threshold

### Skill Plans
- **Clipboard import** of EVE client skill plans
- **Global or character-specific** plans
- **SP cost and estimated training time** per skill, with plan totals
- **Visual indicators** when a plan is already trained or in the queue

### Settings & System
- **Start with Windows** and **start minimized to tray**
- **Hide primary character** when a group is collapsed (optional)
- **Legacy import** from the old EVE Skill Tray app
- **Test panel** available in test builds only

## Roadmap

### Core Data & ESI Features
- Market Jita price lookup
- Clone locations and implants
- Asset search
- Contracts tab (active contracts + completion notifications)
- Industry tab (active jobs)
- Market orders tab (active buy/sell orders)
- Cross-character skill search
- Ship loss notifications (public ESI killmails)

### UI, Notifications & Quality of Life
- Add-character popup with scope choice (current scopes vs. all future scopes)
- Queue-empty warning (notify before the skill queue runs dry)
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


---

## Updates / Alpha Builds

This repository tracks the latest development (alpha) code. If you want to run the bleeding edge before an official release is built, pull the `main` branch and run:

```
npm install
npm start
```

**Currently tracked version: v1.1.6**

### Changelog
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