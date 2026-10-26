# Frontend

Before changing UI code, read:

- docs/design/DESIGN_SYSTEM_SALOA.md
- docs/design/UI_AUDIT.md

DESIGN_SYSTEM_SALOA.md is the source of truth for visual and UX decisions.

Product:
Saloa — restaurant operations SaaS.

Stack:
- Vue 3
- TypeScript
- Tailwind CSS v4

Design principle:
"Apple quality, not Apple clone."

Priorities:
- clean
- lightweight
- premium
- highly legible
- operational
- responsive
- accessible

Never:
- invent API contracts
- change business rules without explicit instruction
- change permissions or auth
- create arbitrary visual patterns
- reintroduce Material 3 patterns that conflict with DESIGN_SYSTEM_SALOA.md
- create cards inside cards
- use raw colors when a semantic token exists

For frontend changes:
1. Read the relevant Design System sections.
2. Inspect the existing implementation.
3. Preserve business behavior.
4. Implement only the requested migration phase.
5. Run build and tests.
6. Review responsive behavior.
7. Check accessibility.
8. Report changed files and remaining issues.