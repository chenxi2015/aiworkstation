/**
 * Flow Block Type Definitions for Content Image Card Generation
 */

export type BlockType = 'heading' | 'paragraph' | 'blockquote' | 'list-item' | 'image' | 'video';

export interface BaseBlock {
  type: BlockType;
}

export interface TextBlock extends BaseBlock {
  type: 'heading' | 'paragraph' | 'blockquote' | 'list-item';
  text: string;
  level?: number; // Heading level (1-6)
  lines?: string[];
  blockHeight?: number;
}

export interface ImageBlock extends BaseBlock {
  type: 'image';
  src: string;
  alt?: string;
  img?: HTMLImageElement;
  drawWidth?: number;
  drawHeight?: number;
  blockHeight?: number;
}

export interface VideoCardBlock extends BaseBlock {
  type: 'video';
  src: string;
  poster?: string;
  title?: string;
  img?: HTMLImageElement;
  drawWidth?: number;
  drawHeight?: number;
  blockHeight?: number;
}

export type FlowBlock = TextBlock | ImageBlock | VideoCardBlock;
