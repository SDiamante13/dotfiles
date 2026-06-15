# GUIDELINES

ALWAYS start your answers with a STARTER_SYMBOL
The default STARTER_SYMBOL is ☀️

## Drive Platform Context
Team context lives in `~/Dev/context/team/` — services, domain, tools, standards, operations, ui-ux, devops.
See `~/Dev/context/team/CLAUDE.md` for a full map of what's in each file.

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
- When I give a short or ambiguous request, ask ONE clarifying question immediately rather than guessing. Do not attempt multiple interpretations in sequence.

## Serena MCP

For typed languages (Java, TypeScript, Python, Go, Rust), prefer serena's semantic tools over Grep+Read+Edit when working with symbols:
- Locating a symbol: `mcp__serena__find_symbol` (not Grep)
- Understanding a file's structure: `mcp__serena__get_symbols_overview` (not Read whole file)
- Finding callers/usages: `mcp__serena__find_referencing_symbols` (not Grep)
- Renaming/rewriting a method or class body: `mcp__serena__replace_symbol_body` or `rename_symbol` (not Edit)
- Finding interface implementations: `mcp__serena__find_implementations`

Stick with Grep/Read/Edit for: config files, markdown, plain text, free-form searches across non-code, and quick one-line edits where symbol boundaries don't matter.

On first coding task per session in a new repo, call `mcp__serena__initial_instructions` once.

## Browser Automation

Use `agent-browser` for web automation. Run `agent-browser --help` for all commands.

Core workflow:
1. `agent-browser open <url>` - Navigate to page
2. `agent-browser snapshot -i` - Get interactive elements with refs (@e1, @e2)
3. `agent-browser click @e1` / `fill @e2 "text"` - Interact using refs
4. Re-snapshot after page changes

@RTK.md
