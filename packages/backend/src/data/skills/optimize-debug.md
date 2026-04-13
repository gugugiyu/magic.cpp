---
name: optimize-debug
description: Deep codebase investigation, bug detection, and UI/UX audit for a given component, feature, or workflow. Use this skill whenever the user asks to "debug", "audit", "review", "optimize", "find bugs in", or "check" any part of a codebase — even if they only mention one file or one feature. This skill performs a graph-traversal-style exploration of all related files (imports, callers, shared state, API contracts, style dependencies, route handlers, etc.) before reporting bugs and UX flaws in a structured severity report. Trigger this even for vague requests like "something feels off with X" or "can you look into Y".
---

# Optimize & Debug Skill

The user provides a **focus line** — a component, feature, file path, workflow, or freeform description of what to investigate. Your job is to:

1. **Explore** — recursively trace all code that touches the focus area.
2. **Report** — produce a comprehensive findings document sorted by severity.

Think of this like a compiler's dependency graph walk: you start at the entry node (the user's focus), resolve all edges (imports, calls, shared state, routes, styles), and visit every reachable node before forming conclusions. A bug found only in the entry file while missing its root cause in a utility three levels deep is a failed audit.

---

## Phase 1: Codebase Exploration (Subagent Delegation)

Before writing a single finding, spawn an **Explorer subagent** (or perform this inline if subagents are unavailable) with the following directive:

### Explorer Directive

```
You are a code explorer. Your job is NOT to fix anything — only to map and report.

Starting from: [USER'S FOCUS LINE]

Perform a full dependency traversal:
1. Read every file the user mentioned explicitly.
2. For each file, identify:
   - All imports / requires / dynamic imports
   - All components/functions/hooks it calls or is called by
   - All shared state (Redux slices, Zustand stores, Context providers, global vars)
   - All API calls it makes or endpoints it hits (trace to route handlers if possible)
   - All CSS/style files, theme tokens, or utility classes it depends on
   - All type definitions, interfaces, or schema files it references
3. Recurse into each discovered dependency. Stop only when:
   - You hit a node_modules boundary (third-party lib), OR
   - You have already visited this file, OR
   - The file is clearly unrelated (e.g., a test fixture for a different domain)
4. For each file visited, extract and note:
   - Its role / responsibility (one sentence)
   - Any code smells, error-prone patterns, or inconsistencies you notice (raw notes, not yet classified)
   - Props/API surface it exposes vs. what callers actually pass
   - Any hardcoded values, missing null-guards, unhandled promise rejections, or console.error suppressions
   - UI/UX signals: missing loading states, no error boundaries, inaccessible elements (no aria, bad contrast, missing focus management), unclear affordances, broken responsive breakpoints
5. Produce a structured exploration report:
   - File map: list of all files visited with their roles
   - Raw findings per file: unclassified observations
   - Dependency graph summary (which files depend on which)
```

Collect the Explorer's full report before proceeding to Phase 2.

---

## Phase 2: Analysis & Classification

With the exploration report in hand, act as a **senior debugger and UI/UX auditor**. Classify every raw finding using the rubric below. When in doubt, escalate severity.

### Severity Rubric

| Level | Definition |
|---|---|
| **Critical** | Data loss, security vulnerability, crash/exception that breaks a user flow, broken core functionality, race condition that corrupts state |
| **High** | Feature doesn't work as intended under normal conditions, significant performance degradation, broken accessibility (renders feature unusable for some users), API contract mismatch causing silent wrong data |
| **Medium** | Edge-case failures, degraded-but-not-broken UX, missing error handling for recoverable errors, minor data inconsistencies, code paths that will break under scale |
| **UI/UX Flaw** | Not a functional bug, but a design/experience problem: confusing affordance, inconsistent styling, poor feedback (no loading/empty/error states), accessibility smell, layout breaks at certain viewports |

---

## Phase 3: Output Format

Produce the final report in **exactly** this structure. Do not skip sections even if empty — write "None found" instead.

---

### 🔴 Critical Bugs

For each finding:

```
**[Short Title]**
- File: `path/to/file.ext` (line N if known)
- Description: One or two sentences explaining what is broken and why it's critical.
- Recommended Fix: Concrete, actionable fix. Prefer showing a before/after code snippet if the fix is non-obvious.
```

---

### 🟠 High Priority Bugs

```
**[Short Title]**
- File: `path/to/file.ext`
- Description: …
- Recommended Fix: …
```

---

### 🟡 Medium Priority Bugs

```
**[Short Title]**
- File: `path/to/file.ext`
- Description: …
- Recommended Fix: …
```

---

### 🎨 UI/UX Flaws

For each finding:

```
**[Short Title]**
- Rationale: Why this is a UX problem — reference the affected user interaction or accessibility standard (WCAG level if applicable).
- Recommended Fix: Specific change to make. If it's a visual fix, describe the desired end state.
```

---

## Exploration Quality Checklist

Before finalizing the report, verify you have examined:

- [ ] All files the user explicitly mentioned
- [ ] Every file imported by those files (direct and transitive, within the project)
- [ ] Shared state slices/stores that the focus area reads or writes
- [ ] API layer: fetch/axios calls → route handlers → middleware → response shapes
- [ ] Parent components that render the focus component (check prop drilling, incorrect defaults)
- [ ] Style/theme files that affect the focus area's rendering
- [ ] Type/schema definitions used by the focus area
- [ ] Any test files — do they pass? Do they cover the buggy paths?

If any item is unchecked because the file was inaccessible, note this explicitly in the report under a **⚠️ Coverage Gaps** section.

---

## Tone & Constraints

- Be precise: cite file paths and line numbers wherever possible.
- Be actionable: every finding must have a fix recommendation — not "consider refactoring" but *how*.
- Don't pad: if there are only 2 critical bugs, list 2. Don't inflate severity to fill sections.
- Don't guess: if you cannot determine the root cause without more context, say so and ask a targeted question rather than filing a speculative bug.
- Stay in the codebase: don't recommend third-party library swaps unless the current choice is a direct cause of the bug.
