```mermaid
flowchart LR
    subgraph Request["📤 Pre-Request Filter"]
        LP["Language Pinner<br/>detectLanguagePinner()"]
    end

    subgraph API["🌐 API Request"]
        API1["Modified in-memory message<br/>Language instruction appended"]
    end

    subgraph Response["📥 Post-Response Filters"]
        CB["Codeblock Only"]
        ER["Emoji Removal"]
        RM["Raw Mode"]
        NM["Markdown Normalizer"]
    end

    subgraph Render["🎨 Rendering"]
        MD["MarkdownContent.svelte"]
        UI["User sees filtered text"]
    end

    subgraph Storage["💾 Database"]
        DB["Raw content stored<br/>(NEVER modified by filters)"]
    end

    LP -->|"Append instruction| API
    API -->|"LLM response"| Response
    CB --> ER
    ER --> RM
    RM --> NM
    NM --> MD
    MD --> UI
    Response -. "raw content" .-> DB
```

---

## Filter Architecture

### Overview

Response filters are **display-only transformations** applied at render time. The raw model output is **never modified** in storage — filters only affect what the user sees in the UI.

One exception: the **Language Pinner** is a **pre-request filter** that modifies the in-memory message before sending to the API (but never persists the modification).

### Filter Application Order

When multiple filters are active simultaneously, they apply in this sequence:

```
Raw Response
    ↓
1. Codeblock Only   — Narrow to first code block
    ↓
2. Emoji Removal    — Strip emoji characters
    ↓
3. Raw Mode         — Strip Markdown syntax
    ↓
4. Markdown Normalizer — Fix formatting issues
    ↓
Rendered Output
```

---

## Filters

### 1. Language Pinner (Pre-Request)

**Setting:** `filterLanguagePinner`

Detects `![xx]` language tags in the **last user message** and appends a language instruction to the API request.

**Detection regex:** `/!\[([a-zA-Z]{2,8})\]/`

**Example:**

- User message: `Explain quantum computing ![fr]`
- Instruction appended: `\n\nIMPORTANT: the response should be in fr.`
- **Only** the in-memory `normalizedMessages` array is modified — the DB is never touched

**Scope:** Last user message only. The `![xx]` tag is **not stripped** from the displayed message.

### 2. Codeblock Only

**Setting:** `filterCodeblockOnly`

Keeps only the **first** fenced code block (` ```...``` `), discarding all surrounding text.

**Regex:** `/```[\s\S]*?```/`

**Behavior:**

- If no code block found → return original text unchanged
- Returns the complete code block including fences
- Applies **before** other filters (narrows the content)

**Use case:** When you only want to see the code output without the model's commentary.

### 3. Emoji Removal

**Setting:** `filterEmojiRemoval`

Strips all Extended Pictographic Unicode characters, including:

- Base emoji sequences
- Variation selectors (`\uFE00-\uFE0F`)
- Skin tone modifiers (`\u{1F3FB}-\u{1F3FF}`)
- Keycap combining (`\u{20E3}`)
- ZWJ (Zero Width Joiner) sequences

**Regex (Unicode property escapes):**

```
\p{Extended_Pictographic}(?:[\uFE00-\uFE0F]|[\u{1F3FB}-\u{1F3FF}]|\u{20E3}|\u{200D}\p{Extended_Pictographic}(?:[\uFE00-\uFE0F]|[\u{1F3FB}-\u{1F3FF}]|\u{20E3})?)*
```

**Streaming behavior:** Emojis are removed mid-stream as chunks arrive — visually "hides" them before the full response completes.

### 4. Raw Mode

**Setting:** `filterRawMode`

Strips all Markdown formatting, returning plain text:

- Headings (`#{1,6}`)
- Bold/italic (`**`, `*`, `__`, `_`)
- Inline code (`` ` ``)
- Code blocks (` ``` `)
- Links (`[text](url)`)
- Lists (`-`, `*`, `1.`)
- Blockquotes (`>`)
- Horizontal rules (`---`)

### 5. Markdown Normalizer

**Setting:** `filterNormalizeMarkdown` (enabled by **default**)

Auto-fixes common formatting issues ported from OpenWebUI's normalizer:

| Fix                  | Description                                                   |
| -------------------- | ------------------------------------------------------------- |
| Escape characters    | Convert `\\n`, `\\r\\n` to actual newlines                    |
| Thought tags         | Normalize `<thinking>`, `<think>`, `<thought>` to `<thought>` |
| Details tags         | Fix `<details>` spacing and self-closing tags                 |
| Code blocks          | Ensure proper newline before/after fences                     |
| LaTeX delimiters     | Convert `\[...\]` to `$$...$$`, `\(...\)` to `$...$`          |
| Lists                | Add newlines before numbered list items                       |
| Headings             | Add space after `#` if missing                                |
| Tables               | Ensure trailing pipe on table rows                            |
| XML artifacts        | Strip `<antArtifact>`, `<antThinking>`, `<artifact>` tags     |
| Unclosed code blocks | Auto-close if odd number of fences                            |
| Fullwidth symbols    | Replace fullwidth punctuation inside code blocks              |
| Mermaid diagrams     | Fix node labels, auto-close unclosed subgraphs                |
| Emphasis spacing     | Remove extra spaces inside italic/bold markers                |

