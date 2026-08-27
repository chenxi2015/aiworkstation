/**
 * Document AST (Abstract Syntax Tree) Type Definitions
 * Represents structured, semantic document content extracted from webpages.
 */

import type { PageTDK, GrabbedVideo } from '../../types';

/**
 * Top-level Document AST model
 */
export interface DocumentAST {
  version: '1.0';
  metadata: DocumentMetadata;
  children: BlockNode[];
}

/**
 * Metadata associated with the captured document
 */
export interface DocumentMetadata {
  title: string;
  url: string;
  cleanUrl?: string;
  siteName?: string;
  description?: string;
  capturedAt: number;
  selector?: string;
  tag?: string;
  tdk?: PageTDK;
  stats: DocumentStats;
}

/**
 * Basic statistical metrics for the AST content
 */
export interface DocumentStats {
  wordCount: number;
  imageCount: number;
  videoCount: number;
  linkCount: number;
  blockCount: number;
}

// ── Block Nodes ─────────────────────────────────────────────────────────────

export type BlockNodeType =
  | 'heading'
  | 'paragraph'
  | 'blockquote'
  | 'code'
  | 'list'
  | 'list_item'
  | 'image'
  | 'video'
  | 'table'
  | 'divider';

export type BlockNode =
  | HeadingBlock
  | ParagraphBlock
  | QuoteBlock
  | CodeBlock
  | ListBlock
  | ListItemBlock
  | ImageBlock
  | VideoBlock
  | TableBlock
  | DividerBlock;

export interface BaseBlockNode {
  type: BlockNodeType;
  id?: string;
}

export interface HeadingBlock extends BaseBlockNode {
  type: 'heading';
  level: 1 | 2 | 3 | 4 | 5 | 6;
  children: InlineNode[];
}

export interface ParagraphBlock extends BaseBlockNode {
  type: 'paragraph';
  children: InlineNode[];
}

export interface QuoteBlock extends BaseBlockNode {
  type: 'blockquote';
  children: (BlockNode | InlineNode)[];
}

export interface CodeBlock extends BaseBlockNode {
  type: 'code';
  code: string;
  language?: string;
}

export interface ListBlock extends BaseBlockNode {
  type: 'list';
  ordered: boolean;
  start?: number;
  items: ListItemBlock[];
}

export interface ListItemBlock extends BaseBlockNode {
  type: 'list_item';
  children: (BlockNode | InlineNode)[];
}

export interface ImageBlock extends BaseBlockNode {
  type: 'image';
  src: string;
  alt?: string;
  title?: string;
  width?: number;
  height?: number;
}

export interface VideoBlock extends BaseBlockNode {
  type: 'video';
  src: string;
  poster?: string;
  title?: string;
}

export interface TableBlock extends BaseBlockNode {
  type: 'table';
  headers: string[];
  rows: string[][];
  caption?: string;
}

export interface DividerBlock extends BaseBlockNode {
  type: 'divider';
}

// ── Inline Nodes ────────────────────────────────────────────────────────────

export type InlineNodeType =
  | 'text'
  | 'link'
  | 'formatted'
  | 'inline_code';

export type InlineNode =
  | TextInline
  | LinkInline
  | FormattedInline
  | CodeInline;

export interface BaseInlineNode {
  type: InlineNodeType;
}

export interface TextInline extends BaseInlineNode {
  type: 'text';
  value: string;
}

export interface LinkInline extends BaseInlineNode {
  type: 'link';
  url: string;
  title?: string;
  children: InlineNode[];
}

export interface FormattedInline extends BaseInlineNode {
  type: 'formatted';
  bold?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  children: InlineNode[];
}

export interface CodeInline extends BaseInlineNode {
  type: 'inline_code';
  value: string;
}

// ── Visitor & Transform Patterns ────────────────────────────────────────────

export interface ASTVisitor {
  enterBlock?: (node: BlockNode, parent?: BlockNode | DocumentAST) => void | BlockNode | false;
  leaveBlock?: (node: BlockNode, parent?: BlockNode | DocumentAST) => void;
  enterInline?: (node: InlineNode, parent?: BlockNode | InlineNode) => void | InlineNode | false;
  leaveInline?: (node: InlineNode, parent?: BlockNode | InlineNode) => void;
}

export type ASTTransform = (ast: DocumentAST) => DocumentAST;
