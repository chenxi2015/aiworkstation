# Spec Delta

## Purpose

Defines the AI assistant's unified decision layer for writable-content actions: before executing any action that targets a note or document, the system resolves the intended target object from the current page and session context, then either executes directly (when the target is the object the user is currently viewing) or presents a confirmation proposal (when the target is ambiguous, cross-module, cross-object, or carries skill context). This capability owns the rules for when execution is direct versus proposed, and how proposals are presented and confirmed.

## ADDED Requirements

### Requirement: Unified target resolution before writable-content actions

The system SHALL route every request implying a writable operation on a note or document (chat prompt, slash-selected skill, selection action) through a single target-resolution step before execution. Resolution SHALL consider the currently open page object and session context items as candidate targets, and SHALL produce exactly one outcome: direct execution, a confirmation proposal, or fallback to the general agent when no writable target exists.

#### Scenario: Rewrite intent on the currently open note

- **WHEN** the user is viewing a Markdown note in the notes module and submits a rewrite-class request (e.g. "帮我改写这篇") without attached skill or file context
- **THEN** the system SHALL directly open the split-pane compare pipeline for that note without a confirmation step

#### Scenario: Rewrite intent with an attached article from another module

- **WHEN** the user is in the workbench or bookmarks module and submits a rewrite-class request whose only writable target is an attached context item belonging to the notes or creator module
- **THEN** the system SHALL present a confirmation proposal naming the target object, its owning module, and the execution form, and SHALL NOT execute until the user confirms

#### Scenario: No writable target

- **WHEN** the user submits a request for which target resolution finds no writable note or document
- **THEN** the system SHALL fall back to the general conversational agent without presenting a proposal

### Requirement: Confirmation proposals for ambiguous or cross-boundary actions

The system SHALL present a confirmation proposal instead of executing directly whenever any of the following holds: the resolved target is not the object currently open on the page; the target's owning module differs from the active module; or the request carries skill context. The proposal SHALL state the target object, the owning module, and the execution form, and SHALL offer confirm and dismiss affordances. Silence or dismissal SHALL NOT execute the action.

#### Scenario: Cross-module operation from notes to a creator document

- **WHEN** the user is in the notes module and requests an operation whose resolved target is a creator-module document
- **THEN** the system SHALL present a proposal identifying the creator document, and on confirmation SHALL navigate to the creator module, open that document, and execute the action

#### Scenario: Skill-selected request on the currently open note

- **WHEN** the user selects a skill via the slash menu and submits a rewrite-class request while viewing a Markdown note
- **THEN** the system SHALL present a confirmation proposal (rather than silently downgrading to the general agent or silently executing), and on confirmation SHALL run the split-pane pipeline with the skill's guidance content included in the instruction

#### Scenario: Dismissed proposal

- **WHEN** a confirmation proposal is presented and the user dismisses or ignores it
- **THEN** the system SHALL NOT execute the proposed action and SHALL NOT navigate away from the current module

### Requirement: Proposal confirmation navigates and executes

When the user confirms a proposal whose target lives in a different module, the system SHALL navigate to the owning module, open the target object, and execute the proposed action after the target page has registered its capabilities. The pending action SHALL be consumed exactly once, SHALL expire if the target page does not become ready within a bounded interval, and SHALL be cancelled with user-visible feedback if the target object no longer exists.

#### Scenario: Confirmed cross-module proposal

- **WHEN** the user confirms a proposal targeting a note while in the workbench module
- **THEN** the system SHALL navigate to the notes module, open that note, and start the proposed action (e.g. split-pane rewrite) without requiring further input

#### Scenario: Stale pending action

- **WHEN** a pending action exists but the target page does not register readiness within the expiry interval
- **THEN** the system SHALL discard the pending action and surface a non-blocking notice that the action could not be started

### Requirement: Skill content participates in the split-pane pipeline

The split-pane rewrite pipeline SHALL accept resolved skill guidance content as part of its instruction, so that requests carrying slash-selected skills can execute in split-pane form rather than being forced through the general agent.

#### Scenario: Skill-guided rewrite in split pane

- **WHEN** a confirmed proposal includes skill context
- **THEN** the split-pane pipeline SHALL incorporate the skill's guidance content into the rewrite instruction presented to the model
