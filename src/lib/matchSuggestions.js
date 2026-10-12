/**
 * Suggest which file belongs to which requirement, using file names only.
 * Deliberately conservative: it only proposes a match when the name clearly
 * points at one requirement and the pairing is not ambiguous.
 */

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'of', 'and', 'for', 'to', 'in', 'on', 'copy', 'final',
  'new', 'doc', 'document', 'file', 'pdf', 'scan', 'page', 'pages', 'updated',
  'draft', 'final2', 'attached', 'attachment',
]);

export function normalizeName(value) {
  return String(value || '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[_]+/g, ' ')
    .replace(/[^a-z0-9\u0980-\u09FF ]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function tokenize(value) {
  return normalizeName(value)
    .split(' ')
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

/** Keywords a file name would use for a given requirement. */
function requirementTokens(requirement) {
  const sources = [requirement.title_en, requirement.title_bn, requirement.id];
  const tokens = new Set();
  for (const source of sources) {
    for (const token of tokenize(source)) tokens.add(token);
  }
  // Also index the longest words of the English title, which carry the meaning
  // ("trade", "license", "municipality").
  const english = tokenize(requirement.title_en);
  english
    .filter((token) => token.length >= 5)
    .forEach((token) => {
      tokens.add(token);
      tokens.add(token.slice(0, Math.max(4, token.length - 2)));
    });
  return tokens;
}

function scoreFile(tokens, fileTokens, requirementTokenSet) {
  if (fileTokens.length === 0) return 0;
  let score = 0;
  for (const token of fileTokens) {
    if (requirementTokenSet.has(token)) {
      score += 3;
      continue;
    }
    // Partial credit for a file name that contains the requirement keyword,
    // e.g. "trade_license_2024.pdf" against "Trade License".
    for (const candidate of requirementTokenSet) {
      if (candidate.length >= 4 && (token.includes(candidate) || candidate.includes(token))) {
        score += 2;
        break;
      }
    }
  }
  return score;
}

/**
 * Name-quality check: how much of the requirement's English title is echoed
 * by the file name. Pure: no state, no side effects.
 *
 * Normalisation applied to both sides:
 *  - lowercase, strip ".pdf"
 *  - remove a leading order number/ID like "02_", "2-", "R02_"
 *  - replace _ - . with spaces, collapse extra spaces
 *  - drop stop words (of, the, and, for)
 *
 * Returns the share of requirement title_en words present in the file name,
 * from 0 to 1.
 */
const NAME_STOP_WORDS = new Set(['of', 'the', 'and', 'for']);

function normalizeForMatch(value) {
  const cleaned = String(value || '')
    .toLowerCase()
    .replace(/\.pdf$/i, '')
    .replace(/^[a-z]{0,4}-?\d+[_\-. ]+/i, '')
    .replace(/[_\-.]+/g, ' ')
    .replace(/[^a-z0-9\u0980-\u09FF\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned
    .split(' ')
    .filter((word) => word && !NAME_STOP_WORDS.has(word));
}

export function nameMatchScore(fileName, requirement) {
  const title = typeof requirement === 'string'
    ? requirement
    : (requirement && (requirement.title_en || requirement.title || requirement.displayTitle || ''));
  const titleWords = normalizeForMatch(title);
  if (titleWords.length === 0) return 1;
  const fileWords = new Set(normalizeForMatch(fileName));
  const found = titleWords.filter((word) => fileWords.has(word)).length;
  return found / titleWords.length;
}

/**
 * Matched straight from file names: the best file for every requirement that
 * is not matched yet, using the same nameMatchScore >= 0.5 rule the row
 * warning uses. Pairs are taken best-score-first, so a file that fits one
 * document perfectly is not spent on a so-so pairing elsewhere, and each file
 * / requirement is used at most once. Requirements and files the user already
 * matched are never touched.
 *
 * Used by the automatic matching in step 3 (on upload / on the auto-match
 * button); nothing here is ever applied behind a second confirmation.
 */
export function suggestByName({ files, requirements, matches = {} }) {
  const usedRequirements = new Set(Object.keys(matches));
  const usedFiles = new Set(Object.values(matches));
  const freeFiles = (files || []).filter(
    (file) => file.readState === 'ready' && !usedFiles.has(file.id),
  );

  const pairs = [];
  for (const requirement of requirements || []) {
    if (usedRequirements.has(requirement.id)) continue;
    for (const file of freeFiles) {
      const score = nameMatchScore(file.name, requirement);
      if (score >= 0.5) pairs.push({ requirementId: requirement.id, fileId: file.id, score });
    }
  }
  pairs.sort((a, b) => b.score - a.score);

  const proposals = [];
  const takenRequirements = new Set();
  const takenFiles = new Set();
  for (const pair of pairs) {
    if (takenRequirements.has(pair.requirementId) || takenFiles.has(pair.fileId)) continue;
    takenRequirements.add(pair.requirementId);
    takenFiles.add(pair.fileId);
    proposals.push(pair);
  }
  return proposals;
}

/**
 * Returns [{ fileId, requirementId }]. Only unambiguous pairings are returned,
 * and each file / requirement appears at most once.
 */
export function suggestMatches({ files, requirements }) {
  const tokenSets = new Map(requirements.map((r) => [r.id, requirementTokens(r)]));
  const fileTokens = new Map(
    files
      .filter((file) => file.readState === 'ready')
      .map((file) => [file.id, tokenize(file.name)]),
  );

  const candidates = [];
  for (const file of files) {
    if (file.readState !== 'ready') continue;
    const tokens = fileTokens.get(file.id);
    for (const requirement of requirements) {
      const score = scoreFile(tokens, tokens, tokenSets.get(requirement.id));
      if (score >= 3) candidates.push({ fileId: file.id, requirementId: requirement.id, score });
    }
  }

  // Best score per file and per requirement; drop anything contested.
  const bestForFile = new Map();
  const bestForRequirement = new Map();
  for (const candidate of candidates) {
    const currentFile = bestForFile.get(candidate.fileId);
    if (!currentFile || candidate.score > currentFile.score) bestForFile.set(candidate.fileId, candidate);
    const currentReq = bestForRequirement.get(candidate.requirementId);
    if (!currentReq || candidate.score > currentReq.score) bestForRequirement.set(candidate.requirementId, candidate);
  }

  const suggestions = [];
  for (const [fileId, candidate] of bestForFile) {
    const reverse = bestForRequirement.get(candidate.requirementId);
    if (reverse && reverse.fileId === fileId && reverse.score === candidate.score) {
      suggestions.push({ fileId, requirementId: candidate.requirementId, score: candidate.score });
    }
  }

  suggestions.sort((a, b) => b.score - a.score);
  return suggestions.map(({ fileId, requirementId }) => ({ fileId, requirementId }));
}