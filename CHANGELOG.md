# Changelog

## 1.2.8
- Notification history panel on each character's Overview: lists every notification that arrived since you last checked that character, color-coded by type, with a "since X ago" label. It lives at the bottom of the Overview.
- Recently Finished Skills panel on the Overview — the last five skills that finished training, with completion times.
- Sidebar alert pulses: character cards pulse green when they have unseen notifications, orange when the skill queue has less than the configured warning lead time left, and red when a character's training ran out. Collapsed group headers pulse with the highest-priority color among their members.
- Collapsed groups now show the primary character compactly (name + location only), and the Ungrouped section is now collapsible like named groups.
- Tab bar position lock: new Appearance settings let you pin the tabs vertical or horizontal (mutually exclusive); leave both off for the usual responsive behavior.
- Skill plan editing: every plan now has an Edit button that reopens the plan builder with the plan's skills pre-loaded, saving back to the same plan.

## 1.2.7
- Fixed the What's-new popup: it now reliably shows on the first launch after an update. The changelog is requested once the UI is up (instead of being pushed at startup, which could be missed), and the last-seen version is only recorded when the popup is actually shown.

## 1.2.6
- In-app skill plan creation: build plans straight from the full EVE skill catalog in collapsible groups, adding levels with a single click, and save as a global or character-specific plan.
- The Create Plan builder shows each skill's current level for the selected character.
- Clicking any plan opens a detail popup with its skills and an "Export Skill Plan to Clipboard" button (same format as clipboard import).
- A What's-new popup shows the changelog once per version on first launch, tracking the last-seen version in settings so it only appears after an update.

## 1.2.5
- Grouped characters sidebar in the new UI (custom group names, primary character star, collapsible groups and Ungrouped section).
- Debug tab only appears when running from the Vite dev server, never in releases.
- Installer artifacts use dotted, readable names (EVE.Status.Perception.Setup.1.2.5.exe).
- Native cross-platform notifications with the Windows toast overlay as a fallback; toast overlay assets restored into packaged builds.
- Skill Plans tab completed: per-character filtering, delete, and clipboard import with a naming/scope dialog.

## 1.2.4
- Responsive layout refinements so the interface stays clean and usable on smaller windows.

## 1.2.3
- Themes: switch between color themes with an optional larger-text mode.

## 1.2.2
- New debug engine: scriptable diagnostic actions for easier testing and support.

## 1.2.1
- Assets section completed: full asset tree with structure names and location hierarchy.

## 1.2.0
- New UI backend for smoother, more responsive interface interaction and smarter ESI request throttling.