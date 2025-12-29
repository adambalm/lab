# AICRED Dashboard

Interactive dashboard for the AI CRED learning path. Tracks patterns, decisions, and progress through prompt engineering modules.

## Pattern Sync with Basic Memory

The dashboard loads pattern data from `patterns-data.json`, which is synced from Basic Memory markdown files.

### Manual Sync

```bash
cd lab/aicred
node sync-patterns.js
```

This reads patterns from `C:\Users\Guest1\basic-memory\patterns\` and generates `patterns-data.json`.

### Automatic Sync (Pre-commit Hook)

A git pre-commit hook automatically runs `sync-patterns.js` before each commit, ensuring the JSON stays in sync with Basic Memory.

### Data Flow

```
Basic Memory (markdown)     →    sync-patterns.js    →    patterns-data.json
patterns/*.md                    Parses frontmatter       Dashboard fetches
                                 + sections               at runtime
```

### What Gets Synced

| Basic Memory Section | Dashboard Field |
|---------------------|-----------------|
| YAML frontmatter | id, name, status, type |
| When to Use | problemSignature |
| Template | templateSummary |
| Gotchas | gotchas |
| When NOT to Use | antiPatterns |
| Relations | relatedPatterns |
| Example | example |
| Core Insight | coreInsight |

### What Stays in Dashboard

- `decisions` - Problem history and decision journey
- `evidenceLog` - Work done for progress checks
- `patternHealthMetrics` - Module 5 audit data
- `problemFirstNav` - Problem-to-pattern mapping

## Orphan Detection

The sync script checks for stale pattern references in `index.html`:

```
⚠️  ORPHAN DETECTION
The following pattern IDs are referenced in index.html but not in synced patterns:

  problemFirstNav:
    - old-pattern-id
  decisions:
    - deleted-pattern
```

This catches:
- `problemFirstNav` entries pointing to deleted/renamed patterns
- `decisions.patternsUsed` referencing non-existent patterns
- `patternHealthMetrics` keys for patterns that no longer exist

**When you see orphans:** Update `index.html` to remove stale references, or add the missing pattern to Basic Memory.

## Adding a New Pattern

1. Create markdown in Basic Memory (`patterns/*.md`)
2. Add to `CANONICAL_IDS` in `sync-patterns.js` (for predictable ID)
3. Run `node sync-patterns.js`
4. Optionally add to `problemFirstNav` in `index.html` (for problem-first nav)
5. Optionally add to `patternHealthMetrics` in `index.html` (for Module 5 audit)

## Running Locally

```bash
npx serve -l 8080
# Open http://localhost:8080
```

## Files

| File | Purpose |
|------|---------|
| index.html | React dashboard (single-file) |
| sync-patterns.js | Pattern sync script |
| patterns-data.json | Generated pattern data |