---

## Implementation

### Filter Utilities

**File:** `src/lib/utils/filters.ts`

```typescript
// Individual filters
export function applyEmojiRemoval(text: string): string;
export function applyCodeblockOnly(text: string): string;
export function applyRawMode(text: string): string;
export function normalizeMarkdown(text: string): string;
export function detectLanguagePinner(text: string): string | null;

// Composite filter
export interface ResponseFilterOptions {
	filterEmojiRemoval: boolean;
	filterCodeblockOnly: boolean;
	filterRawMode: boolean;
	filterNormalizeMarkdown: boolean;
}

export function applyResponseFilters(text: string, opts: ResponseFilterOptions): string;

// Active filter display
export function getActiveFilters(opts: ResponseFilterOptions): string[];
// Returns: ['Emoji Removal', 'Markdown Normalizer']
```

### Settings Integration

**Settings keys:** `src/lib/constants/settings-keys.ts`

```typescript
FILTER_EMOJI_REMOVAL: 'filterEmojiRemoval',
FILTER_CODEBLOCK_ONLY: 'filterCodeblockOnly',
FILTER_RAW_MODE: 'filterRawMode',
FILTER_LANGUAGE_PINNER: 'filterLanguagePinner',
FILTER_NORMALIZE_MARKDOWN: 'filterNormalizeMarkdown',
```

**Defaults:** `src/lib/constants/settings-config.ts`

```typescript
filterEmojiRemoval: false,
filterCodeblockOnly: false,
filterRawMode: false,
filterLanguagePinner: false,
filterNormalizeMarkdown: true,  // Enabled by default
```

**Settings UI:** New **Filter** tab in ChatSettings (between MCP and Developer tabs)

- Icon: `ListFilter` from lucide
- Four checkbox fields with descriptions from `SETTING_CONFIG_INFO`

### Where Filters Are Applied

**Display filters** (post-response):

```
ChatMessageAgenticContent.svelte
  └→ for each TEXT section:
       {@const displayContent = applyResponseFilters(section.content, filterOptions)}
       <MarkdownContent content={displayContent} />
```

**Language pinner** (pre-request):

```
chat.service.ts → sendMessage()
  └→ After building normalizedMessages, before requestBody:
       if (config.filterLanguagePinner) {
         const lang = detectLanguagePinner(lastUserMsg);
         if (lang) append instruction to message;
       }
```

---

## What Is NOT Changing

| Component                | Reason                                                 |
| ------------------------ | ------------------------------------------------------ |
| Database layer           | Filters are display-only; raw content is always stored |
| Store layer              | No filter logic in `chatStore`, `conversationsStore`   |
| `MarkdownContent.svelte` | Receives already-filtered content                      |
| `chat.svelte.ts`         | Streaming logic unchanged                              |
| API layer                | Filters run client-side after response received        |

---

## Streaming Behavior

Filters apply **purely at render time** on `section.content`. Since streaming continuously updates `section.content` via reactive store updates, the filter re-applies on every chunk:

| Filter              | Mid-stream behavior                                               |
| ------------------- | ----------------------------------------------------------------- |
| Emoji removal       | Emojis "disappear" as they stream in                              |
| Codeblock only      | Shows nothing until opening ``` appears, then shows partial block |
| Raw mode            | Strips formatting incrementally                                   |
| Markdown normalizer | Fixes issues on each chunk                                        |

This is acceptable because the spec only restricts **persisted** content to be unmodified — streaming display changes are fine.

---

## Files

| File                                                                        | Purpose                            |
| --------------------------------------------------------------------------- | ---------------------------------- |
| `src/lib/utils/filters.ts`                                                  | Filter implementations + composite |
| `src/lib/utils/index.ts`                                                    | Re-exports filters                 |
| `src/lib/constants/settings-keys.ts`                                        | Filter setting keys                |
| `src/lib/constants/settings-config.ts`                                      | Default values + info strings      |
| `src/lib/constants/settings-sections.ts`                                    | Filter tab registration            |
| `src/lib/components/app/chat/ChatSettings/ChatSettings.svelte`              | Filter tab UI                      |
| `src/lib/components/app/chat/ChatMessages/ChatMessageAgenticContent.svelte` | Post-response filter application   |
| `src/lib/services/chat.service.ts`                                          | Language pinner (pre-request)      |
