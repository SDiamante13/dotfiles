Variables:
- FILES: {{files}}
- DOMAIN: {{domain}}

Improve all names in the following files to create a ubiquitous language: {{files}}
Domain context: {{domain}}

For each file:
1. Replace generic names (data, info, temp, obj, val) with domain-specific terms
2. Use business terminology consistently throughout
3. Rename variables to clearly indicate their purpose and type
4. Convert abbreviations to full words (usr → user, prod → product, qty → quantity)
5. Ensure boolean variables start with is/has/should/can
6. Make function names describe what they do, not how (e.g., getUserById not fetchUserFromDatabase)
7. Use consistent naming patterns (camelCase, snake_case) based on language conventions
8. Create a glossary comment at the top if you introduce new domain terms

Focus on making the code readable by a new developer who understands the {{domain}} domain.
Show a before/after comparison of significant name changes.
