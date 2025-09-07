Refactor $ARGUMENTS by extracting small methods from large code blocks.

Focus on:

1. Identify large blocks of code that perform distinct operations
2. Extract these blocks into well-named methods with clear intent
3. Name methods based on behavior not implementation
4. Ensure each method has a single responsibility
5. Pass necessary parameters rather than sharing state
6. Update all references to use the new methods
7. Follow language-specific method extraction patterns
8. Preserve the original functionality

## GUIDELINES

- Extract methods pragmatically to improve code organization
- Create behavior-focused method names that reveal intent
- Refactor for readability and maintainability
- Apply proper access modifiers (private for helper methods)
- Preserve the original behavior exactly
- If the tests don't pass after refactor then revert

Examples of good method extractions:
- Extract validation logic into 'validateUserCredentials()'
- Extract data processing into 'transformRawStockData()'
- Extract repetitive UI setup into 'configureDataTable()'