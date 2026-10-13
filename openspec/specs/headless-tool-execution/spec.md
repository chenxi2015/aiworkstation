# headless-tool-execution Specification

## Purpose

Provides a server-side closed-loop execution engine for file-based AI Agent tools: tools that create or write content to Vault/DB-backed artifacts execute entirely on the server without requiring the owning module's page view to be open. Content-generating tools automatically split execution between a live-view bridged path (preserving real-time rendering) and a headless file-writing path, then return a navigation result the chat UI renders as a clickable card.

## Requirements

### Requirement: Headless creation of file-based artifacts

Tools classified as `global-headless` SHALL execute fully on the server: resolve the target path, perform the atomic write, invalidate relevant caches, and return a structured result. Execution SHALL NOT depend on any frontend page bridge or mounted view.

#### Scenario: Create a drawing from an unrelated module

- **WHEN** the user in the workbench module asks the AI to create a new drawing board
- **THEN** the server creates the `.excalidraw` file in the Vault, and the user remains in the workbench module without any navigation or interruption

#### Scenario: Name collision during headless creation

- **WHEN** a headless create targets a name that already exists in the target directory
- **THEN** the system auto-suffixes the name (e.g. `name 1.excalidraw`) and returns the actual created path in the result

### Requirement: Dual-path execution for content-generating tools

Tools classified as `content-generating` SHALL select an execution path based on the target's nature. For tools that modify an existing, user-identified artifact (such as drawing into an existing board or rewriting an existing document), execution SHALL follow the dual-path rule: if the target file is currently open in a view, execute via the frontend page bridge (preserving live rendering/animation); if not open, execute headlessly by writing the generated content directly to the file. For tools that create a brand-new long-form document from scratch, execution SHALL NOT write to the target store directly; the generated content SHALL be delivered as a draft per the content-delivery capability, and SHALL be persisted to the target store only after the user explicitly chooses a destination. Both modification paths SHALL produce the same final file format.

#### Scenario: Draw into an open board

- **WHEN** the target drawing file is currently open in the notes module view
- **THEN** elements are written through the frontend bridge and the user sees the drawing render in real time

#### Scenario: Draw into a board that is not open

- **WHEN** the target drawing file is not open in any view
- **THEN** the server computes the element layout headlessly, writes the elements into the file, and the user sees the completed drawing upon opening it later

#### Scenario: From-scratch article creation delivers a draft instead of writing a store

- **WHEN** the user asks the AI to write a brand-new long-form article from any module
- **THEN** the system writes the generated content to the draft area and presents a delivery card, and neither the documents table nor the Vault receives new content until the user confirms a destination

### Requirement: Navigation result contract

A successful headless or cross-module tool execution SHALL return a result containing a `navigation` field with the target route and route params. The chat message rendering layer SHALL display this as an interactive result card with the artifact name, location, and an explicit "open" action that navigates to the route.

#### Scenario: Result card after silent creation

- **WHEN** a drawing board was created and drawn headlessly while the user stayed in another module
- **THEN** the assistant message contains a result card showing the board name, its Vault location, element count, and an "open board" action

#### Scenario: Clicking the result card navigates to the artifact

- **WHEN** the user clicks the open action on a result card
- **THEN** the app navigates to the owning module route and opens the created artifact (e.g. `/obsidian` with the drawing file selected)

### Requirement: Shared element generation core

The element layout and generation logic for drawing tools SHALL be available as a dependency-free pure function usable by both server (headless) and client (bridged) execution paths, producing valid file-format-conformant output in both cases.

#### Scenario: Server generates valid drawing content without the client library

- **WHEN** the server executes a draw tool headlessly without importing the frontend rendering package
- **THEN** the written file contains spec-conformant elements (with required generated fields) that open correctly in the drawing view
