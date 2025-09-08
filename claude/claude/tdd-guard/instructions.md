## CRITICAL: test.json Validation Rules

**IMMEDIATE VALIDATION**: Before any other checks, if test.json exists and contains ANY test with:
- `"state": "failed"`
- `"errors"` array with `"expected"` and `"actual"` values
- Clear assertion failure messages

→ **Implementation is ALWAYS permitted, no exceptions**

**Example of VALID test.json that ALWAYS permits implementation:**
```json
{
  "name": "should move backward South by 1",
  "state": "failed", 
  "errors": [
    {
      "message": "Error: expect(received).toBe(expected)...\nExpected: 9\nReceived: 1",
      "expected": "9",
      "actual": "1"
    }
  ]
}
```

**Rule**: If test.json shows Expected: 9, Received: 1, then implementing code to make it return 9 is valid Green phase TDD - NEVER block this.

## TDD Fundamentals

### Uncle Bob's 3 Laws of TDD (Fundamental Rules)

**Law 1**: You are not allowed to write any production code unless it is to make a failing unit test pass.

**Law 2**: You are not allowed to write any more of a unit test than is sufficient to fail; compilation failures count as failures.

**Law 3**: You are not allowed to write any more production code than is sufficient to pass the one failing unit test.

These laws must be followed strictly - they are the foundation of TDD discipline.

### The Prediction Phase: Think Before You Test

Before writing any test, engage in **Predictive TDD** by explicitly answering two critical questions:

**🎯 Question 1: "What should it do?"**
- Define the specific behavior you want to implement
- Be concrete and measurable, not vague
- Focus on the observable outcome

**🔍 Question 2: "How will you know it did it?"**
- Predict exactly how the test will fail when you run it
- Anticipate the specific error message or assertion failure
- This prediction validates your understanding of the current system state

**Example for Mars Rover:**
- What should it do? *"When rover receives 'F' command while facing North, it should move one position forward on Y-axis"*
- How will you know? *"Test will fail with 'Expected y to be 1, got 0' because moveForward method doesn't exist yet"*

**Why Prediction Matters:**
- Catches incorrect assumptions before writing code
- Makes testing more intentional and thoughtful
- Helps identify missing setup or incomplete understanding
- Prevents "accidental" passing tests that don't accurately test what you think

### The TDD Cycle
The foundation of TDD is the Red-Green-Refactor cycle:

1. **Red Phase**: Predict, then write ONE failing test
    - **Step 1**: Make explicit predictions (see Prediction Phase above)
    - **Step 2**: Write the test based on your predictions
    - **Step 3**: Run the test and verify it fails as predicted
    - ✅ **Correct Prediction**: Test fails as expected → proceed to Green
    - ❌ **Incorrect Prediction**: Test fails differently → reassess understanding
    - The test must fail for the RIGHT reason (not syntax/import errors)
    - Only one test at a time - this is critical for TDD discipline
    - **Adding a single test to a test file is ALWAYS allowed** - no prior test output needed

2. **Green Phase**: Write MINIMAL code to make the test pass
    - **CRITICAL**: Implementation is ALWAYS allowed when there are failing tests with clear assertion errors
    - **Test Output Recognition**: Valid test output includes any of:
        - Jest/test runner showing "Expected: X, Received: Y" assertion failures
        - Console output showing specific test failures with error messages
        - Test files showing failed test states with error details
        - Error messages like "rover.moveBackward is not a function"
        - Compilation errors like "ReferenceError: MarsRover is not defined"
    - **Implementation Validation**: Before implementing, verify:
        1. Test output clearly shows what is expected vs what is received
        2. Your implementation addresses ONLY the specific failure shown
        3. You are not adding extra functionality beyond the current test requirement
    - **Implementation Rule**: If test output shows a specific assertion failure, implement ONLY what's needed to fix that exact failure
    - Implement only what's needed for the current failing test
    - No anticipatory coding or extra features
    - Address the specific failure message

3. **Refactor Phase**: Improve code structure while keeping tests green
    - Only allowed when tests are passing (green)
    - Run tests before refactoring to confirm green state
    - Valid refactoring: extract methods, rename, add types, eliminate duplication
    - Invalid refactoring: new behavior, additional methods, changed logic
    - Apply to BOTH test and implementation code

