---
name: tdd-cycle
description: Orchestrate the core TDD cycle. Use when Steven asks for TDD, red/green/refactor, test-first implementation, regression-first bug fixing, characterization tests, or explicit tdd-cycle; identify the smallest externally observable behavior, write a failing test first, make the minimal production change, refactor only after green, and report red/green validation evidence.
---

# TDD Cycle

Run one small red-green-refactor loop per externally observable behavior or regression. Avoid broad rewrites and unrelated cleanup.

## Workflow

1. Identify the smallest externally observable behavior or regression to prove.
2. Write or update a failing test before production changes.
3. Run the narrow test and confirm it fails for the expected reason.
4. Implement the minimal production change needed to pass.
5. Run the narrow test and confirm it passes.
6. Run relevant broader tests after the focused test is green.
7. Refactor only after green, preserving behavior; rerun the focused test after refactoring.
8. Repeat the cycle for additional behaviors, keeping each cycle small.

## Blocked Test Harness

If a failing test cannot be written because the harness is missing, flaky, unsafe, or blocked by unrelated infrastructure, state why. Create the closest executable characterization or documented verification command instead, then keep the production change as small as possible.

## Final Report

- RED command and intended failure result.
- Files changed.
- GREEN command and passing result.
- Broader validation command and result, or any skipped broader validation with reason.
