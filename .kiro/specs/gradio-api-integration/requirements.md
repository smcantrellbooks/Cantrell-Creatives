# Requirements Document

## Introduction

The `voice_studio_test.html` page currently calls five Flask-style REST endpoints on the Render service (`/api/speak`, `/api/generate-audiobook`, `/api/chat`, `/api/upload-mp3`, `/api/transcribe`). The Render service is a Gradio application, not Flask, so all five endpoints return 404. This feature rewires the frontend to call the correct Gradio API endpoints for audiobook generation, and routes TTS voice preview through a proxy (apifree Kokoro TTS). Nyxen (chat, voice playback, mic transcription) is out of scope for this spec — she will be built as an independent platform-wide app in a separate spec. The Nyxen UI remains in the page but her backend calls are disabled with a placeholder message.

## Glossary

- **Voice_Studio**: The `voice_studio_test.html` single-page application hosted on Sitejet that provides audiobook generation, TTS, and voice cloning functionality.
- **Gradio_Backend**: The Render-hosted Gradio application at `https://audiobook-creator.onrender.com` that exposes audiobook generation endpoints via `/run/<endpoint_name>` with `{"data": [...]}` payloads.
- **Apifree_TTS**: The external Kokoro TTS API (apifree.is) used for voice preview and text-to-speech generation.
- **TTS_Proxy**: A Vercel serverless function or Cloudflare Worker that proxies TTS requests to Apifree_TTS, keeping the API key server-side.
- **Narrator_Gender**: A string value of either "male" or "female" derived from the selected voice ID prefix (`am_`/`bm_` = male, `af_`/`bf_` = female).
- **Voice_Type**: A string value of either "Single Voice" or "Multi-Voice" determined by whether one or two distinct voices are selected.
- **Output_Format**: The audio format for generated audiobooks, one of: "MP3", "WAV", "M4B (Chapters & Cover)", "AAC", "M4A", "OPUS", "FLAC", "PCM".

## Requirements

### Requirement 1: Audiobook Generation via Gradio API

**User Story:** As an author, I want the "Generate Audiobook" button to produce audio through the Gradio backend, so that I can create audiobooks from my manuscript.

#### Acceptance Criteria

1. WHEN the user clicks "Generate Audiobook", THE Voice_Studio SHALL extract the full text content from the main document editor and send it to the Gradio_Backend `/run/save_book_wrapper` endpoint with the text as the first data parameter.
2. WHEN `/save_book_wrapper` returns successfully, THE Voice_Studio SHALL call `/run/generate_audiobook_wrapper` with parameters: Voice_Type, Narrator_Gender, Output_Format, a null book_file, and the book title string.
3. WHEN `/run/generate_audiobook_wrapper` returns a file URL in the response, THE Voice_Studio SHALL set the audio player source to that URL and enable the download button.
4. IF `/run/save_book_wrapper` or `/run/generate_audiobook_wrapper` returns an error, THEN THE Voice_Studio SHALL display the error message in the generation status area and re-enable the generate button.
5. THE Voice_Studio SHALL derive Narrator_Gender from the Voice 1 selection: voice IDs starting with `am_` or `bm_` map to "male", voice IDs starting with `af_` or `bf_` map to "female".
6. THE Voice_Studio SHALL derive Voice_Type from the voice casting configuration: "Multi-Voice" when Voice 1 and Voice 2 are different voices, "Single Voice" when they are the same or only one voice is used.
7. THE Voice_Studio SHALL display a progress bar during generation and update the status message at each stage (saving text, generating audio, complete).

### Requirement 2: Book Upload via Gradio API

**User Story:** As an author, I want to upload a DOCX file and have it processed by the Gradio backend, so that I can import my manuscript for audiobook generation.

#### Acceptance Criteria

1. WHEN the user imports a DOCX file via the file input, THE Voice_Studio SHALL send the file to the Gradio_Backend `/run/validate_book_upload` endpoint with the file and book title as parameters.
2. WHEN `/run/validate_book_upload` returns successfully, THE Voice_Studio SHALL call `/run/text_extraction_wrapper` with the file and the decoding option "textract" to extract text content.
3. WHEN `/run/text_extraction_wrapper` returns extracted text, THE Voice_Studio SHALL load the text into the document editor and run chapter detection on the result.
4. IF the Gradio_Backend file upload or text extraction fails, THEN THE Voice_Studio SHALL fall back to the existing client-side JSZip-based DOCX parsing already implemented in the `processFile` function.
5. THE Voice_Studio SHALL continue to support client-side TXT file loading without calling the Gradio_Backend.

### Requirement 3: Save Edited Text via Gradio API

**User Story:** As an author, I want my edited manuscript text saved to the Gradio backend session, so that the audiobook generator uses my latest edits.

#### Acceptance Criteria

