# EVE Status Perception (ESP)

A lightweight desktop companion for EVE Online. ESP keeps an eye on your
characters' skill queues, wallets and activity while you play (or sleep),
and nudges you exactly when something matters.

Built with Electron and the EVE ESI API.

## Current Features (v1.2.14)

### Character Management & Tracking
- **EVE SSO login** for multiple characters
- **Scope-choice add-character modal** — Essential (minimum) or future-proof Full access scopes
- **Automatic + manual refresh** of character data, batched to stay under ESI connection limits
- **Active skill training** with live progress bar and completion countdown
- **Active skill watcher** — the training card shows time left and SP left for the skill in training
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
- **Hide tabs** — optionally hide the tab bar in Settings
- **Compact collapsed cards** — a collapsed group shows its primary character with just name and location
- **Alert pulses** — sidebar cards pulse green for unseen notifications, orange when the queue is almost dry, red when training stopped; collapsed group headers pulse with the highest-priority alert in the group
- **Per-character tabs** — Overview, Skill Queue, Wallet, Skill Plans, Assets, Notifications (framework only)
- **Per-character notes** — editable Notes tab on each character sheet, saved locally
- **Cross-character skill search** — search box in topbar, autocomplete dropdown, popup showing all characters' levels for a skill, with minimize to a pill
- **Window remembers size and position** between sessions
- **System tray** integration with a live training-status tooltip
- **Single-instance app** and a live EVE time clock

### Notifications & Alerts
- **Click-through toast bubbles** that appear above the taskbar
- **Customizable toast box** — move the toast overlay anywhere on screen, choose how many toasts show at once and how long they stay, list them from the top or up from the bottom, and preview with a test toast
- **Skill complete alerts** with an ascending chime
- **Wallet activity alerts** with a double-blip chime (new activity only)
- **Queue-running-dry warning** with its own descending chime — toggle and lead time configurable in Settings
- **Custom WAV sounds** — pick your own .wav file for each notification type (skill, wallet, queue) in Settings, replacing the built-in chimes; "Show test toast" previews the current sound
- **No-skill-training alerts** — cards pulse red whenever a character's skill queue is empty (no unread notification required), ESP pings "Queue empty" on launch for every idle queue, and a per-character "Ignore no-skill-training" checkbox on the Skills tab suppresses both
- **Granular controls** — per-type toggles, mute sounds, minimum ISK threshold

### Skill Plans
- **Global plans act per character** — a plan for all characters gives each character its own copy, editable individually; every copy remembers its shared parent, so switching "Applies to" back to **All characters** updates everyone at once
- **In-app Create Plan builder** — browse the full EVE skill catalog in collapsible groups and add levels with one click, then save as a global or character-specific plan
- **Skill trees** — each planned skill shows all of its levels (target on top, lower levels beneath), collapsible, each with its own SP cost
- **Live training estimates** — the builder shows the selected character's current attributes, total remaining SP, and estimated training time based on them
- **Total SP per skill** — the catalog column shows what each skill costs to train to level 5
- **Current skill levels** — the builder shows how far the selected character has trained each skill, hides fully-trained skills, and skips already-trained levels
- **Edit plans** — any plan can be reopened in the builder with its skills pre-loaded and saved back to the same plan
- **Plan detail popup** — click any plan to review its skills and export it to the clipboard (same format as clipboard import)
- **Clipboard import** — paste a plan copied from the EVE client; malformed lines are reported instead of silently dropped
- **Prerequisites auto-added** — adding a skill to a plan pulls in its prerequisites (and their prerequisites) at the required levels; the catalog shows a "Requires" note under each skill, and skills a plan depends on can't be lowered or removed while in use
- **Character or global scope** per plan, with "Applies to" defaulting to the selected character

