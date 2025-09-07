Variables:
- FILES: {{files}}
- MAX_LINES: {{maxLines:20}}
- TARGET_DIR: {{targetDir:.}}

Extract methods in the following files: {{files}}
Maximum lines per method: {{maxLines}}
Target directory for new files (if needed): {{targetDir}}

For each file:
1. Identify code blocks that serve a single purpose and extract them into well-named methods
2. Look for repeated code patterns and extract them into reusable functions
3. Break down methods longer than {{maxLines}} lines into smaller, focused methods
4. Extract complex conditional logic into predicate methods (e.g., isEligibleForDiscount())
5. Create helper methods for data transformation or formatting
6. Extract validation logic into separate validation methods
7. Ensure each extracted method has a single, clear responsibility
8. Add appropriate parameters and return types

Name each extracted method to clearly communicate its purpose. Keep methods at the same level of abstraction.
If utils/helpers are needed, create them in {{targetDir}}/utils.
