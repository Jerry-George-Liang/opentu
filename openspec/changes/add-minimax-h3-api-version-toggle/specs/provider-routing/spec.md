## ADDED Requirements

### Requirement: MiniMax-H3 Video API Version Selection

The system SHALL allow a user generating video with `MiniMax-H3` to select either the Tuzi V1 compatibility endpoint or the MiniMax V2 endpoint while preserving the same H3 JSON generation parameters.

#### Scenario: Default to V1

- **GIVEN** the selected video model is `MiniMax-H3`
- **AND** no API version preference has been saved
- **WHEN** the generation parameter panel is displayed
- **THEN** the system SHALL show V1 and V2 interface options
- **AND** SHALL select V1 by default

#### Scenario: Submit and poll through V1

- **GIVEN** the selected video model is `MiniMax-H3`
- **AND** the user selected V1
- **WHEN** a video generation task is submitted
- **THEN** the system SHALL send JSON to `POST /v1/videos`
- **AND** the JSON SHALL contain `model`, `content`, `duration`, `resolution`, and `ratio`
- **AND** the system SHALL poll the task through `GET /v1/videos/{task_id}`

#### Scenario: Submit and poll through V2

- **GIVEN** the selected video model is `MiniMax-H3`
- **AND** the user selected V2
- **WHEN** a video generation task is submitted
- **THEN** the system SHALL send JSON to `POST /v2/video_generation`
- **AND** the system SHALL poll the task through `GET /v2/query/video_generation/{task_id}`

#### Scenario: Preserve other video model routing

- **GIVEN** the selected video model is not `MiniMax-H3`
- **WHEN** the generation parameter panel and video request route are resolved
- **THEN** the system SHALL not expose the MiniMax-H3 API version parameter
- **AND** SHALL preserve the model's existing request and polling behavior
