# GUIDELINES

ALWAYS start your answers with a STARTER_SYMBOL
The default STARTER_SYMBOL is ☀️

- Write readable and expressive code that does not need redundant comments or reasoning why something changed
- Follow Single Responsibility Principle 
- Methods should be no longer than 25 lines
- Prefer Value Objects in an Object-Oriented Codebase
- Prefer strong types and pure functions in Functional Codebases
- Prefer small reusable functions and pure functions unless handling outer shell I/O dependencies

## TDD Guard Path Warning

**CRITICAL**: When editing TDD guard instruction files, ALWAYS use the project-level path `.claude/tdd-guard/data/instructions.md`. 
NEVER create nested `.claude/.claude/` directories. If you see a path like `.claude/.claude/tdd-guard/`, it's incorrect - use `.claude/tdd-guard/` instead. 


