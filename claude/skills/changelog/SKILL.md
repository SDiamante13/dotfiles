---
name: changelog
description: Generate a bullet-point summary of branch changes for a PR description. Triggers on "changelog", "pr summary", "summarize branch", or "/changelog".
---

# Changelog — PR Summary Generator

Generate a concise bullet-point summary of all changes on the current branch vs the base branch.

## Activation Triggers

Activate when: "changelog", "pr summary", "summarize branch", "what changed on this branch", "/changelog"

## Process

1. **Detect base branch**: Default to `main`. If the user specifies a different base, use that.
2. **Gather data** — run these in parallel:
   - `git log <base>..HEAD --oneline` — commit list
   - `git diff <base>..HEAD --stat` — files changed
3. **Read the full diff** for context:
   - `git diff <base>..HEAD` — scan for meaningful changes (skip lockfiles, generated files)
4. **Synthesize** — produce a bullet-point summary grouped by theme, not by commit. Merge related commits into single bullets.

## Output Format

```markdown
## Summary

- **<Theme/area>** — concise description of what changed and why
- **<Theme/area>** — concise description of what changed and why
...
```

## Rules

- Group by logical change, not by commit — multiple commits on the same topic become one bullet
- Lead each bullet with a bold area label (e.g., **CI**, **Coordinator prompt**, **Experiment data**)
- Keep each bullet to 1-2 lines max
- Focus on *what* and *why*, not *how*
- Omit trivial changes (whitespace, formatting-only) unless they're the only change
- If a skill or tool was added, mention it by name
- Do NOT include commit hashes in the output
- Output plain markdown — no code fences wrapping the whole thing
