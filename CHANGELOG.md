# Changelog

## 1.2.13

### Notifications — custom sounds
- **Custom WAV sounds** — each notification type (skill complete, wallet activity, queue empty/warning) can now use its own WAV file picked via a file dialog in Settings → Notifications. The toast overlay plays the chosen file instead of the built-in synthesized chime.
- **Per-type controls** — a "Choose WAV…" button per type plus a "Reset" button to go back to the default chime; the chosen file name is shown under each type.
- **Test toast preview** — "Show test toast" now plays the current skill-complete sound so you can hear your custom WAV before saving.
- The built-in chimes and the mute toggle still work exactly as before; custom sounds play through the Windows toast overlay, while other platforms keep the OS default sound.

## 1.2.12

### Skill plans — prerequisites
- **Auto-added prerequisites** — adding a skill to a plan (e.g. Gallente Cruiser) now brings its prerequisites along (e.g. Gallente Frigate) at the level they actually require, including the full chain of prereqs behind them. Skills the character already has trained aren't re-added.
- **Requirement hints** — the skill catalog shows a "Requires Gallente Frigate L4" note under each skill, so you can see what will come along before you add it.
- **Guards** — a prerequisite skill can't be lowered below what another planned skill needs, and can't be removed from a plan while a skill still depends on it.

## 1.2.11

### No-skill-training alerts
- **Red pulse whenever training is empty** — a character card now pulses red whenever that character has no skill training, no matter what. Previously the pulse only appeared while a "queue empty" notification was still unread; now an idle skill queue raises the alert the moment the queue data shows nothing training.
- **Startup no-training ping** — after the app pulls fresh character data on launch, every character whose skill queue is empty triggers a "Queue empty" notification once per session, so you're reminded right away when you open ESP.
- **Per-character ignore** — a new "Ignore no-skill-training" checkbox on the Skills tab suppresses both the empty-queue notification and the red pulse for that character, on its own and on every launch.

## 1.2.10

### Toast notifications — customizable
- **Move the toast box** — a new "Move toast box" button in Settings enters a drag mode: grab the highlighted toast overlay and drop it anywhere on screen, then save the position. The location is remembered between sessions and still works after unplugging a monitor.
- **Stack direction** — toasts can list from the top of the screen or up from the bottom. "New toasts on top" is now on by default; the toast box hops to the matching corner when you switch.
- **How many fit** — choose the number of toasts shown at once (1–10); the toast window resizes to fit and old toasts are pruned.
- **How long they stay** — set how many seconds a toast stays on screen (2–30).
- **Test toast** — a button in Settings fires a sample notification instantly, so you can preview positioning and sizing before you're done.
- All of it lives in a new **Toast Notifications** section of Settings, sitting between Appearance and Tab Activation.

### Kick MRCHI theme
- Group selection button text is black, matching the metallic-gold button style.
- The group picker list now shows group names in black, with the currently selected group in red.

### Overview
- Corporation, location and clone-home context text now matches the character name color (cyan), so the character header reads as a single unit.

### Hotfix
- **Add Group button fixed** — the New Group button did nothing in the packaged app (it relied on a browser-only prompt). It now opens a proper dialog to name and create the group, and shows an error toast if creation fails.

## 1.2.9

### Skill Plans — the centerpiece
- **Plans for all characters now work per character.** A global plan is treated as one copy per character, each editable on its own — and because every copy remembers its shared parent, switching "Applies to" back to **All characters** pushes your edits to everyone again. Shared plans are labeled clearly per character ("All characters (shared)" vs "This character only (customized)").
- **Skill trees in the plan builder.** Each skill you add now shows all of its levels, not just the target — the highest level is the branch and the levels below it are leaves, each with its own SP cost. The tree collapses and expands with a click.
- **Live training numbers while you build.** The plan builder now shows, at a glance: your selected character's current attributes, the total SP remaining to finish the plan (already-trained skills excluded), and an estimated training time calculated from those attributes.
- **Total SP per skill in the catalog.** The skill list shows how many SP a skill costs to train all five levels, before you add it.
- **Smarter defaults.** The "Applies to" choice now starts on the character you have selected — creating a brand-new plan defaults to that character too.
- **Fully-trained skills are hidden** from the catalog, and levels the character already has are skipped in the plan tree.

### Fixes
- **Fixed skill completion notifications** — alerts for finished skills now fire reliably.
- **Fixed skill history** — the recently-finished and notification history panels now reflect what actually happened.

### UI & Settings
- **Hide tabs option** — you can now hide the tab bar in Settings.
- **Active skill watcher upgrade** — the live training card now shows both time left and SP left for the skill in training.

### Notifications tab (framework only)
- A new tab for in-game notifications has been scaffolded. It's groundwork for the full feature — expect raw IDs and partial data while it's built out.

## 1.2.8
- Notification history panel on each character's Overview: lists every notification that arrived since you last checked that character, color-coded by type, with a "since X ago" label. It lives at the bottom of the Overview.
- Recently Finished Skills panel on the Overview — the last five skills that finished training, with completion times.
- Sidebar alert pulses: character cards pulse green when they have unseen notifications, orange when the skill queue has less than the configured warning lead time left, and red when a character's training ran out. Collapsed group headers pulse with the highest-priority color among their members.
- Collapsed groups now show the primary character compactly (name + location only), and the Ungrouped section is now collapsible like named groups.
- Tab bar position lock: new Appearance settings let you pin the tabs vertical or horizontal (mutually exclusive); leave both off for the usual responsive behavior.
- Skill plan editing: every plan now has an Edit button that reopens the plan builder with the plan's skills pre-loaded, saving back to the same plan.