# Spec Delta

## MODIFIED Requirements

### Requirement: Context-dependent tools stay module-locked

Tools classified as `context-dependent` SHALL NOT be globally registered. When the user requests such an action from a different module, the system SHALL respond with a confirmation proposal naming the target object and owning module; on confirmation it navigates to the owning module and executes the action. It SHALL NOT silently fail, attempt headless execution, or emit only a passive hint.

#### Scenario: Cross-module request for a view-state action

- **WHEN** the user in the bookmarks module asks to "tidy the current board layout" and no board is open
- **THEN** the system presents a confirmation proposal identifying the notes module as the owner, and executes the action only after the user confirms and is navigated there

#### Scenario: Passive hint without proposal is insufficient

- **WHEN** the user requests a context-dependent action from a different module
- **THEN** the response SHALL include an actionable confirmation affordance, not only informational text
