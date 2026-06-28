# Review Criteria

## Priority Tiers

### 🔴 Concerns (Must Address)

- **Bugs**: Logic errors, null pointer issues, off-by-one errors
- **Security**: SQL injection, XSS, exposed secrets, auth bypasses, missing tenant scoping
- **Breaking changes**: API field removed/renamed/type-changed, enum values removed, HTTP status or path changed, required fields added to previously-optional positions
- **Performance**: N+1 queries, inefficient algorithms, memory leaks
- **Error handling**: Uncaught exceptions, silent failures
- **Missing tests**: New functionality or bug fixes with no test coverage

### 🟡 Suggestions (Consider)

- **Better patterns**: More idiomatic approaches
- **Code clarity**: Better naming, simpler logic, extract methods
- **Consistency**: Match existing patterns in the codebase
- **Edge cases**: Missing validations or boundary conditions

### 🟢 Pattern Alignment (Verify)

- **Naming conventions**: Variables, functions, classes match project style
- **Import style**: Simple class names, avoid fully qualified names
- **Test naming**: `givenCondition_whenAction_thenExpectedResult()` format
- **Commit messages**: `JIRA-ID Description` (space after ID) format
- **Error handling patterns**: Match existing approach
- **API patterns**: Consistent with existing endpoints

---

## Language-Specific Anti-Patterns

### Java / Spring Boot

- Fully qualified class names in code (use simple imports)
- `.get(0)` on lists — use `.getFirst()`
- Lambda where a method reference is cleaner
- Missing transaction boundaries
- DTO/Entity mixing

### TypeScript / React

- `any` type without justification
- Unhandled promise rejections
- Tests not co-located with components
- Missing dependency arrays in hooks
- Inline styles instead of design system tokens

---

## Test Quality

Flag as 🔴 blocking or 🟡 advisory:

1. **Setup vs test separation** — `@BeforeEach` contains all tenant/data setup; test methods contain only behavioral assertions
   - 🔴 Setup steps masquerading as tests (e.g. `test1_CreateItem` with no assertion)
2. **Polling abstracted** — polling loops must be extracted to named helpers
   - 🟡 Inline polling loop — extract to `waitForX()` helper
3. **Repeated request patterns extracted** — multi-step sequences appearing in > 1 test should be a helper method
   - 🟡 Duplicated request sequence — extract to named helper
4. **`@Ignore` annotations reference tickets** — every `@Ignore` must include the blocking Jira key
   - 🔴 `@Ignore` with no ticket reference
5. **Test names follow given/when/then** — `givenX_whenY_thenZ()` format
   - 🟡 Non-conforming test names
