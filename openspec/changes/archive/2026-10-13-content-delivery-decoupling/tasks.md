# Tasks

## 1. Draft storage core

- [x] 1.1 Create `src/server/ai/drafts/draftStore.ts`: draft directory bootstrap (`~/.aiworkstation/drafts/`), `index.json` metadata management, `createDraft({ title, content, sessionId })` → writes `.md` + index entry, `getDraft(id)`, `listDrafts()`, `updateDraftContent(id, content)` (overwrite + refresh wordCount/updatedAt), `markArchived(id, target)`, `deleteDraft(id)` (via trash).
- [x] 1.2 Add startup sweep: on app start, remove `pending` drafts older than 7 days (move to trash); delete files of `archived` drafts immediately. Unit-test index round-trip and sweep filtering with injected clock.

## 2. Agent tool switch

- [x] 2.1 Create `draft_article` server tool: input `{ title, prompt, stylePreset? }`, reuses `generateArticleContent` to produce the full text, writes it via draftStore, returns result with `navigation` carrying `draftId`/title/wordCount and a summary that explicitly says the content awaits user destination choice. Never returns the full text to the LLM.
- [x] 2.2 Remove `trigger_document_create` from global registration in `agentRunner.ts` / `editorTools.ts` (retire `createDocumentCreateTool`); update editor module prompt to drop the auto-create guidance and describe the draft flow; allow `fs_read_file`/`fs_patch_file` to operate inside the drafts directory so follow-up edits work.

## 3. Delivery card UI

- [x] 3.1 Add `draft` payload to `ChatItem` (`{ draftId, title, wordCount, status: "pending" | "archived" | "expired" }`); on `step_end` for `draft_article`, attach the draft payload to the assistant message.
- [x] 3.2 Create `DraftDeliveryCard` component: title, word count, created time, actions 预览 / 存为创作文档 / 存为笔记 / 丢弃; resolved cards become inert (show archived destination or 已丢弃/已过期). Render via `ChatMessageItem` dispatch.
- [x] 3.3 Implement preview: server function reads the draft file and returns content for a modal/expandable view; expired drafts render a disabled card with 「草稿已过期」.

## 4. Destination actions

- [x] 4.1 Server function `saveDraftAsDocument`: read draft → markdownToTiptapDoc → insert into documents table → markArchived; returns `{ documentId }`; card shows a navigation entry to `/creator/studio?doc=<id>`.
- [x] 4.2 Server function `saveDraftAsNote`: directory picker reusing obsidian directory components (default Vault root or current dir) → move draft `.md` into the Vault with name de-duplication → markArchived; returns the note path with a navigation entry to `/obsidian?note=<path>`.
- [x] 4.3 Discard action: deleteDraft via trash, card turns inert.

## 5. Cleanup and verification

- [x] 5.1 Remove the now-dead `onTriggerCreateDocumentPipeline` interactive-pipeline branch in `useAiChat.ts` and the `stream_create_document` bridge action if nothing else references it; keep `createDocumentHeadlessRpc` (used by 4.1's flow or remove if fully superseded).
- [x] 5.2 Manual verification matrix: 创作请求 → 草稿卡片不入库；存为创作文档 → 落库可跳转；存为笔记 → Vault 出现文件可打开；丢弃 → 草稿清除；追问「展开第三段」→ 草稿更新卡片刷新；重启 app → 卡片惰性态正确（已归档/已过期）。
