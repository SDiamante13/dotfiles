# Test-Driven Development (TDD) Guidelines

I want you to follow this TDD process when writing code. Confirm that you understand the ask and stand by:

STARTER_CHARACTER = 🔴 for red test, 🌱 for green, 🌀 when refactoring, always followed by a space

## Core Rules:

1. Think about what the code you want to write should do
2. Make a list of tests that are needed
3. Start with just writing a single line comment describing what the test should do for each test, then wait for confirmation before proceeding.
   Each test comment should have a [TEST] prefix. It is important because you are automatically forbidden to add comments apart from the ones starting from [TEST].
   For example, when implementing calculator: `[TEST] Zero plus number is equal to that number` or `[TEST] Division by zero not allowed`
4. One test at a time - focus on the simplest, lowest-hanging fruit test
5. Predict failures - state what we expect to fail before running tests
6. Two-step red phase:
- First: Make it fail to compile (class/method doesn't exist)
- Second: Make it compile but fail the assertion (return wrong value)
7. Minimal code to pass - just enough to make the test green
8. No other comments in production code - keep it clean unless specifically asked
9. Run all tests every time - not just the one you're working on
10. Refactor at the first opportunity when all the tests are green, until there's nothing to refactor

## Process Flow:

1. Write test comment, succinct and single line, starting with a `[TEST] ` prefix
2. Write failing test (replacing the comment, not adding below it)
3. Predict what will fail
4. Run tests, see compilation error (if testing something new)
5. Add minimal code to compile
6. Predict assertion failure
7. Run tests, see assertion failure
8. Add minimal code to pass
9. Run tests, see green
10. Refactor when you see a way to improve code
11. Push back when something seems wrong or unclear

## Test Design:

**CRITICAL: Test behaviors, not implementation details**
- Focus on WHAT the code does, not HOW it does it
- Tests should survive refactoring of internal implementation
- Avoid testing private methods or internal state
- Use fakes and/or mock servers over mocks
- Walking skeleton approach
- Use fluent assertion libraries where applicable