### Test Prioritization: ZOMBIES FIRST

Write tests in this order for optimal TDD flow:
- **Z**ero: Empty cases, null inputs, zero values (start here)
- **O**ne: Single item, basic happy path
- **M**any: Multiple items, collections
- **B**oundary: Edge cases, min/max values
- **I**nterface: Different implementations
- **E**xercise Exceptional behavior: Errors, exceptions
- **S**imple: Prefer simple scenarios and solutions

*Example: For Mars Rover movement, start with Zero (no movement), then One (single step North), then Many (multiple steps), then Boundary (grid edges), etc.*

### Refactoring Guidelines

**✅ VALID Refactoring (No new tests needed):**
- Extract methods or classes
- Rename variables, methods, classes
- Add TypeScript types or interfaces
- Extract constants (replace magic values)
- Eliminate code duplication
- Improve code organization

**❌ INVALID "Refactoring" (Requires failing test first):**
- Add new methods with different behavior
- Add error handling or validation
- Support new input types or formats
- Add business logic or calculations
- Change method signatures or return types

**Decision Rule:** "If I remove this change, will any existing test fail?"
- No → Valid refactoring
- Yes → New functionality requiring a failing test

### TDD Decision Tree

**"Can I add this code?"**
```
Step 1: Do I have test output showing failures?
├─ YES: Go to Step 2
└─ NO: Go to Step 4

Step 2: What type of failure is shown in the test output?
├─ ASSERTION FAILURES ("Expected: X, Received: Y"): Go to Step 3a
├─ TEST.JSON FAILED STATE ({"state": "failed", "errors": [...]}): Go to Step 3a
├─ METHOD MISSING ("is not a function"): Go to Step 3b  
├─ COMPILATION ERRORS ("not defined", import issues): Go to Step 3c
└─ OTHER: ❌ Need clear assertion failures first

Step 3a: Assertion Failure Validation
├─ Does my implementation ONLY fix the specific "Expected vs Received" gap?
│  ├─ YES: ✅ Proceed (Green Phase - ALWAYS ALLOWED)
│  └─ NO: ❌ Remove extra code (Law 3 violation)

Step 3b: Method Missing Validation  
├─ Am I creating ONLY the missing method as a stub?
│  ├─ YES: ✅ Create minimal method stub
│  └─ NO: ❌ Create stub first, implement logic only after assertion failure

Step 3c: Compilation Error Validation
├─ Am I creating ONLY what's needed to resolve the compilation error?
│  ├─ YES: ✅ Create minimal stubs (empty class, basic imports)
│  └─ NO: ❌ Create minimal stub only

Step 4: No test failures shown - what's my intent?
├─ Tests are GREEN: Is this refactoring (no behavior change)?
│  ├─ YES: ✅ Proceed (Refactor Phase)
│  └─ NO: ❌ Write failing test first (Law 1 violation)
└─ Tests status UNKNOWN: ❌ Run tests first to see current state
```

**Key Rule**: If test output shows "Expected: 9, Received: 1", implementing code to return 9 is ALWAYS valid Green phase work.

**Validation Checklist for Implementation:**
Before writing any production code, confirm:
- [ ] I can see specific test output showing what failed
- [ ] The failure shows expected vs received values OR missing method/class errors
- [ ] My implementation fixes ONLY the specific failure shown
- [ ] I am not adding extra functionality beyond what the test requires
- [ ] If implementing method logic, I have a clear "Expected: X, Received: Y" assertion failure

### Minimal Implementation Strategy

Follow this progression for each failing test:

1. **Compilation Error** → Create minimal stub
   ```typescript
   // Test fails: "MarsRover is not defined"
   export class MarsRover {} // ONLY this, nothing more
   ```

2. **Method Missing** → Add method stub
   ```typescript
   // Test fails: "move is not a function"
   move() {} // ONLY this method, no implementation
   ```

3. **Assertion Failure** → Implement minimal logic
   ```typescript
   // Test fails: Expected position to be {x:0,y:1}, got undefined
   move() { 
     this.position = {x:0, y:1}; // Hardcode exact expected result
   }
   ```

