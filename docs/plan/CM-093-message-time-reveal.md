# CM-093: Show one time per message group and reveal a message's own time on tap
- Type: feat
- Status: **Closed, superseded** (2026-10-17). Not implemented as written; do not merge `feat/CM-093-message-time-reveal`.
- Priority: P3 · Estimate: S

## Goal (original)
Reduce clutter: one time at the start of each message group; tapping a message shows or hides its own time (one at a time).

## Resolution
Superseded by the message-actions work on `feat/message-actions-menu` (commits 271e589, 02c3122), merged into `develop`:
- Own messages: the delivery chip stays only on the latest sent message; earlier ones show a plain time on hover, like the other side.
- Other members' messages: a time next to the sender at group start, a plain time on hover for the rest (unchanged).
- Click, tap, right click or long press on any bubble opens an actions menu that starts with the message time, so touch screens can read it.
- A pause of an hour or more inside one day gets a centered time pill.

Why the tap-to-toggle design was dropped: the menu already owns the tap gesture on bubbles, and a second tap behavior on own bubbles would conflict with it.

## Follow-ups
- The parked branch and worktree (`feat/CM-093-message-time-reveal`, `.worktrees/CM-093`, commit 70d7387) are kept untouched for the owner to delete.
