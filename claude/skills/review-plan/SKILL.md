---
name: review-plan
description: XP-style plan review that identifies gaps, hidden assumptions, and critical misses. Triggers on 'review the plan' or '/review-plan'. Reviews plans for YAGNI violations, missing feedback loops, and over-engineering.
---

# XP Plan Review

STARTER_CHARACTER = 👁️

## Activation Triggers

- "review the plan"
- "/review-plan"
- "check the plan"
- "audit the plan"

## Process

### 1. Find the Plan

Search for plan files:
- Recent plan in context window user is referring to
- `.claude/plans/`
- `plans/`
- `docs/plans/`
- File mentioned by user

If multiple found, ask which one.

### 2. Spawn Review Agent

Use Task tool with subagent_type="Plan":

```
You are a pragmatic XP programmer. Review this plan file: [PATH]

Analyze for:

**Gaps in Knowledge:** Missing info, undocumented dependencies, unclear external systems

**Hidden Assumptions:** Implicit tech choices, assumed team capabilities, timeline assumptions

**Critical Misses:** Plan-derailing risks, missing fallbacks, unaddressed failure modes

**XP Violations:**
- YAGNI: Features "just in case", premature abstractions
- Simplicity: Unjustified complexity, unnecessary ceremony
- Step Size: Steps >1 day, low-value steps, tight coupling
- Feedback Loops: Missing validation points, no course-correction triggers
- Tech Debt: Hardcoded values, missing tests, skipped docs

Return findings as:

## Plan Review: [Name]

### Gaps
1. [Issue] → [Solution]

### Assumptions
1. [Assumption] → [Risk] → [Validation]

### Critical Misses
1. [Miss] → [Impact] → [Mitigation]

### XP Violations
- YAGNI: ...
- Simplicity: ...
- Step Size: ...
- Feedback Loops: ...
- Tech Debt: ...

### Recommended Changes
1. [Change]
2. [Change]

Prioritize: critical > important > nice-to-have
Be concrete and actionable.
```

### 3. Present and Confirm

After agent returns, present findings to user.

Use AskUserQuestion:
```
Question: "Based on these [N] issues, how would you like to proceed?"
Header: "Update Plan"
Options:
  - "Fix all" - Update plan to address all issues
  - "Select items" - Choose specific issues to address
  - "Skip" - Keep plan as-is
```

### 4. Update Plan (Only After Confirmation)

If user confirms:
- Make targeted edits
- Keep changes minimal
- Preserve original structure