**Critical Rule:** If test expects North movement, implement ONLY North. Do NOT implement East, South, West until you have failing tests for each direction.

### Core Violations and Solutions

**❌ Multiple Test Addition**
- Problem: Adding >1 test at once breaks Law 2
- Solution: Write one test, make it pass, then write next test

**❌ Over-Implementation**
- Problem: Code exceeds current test requirements (Law 3)
- Examples: Implementing all directions when test only needs North
- Solution: Implement literally what the test expects, nothing more

**❌ Premature Implementation**
- Problem: Adding code without failing test (Law 1)
- Solution: Always start with failing test, then minimal implementation

**❌ Refactoring with Red Tests**
- Problem: Changing structure while tests fail
- Solution: Make tests green first, then refactor safely

**❌ Prediction Violations**
- Problem: Writing tests without explicit failure predictions
- Examples: "Let me just write this test and see what happens"
- Solution: Always predict specific failure before writing/running test
- Impact: Leads to accidental passing tests and misunderstood requirements

### Test Quality: FIRST Principles

Your tests should be:
- **Fast**: Run in milliseconds, avoid I/O operations
- **Independent**: Each test stands alone, no dependencies
- **Repeatable**: Same results every time, any environment
- **Self-validating**: Clear pass/fail, descriptive assertions
- **Timely**: Written just before production code

*Poor test example:* `expect(result).toBeTruthy()` (not self-validating)
*Good test example:* `expect(rover.position).toEqual({x: 0, y: 1})` (specific, clear)

### Critical Principle: Incremental Development
Each step in TDD should address ONE specific issue:
- Test fails "not defined" → Create empty stub/class only
- Test fails "not a function" → Add method stub only
- Test fails with assertion → Implement minimal logic only

### Test Output Validation Rules

**CRITICAL**: Implementation is permitted when ANY of these conditions are met:

1. **Clear Assertion Failures**: Test output shows specific "Expected: X, Received: Y" messages
2. **Jest/Test Runner Output**: Console showing test failures with assertion details
3. **Test State Files**: JSON or other files showing failed test states with error details
4. **Compilation Errors**: Missing classes, methods, or imports that prevent tests from running

**Examples of VALID test output that permits implementation:**
```
✗ expect(received).toBe(expected)
  Expected: 9
  Received: 1
```
```
Error: rover.moveBackward is not a function
```
```
ReferenceError: MarsRover is not defined
```

**CRITICAL: test.json Format Recognition**
When test.json contains entries like this, implementation is ALWAYS permitted:
```json
{
  "name": "should move backward South by 1",
  "state": "failed",
  "errors": [
    {
      "message": "Error: expect(received).toBe(expected)...\n\nExpected: 9\nReceived: 1",
      "expected": "9", 
      "actual": "1"
    }
  ]
}
```

**Validation Logic for test.json:**
- If ANY test has `"state": "failed"` → Implementation permitted
- If ANY test has `"errors"` array with `"expected"` and `"actual"` values → Implementation ALWAYS permitted
- If test shows specific assertion failure message → Implementation ALWAYS permitted

**When test output is present showing specific failures, the agent should NEVER be blocked from implementing the minimal fix.**

### Implementation Permission Matrix

| Test Output Type | Implementation Allowed | Requirements |
|------------------|----------------------|-------------|
| "Expected: X, Received: Y" | ✅ ALWAYS | Implement only what bridges the gap |
| test.json "state": "failed" | ✅ ALWAYS | Implement only what fixes the specific failure |
| test.json with "expected"/"actual" | ✅ ALWAYS | Bridge the expected vs actual gap |
| "method is not a function" | ✅ YES | Create method stub only |
| "Class is not defined" | ✅ YES | Create empty class/import only |
| "ReferenceError" | ✅ YES | Add missing reference/import only |
| No test output | ❌ NO | Run tests first or write failing test |
| All tests passing | ⚠️ REFACTOR ONLY | No new behavior without failing test |

### Blocking vs Allowing Implementation

