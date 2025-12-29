/**
 * sync-patterns.js
 *
 * Reads pattern markdown files from Basic Memory and generates
 * patterns-data.json for the AICRED dashboard.
 *
 * Usage: node sync-patterns.js
 *
 * Reads from: C:\Users\Guest1\basic-memory\patterns\**\*.md
 * Writes to:  ./patterns-data.json
 */

const fs = require('fs');
const path = require('path');

// Configuration
const BASIC_MEMORY_PATTERNS = 'C:\\Users\\Guest1\\basic-memory\\patterns';
const OUTPUT_FILE = path.join(__dirname, 'patterns-data.json');

// Pattern type detection based on path
function detectPatternType(filePath) {
  if (filePath.includes('prompt-patterns')) return 'prompt';
  const content = fs.readFileSync(filePath, 'utf-8').toLowerCase();
  if (content.includes('workflow') || content.includes('deliberat')) return 'workflow';
  if (content.includes('architectural') || content.includes('structure')) return 'architectural';
  return 'prompt';
}

// Parse YAML frontmatter
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const yaml = match[1];
  const result = {};

  // Parse simple key: value pairs
  yaml.split('\n').forEach(line => {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      let value = line.slice(colonIndex + 1).trim();

      // Handle arrays on single line [item1, item2]
      if (value.startsWith('[') && value.endsWith(']')) {
        value = value.slice(1, -1).split(',').map(s => s.trim().replace(/^['"]|['"]$/g, ''));
      }
      // Handle quoted strings
      else if (value.startsWith("'") || value.startsWith('"')) {
        value = value.slice(1, -1);
      }

      result[key] = value;
    }
  });

  return result;
}

// Extract content after frontmatter
function getContent(raw) {
  return raw.replace(/^---\n[\s\S]*?\n---\n*/, '');
}

// Extract a section's content (returns array of bullet points or paragraph)
function extractSection(content, sectionName) {
  // Match both ## and # headers
  const regex = new RegExp(`##?\\s*${sectionName}[\\s\\S]*?(?=\\n##?\\s|$)`, 'i');
  const match = content.match(regex);
  if (!match) return null;

  const section = match[0];
  // Remove the header line
  const body = section.replace(/^##?\s*[^\n]+\n+/, '');

  return body.trim();
}

// Parse bullet points into array
function parseBulletPoints(text) {
  if (!text) return [];

  const lines = text.split('\n');
  const items = [];
  let currentItem = '';

  for (const line of lines) {
    const trimmed = line.trim();
    // New bullet point
    if (trimmed.match(/^[-*]\s/)) {
      if (currentItem) items.push(currentItem);
      currentItem = trimmed.replace(/^[-*]\s+/, '');
    }
    // Continuation of previous bullet
    else if (trimmed && currentItem) {
      currentItem += ' ' + trimmed;
    }
  }
  if (currentItem) items.push(currentItem);

  return items.map(item => {
    // Clean markdown formatting
    return item
      .replace(/\*\*([^*]+)\*\*/g, '$1')  // Bold
      .replace(/\*([^*]+)\*/g, '$1')       // Italic
      .replace(/`([^`]+)`/g, '$1')         // Code
      .trim();
  });
}

// Extract problem signature from "When to Use" section
function extractProblemSignature(content) {
  const whenToUse = extractSection(content, 'When to Use');
  if (!whenToUse) return [];
  return parseBulletPoints(whenToUse);
}

// Extract template summary
function extractTemplateSummary(content) {
  const template = extractSection(content, 'Template');
  if (!template) {
    const mechanism = extractSection(content, 'Mechanism');
    if (!mechanism) return '';
    // Get first paragraph
    const firstPara = mechanism.split('\n\n')[0];
    return firstPara.replace(/\n/g, ' ').slice(0, 300);
  }

  // Get first paragraph or first few lines
  const lines = template.split('\n').filter(l => l.trim() && !l.startsWith('#'));
  return lines.slice(0, 3).join(' ').slice(0, 300);
}

// Extract gotchas
function extractGotchas(content) {
  const gotchas = extractSection(content, 'Gotchas');
  if (!gotchas) return [];
  return parseBulletPoints(gotchas);
}

// Extract anti-patterns (When NOT to Use)
function extractAntiPatterns(content) {
  let section = extractSection(content, 'When NOT to Use');
  if (!section) {
    section = extractSection(content, 'Anti-Patterns');
  }
  if (!section) return [];
  return parseBulletPoints(section);
}

// Extract related patterns from Relations section
function extractRelatedPatterns(content) {
  const relations = extractSection(content, 'Relations');
  if (!relations) return [];

  // Look for [[Pattern Name]] links
  const matches = relations.matchAll(/\[\[([^\]]+)\]\]/g);
  const patterns = [];

  for (const match of matches) {
    const name = match[1];
    // Convert pattern name to id
    const id = name
      .toLowerCase()
      .replace(/pattern$/i, '')
      .replace(/protocol$/i, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+$/, '');

    if (id && !patterns.includes(id)) {
      patterns.push(id);
    }
  }

  return patterns.slice(0, 5); // Limit to 5
}

// Extract example
function extractExample(content) {
  const example = extractSection(content, 'Example');
  if (!example) return '';

  // Get first line or paragraph
  const firstLine = example.split('\n').find(l => l.trim() && !l.startsWith('*'));
  return firstLine ? firstLine.trim().slice(0, 200) : '';
}

// Extract core insight if present
function extractCoreInsight(content) {
  const insight = extractSection(content, 'Core Insight');
  if (!insight) return null;

  // Get first paragraph
  const lines = insight.split('\n\n')[0];
  return lines.replace(/\n/g, ' ').replace(/\*\*/g, '').slice(0, 300);
}

// Canonical ID mapping - matches problemFirstNav in dashboard
const CANONICAL_IDS = {
  'Selective Deep Dive Pattern': 'selective-deep-dive',
  'Systematic Prompt Iteration Protocol': 'systematic-iteration',
  'Multi-Agent Adversarial Review Pattern': 'adversarial-review',
  'Structured Cross-Examination Pattern': 'cross-examination',
  'Skill Forge Pattern': 'skill-forge',
  'Canonical Base with Overlays Pattern': 'canonical-overlays',
  'Visualization Generator Pattern': 'visualization-generator',
  'Targeted Artifact Generation Pattern': 'targeted-artifact-generation',
  'UI Experimentation to Automation Pattern': 'ui-experimentation'
};

// Generate pattern ID from filename - uses canonical mapping when available
function generateId(filename, title) {
  // Check canonical mapping first
  if (title && CANONICAL_IDS[title]) {
    return CANONICAL_IDS[title];
  }

  // Fallback: generate from title
  const base = title || filename.replace('.md', '');
  return base
    .toLowerCase()
    .replace(/pattern$/i, '')
    .replace(/protocol$/i, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+$/, '');
}

// Process a single pattern file
function processPattern(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const frontmatter = parseFrontmatter(raw);
  const content = getContent(raw);
  const filename = path.basename(filePath);

  // Skip non-pattern files (like Pattern Index)
  if (filename.includes('Index') || filename.includes('Orchestration')) {
    return null;
  }

  const id = generateId(filename, frontmatter.title);
  const type = detectPatternType(filePath);

  const pattern = {
    id,
    name: frontmatter.title || filename.replace('.md', ''),
    type,
    status: frontmatter.status || 'draft',
    description: '', // Will be filled from summary or first line
    kbPath: filePath.replace(BASIC_MEMORY_PATTERNS, 'patterns').replace(/\\/g, '/'),
    problemSignature: extractProblemSignature(content),
    templateSummary: extractTemplateSummary(content),
    gotchas: extractGotchas(content),
    antiPatterns: extractAntiPatterns(content),
    relatedPatterns: extractRelatedPatterns(content),
    example: extractExample(content)
  };

  // Add core insight if present
  const coreInsight = extractCoreInsight(content);
  if (coreInsight) {
    pattern.coreInsight = coreInsight;
  }

  // Add meta flag for meta-patterns
  if (content.toLowerCase().includes('meta-pattern') ||
      (frontmatter.tags && frontmatter.tags.includes('meta-pattern'))) {
    pattern.meta = true;
  }

  // Generate description from summary or first line
  const summary = extractSection(content, 'Summary');
  if (summary) {
    pattern.description = summary.split('\n')[0].slice(0, 150);
  } else if (pattern.templateSummary) {
    pattern.description = pattern.templateSummary.slice(0, 100);
  }

  return pattern;
}

// Find all pattern markdown files
function findPatternFiles(dir) {
  const files = [];

  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name.endsWith('.md')) {
        files.push(fullPath);
      }
    }
  }

  walk(dir);
  return files;
}

// Extract pattern ID references from dashboard index.html
function extractDashboardReferences(indexPath) {
  const refs = {
    problemFirstNav: [],
    decisions: [],
    patternHealthMetrics: []
  };

  try {
    const html = fs.readFileSync(indexPath, 'utf-8');

    // Extract problemFirstNav patternIds
    const navMatches = html.matchAll(/patternId:\s*['"]([^'"]+)['"]/g);
    for (const match of navMatches) {
      if (!refs.problemFirstNav.includes(match[1])) {
        refs.problemFirstNav.push(match[1]);
      }
    }

    // Extract decisions patternsUsed and patternsConsidered
    const decisionPatternMatches = html.matchAll(/patterns(?:Used|Considered):\s*\[([^\]]*)\]/g);
    for (const match of decisionPatternMatches) {
      const ids = match[1].match(/['"]([^'"]+)['"]/g) || [];
      ids.forEach(id => {
        const clean = id.replace(/['"]/g, '');
        if (!refs.decisions.includes(clean)) {
          refs.decisions.push(clean);
        }
      });
    }

    // Extract patternHealthMetrics keys (pattern IDs are quoted strings at start of line)
    const metricsMatch = html.match(/const patternHealthMetrics = \{([\s\S]*?)\n\};/);
    if (metricsMatch) {
      // Match pattern IDs like 'selective-deep-dive': { or "skill-forge": {
      const keyMatches = metricsMatch[1].matchAll(/['"]([a-z][a-z-]+)['"]\s*:\s*\{/g);
      for (const match of keyMatches) {
        if (!refs.patternHealthMetrics.includes(match[1])) {
          refs.patternHealthMetrics.push(match[1]);
        }
      }
    }
  } catch (err) {
    console.warn(`Could not read dashboard for orphan detection: ${err.message}`);
  }

  return refs;
}

// Check for orphaned references
function detectOrphans(patternIds, dashboardRefs) {
  const orphans = {
    problemFirstNav: [],
    decisions: [],
    patternHealthMetrics: []
  };

  for (const ref of dashboardRefs.problemFirstNav) {
    if (!patternIds.includes(ref)) {
      orphans.problemFirstNav.push(ref);
    }
  }

  for (const ref of dashboardRefs.decisions) {
    if (!patternIds.includes(ref)) {
      orphans.decisions.push(ref);
    }
  }

  for (const ref of dashboardRefs.patternHealthMetrics) {
    if (!patternIds.includes(ref)) {
      orphans.patternHealthMetrics.push(ref);
    }
  }

  return orphans;
}

// Main
function main() {
  console.log('Syncing patterns from Basic Memory...\n');

  const files = findPatternFiles(BASIC_MEMORY_PATTERNS);
  console.log(`Found ${files.length} markdown files\n`);

  const patterns = [];

  for (const file of files) {
    const relativePath = file.replace(BASIC_MEMORY_PATTERNS, '');
    console.log(`Processing: ${relativePath}`);

    try {
      const pattern = processPattern(file);
      if (pattern) {
        patterns.push(pattern);
        console.log(`  -> ${pattern.id} (${pattern.type}, ${pattern.status})`);
        console.log(`     ${pattern.problemSignature.length} triggers, ${pattern.gotchas.length} gotchas`);
      } else {
        console.log(`  -> Skipped (not a pattern file)`);
      }
    } catch (err) {
      console.error(`  -> Error: ${err.message}`);
    }
  }

  // Sort by name
  patterns.sort((a, b) => a.name.localeCompare(b.name));

  // Write output
  const output = {
    generated: new Date().toISOString(),
    source: BASIC_MEMORY_PATTERNS,
    count: patterns.length,
    patterns
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));

  console.log(`\nGenerated ${OUTPUT_FILE}`);
  console.log(`Total patterns: ${patterns.length}`);

  // Orphan detection
  const indexPath = path.join(__dirname, 'index.html');
  const patternIds = patterns.map(p => p.id);
  const dashboardRefs = extractDashboardReferences(indexPath);
  const orphans = detectOrphans(patternIds, dashboardRefs);

  const hasOrphans = orphans.problemFirstNav.length > 0 ||
                     orphans.decisions.length > 0 ||
                     orphans.patternHealthMetrics.length > 0;

  if (hasOrphans) {
    console.log('\n⚠️  ORPHAN DETECTION');
    console.log('The following pattern IDs are referenced in index.html but not in synced patterns:\n');

    if (orphans.problemFirstNav.length > 0) {
      console.log('  problemFirstNav:');
      orphans.problemFirstNav.forEach(id => console.log(`    - ${id}`));
    }

    if (orphans.decisions.length > 0) {
      console.log('  decisions:');
      orphans.decisions.forEach(id => console.log(`    - ${id}`));
    }

    if (orphans.patternHealthMetrics.length > 0) {
      console.log('  patternHealthMetrics:');
      orphans.patternHealthMetrics.forEach(id => console.log(`    - ${id}`));
    }

    console.log('\nThese references will not render correctly in the dashboard.');
    console.log('Fix: Update index.html to remove/update these references, or add the missing patterns to Basic Memory.');
  } else {
    console.log('\n✓ No orphaned references detected');
  }
}

main();
