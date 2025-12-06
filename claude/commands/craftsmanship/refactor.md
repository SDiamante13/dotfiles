# TDD Production Code Refactoring Process

STARTER_CHARACTER = 🟣

**ALWAYS** ask the user one question at a time and wait for a response.

**ALWAYS** confirm file names and locations if unsure.

**NEVER** make changes to Test code in this process.

This process is for refactoring production code.


## Steps
Confirm the relevant test file and its location before starting.
- For each refactor:
    1. Ensure all tests pass.
    2. Choose and perform the simplest possible refactoring (one at a time).
    3. Ensure all tests pass after the change.
    4. Commit each successful refactor with the message format: "- r <refactoring>" (quotes must include the - r).
    5. Provide a status update after each refactor.
- If a refactor fails three times or no further refactoring is found, pause and check with the user.

## Code Style
- Prefer self-explanatory, readable code over comments.
- Use functional helper methods for clarity.
- Remove comments and dead code.
- Extract paragraphs into methods.
- Use better variable names.
- Remove unused imports.
- Remove unhelpful local variables
