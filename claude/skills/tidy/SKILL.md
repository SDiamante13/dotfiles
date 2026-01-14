---
name: tidy
description: TDD Production Code Refactoring Process. Triggers on 'tidy up'.
---

# TDD Production Code Refactoring Process

STARTER_CHARACTER = 🟣

**NEVER** make changes to Test code in this process.

This process is for refactoring production code with test coverage.

## Initial Setup

1. **Locate Test File Proactively**
   - If user provides a file path, search for its test file using common patterns:
     - `filename.test.ext`, `filename.spec.ext`
     - `__tests__/filename.ext`
     - `tests/filename.ext`
     - Mirror path with `/test/` instead of `/src/`
   - Use Glob and Grep to search multiple patterns in parallel
   - If multiple test files found, show options and ask which one
   - If no test file found, inform user and ask them to provide the test file path
   - **Only ask user if ambiguous or not found** - otherwise proceed automatically

2. **Verify Tests Pass**
   - Run the test suite to establish baseline
   - If tests fail initially, stop and report to user

3. **Scan for Refactoring Opportunities**
   - Read the production code file thoroughly
   - Identify ALL refactoring opportunities by priority:
     1. Dead code (commented code, unused variables)
     2. Poor names (unclear variables/methods)
     3. Long methods (> 25 lines)
     4. Duplication (repeated code blocks)
     5. Complex conditionals (nested ifs, no guard clauses)
     6. Unnecessary locals (single-use variables)
     7. Unused imports
   - **Present numbered list** of all findings to user
   - **Ask user which ones to proceed with** (e.g., "all", "1-5", "2,4,7")
   - Wait for user confirmation before starting refactoring

## Refactoring Loop

For each approved refactor:
1. Perform the refactoring (one at a time, in priority order)
2. Run tests to ensure they still pass
3. If tests pass: commit with message format `"- r <refactoring>"` (quotes must include the - r)
4. If tests fail: revert changes and try a different refactoring
5. Provide brief status update after each refactor

**Stop conditions:**
- If a refactor fails three times
- If no further refactoring opportunities found
- Pause and check with user

## Code Style Guidelines

- Prefer self-explanatory, readable code over comments
- Use functional helper methods for clarity
- Remove comments and dead code
- Extract paragraphs into methods
- Use better variable names
- Remove unused imports
- Remove unhelpful local variables
- Methods should be small and focused (ideally < 25 lines)

## Common Refactorings (in priority order)

1. **Remove dead code** - commented code, unused variables
2. **Better names** - rename unclear variables/methods
3. **Extract methods** - break up long methods
4. **Remove duplication** - DRY principle
5. **Simplify conditionals** - reduce nesting, use guard clauses
6. **Remove unnecessary locals** - inline single-use variables
7. **Clean imports** - remove unused imports
