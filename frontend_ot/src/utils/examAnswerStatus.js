import { DEFAULT_TEMPLATES } from '../config/constants';

/**
 * Normalizes code/markup string by converting CRLF to LF and trimming whitespace.
 */
export const cleanStr = (str) => (str || '').replace(/\r\n/g, '\n').trim();

/**
 * Determines whether a question has been genuinely answered by the candidate.
 * 
 * - MCQ: Answered if selectedOptionIndex is not null and not undefined.
 * - Web: Answered if HTML, CSS, or JS has actually been modified from starter templates.
 * - Coding: Answered if code is non-empty AND differs from initialTemplate and default boilerplate.
 */
export const isQuestionAnswered = (q, ans, drafts = {}) => {
  if (!q) return false;

  // 1. Multiple Choice Questions (Single Choice SCC & Multi Choice MCC)
  if (q.type === 'mcq' || q.type === 'scc' || q.type === 'mcc') {
    const isMulti = q.isMultiChoice || q.type === 'mcc' || q.category === 'Multiple Choice';
    if (isMulti) {
      const selOpts = drafts.draftMCQ !== undefined ? drafts.draftMCQ : (ans?.selectedOptionIndices ?? (ans?.selectedOptionIndex !== null && ans?.selectedOptionIndex !== undefined ? [ans.selectedOptionIndex] : []));
      return Array.isArray(selOpts) && selOpts.length > 0;
    }
    const selOpt = drafts.draftMCQ !== undefined ? drafts.draftMCQ : ans?.selectedOptionIndex;
    return selOpt !== null && selOpt !== undefined;
  }

  // 2. Interactive Web Development
  if (q.type === 'web') {
    const curH = cleanStr(drafts.draftHtml !== undefined ? drafts.draftHtml : ans?.submittedHtml);
    const curC = cleanStr(drafts.draftCss !== undefined ? drafts.draftCss : ans?.submittedCss);
    const curJ = cleanStr(drafts.draftJs !== undefined ? drafts.draftJs : ans?.submittedJs);

    const initH1 = cleanStr(q.initialHtml);
    const initH2 = cleanStr(q.initialCode?.html);
    const initC1 = cleanStr(q.initialCss);
    const initC2 = cleanStr(q.initialCode?.css);
    const initJ1 = cleanStr(q.initialJs);
    const initJ2 = cleanStr(q.initialCode?.js);

    const isHtmlChanged = curH !== '' && curH !== initH1 && curH !== initH2;
    const isCssChanged = curC !== '' && curC !== initC1 && curC !== initC2;
    const isJsChanged = curJ !== '' && curJ !== initJ1 && curJ !== initJ2;

    return isHtmlChanged || isCssChanged || isJsChanged;
  }

  // 3. Algorithmic Coding Questions (C++, C, Python, Java)
  const curCode = cleanStr(drafts.draftCode !== undefined ? drafts.draftCode : ans?.submittedCode);
  if (!curCode) return false;

  const curLang = drafts.draftLanguage || ans?.selectedLanguage || 'cpp';
  const initC1 = cleanStr(q.initialTemplate);
  const initC2 = cleanStr(DEFAULT_TEMPLATES?.[curLang]);
  const initC3 = cleanStr(DEFAULT_TEMPLATES?.cpp);

  // If code matches any initial template / starter boilerplate, candidate has NOT answered it
  if (initC1 && curCode === initC1) return false;
  if (initC2 && curCode === initC2) return false;
  if (initC3 && curCode === initC3) return false;

  return true;
};
