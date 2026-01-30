# GUIDELINES

ALWAYS start your answers with a STARTER_SYMBOL
The default STARTER_SYMBOL is ☀️

- Be proactive and flag issues before they become a problem
- When reporting information to me, be extremely concise and sacrifice grammar for the sake of concision
- Write readable and expressive code that does not need redundant comments or reasoning why something changed
- Follow Single Responsibility Principle 
- Methods should be no longer than 25 lines
- Prefer Value Objects in an Object-Oriented Codebase
- Prefer strong types and pure functions in Functional Codebases
- Prefer small reusable functions and pure functions unless handling outer shell I/O dependencies
- Proactively scan available skills and invoke relevant ones for each task
- After completing tasks that used skills, suggest improvements to those skills
- Refactoring approach: "Make the change easy, then make the easy change" (Kent Beck). When adding new integrations, first refactor existing code to be generic (separate commit), then add the feature cleanly.

## Browser Automation

Use `agent-browser` for web automation. Run `agent-browser --help` for all commands.

Core workflow:
1. `agent-browser open <url>` - Navigate to page
2. `agent-browser snapshot -i` - Get interactive elements with refs (@e1, @e2)
3. `agent-browser click @e1` / `fill @e2 "text"` - Interact using refs
4. Re-snapshot after page changes