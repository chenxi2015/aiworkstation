/**
 * Code Syntax Highlighter Utility
 * Powered by PrismJS for lexical tokenization and highlighting.
 * Supports Word (.docx) styled TextRun generation and semantic HTML rendering.
 */

import Prism from 'prismjs';

// Load common language grammars
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-markup'; // HTML/XML
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-markdown';

export interface StyledCodeToken {
  text: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
}

// Language alias dictionary
const LANGUAGE_ALIASES: Record<string, string> = {
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  yml: 'yaml',
  golang: 'go',
  rs: 'rust',
  html: 'markup',
  xml: 'markup',
  svg: 'markup',
  md: 'markdown',
};

// Word (.docx) hex color palette for syntax tokens (Tailwind / One Light inspired)
const DOCX_TOKEN_COLORS: Record<string, string> = {
  keyword: '7C3AED', // Purple
  boolean: '7C3AED',
  builtin: '0284C7', // Sky blue
  'class-name': '0284C7',
  function: '2563EB', // Blue
  string: '16A34A', // Green
  char: '16A34A',
  regex: '059669',
  comment: '64748B', // Slate gray
  prolog: '64748B',
  doctype: '64748B',
  cdata: '64748B',
  number: 'D97706', // Amber / Orange
  operator: 'DC2626', // Red
  punctuation: '475569',
  decorator: 'D97706',
  property: '0D9488', // Teal
  variable: '334155',
  tag: 'DC2626', // Markup tag (HTML/XML)
  'attr-name': 'D97706',
  'attr-value': '16A34A',
};

/**
 * Resolves standard language key from alias or input
 */
export function resolveLanguage(lang?: string): string {
  if (!lang) return 'javascript';
  const clean = lang.trim().toLowerCase();
  return LANGUAGE_ALIASES[clean] || clean;
}

/**
 * Tokenize a code block into styled chunks for Word (.docx) rendering
 */
export function tokenizeCodeForDocx(code: string, rawLang?: string): StyledCodeToken[] {
  if (!code) return [];

  const lang = resolveLanguage(rawLang);
  const grammar = Prism.languages[lang] || Prism.languages.javascript || Prism.languages.markup;

  if (!grammar) {
    return [{ text: code, color: '0F172A' }];
  }

  const tokens = Prism.tokenize(code, grammar);
  const result: StyledCodeToken[] = [];

  function flattenToken(token: string | Prism.Token, parentType?: string) {
    if (typeof token === 'string') {
      const color = parentType ? DOCX_TOKEN_COLORS[parentType] || '0F172A' : '0F172A';
      result.push({
        text: token,
        color,
        italic: parentType === 'comment',
      });
      return;
    }

    const currentType = token.type || parentType;

    if (Array.isArray(token.content)) {
      for (const child of token.content) {
        flattenToken(child, currentType);
      }
    } else if (typeof token.content === 'string') {
      const color = currentType ? DOCX_TOKEN_COLORS[currentType] || '0F172A' : '0F172A';
      result.push({
        text: token.content,
        color,
        italic: currentType === 'comment',
        bold: currentType === 'keyword' || currentType === 'class-name',
      });
    } else if (token.content) {
      flattenToken(token.content as Prism.Token, currentType);
    }
  }

  for (const token of tokens) {
    flattenToken(token);
  }

  return result;
}

/**
 * High-level HTML syntax highlighter for code snippets
 */
export function highlightCodeToHtml(code: string, rawLang?: string): string {
  if (!code) return '';

  const lang = resolveLanguage(rawLang);
  const grammar = Prism.languages[lang] || Prism.languages.javascript;

  if (!grammar) {
    return code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  try {
    return Prism.highlight(code, grammar, lang);
  } catch (err) {
    console.warn(`Failed to highlight code for language ${lang}:`, err);
    return code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
