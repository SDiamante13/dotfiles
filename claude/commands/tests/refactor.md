---
description: Refactor test files to improve clarity and remove anti-patterns
---

# Test Refactor

Ask the user for the test file to refactor. Work on one test file at a time.

## Process

Work through these steps in order, making a separate commit for each step that makes changes:

1. **Remove tests for private methods**
   - Tests should only test public API/behavior
   - Private methods tested indirectly through public interface

2. **Remove tests for getters/trivial code**
   - Only test core behavior, not trivial getters/setters
   - Remove noise that doesn't provide safety net

3. **Consolidate overlapping test coverage**
   - Merge redundant tests that cover same behavior
   - Keep just enough coverage for refactoring safety
   - Don't test same thing multiple ways

4. **Split multi-behavior tests**
   - Each test should cover single behavior
   - One logical assertion per test (multiple technical assertions OK if testing one behavior)

5. **Fix test anti-patterns**
   - Tests testing implementation → refactor to test behavior
   - Conditional logic in tests → split into separate tests
   - Order-dependent tests → make independent
   - If test level seems wrong for component, ASK USER with recommendation

6. **Improve test data**
   - Move large test objects to test data builders
   - Keep only relevant data in each test
   - Keep test data close to test for readability

7. **Improve test names/assertions (ASK USER FIRST)**
   - Present 3 options for unclear tests:
     1. Rename test to describe behavior
     2. Improve assertion messages
     3. Both
   - Wait for user decision

8. **Refactor test structure**
   - Use AAA pattern (Arrange-Act-Assert)
   - Separate sections with blank lines (NO comments)
   - Extract helper functions for duplicated setup (NOT beforeEach)
   - Use beforeEach only for variables scoped to describe block

9. **Review mocking strategy**
   - Acceptance tests: Use mock web servers (http), TestContainers (DB)
   - Unit tests: Only mock external dependencies (filesystem, random, time, http, DB)
   - Prefer test doubles over mocking frameworks
   - Use real objects when possible

After EACH step:
- Run tests automatically
- If tests fail, revert the change immediately
- Commit using: `. t <brief description>`

## Testing Philosophy

- TDD: Write tests first
- Acceptance tests for behavior, unit tests for complex pure functions
- Acceptance level depends on component:
  - Microservices: Event or HTTP level
  - UI: Route-level component rendering

## Output

- If no refactoring needed, report "No test refactoring needed"
- Otherwise provide brief summary (e.g., "Removed 3 private method tests, consolidated 5 overlapping tests, split 2 multi-behavior tests")

## Commit Format

Use Arlo's Commit Notation (ACN):
- `. t remove tests for private methods`
- `. t consolidate overlapping coverage for user validation`
- `. t extract test data builder for invoice objects`