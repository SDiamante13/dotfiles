Variables:
- FILES: {{files}}
- OUTPUT_STRUCTURE: {{structure:modular}}
- BASE_DIR: {{baseDir:.}}

Refactor the following files to follow the Single Responsibility Principle: {{files}}
Output structure preference: {{structure}} (modular/layered/functional)
Base directory for new files: {{baseDir}}

For each file:
1. Identify classes/modules doing multiple things and split them
2. Separate data access from business logic
3. Extract validation logic into validator classes/functions
4. Move formatting/presentation logic to dedicated formatters
5. Separate configuration from implementation
6. Extract cross-cutting concerns (logging, caching) into separate modules
7. Ensure each class/function has only one reason to change
8. Create new files/modules as needed with clear, focused responsibilities

Create the following directory structure in {{baseDir}}:
- /validators - for validation logic
- /formatters - for formatting/presentation logic  
- /data - for data access layers
- /services - for business logic
- /utils - for shared utilities

For each split, explain what the single responsibility is. Update all imports and show the new file structure.
