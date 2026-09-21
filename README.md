# EVE Status Perception (ESP)

A lightweight desktop companion for EVE Online. ESP keeps an eye on your
characters' skill queues, wallets and activity while you play (or sleep),
and nudges you exactly when something matters.

Built with Electron and the EVE ESI API.

## Current Features (v1.2.8)

### Character Management & Tracking
- **EVE SSO login** for multiple characters
- **Scope-choice add-character modal** — Essential (minimum) or future-proof Full access scopes
- **Automatic + manual refresh** of character data, batched to stay under ESI connection limits
- **Active skill training** with live progress bar and completion countdown
- **Full skill queue table** — positions, SP costs, start/finish times and totals
- **Recently completed skills** — collapsible last-7-days list on each Overview (auto-collapsed above 5 entries)
- **Recently Finished Skills** — the last five skills that finished training shown on each Overview
- **Notification history** — a per-character panel on the Overview listing everything that happened since you last checked, color-coded by type
- **Wallet tracking** — balance plus a 7-day wallet journal with ISK in/out summary
- **Clone locations & implants** — Assets tab shows active clone detection, standby clones with expandable implant lists, implant slot numbers and ISK valuations, local clone nicknames
- **Location & ship** shown directly on each character row
- **Corporation & alliance** names in the character header

### Organisation & UI
- **Account groups** with custom names (e.g. "Main account", "Industry alts")
- **Primary character star** — collapsed groups show the primary; expanded groups sort it to the top
- **Collapsible groups** and a collapsible Ungrouped section
- **Compact collapsed cards** — a collapsed group shows its primary character with just name and location
- **Alert pulses** — sidebar cards pulse green for unseen notifications, orange when the queue is almost dry, red when training stopped; collapsed group headers pulse with the highest-priority alert in the group
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
- **In-app Create Plan builder** — browse the full EVE skill catalog in collapsible groups and add levels with one click, then save as a global or character-specific plan
- **Current skill levels** — the builder shows how far the selected character has trained each skill
- **Edit plans** — any plan can be reopened in the builder with its skills pre-loaded and saved back to the same plan
- **Plan detail popup** — click any plan to review its skills and export it to the clipboard (same format as clipboard import)
- **Clipboard import** — paste a plan copied from the EVE client; malformed lines are reported instead of silently dropped
- **Character or global scope** per plan, with plans filtered per character

### Updates & System
- **What's-new popup** — the changelog shows once per version on the first launch after an update (tracks the last-seen version)
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

## Updates / Alpha Builds

This repository tracks the latest development (alpha) code. If you want to run the bleeding edge before an official release is built, pull the `main` branch and run:


**Currently tracked version: v1.2.8**

### Changelog
- **v1.2.8 (current)** — Notification history on each character (everything that happened since you last checked, color-coded, at the bottom of the Overview) plus a Recently Finished Skills panel (last five). Sidebar alert pulses: green for unseen notifications, orange when the queue is almost dry, red when training stopped, with collapsed group headers showing the highest-priority color. Collapsed groups now show the primary compactly (name + location) and the Ungrouped section is collapsible. New tab bar position lock (vertical or horizontal, mutually exclusive). Skill plans can be edited: Edit reopens the builder with existing skills pre-loaded and saves back to the same plan.
- **v1.2.7** — Fixed the What's-new popup so it reliably appears once per version: the changelog is now requested once the UI is ready instead of being pushed at startup, and the last-seen version is only recorded when the popup is actually shown.
- **v1.2.6** — In-app skill planning: build plans straight from the full EVE skill catalog, showing each skill's current level for the selected character. Click any plan for a detail popup and export it back to the clipboard (same format as clipboard import). A What's-new popup now shows the changelog once per version, tracking the last-seen version so it only appears after an update.
- **v1.2.5** — Character groups in the new sidebar (custom names, primary star, collapsible sections). Debug tab removed from release builds so it only appears under the dev server. Dotted, readable installer names for updates. Cross-platform native notifications with the Windows toast overlay as a fallback, and the toast assets restored in packaged builds. Skill Plans tab completed: per-character filtering, delete, and clipboard import with a naming and scope dialog.
- **v1.2.4** — Responsive layout refinements so the interface stays clean and usable on smaller windows.
- **v1.2.3** — Themes added: switch between color themes with an optional larger-text mode.
- **v1.2.2** — New debug engine: scriptable diagnostic actions for easier testing and support.
- **v1.2.1** — Assets section completed: full asset tree with structure names and location hierarchy.
- **v1.2.0** — New UI backend for smoother, more responsive interaction, plus smarter ESI request throttling.
- **Hotfix** — sidebar no longer jumps to top when clicking a character.
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

