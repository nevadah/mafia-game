# Working Style — Nevada Hamaker

> **Canonical source:** [github.com/nevadah/ai-working-style](https://github.com/nevadah/ai-working-style)
> This is a project-local copy. If the canonical version and this file diverge, the canonical version wins.

Cross-project preferences for working with AI coding tools (Claude Code, Cursor, Copilot, and similar).

---

## Branch Hygiene

Before starting any new branch:

1. **Verify the previous PR is merged.** Use `gh pr list` or `git log origin/main`. Never assume a PR merged because it was opened — confirm it. A stale branch divergence can require manual re-application of recently merged fixes.
2. **Pull from main.** Always branch from an up-to-date main.

---

## Quality Gates

Before opening any PR:

- **Run the linter.** CI fails on lint errors and warnings, not just test failures. Find and run the project's lint command (e.g. `npm run lint`, `ruff check`, `golangci-lint run`) before pushing.
- **Run the full test suite.** Coverage thresholds are enforced.
- **Audit project documentation.** Check `CLAUDE.md` and any `docs/` for anything the branch has made stale or left undocumented — new endpoints, changed constraints, new APIs, updated workflows, etc. Update inline. Never defer doc updates to a follow-up PR.

---

## Issue Tracking

**At the start of a session on a new project, identify what issue tracker is in use before doing anything else.** Look for a `CLAUDE.md`, `README.md`, or project docs that mention a specific tool. If none is apparent, ask — don't default silently to an ad-hoc system.

Supported trackers vary by project. Examples include Beads (`bd`), GitHub Issues (`gh issue`), Linear, Jira, or plain markdown files. Use whatever the project has configured.

Regardless of which tracker is in use:

- **File an issue before writing code** — not after. If you are about to start a task that has no issue, create one first.
- **Never use `TodoWrite`, `TaskCreate`, or in-conversation markdown lists** as a substitute for the project's real issue tracker. These are invisible to collaborators and don't survive session boundaries.
- When identifying multiple work items, file them all — don't let them live only in conversation.
- Claim or assign issues before starting work so others (or a future session) can see what's in progress.
- Close or update issues when work is complete.

If the project uses **Beads** (`bd`):

```bash
bd ready                    # find available work with no blockers
bd show <id>                # view issue details and dependencies
bd update <id> --claim      # claim an issue before starting work
bd close <id>               # mark complete
bd create \
  --title="Summary" \
  --description="Why this exists and what to do" \
  --type=task \
  --priority=2              # 0=critical 1=high 2=medium 3=low 4=backlog
```

Beads-specific: use `bd remember "insight"` for persistent knowledge across sessions; run `bd dolt push` as part of every session close.

---

## Session Completion Protocol

**Work is NOT complete until `git push` succeeds.**

Mandatory steps before ending a session:

1. **File issues** for any remaining or follow-up work in the project's issue tracker.
2. **Run quality gates:** tests, linter, build.
3. **Update issue status** — close finished work, update in-progress items.
4. **Push:**
   ```bash
   git pull --rebase
   git push
   git status   # must show "up to date with origin"
   ```
   If the project uses a tracker with a sync step (e.g. `bd dolt push` for Beads), run that before `git push`.
5. Never say "ready to push when you are" — push every time, without prompting.

---

## Code Style

- **Don't add features beyond what was asked.** A bug fix doesn't need surrounding cleanup. A simple feature doesn't need extra configurability.
- **No speculative abstractions.** Don't build helpers, utilities, or generalization for hypothetical future needs. Three similar lines of code is better than a premature abstraction.
- **No backwards-compatibility shims** for removed code unless explicitly asked.
- **Don't add error handling for scenarios that can't happen.** Trust internal guarantees; validate only at system boundaries.
- **No docstrings, comments, or type annotations on code you didn't change.**

---

## Response Style

- **Terse.** Skip preamble and recap. Get to the point.
- **No trailing summaries.** Don't explain what you just did — the diff is self-evident.
- **No emojis** in code, commits, docs, or responses unless explicitly requested.
- **No "I'll continue" or context acknowledgements** at the start of a resumed session — pick up mid-task as if the break never happened.
- When referencing code locations, use markdown links: `[file.ts:42](path/to/file.ts#L42)`.
