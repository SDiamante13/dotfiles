# Review Output Format

```markdown
# Code Review: [Task/Feature Name]

**Scope:** [Brief description]
**Files Changed:** N files — [list key files]

---

## 🔴 Concerns (Must Address)

### [path/to/file:line]
**Issue:** [Description]
**Impact:** [What could go wrong]
**Suggested Fix:**
\`\`\`language
// current
// suggested
\`\`\`

---

## 🟡 Suggestions (Consider)

### [path/to/file:line]
**Observation:** [What could be improved]
**Benefit:** [Why this matters]

---

## 🟢 Pattern Alignment & Conventions

**Followed:**
- ✅ [pattern or convention]

**Deviations:**
- ❌ [deviation]: [file:line] — expected [X], got [Y]

**CLAUDE.md conventions:**
- ✅ No low-value comments added
- ✅ No secrets committed

---

## 🏗️ Architectural Analysis

**Top concerns:**
- [concern]: [file:line] — [explanation]

**Simplification wins:**
- [opportunity]: [file] — [suggestion]

**Looks good:**
- [pattern or decision that is well-done]

---

## 🔀 Alternative Approaches

| Alternative | Key tradeoff vs chosen approach | Better when |
|---|---|---|
| [Alt 1] | [tradeoff] | [scenario] |

---

## 📚 Context Gap?

[Flag non-obvious changes: new endpoints, inter-service contracts, new env vars, auth/header requirements.
For each: what changed + which ~/Dev/context/team/services/<service>.md to update.]
[Or: ✅ No context gaps detected.]

---

## Summary

**Overall Assessment:** [Good / Needs Work / Mixed]

**Priority Actions:**
1. [Most important]
2. [Next]

**Positive Highlights:**
- [What was done well]

---
**Total:** 🔴 [N] concerns · 🟡 [N] suggestions · 🟢 [N] convention issues
```
