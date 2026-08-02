---
name: graphify
description: The knowledge graph of this repository — what connects to what, across code and schema. Use before planning any change, to answer "what does this touch?" without grepping blind, and for any question about architecture, file relationships or where a concept lives. Also covers installing and updating the graphify tool itself, which is absent at the start of every session because the container is ephemeral.
---

# Graphify

`graphify` (upstream: [Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify),
PyPI `graphifyy`) parses the repository with tree-sitter and produces a queryable graph.

Edges are labelled for honesty: `EXTRACTED` was found in the source, `INFERRED` was
resolved. Treat an `INFERRED` edge as a lead, not a fact. A local-only build is 100%
`EXTRACTED`.

## Always opt out of the LLM backend

This is the part to get right. **`graphify` is not local by default.** Bare `extract`,
`cluster-only` and `label` auto-detect a model backend from whatever is available — and if
no API key is set, they fall back to shelling out to the `claude` CLI when it's on `PATH`,
which it is here. That means a nested agent, real cost, and the repository's contents
leaving the machine, none of it asked for.

Every command below therefore carries its opt-out. `GRAPH_REPORT.md` prints
`Token cost: 0 input · 0 output` when the run really was local — check it.

## Bootstrap

The container is ephemeral: assume the tool is **not** installed. Getting it ready is one
Sonnet subagent's job, dispatched in the background so nobody waits on it.

```bash
graphify --version                      # installed?
uv tool install graphifyy               # no → install
uv tool upgrade graphifyy               # yes → keep it current
```

"Outdated" means the installed version differs from the latest on PyPI:

```bash
curl -s https://pypi.org/pypi/graphifyy/json | python3 -c "import sys,json; print(json.load(sys.stdin)['info']['version'])"
```

If `uv tool install` is refused by the sandbox permission classifier, fall back to a
virtualenv in the scratchpad (`uv venv` + `uv pip install graphifyy`) and call the binary
by absolute path. If that fails too, say so plainly and carry on with `git` and `grep` — a
missing graph slows the work down, it never blocks it.

**Do not run `graphify install`.** That subcommand rewrites `CLAUDE.md` and overwrites this
file with the vendor's own. This repository owns its skill and its `CLAUDE.md`.

## Build

Two steps, both local. There is no `graphify .`.

```bash
graphify extract . --code-only        # AST only, no API key, skips docs/images
graphify cluster-only . --no-label    # communities, no LLM naming
```

`--no-label` leaves communities as `Community 0`, `Community 1` … That is the price of not
calling a model on a first build, and it's the right trade — the edges are what the graph
is for.

After code changes:

```bash
graphify update .                     # re-extract changed files; no LLM, no cost
```

`update` re-clusters as it goes and names communities after their hub node (`getSupabase`,
and so on) without calling anything — still `Token cost: 0`. So the placeholders from the
first build disappear on the first refresh.

Add `--no-viz` to `cluster-only` if HTML generation ever fails. Output lands in
`graphify-out/`: `graph.json` (queryable), `GRAPH_REPORT.md` (prose), `graph.html`
(interactive).

`graphify-out/` is **gitignored and never committed** — derived, stale the moment code
changes, and its JSON would bury every diff. It's excluded in `biome.json` too, because
Biome formats `**` and does not read `.gitignore`.

## Is the graph stale?

`GRAPH_REPORT.md` records the commit it was built from. Compare against `git rev-parse
HEAD`; if they differ, `graphify update .` before trusting it.

## Query

Once `graphify-out/graph.json` exists, reach for these before grep — they return a scoped
subgraph rather than a wall of matches, and none of them calls a model:

| Command | For |
| --- | --- |
| `graphify query "<question>"` | "What connects the API to the database?" |
| `graphify path "<A>" "<B>"` | The shortest link between two things |
| `graphify explain "<concept>"` | Everything hanging off one component |
| `graphify affected "<X>"` | What breaks if X changes — reverse traversal |
| `graphify god-nodes` | The architectural hubs, most connected first |

Read `graphify-out/GRAPH_REPORT.md` only for a broad architecture sweep, or when the
commands above don't surface enough.

## Never send the graph out

No pushing to Neo4j, FalkorDB or any other external store, and don't start `graphify-mcp`
to serve it. This codebase's entire architecture exists to keep credentials server-side;
its map stays local too.
