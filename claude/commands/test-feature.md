---
description: Test newly added features using Playwright MCP for acceptance testing
---

# Feature Acceptance Testing

Use the Playwright MCP tool through a subtask to perform acceptance testing on recently added features.

## Testing Process

1. **Get Application URL**: Ask the user for the URL of the application to test
2. **Handle Authentication**: If login screens are encountered, ask the user for guidance
3. **Test Happy Paths**: Run through all main user flows for the new features (not intensive QA, just sensible "does this work" testing)
4. **Identify Issues**: Document any features not working as expected
5. **UX/UI Review**: Note any UX/UI improvements that could be made
6. **Generate Report**: Create a comprehensive test report

## Report Format

The report should include:
- List of all features that are not working as expected
- UX/UI improvement suggestions
- Save location: Current directory with naming format: `test-report-{feature-name}-{YYYY-MM-DD-HH-MM}.md`

## Execution

Launch a playwright-mcp subtask agent to:
- Navigate through the application
- Test all happy path scenarios
- Capture screenshots of issues
- Document findings in a structured report