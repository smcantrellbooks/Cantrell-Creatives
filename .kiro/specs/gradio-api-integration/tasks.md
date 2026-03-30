# Implementation Plan: Gradio API Integration

## Overview

Rewire `voice_studio_test.html` from broken Flask `/api/*` endpoints to correct Gradio `/run/<endpoint>` format, route TTS through a Vercel proxy, and gracefully disable out-of-scope features (Nyxen, voice cloning). Also create the Vercel serverless TTS proxy function.

## Tasks

- [x] 1. Replace URL constants and add helper functions
  - [x] 1.1 Replace URL constants at top of `<script>` block in `voice_studio_test.html`
    - Remove `RENDER_URL`, `WORKER_BASE`, `NYXEN_WORKER` constants
    - Add `GRADIO_BASE = 'https://audiobook-creator.onrender.com'`
    - Add `TTS_PROXY_URL = 'https://www.smcantrellbooks.com/api/tts-preview'`
    - _Requirements: 7.1, 7.2, 7.3, 4.4_

  - [x] 1.2 Add `gradioCall()` helper function
    - Implement shared async function that POSTs to `GRADIO_BASE + '/run/' + endpoint` with `{"data": [...]}` body
    - Parse response JSON, return `data` array on success
    - Throw descriptive error on non-200 or `error` field in response
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x] 1.3 Add `ttsProxyCall()` helper function
    - Implement shared async function that POSTs to `TTS_PROXY_URL` with text (truncated to 2000 chars), voice, and model
    - Return blob URL on audio response, throw on error
    - _Requirements: 5.1, 6.1_

  - [x] 1.4 Add `deriveNarratorGender()` and `deriveVoiceType()` pure functions
    - `deriveNarratorGender(voiceId)`: return `'male'` for `am_`/`bm_` prefixes, `'female'` otherwise
    - `deriveVoiceType(voice1Id, voice2Id)`: return `'Single Voice'` when voice2 is falsy or equal to voice1, `'Multi-Voice'` otherwise
    - _Requirements: 1.5, 1.6_

  - [ ]* 1.5 Write property tests for `deriveNarratorGender` (fast-check)
    - **Property 1: Narrator gender derivation from voice ID prefix**
    - **Validates: Requirements 1.5**

  - [ ]* 1.6 Write property tests for `deriveVoiceType` (fast-check)
    - **Property 2: Voice type derivation from voice pair**
    - **Validates: Requirements 1.6**

