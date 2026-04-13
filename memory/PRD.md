# OpenVoice Clone — PRD

## Architecture
- Backend: FastAPI + SQLite + OpenAI TTS + Groq SDK
- Frontend: Vanilla HTML/CSS/JS (Tailwind CDN)
- 24 custom .wav voice reference files
- 13 API endpoints

## Implemented Features
- Voice Explorer (24 custom profiles with playable .wav samples)
- TTS Studio (text-to-speech with voice selection, speed control, HD quality)
- Batch TTS Generation (auto-chunking for long texts)
- Voice Comparison Tool (side-by-side 2-6 voice comparison)
- Audiobook Studio (DOCX upload, dialogue detection, multi-voice)
- AI Chat Assistant (Groq / openai/gpt-oss-20b)
- Generation History (with CSV/JSON export)
- Waveform Visualization (real-time frequency bars)
- Markdown Rendering (chat responses)

## API Endpoints
- GET /api/health, /api/voices, /api/voice-sample/{id}, /api/history, /api/history/export, /api/audio/{id}
- POST /api/tts, /api/batch-tts, /api/compare, /api/audiobook, /api/upload, /api/chat
