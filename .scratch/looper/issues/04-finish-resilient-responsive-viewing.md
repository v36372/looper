# 04 — Finish resilient, responsive ticket viewing

**What to build:** Complete the ticket viewer as a polished, dependable terminal interface rather than a happy-path demo. Every authentication, loading, empty, failure, mobile, desktop, keyboard, and contrast state should feel intentional while preserving Looper's strict read-only simplicity.

**Blocked by:** 03 — Switch projects and publish live snapshot changes.

**Status:** done

- [x] A board with no projects displays the agreed empty-board message without rendering project controls.
- [x] A selected project with no tickets displays the agreed empty-project message.
- [x] Query or runtime failure produces a compact terminal-style error and a working retry action.
- [x] Reconnection preserves the selected project whenever that slug remains available.
- [x] The interface is fully usable at 360 px and across large desktop widths without clipped essential content.
- [x] Ticket status moves beneath the title on narrow screens and aligns consistently on wider screens.
- [x] Navigation, headings, controls, and ticket collections use appropriate semantic elements.
- [x] Every interactive control is keyboard reachable and has a visible focus state.
- [x] Text and controls meet WCAG AA contrast.
- [x] All statuses remain distinguishable by text when color is unavailable.
- [x] There are no editing, sorting, filtering, searching, ticket navigation, or hidden row actions.
- [x] Any introduced transition respects reduced-motion preferences.
