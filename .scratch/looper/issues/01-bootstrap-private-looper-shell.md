# 01 — Bootstrap the private Looper shell

**What to build:** A runnable Lakebed version of Looper that gives users the complete private-access experience before ticket data is introduced. Visitors see a refined terminal-inspired shell, can sign in with Google, and reach either an access-denied state or an authorized empty-board state. Authorization must be enforced by the server using the configured verified-email allowlist, not merely hidden in the browser. Establish the agreed Oxc-based quality workflow so every later slice starts from a green baseline.

**Blocked by:** None — can start immediately.

**Status:** done

- [x] A fresh checkout can start the Lakebed capsule locally and produce a successful Lakebed validation build.
- [x] While authentication is unresolved, no protected content is rendered.
- [x] Signed-out visitors see the Looper shell and Google sign-in action but receive no board data.
- [x] A signed-in account is allowed only when its email is verified and exactly matches the normalized server allowlist.
- [x] An authenticated but unlisted account sees a concise denial state and can sign out, without receiving board data.
- [x] An authorized account sees a clear empty-board state.
- [x] The interface uses a pinned WebTUI CDN stylesheet plus restrained monochrome product styling without importing arbitrary packages into capsule code.
- [x] Oxlint, Oxfmt, Ultracite configured for the Oxc toolchain, and Lefthook are installed and pass on the initial capsule.
- [x] Secrets and Lakebed runtime artifacts are excluded from version control.
