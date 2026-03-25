# Task Tracking with Beads

This project uses **[Beads](https://github.com/steveyegge/beads)** (`bd`) for issue and task tracking, as part of an intentional exploration of AI-assisted development workflows.

## What is Beads?

Beads is a command-line issue tracker designed for use with coding agents. Rather than flat markdown todo lists, it models tasks as a dependency-aware graph backed by [Dolt](https://github.com/dolthub/dolt) — a version-controlled SQL database. Key properties:

- **Graph structure** — tasks have typed relationships (`blocks`, `relates_to`, `duplicates`, `supersedes`), so an agent can surface what's actually ready to work on
- **Collision-safe IDs** — hash-based identifiers like `bd-a1b2` avoid conflicts across contributors and agents
- **Agent-optimized** — the `bd prime` command injects compact workflow context into a coding agent session without the token overhead of MCP schemas
- **Git-independent** — Dolt stores its data separately from git refs, so task history doesn't pollute commit history

## Why it's used here

This project is both a portfolio piece and a hands-on exercise in AI-assisted development. Using Beads makes the AI workflow visible and structured:

- Work items are tracked with dependency context, not scattered across commit messages or markdown files
- Claude Code sessions start with a consistent workflow snapshot via the installed hooks
- The task graph is an artifact of the development process itself, not a post-hoc summary

## Setup (for contributors)

Install `bd` and initialize your environment:

```bash
# Install (macOS)
brew install beads

# Set up Claude Code hooks (installs SessionStart + PreCompact hooks)
bd setup claude
```

The Dolt database is stored outside git's object store and can be synchronized separately.

## Common commands

```bash
bd ready              # List tasks with no unresolved blockers
bd show <id>          # View a task and its relationships
bd create             # File a new issue
bd update <id>        # Update status, priority, or links
bd close <id>         # Mark a task complete
bd dep tree <id>      # Visualize dependency chain
bd prime              # Inject full workflow context (used by agents)
```

See `bd help` or the [Beads docs](https://github.com/steveyegge/beads/tree/main/docs) for the full reference.
