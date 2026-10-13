# Tasks

## 1. Target resolution core

- [x] 1.1 Create `src/components/workbench/ai/chat/proposal/resolveActionTarget.ts`: pure function taking `{ prompt, skillContextItems, pageBridge, contextItems }` and returning `direct | proposal | agent` discriminated union (per design D2), with unit tests covering: current-page target direct, context-item target proposal, cross-module proposal, skill-context proposal, no-target agent fallback.
- [x] 1.2 Move `matchRewritePipelineIntent` usage out of `ChatWithBookmarksPanel.tsx` into the resolution layer as a candidate signal (design D5); keep the keyword matcher itself unchanged.
- [x] 1.3 Extend PageBridge action metadata: add target-object declaration (owning module, object id, execution form) to actions registered by `useEditorAiBridge` and `useObsidianAiBridge`, so the resolver reads capability declarations instead of module heuristics.

## 2. Proposal card UI

- [x] 2.1 Create `ActionProposalCard` chat message component: shows target object title, owning module label, execution form (e.g. "双栏比对改写"), confirm / dismiss affordances; dismissed cards record dismissal and never auto-execute.
- [x] 2.2 Wire proposal rendering into the chat message list: proposals appear as message items (not toasts), persist within the session transcript, and become inert once resolved (confirmed or dismissed).

## 3. Confirm-and-navigate execution

- [x] 3.1 Add pending-action slot to `workbenchContextStore`: `{ targetObject, actionId, payload, expiresAt }`, single-slot, one-time consume, 60s TTL.
- [x] 3.2 Implement confirm handler in the proposal card: write pending action, navigate to the owning module route, and surface a non-blocking toast if the target page does not consume it before expiry.
- [x] 3.3 Consume pending actions on target page mount: after PageBridge registration in editor and obsidian pages, check the store, validate the target object still exists (toast + discard if not), and invoke the matching action.

## 4. Skill context in split-pane pipeline

- [x] 4.1 Extend `runBridgeRewriteAction` (and the obsidian/editor `onStartRewritePipeline` path) to accept resolved skill guidance content and append it to the rewrite instruction as a supplementary-requirements section, consistent with the existing `customRequirement` concatenation.
- [x] 4.2 Remove the `hasSkillOrFileContext` bypass in `ChatWithBookmarksPanel.tsx` so skill-carrying requests reach the resolution layer instead of being forced into the general agent.

## 5. Cleanup and verification

- [x] 5.1 Delete the obsidian-specific shortcut block in `ChatWithBookmarksPanel.tsx` (the hardcoded `module === "obsidian"` branch) once the resolution layer covers its behavior.
- [x] 5.2 Manual verification matrix: current-note rewrite direct; workbench + attached note rewrite → proposal → confirm → navigate + split pane; skill + current note rewrite → proposal → split pane with skill guidance; dismiss proposal → no execution; stale pending action expiry toast.