**❌ BLOCK implementation when:**
- No test output available (tests haven't been run)
- All tests are passing (green state) and agent wants to add new behavior
- Agent wants to implement multiple features beyond current test requirement

**✅ ALLOW implementation when:**
- Test output shows assertion failures with specific expected/received values
- Test output shows compilation/import errors
- Agent is implementing ONLY what's needed to fix the specific failure
- Agent is refactoring with green tests

**Key Principle**: If you can see what the test expects and what it's currently getting, implementation to bridge that gap is valid TDD.

### Hook Validation Debugging

**If the hook is incorrectly blocking implementation despite failing tests:**

1. **Check test.json content**: Look for:
    - Any test with `"state": "failed"`
    - Any test with `"errors"` array containing `"expected"` and `"actual"` fields
    - Clear assertion failure messages in `"message"` field

2. **Validate test evidence**: If test.json shows:
   ```json
   "state": "failed",
   "errors": [{"expected": "9", "actual": "1"}]
   ```
   Then implementation is ALWAYS permitted - no exceptions.

3. **Check for false negatives**: The hook should NEVER block when:
    - test.json contains failed test states
    - Clear expected vs actual values are present
    - Assertion failure messages are visible

4. **Diagnostic questions for hook validation**:
    - Is test.json being read correctly?
    - Is "state": "failed" being recognized as valid test output?
    - Are "expected"/"actual" fields being parsed as assertion failures?
    - Is the hook distinguishing between "no tests run" vs "tests ran and failed"?

**CRITICAL**: Any test.json entry with "state": "failed" and specific expected/actual values constitutes valid failing test evidence that permits Green phase implementation.

### Test Management and Cleanup

**✅ VALID Test Deletion/Cleanup:**
- **Redundant Coverage**: Remove tests when newer, more comprehensive tests provide equivalent or superior coverage
- **Combined Test Superiority**: Delete simple tests when complex tests validate the same behavior plus additional scenarios
- **Test Suite Evolution**: As codebase matures, replace granular tests with broader integration-style tests
- **Overlapping Assertions**: Remove tests that assert identical behavior already covered by other passing tests

**Examples of Valid Test Cleanup:**
- Individual movement tests (F, B per direction) → Complex sequence tests (LFRFRFRFF) that exercise same movements
- Single command tests (L, R) → Multi-command rotation tests (LLLL, RRRR) that include single rotations
- Basic edge cases → Comprehensive edge case suites that cover the same boundaries

**Decision Criteria for Test Deletion:**
1. **Coverage Analysis**: New tests exercise same code paths as old tests
2. **Regression Protection**: New tests would catch same bugs as old tests
3. **Behavior Validation**: New tests verify same expected behaviors as old tests
4. **Green State Requirement**: All tests (including new comprehensive ones) must be passing

**❌ INVALID Test Deletion:**
- Removing tests with no replacement coverage
- Deleting tests while any test is failing
- Removing tests that cover unique edge cases not covered elsewhere
- Deleting tests during Red or implementation phases

**Validation Process for Test Cleanup:**
1. Verify new tests provide equivalent or better coverage
2. Confirm all tests are currently green (passing state)
3. Ensure new tests would catch regressions the old tests would catch
4. Run test suite after deletion to confirm no coverage gaps

### General Information
- Sometimes the test output shows as no tests have been run when a new test is failing due to a missing import or constructor. In such cases, allow the agent to create simple stubs. Ask them if they forgot to create a stub if they are stuck.
- It is never allowed to introduce new logic without evidence of relevant failing tests.
- In the refactor phase, it is perfectly fine to refactor both test and implementation code. That said, completely new functionality is not allowed. Types, cleanup, abstractions, and helpers are allowed as long as they do not introduce new behavior.
- Adding types, interfaces, or a constant to replace magic values is perfectly fine during refactoring.
- Test cleanup and deletion of redundant tests is allowed when comprehensive replacement tests provide superior coverage.
- Provide the agent with helpful directions so that they do not get stuck when blocking them.

### Critical Validation Fix
**NEVER block implementation if test.json contains failed tests with expected/actual values.** The most common validation error is not recognizing test.json entries with `"state": "failed"` as valid test output. This is a false positive that prevents proper TDD flow. Always check:
1. Does test.json exist?
2. Does ANY test have `"state": "failed"`?
3. Are there `"expected"` and `"actual"` values in the error?
4. If YES to all → Implementation is permitted, period.