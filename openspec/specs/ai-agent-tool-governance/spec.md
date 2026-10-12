# ai-agent-tool-governance Specification

## Purpose

Defines the governance system for AI Agent tools: how tools are classified by execution dependency, how module whitelists evolve from hard filters to soft layering, and the contract by which intent-routed tools bypass module restrictions. This capability owns the rules for "which tools are available in which module context, and through which execution path" as the tool inventory grows.

## Requirements

### Requirement: Tool classification by execution dependency

Every Agent tool SHALL be classified into exactly one of three categories based on its execution dependency: `global-headless` (atomic file/DB operation requiring no page view), `content-generating` (writes content to a target file, view-optional), `context-dependent` (operates on the currently open view state). The classification SHALL be declared in the tool's registration metadata, not inferred from the module it happens to be used in.

#### Scenario: Classify a create-type tool

- **WHEN** a tool's underlying operation is a single atomic file or DB write (e.g. create a drawing file in the Vault)
- **THEN** the tool is classified as `global-headless` and registered as globally available

#### Scenario: Classify a view-state tool

- **WHEN** a tool's operation requires reading or mutating the currently rendered view (e.g. center the viewport, tidy an open board's layout)
- **THEN** the tool is classified as `context-dependent` and remains locked to its owning module

#### Scenario: Classify a content-writing tool

- **WHEN** a tool writes structured content into a target file that may or may not be open in a view (e.g. draw elements into a board file)
- **THEN** the tool is classified as `content-generating` and supports both bridged and headless execution paths

### Requirement: Module whitelist as soft layering

The module contribution `tools` list SHALL act as a prioritization hint (ordering and LLM preference) rather than an exclusion filter. Tools not in the active module's list SHALL remain callable when the intent router explicitly requires them or when the LLM selects them from the full registry. The whitelist SHALL NOT cause a tool to be excluded from the available tool set.

#### Scenario: Intent-routed tool bypasses whitelist

- **WHEN** the user is in module A and the intent router resolves a required tool owned by module B
- **THEN** the tool is available for execution in that conversation regardless of module A's whitelist

#### Scenario: Module tools are prioritized, not exclusive

- **WHEN** the LLM receives the tool list in module A
- **THEN** module A's declared tools appear first or with higher prominence, but globally registered tools from other modules are still present and selectable

### Requirement: Context-dependent tools stay module-locked

Tools classified as `context-dependent` SHALL NOT be globally registered. When the user requests such an action from a different module, the system SHALL respond with a navigation hint to the owning module rather than silently failing or attempting headless execution.

#### Scenario: Cross-module request for a view-state action

- **WHEN** the user in the bookmarks module asks to "tidy the current board layout" and no board is open
- **THEN** the system replies that this action requires the notes module and offers a navigation entry, without executing any mutation
