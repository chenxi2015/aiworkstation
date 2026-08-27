/**
 * Clean Noise AST Transform
 * Removes video player UI artifacts (e.g. playback rate lists, quality selectors, danmaku controls)
 * and interactive clutter from DocumentAST.
 */

import type { DocumentAST, ASTTransform, BlockNode, InlineNode } from '../types';
import { traverseAst } from '../visitor';

/**
 * Extracts plain text from an inline node or node array
 */
function getInlineText(nodes: InlineNode[]): string {
  return nodes
    .map((node) => {
      if (node.type === 'text' || node.type === 'inline_code') {
        return node.value;
      }
      if ('children' in node && Array.isArray(node.children)) {
        return getInlineText(node.children);
      }
      return '';
    })
    .join('')
    .trim();
}

const NOISE_CONTROL_KEYWORDS = new Set([
  '播放',
  '暂停',
  '重播',
  '全屏',
  '网页全屏',
  '倍速',
  '倍速播放中',
  '画质',
  '清晰度',
  '超清',
  '高清',
  '标清',
  '流畅',
  '原画',
  '发弹幕',
  '弹幕',
  '弹幕礼仪',
  '关闭弹幕',
  '点赞',
  '赞',
  '投币',
  '收藏',
  '分享',
  '转发',
  '关注',
  '已关注',
  '观看更多',
  '继续观看',
  '画中画',
  '静音',
  '取消静音',
  '投屏',
  '选集',
  '视频加载中',
  '重试',
]);

/**
 * Checks if text is typical video player UI noise (e.g. playback rate buttons, timestamps, quality switchers)
 */
function isPlayerControlText(text: string): boolean {
  if (!text) return false;
  const trimmed = text.trim();

  // 1. Check isolated common player control keyword
  if (NOISE_CONTROL_KEYWORDS.has(trimmed)) {
    return true;
  }

  // 2. Check compound player control buttons (e.g. "重播 分享 赞", "关注 已关注")
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length > 0 && tokens.length <= 5 && tokens.every((token) => NOISE_CONTROL_KEYWORDS.has(token))) {
    return true;
  }

  // 3. Timestamps (e.g. "00:00", "00:24", "00:00 / 00:24", "00:00/00:24", "01:23:45 / 02:00:00")
  if (/^(?:\d{1,2}:)?\d{1,2}:\d{2}(?:\s*\/\s*(?:\d{1,2}:)?\d{1,2}:\d{2})?$/.test(trimmed)) {
    return true;
  }

  // 4. Counter / progress ratio (e.g. "0/0", "0 / 0")
  if (/^\d+\s*\/\s*\d+$/.test(trimmed)) {
    return true;
  }

  // 5. Screen reader and progress bar announcements (e.g. "进度条，百分之0")
  if (/^进度条(?:[，,\s]*百分之\d+)?$/i.test(trimmed)) {
    return true;
  }

  // 6. Playback rate list strings (e.g. "0.5倍 0.75倍 1.0倍 1.5倍 2.0倍" or "0.5X 1.0X 1.5X 2.0X")
  if (/(?:0\.5|0\.75|1\.0|1\.25|1\.5|2\.0)\s*(?:倍|x|X)/i.test(trimmed) && trimmed.length < 60) {
    return true;
  }

  // 7. Video quality labels (e.g. "超清 流畅", "1080P 720P 高清")
  if (
    /^(?:超清|高清|标清|流畅|原画|4K|1080P|720P|480P|360P)(?:\s+(?:超清|高清|标清|流畅|原画|4K|1080P|720P|480P|360P|自动))*$/i.test(
      trimmed,
    )
  ) {
    return true;
  }

  // 8. Platform embed attribution noise (e.g. "以下视频来源于", "以下视频来源于 豆包")
  if (/^(?:以下视频来源于|来自微信视频号|来自视频号|关注公众号)/.test(trimmed)) {
    return true;
  }

  // 9. Isolated separator symbols left behind
  if (/^[\/\\|\-•·—~]$/.test(trimmed)) {
    return true;
  }

  return false;
}

/**
 * Creates an AST transform that cleans player UI and control noise
 */
export const cleanNoiseTransform: ASTTransform = (ast: DocumentAST): DocumentAST => {
  return traverseAst(ast, {
    enterBlock: (block: BlockNode) => {
      if (block.type === 'paragraph' || block.type === 'heading') {
        const text = getInlineText(block.children);
        if (isPlayerControlText(text)) {
          return false; // Remove noise block
        }
      }
      return block;
    },
  });
};