### Updates & System
- **What's-new popup** — the changelog shows once per version on the first launch after an update (tracks the last-seen version)
- **Start with Windows** and **start minimized to tray**
- **Hide primary character when a group is collapsed** (optional)
- **Legacy import** from the old EVE Skill Tray app

## Roadmap

### In Progress
- **Notifications tab** — a tab for in-game notifications has been scaffolded (framework only); data rendering and enrichment are still being built out.

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
- Toast refresh interval settings

## Updates / Alpha Builds

This repository tracks the latest development (alpha) code. If you want to run the bleeding edge before an official release is built, pull the `main` branch and run:


**Currently tracked version: v1.2.14**

### Changelog
- **v1.2.14 (current)** — Notifications can be exported to a JSON file with names resolved locally (SDE + cached ESI names) and unresolved IDs flagged for background lookup. Alert colors now mean something specific: red "No Active Skill Training" fires when skills are queued but nothing is progressing, while orange is reserved for a completely empty queue. The top-bar Refresh button now only requeues pullers whose timers have passed 50% and locks out until one does.
- **v1.2.13** — Custom WAV sounds. Each notification type (skill complete, wallet activity, queue empty/warning) can use its own .wav file picked via a dialog in Settings → Notifications, with a Reset button returning to the default chime and "Show test toast" previewing the current skill sound. Custom sounds play through the Windows toast overlay; other platforms keep the OS default sound.
- **v1.2.12** — Skill plans now handle prerequisites: adding a skill to a plan auto-adds its prerequisites (and the full chain behind them) at the levels they require, skipping anything the character already has trained. The skill catalog shows a "Requires Gallente Frigate L4"-style note under each skill, and a prerequisite skill can't be lowered or removed from a plan while another planned skill still depends on it.
- **v1.2.11** — No-skill-training alerts are now proactive. A character card pulses red whenever its skill queue is empty, regardless of unread notifications; on launch ESP pings a "Queue empty" notification once per character whose queue is idle; and a new "Ignore no-skill-training" checkbox on the Skills tab suppresses the notification and red pulse per character, persisted across sessions.
- **v1.2.10** — Toast notifications are now customizable: a new Toast Notifications section in Settings lets you move the toast box anywhere on screen (with a drag mode and saved position), set how many toasts show at once and how long they stay, and list toasts from the top or up from the bottom ("new toasts on top" is now the default); a test toast button previews it all instantly. Kick MRCHI theme: the group selection button text is now black and the group picker shows groups in black with the selected one in red; corporation, location and clone-home context in the Overview now match the character name color. Hotfix: the Add Group button now opens a proper dialog instead of silently doing nothing in the packaged app.
- **v1.2.9** — Skill plans for all characters now act per character: each character gets its own editable copy that remembers its shared parent, so switching "Applies to" back to All characters pushes your edits to everyone. Plan skills render as collapsible trees showing every level (target on top, lower levels beneath) with per-level SP, and the builder now shows the selected character's attributes, total remaining SP, and an estimated training time based on them; the catalog lists each skill's total SP for all five levels and hides fully-trained skills. "Applies to" defaults to the selected character. Fixed skill completion notifications and skill history. New Settings option to hide the tabs, the active-skill watcher now shows time left and SP left, and a Notifications tab has been scaffolded (framework only for now).
- **v1.2.8** — Notification history on each character (everything that happened since you last checked, color-coded, at the bottom of the Overview) plus a Recently Finished Skills panel (last five). Sidebar alert pulses: green for unseen notifications, orange when the queue is almost dry, red when training stopped, with collapsed group headers showing the highest-priority color. Collapsed groups now show the primary compactly (name + location) and the Ungrouped section is collapsible. New tab bar position lock (vertical or horizontal, mutually exclusive). Skill plans can be edited: Edit reopens the builder with existing skills pre-loaded and saves back to the same plan.

---

*ESP is developed against the Tranquility server using EVE SSO and ESI.
EVE Online and the EVE logo are the registered trademarks of CCP hf.*

