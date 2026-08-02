# ADR.md

> **Budget: ~50 lines.** One decision per entry, in two groups: how the app is built, and
> how work reaches production. Delete an entry once the code makes it obvious, or once a
> later one supersedes it — git history is the archive. Adding is coupled to pruning.

This project was adopted while already live. Most of what follows was never decided by
anyone — it is what is true, plus what changing it would cost. An entry here is not an
endorsement.

**The application**

- The browser is the whole application. A React + Vite SPA with no server of its own, so
  anything it can read, every visitor can read. There is nowhere to put a secret until
  this app has a server, which is a project rather than a fix.
- The admin password is a constant in `src/App.jsx`, in a public repository, and shipped
  in the JavaScript bundle. The admin panel is therefore unprotected in practice — the
  code itself says so in a comment. Changing the value does not fix it; only moving the
  check off the browser does.
- The data store is a Google Apps Script Web App deployed with access "anyone",
  reachable at a URL that is in the public repository and in the shipped bundle. It
  takes reads and writes from anyone who has it, with no key. Customer names and phone
  numbers are behind it. This is the single largest constraint on this project and it
  bounds every feature that touches personal data.
- Writes replace a whole JSON blob under one key. There is no per-record write and no
  locking, so two people saving at the same moment means one change silently disappears.
  Anything assuming a write is safe is wrong.
- There is no login and no user accounts. A customer is identified by the name and phone
  they type. "Mis citas" is a lookup, not a session.
- `src/FelixBarberia.jsx` and `src/FelixBarberia.jsx (2).txt` are stale copies of
  `App.jsx` that nothing imports. Editing them changes nothing that ships.
- The whole app is one ~2000-line file. Splitting it is a real improvement and also a
  large diff over code with no tests — it needs its own issue, not a drive-by.
- Google Apps Script is the backend and no agent can reach it. Every change to how data
  is stored or to the cancellation emails is a click-by-click procedure for the client.
- `BARBER_EMAIL` is empty, so the barber-side cancellation notice never sends. The code
  path exists and looks like it works.
- Four gallery photos are hotlinked from Unsplash. The app depends on somebody else's
  URLs staying up.
- There is no `package-lock.json`, so CI and Vercel each resolve dependency versions
  fresh. A build that passed yesterday can fail today with no commit in between.

**Getting to production**

- Production staying up outranks every other instruction. Checked before a merge and
  again after the deploy; an already-broken production stops the merge. Nothing reverts
  or redeploys automatically — an agent reports and waits.
- The health check must read the data store, not just the page. If Apps Script is down
  the site still renders normally on sample data, so "the page loads" proves nothing.
- CI is the merge gate, and it runs `npm run build` only. **Green means it compiles, not
  that it works.** There are no tests, no linter and no formatter to add to it.
- Deployment is Vercel's native Git integration, not an Action: an Action would need a
  token to do what the integration does with no credentials at all. Merging to `main`
  publishes immediately; there is no staging.
- `/next` is the default way of working, not a command. Nobody should need to know it
  exists.
- Every PR closes its issue, and the issue's label is its stage. Auto-close doesn't
  always fire, so the issue is verified closed by hand.
- **One issue solves one problem, and one PR closes one issue.** Bundling is what makes a
  change unreviewable, unrevertable, and unreadable as a reason a year later.
- **What the client didn't know to ask for is raised one item per session**, after their
  own request shipped, and always as a separate issue. A list of everything missing gets
  ignored; one sentence gets answered.
- The knowledge graph is local-only and never committed: `graphify` falls back to the
  `claude` CLI on `PATH`, so a bare `extract` becomes a nested agent shipping the
  repository off the machine. Always `--code-only` and `--no-label`.
- Adoption changed no application code, on purpose. Everything it deliberately left
  alone is above, and each one ships — if it ships — as its own issue through `/next`.
