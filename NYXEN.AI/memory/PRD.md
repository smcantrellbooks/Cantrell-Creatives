# Nyxen AI — Product Requirements Document

## Overview
Nyxen is an AI creative assistant that lives on the Cantrell Creatives platform. She serves as a creative storyteller on the Publisher Workspace page and as a general assistant on other pages.

## Avatar
https://cdn1.site-media.eu/images/0/24185616/nyxen-hucYBsyp6NvKtsJFls-OUg.jpg

## Architecture
- **Frontend**: React with Tailwind CSS, shadcn UI components
- **Backend**: FastAPI with SQLite (aiosqlite)
- **AI Chat**: Groq with openai/gpt-oss-20b
- **AI STT**: Groq with whisper-large-v3-turbo
- **AI TTS**: OpenAI TTS HD API (direct)
- **AI Images**: APIFree.ai with ByteDance Seedream 4.5
- **Voice Profiles**: 23 custom voices with .wav samples
- **Design**: "Organic & Earthy" theme — Playfair Display, cream/charcoal palette
- **Repo**: https://github.com/smcantrellbooks/Cantrell-Creatives

## Roles
- **Publisher Workspace (Home Base)**: Full-service creative writing assistant — helps write, edit, structure manuscripts, generate content when asked
- **Other Pages (Voice Studio, Images, etc.)**: Assistive only — guides, suggests, helps with choices but does NOT control tools or auto-execute
- **Standalone**: Full Nyxen chat at /nyxen route
- **Future**: Will connect to smcantrellbooks.com

## Core Principle
User is ALWAYS in control. Nyxen suggests, assists, and enhances. She does NOT auto-generate, override selections, control tools, or force workflows. She sits alongside the user, not between them and the system.

## Features
- [x] AI Chat (openai/gpt-oss-20b via Groq) with dual mode (storyteller/assistant)
- [x] Streaming chat responses
- [x] Speech-to-Text (whisper-large-v3-turbo via Groq)
- [x] Text-to-Speech (OpenAI TTS HD, 23 voices)
- [x] Batch TTS (auto-chunking long texts)
- [x] Streaming TTS (real-time SSE delivery)
- [x] Voice Comparison (2-6 voices side by side)
- [x] Audiobook Studio (DOCX upload, dialogue detection, multi-voice)
- [x] Voice Explorer (23 voice profiles with sample playback)
- [x] Story Studio with AI generation/continuation
- [x] Document Editor with AI rewrite/format tools
- [x] Image Generator (Seedream 4.5 via APIFree.ai)
- [x] Story Illustrations
- [x] Generation History with CSV/JSON export
- [x] Settings page with voice configuration
- [x] Standalone Nyxen chat page (/nyxen)
- [x] Credits page

## API Endpoints
- GET /api/health, /api/voices, /api/voice-sample/{id}
- POST /api/chat, /api/chat/stream
- POST /api/stt
- POST /api/tts, /api/batch-tts, /api/stream-tts
- POST /api/compare, /api/audiobook, /api/upload
- GET /api/history, /api/history/export
- GET /api/audio/{id}
- CRUD /api/conversations
- CRUD /api/stories
- CRUD /api/documents
- POST /api/ai/rewrite, /api/ai/format
- POST /api/ai/generate-story, /api/ai/continue-story, /api/ai/edit-suggestions
- POST /api/ai/generate-image, /api/ai/generate-illustration
- GET /api/ai/images, /api/ai/images/story/{id}

## Pages
- ChatPage — AI chat with voice input (STT)
- StoryStudioPage — AI story generation, editing, illustrations
- DocumentEditorPage — Document editing with AI rewrite/format
- ImageGeneratorPage — Text-to-image generation
- VoiceStudioPage — TTS playground with voice selection, speed, dictation
- AudiobookPage — DOCX upload, dialogue parsing, multi-voice audiobook
- VoiceExplorerPage — Browse and preview 23 voice profiles
- CreditsPage — Credit balance and purchases
- SettingsPage — Voice and AI configuration
- NyxenStandalone — Standalone chat at /nyxen
