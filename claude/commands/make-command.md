---
description: Create a new Claude Code slash command
---

# Create Command Generator

Create a new Claude Code slash command file with the specified name and content.

## Command Structure

The command name should be: `$1`
The command description should be: `$2` 
The command content should be: `$3`

## Instructions

1. Create a new `.md` file in the current commands directory
2. Add proper frontmatter with the description
3. Add the command content as markdown
4. Make the file executable if it contains bash commands
5. Confirm the command was created successfully

## Template

```markdown
---
description: $2
---

$3
```

Save this as `$1.md` in the commands directory.

If `$1` contains a slash, create the appropriate subdirectory structure.

Examples:
- `/make-command my-cmd "Does something" "Do the thing"`
- `/make-command refactor/clean "Clean code" "Refactor the code to be cleaner"`