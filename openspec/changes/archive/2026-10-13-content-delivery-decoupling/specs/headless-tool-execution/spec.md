# Spec Delta

## MODIFIED Requirements

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