- [x] 2. Rewire audiobook generation flow
  - [x] 2.1 Rewire `generateAudiobook()` to use two-step Gradio flow
    - Extract full text from `mainDocEditor`
    - Step 1: Call `gradioCall('save_book_wrapper', [text])` — show "Saving text..." status
    - Step 2: Call `gradioCall('generate_audiobook_wrapper', [voiceType, narratorGender, outputFormat, null, bookTitle])` using derived values
    - On success: set audio player src to returned file URL, enable download
    - On error: display in `genStatus`, re-enable button, reset progress bar
    - Update progress bar and status messages at each stage
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

  - [ ]* 2.2 Write property test for audiobook parameter assembly
    - **Property 4: Generate audiobook assembles correct Gradio parameters**
    - **Validates: Requirements 1.2, 1.5, 1.6**

  - [x] 2.3 Add Gradio save call to `exportToAudio()`
    - After building the main doc content, call `gradioCall('save_book_wrapper', [concatenatedText])`
    - Show confirmation status on success, error message on failure (but don't block generation)
    - _Requirements: 3.1, 3.2, 3.3_

- [x] 3. Checkpoint — Verify audiobook generation flow
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Rewire file upload and TTS functions
  - [x] 4.1 Rewire `processFile()` for DOCX to try Gradio upload first, fall back to JSZip
    - For DOCX files: attempt `gradioCall('validate_book_upload', [file, bookTitle])` then `gradioCall('text_extraction_wrapper', [file, 'textract'])`
    - On Gradio success: load extracted text into editor, run chapter detection
    - On Gradio failure: fall back to existing JSZip parsing, show info message
    - TXT files: keep existing client-side FileReader path unchanged (no Gradio call)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [ ]* 4.2 Write property test for TXT file bypass
    - **Property 7: TXT file loading bypasses Gradio backend**
    - **Validates: Requirements 2.5**

  - [x] 4.3 Rewire `previewVoice()` to use `ttsProxyCall()`
    - Replace `RENDER_URL + '/api/speak'` fetch with `ttsProxyCall(sampleText, voiceId)`
    - Disable button and show loading indicator during request
    - On error: alert "voice preview temporarily unavailable"
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 4.4 Rewire `generateTTS()` to use `ttsProxyCall()`
    - Replace `RENDER_URL + '/api/speak'` fetch with `ttsProxyCall(text, voiceId)`
    - Display audio player with download button on success
    - Show error in `ttsStatus` on failure
    - _Requirements: 6.1, 6.2, 6.3_

  - [ ]* 4.5 Write property test for TTS proxy routing and text truncation
    - **Property 6: TTS operations route through proxy with text truncation**
    - **Validates: Requirements 5.1, 6.1**

- [x] 5. Disable out-of-scope features
  - [x] 5.1 Disable `nyxenSend()` — show "coming soon" message in feed, no fetch call
    - Replace fetch to `/api/chat` with `addNyxMsg()` showing "Nyxen is being rebuilt as an independent app and will return soon"
    - _Requirements: 4.2, 4.3_

  - [x] 5.2 Disable `speakNyxenReply()` — make it a no-op (return immediately, no fetch)
    - _Requirements: 4.3_

  - [x] 5.3 Disable `toggleNyxenMic()` — show message in feed, no fetch call
    - Replace fetch to `/api/transcribe` with message in Nyxen feed
    - _Requirements: 4.3_

  - [x] 5.4 Disable `handleCloneUpload()` — show "not available" message, no fetch call
    - Replace fetch to `/api/upload-mp3` with `showStatus('cloneStatus', 'info', 'Voice cloning is not yet available on the remote service.')`
    - _Requirements: 9.1, 9.2, 9.3_

- [x] 6. Checkpoint — Verify all frontend rewiring
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Create Vercel serverless TTS proxy
  - [x] 7.1 Create `Cantrell Creatives/api/tts-preview.js`
    - Handle CORS preflight (OPTIONS) with permissive headers
    - Accept POST with `{text, voice, model}` body
    - Read `KOKORO_API_KEY` from `process.env`
    - Proxy to `https://api.apifree.ai/v1/audio/speech` with server-side API key
    - Truncate text to 2000 chars server-side
    - Return audio bytes with `Content-Type: audio/wav` on success
    - Return JSON error with upstream status on failure
    - Reject non-POST methods with 405
    - Return 400 if no text provided, 500 if API key not configured
    - _Requirements: 5.1, 5.2, 5.3, 6.1, 6.2, 6.3_

  - [ ]* 7.2 Write property test for Gradio call format compliance (fast-check)
    - **Property 3: Gradio call helper formats requests and parses responses correctly**
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4**

- [x] 8. Final verification — remove all Flask endpoint references
  - [x] 8.1 Scan `voice_studio_test.html` and confirm zero references to `/api/speak`, `/api/generate-audiobook`, `/api/chat`, `/api/upload-mp3`, `/api/transcribe`, `WORKER_BASE`, `NYXEN_WORKER`, or `RENDER_URL`
    - _Requirements: 7.1, 7.2, 4.4_

  - [ ]* 8.2 Write static analysis test for no Flask endpoint references
    - **Property 5: No Flask endpoint references in source code**
    - **Validates: Requirements 7.1, 7.2, 4.3, 4.4, 9.2**

- [x] 9. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests use fast-check (JavaScript PBT library) and validate universal correctness properties from the design document
- The Vercel proxy keeps the `KOKORO_API_KEY` server-side — never exposed in frontend code
- Nyxen UI stays visible but all backend calls are disabled with placeholder messages
- `voice studio.html` (live Sitejet file) is NOT touched — only `voice_studio_test.html`