1. WHEN the user clicks "Export Chapters to Audio", THE Voice_Studio SHALL call `/run/save_book_wrapper` with the concatenated text content from the main document editor.
2. WHEN `/run/save_book_wrapper` returns successfully, THE Voice_Studio SHALL display a confirmation status message indicating the text is saved and ready for generation.
3. IF `/run/save_book_wrapper` fails, THEN THE Voice_Studio SHALL display an error message but still allow the user to attempt audiobook generation.

### Requirement 4: Nyxen Placeholder (Out of Scope)

**User Story:** As an author, I want to see that Nyxen is coming soon, so that I know the chat assistant will be available in a future update.

#### Acceptance Criteria

1. THE Voice_Studio SHALL keep the Nyxen chat bubble and panel UI visible in the page.
2. WHEN the user opens the Nyxen panel, THE Voice_Studio SHALL display a message indicating that Nyxen is being rebuilt as an independent app and will return soon.
3. THE Voice_Studio SHALL NOT call any backend endpoint for Nyxen chat, voice playback, or mic transcription.
4. THE Voice_Studio SHALL remove or disable the `RENDER_URL + '/api/chat'` and `RENDER_URL + '/api/transcribe'` calls, and remove the disabled `NYXEN_WORKER` / `WORKER_BASE` constants.

### Requirement 5: TTS Voice Preview via Proxy

**User Story:** As an author, I want to preview voices before generating my audiobook, so that I can choose the right voice for my narration.

#### Acceptance Criteria

1. WHEN the user clicks a "Preview" button next to a voice selector, THE Voice_Studio SHALL send a TTS request to the TTS_Proxy with the sample text, selected voice ID, and engine type.
2. WHEN the TTS_Proxy returns audio data, THE Voice_Studio SHALL play the audio immediately in the browser.
3. IF the TTS_Proxy is unavailable or returns an error, THEN THE Voice_Studio SHALL display an alert indicating voice preview is temporarily unavailable.
4. THE Voice_Studio SHALL disable the preview button and show a loading indicator while the TTS request is in progress.

### Requirement 6: Text-to-Speech Tab via Proxy

**User Story:** As an author, I want the Text-to-Speech tab to generate speech from arbitrary text, so that I can hear how passages sound before committing to a full audiobook.

#### Acceptance Criteria

1. WHEN the user enters text and clicks "Generate Speech" in the TTS tab, THE Voice_Studio SHALL send the text (up to 2000 characters) and selected voice to the TTS_Proxy.
2. WHEN the TTS_Proxy returns audio, THE Voice_Studio SHALL display an audio player with the generated speech and a download button.
3. IF the TTS_Proxy returns an error, THEN THE Voice_Studio SHALL display the error in the TTS status area.

### Requirement 7: Remove Non-Functional Flask Endpoint References

**User Story:** As a developer, I want all references to non-existent Flask endpoints removed from the codebase, so that no 404 errors occur during normal usage.

#### Acceptance Criteria

1. THE Voice_Studio SHALL contain zero references to `/api/speak`, `/api/generate-audiobook`, `/api/chat`, `/api/upload-mp3`, or `/api/transcribe` as endpoint paths.
2. THE Voice_Studio SHALL use only Gradio `/run/<endpoint>` paths for audiobook operations and the TTS_Proxy URL for voice synthesis. Nyxen endpoints are removed entirely (out of scope).
3. THE Voice_Studio SHALL define all backend URLs as named constants at the top of the script block for easy configuration.

### Requirement 8: Gradio API Call Format Compliance

**User Story:** As a developer, I want all Gradio API calls to use the correct request format, so that the backend processes them successfully.

#### Acceptance Criteria

1. THE Voice_Studio SHALL send all Gradio API requests as POST to `https://audiobook-creator.onrender.com/run/<endpoint_name>` with `Content-Type: application/json`.
2. THE Voice_Studio SHALL structure all Gradio request bodies as `{"data": [param1, param2, ...]}` where parameters are positional and match the endpoint signature.
3. THE Voice_Studio SHALL handle Gradio responses which return `{"data": [...]}` and extract results from the data array.
4. FOR ALL Gradio endpoints called, THE Voice_Studio SHALL handle both successful responses and error responses (non-200 status codes or error fields in the JSON body).

### Requirement 9: Voice Cloning Upload Graceful Degradation

**User Story:** As an author, I want to know that voice cloning is not yet available on the remote backend, so that I am not confused by silent failures.

#### Acceptance Criteria

1. WHEN the user attempts to upload a voice cloning sample, THE Voice_Studio SHALL display a status message indicating that voice cloning is not yet available on the remote service.
2. THE Voice_Studio SHALL not attempt to call any non-existent endpoint for voice cloning uploads.
3. THE Voice_Studio SHALL keep the voice cloning UI visible but clearly indicate the feature status.