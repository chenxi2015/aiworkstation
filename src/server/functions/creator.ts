/**
 * Creator Server Functions Facade
 *
 * Facade aggregating three specialized creator modules:
 * 1. creatorMaterials.ts - Material & asset CRUD, in-place filesystem imports, batch deletion, and OS finder reveal
 * 2. creatorDrafts.ts    - Multi-platform AI generation, draft versioning, and export gates
 * 3. creatorBridge.ts    - Conversion of materials to rich text editor documents with media stream embeds
 */

export * from "./creatorBridge.ts";
export * from "./creatorDrafts.ts";
export * from "./creatorMaterials.ts";
