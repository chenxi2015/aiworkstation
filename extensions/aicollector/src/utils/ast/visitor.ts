/**
 * AST Visitor and Traversal Utilities
 * Implements the Visitor pattern for inspecting and mutating Document ASTs.
 */

import type {
  DocumentAST,
  BlockNode,
  InlineNode,
  ASTVisitor,
} from './types';

/**
 * Traverses inline nodes recursively
 */
export function traverseInlineNode(
  node: InlineNode,
  visitor: ASTVisitor,
  parent?: BlockNode | InlineNode,
): InlineNode | null {
  if (visitor.enterInline) {
    const result = visitor.enterInline(node, parent);
    if (result === false) return null; // Skip / remove
    if (result) node = result;
  }

  // Traverse children if node supports nested inline nodes
  if ('children' in node && Array.isArray(node.children)) {
    const newChildren: InlineNode[] = [];
    for (const child of node.children) {
      const processed = traverseInlineNode(child, visitor, node);
      if (processed) {
        newChildren.push(processed);
      }
    }
    node = { ...node, children: newChildren };
  }

  if (visitor.leaveInline) {
    visitor.leaveInline(node, parent);
  }

  return node;
}

/**
 * Traverses block nodes and their children recursively
 */
export function traverseBlockNode(
  node: BlockNode,
  visitor: ASTVisitor,
  parent?: BlockNode | DocumentAST,
): BlockNode | null {
  if (visitor.enterBlock) {
    const result = visitor.enterBlock(node, parent);
    if (result === false) return null; // Skip / remove
    if (result) node = result;
  }

  // Handle block-specific child traversal
  switch (node.type) {
    case 'heading':
    case 'paragraph': {
      const newChildren: InlineNode[] = [];
      for (const child of node.children) {
        const processed = traverseInlineNode(child, visitor, node);
        if (processed) newChildren.push(processed);
      }
      node = { ...node, children: newChildren };
      break;
    }

    case 'blockquote':
    case 'list_item': {
      const newChildren: (BlockNode | InlineNode)[] = [];
      for (const child of node.children) {
        if ('children' in child || 'value' in child) {
          // Check if it's an inline node
          if (child.type === 'text' || child.type === 'link' || child.type === 'formatted' || child.type === 'inline_code') {
            const processed = traverseInlineNode(child as InlineNode, visitor, node);
            if (processed) newChildren.push(processed);
          } else {
            const processed = traverseBlockNode(child as BlockNode, visitor, node);
            if (processed) newChildren.push(processed);
          }
        }
      }
      node = { ...node, children: newChildren };
      break;
    }

    case 'list': {
      const newItems = node.items
        .map((item) => traverseBlockNode(item, visitor, node) as typeof item | null)
        .filter((item): item is NonNullable<typeof item> => item !== null);
      node = { ...node, items: newItems };
      break;
    }

    default:
      // Leaf nodes (image, video, code, table, divider) require no child traversal
      break;
  }

  if (visitor.leaveBlock) {
    visitor.leaveBlock(node, parent);
  }

  return node;
}

/**
 * Traverses an entire DocumentAST tree with a visitor
 */
export function traverseAst(ast: DocumentAST, visitor: ASTVisitor): DocumentAST {
  const newChildren: BlockNode[] = [];

  for (const block of ast.children) {
    const processed = traverseBlockNode(block, visitor, ast);
    if (processed) {
      newChildren.push(processed);
    }
  }

  return {
    ...ast,
    children: newChildren,
  };
}

/**
 * Recalculates statistical metadata (wordCount, imageCount, videoCount, linkCount) for the AST
 */
export function calculateAstStats(ast: DocumentAST): DocumentAST {
  let wordCount = 0;
  let imageCount = 0;
  let videoCount = 0;
  let linkCount = 0;
  let blockCount = 0;

  traverseAst(ast, {
    enterBlock: (block) => {
      blockCount++;
      if (block.type === 'image') imageCount++;
      if (block.type === 'video') videoCount++;
      if (block.type === 'code') {
        wordCount += block.code.length;
      }
    },
    enterInline: (inline) => {
      if (inline.type === 'text') {
        wordCount += inline.value.trim().length;
      }
      if (inline.type === 'link') {
        linkCount++;
      }
    },
  });

  return {
    ...ast,
    metadata: {
      ...ast.metadata,
      stats: {
        wordCount,
        imageCount,
        videoCount,
        linkCount,
        blockCount,
      },
    },
  };
}
