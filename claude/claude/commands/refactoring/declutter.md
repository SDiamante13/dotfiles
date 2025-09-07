Variables:
- FILES: {{files}}

Declutter the code in the following files: {{files}}

For each file:
1. Remove all commented-out code blocks
2. Delete console.log/print debug statements
3. Remove redundant comments that just repeat what the code does
4. Fix inconsistent formatting (indentation, spacing, line breaks)
5. Remove unused imports and variables
6. Eliminate empty catch blocks or unnecessary try-catch wrappers
7. Remove trailing whitespace and ensure consistent line endings
8. Delete any TODO/FIXME comments that are outdated or no longer relevant

Keep only comments that explain WHY something is done, not WHAT is done. Preserve any copyright headers or important documentation comments.

Process each file separately and save the changes. Show a summary of what was removed from each file.
