const DETACHED_TOKEN_RE = /^(?:https?:\/\/|www\.|doi:|arxiv:)/iu;
const PRECEDING_WORD_RE = /[\p{L}\p{N})\]]$/u;
const SEMANTIC_SPACE_MIN_GAP_RATIO = 0.1;
const ARABIC_SCRIPT_RE = /\p{Script=Arabic}/u;
const ARABIC_WORD_SPACE_MIN_GAP_RATIO = 0.12;

export function shouldInsertSemanticSpace(prevText: string, curText: string, gap: number, fontSize: number): boolean {
  const prev = prevText.trimEnd();
  const cur = curText.trimStart();
  if (prev.length === 0 || cur.length === 0) return false;

  if (gap > fontSize * ARABIC_WORD_SPACE_MIN_GAP_RATIO && ARABIC_SCRIPT_RE.test(prev) && ARABIC_SCRIPT_RE.test(cur)) {
    return true;
  }

  if (gap <= fontSize * SEMANTIC_SPACE_MIN_GAP_RATIO) return false;

  return PRECEDING_WORD_RE.test(prev) && DETACHED_TOKEN_RE.test(cur);
}
