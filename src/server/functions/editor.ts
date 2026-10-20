/**
 * Facade entry point for Editor Server Functions.
 *
 * Architecture split:
 * - ./editor/documents.ts   : Document CRUD, duplicate, sort, status, and physical folder access
 * - ./editor/folders.ts     : Folder hierarchy, sorting, rename, and moving
 * - ./editor/versions.ts    : Document snapshots and version history
 * - ./editor/assets.ts      : Document media uploads, material imports, and external downloads
 * - ./editor/antiLeech.ts   : Anti-hotlinking rules, candidate sequences, and adaptive headers
 * - ./editor/ai.ts          : BubbleMenu / AI bar quick completion
 */

export * from "./editor/ai.ts";
export * from "./editor/antiLeech.ts";
export * from "./editor/assets.ts";
export * from "./editor/documents.ts";
export * from "./editor/folders.ts";
export * from "./editor/versions.ts";
