from fastapi import FastAPI, APIRouter, UploadFile, File, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os
import logging
import uuid
import re
import io
import csv
import json as json_module
from datetime import datetime, timezone
from pathlib import Path
from pydantic import BaseModel
from typing import List, Optional
import aiosqlite

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from emergentintegrations.llm.openai import OpenAITextToSpeech
from groq import AsyncGroq
from voices import VOICE_PROFILES, get_voice_by_id

# Directories
SAMPLES_DIR = ROOT_DIR / "voice_samples"
GENERATIONS_DIR = ROOT_DIR / "generations"
UPLOADS_DIR = ROOT_DIR / "uploads"
SAMPLES_DIR.mkdir(exist_ok=True)
GENERATIONS_DIR.mkdir(exist_ok=True)
UPLOADS_DIR.mkdir(exist_ok=True)

# Database
DB_PATH = str(ROOT_DIR / "openvoice.db")

# Clients
tts_client = OpenAITextToSpeech(api_key=os.environ.get("EMERGENT_LLM_KEY"))
groq_client = AsyncGroq(api_key=os.environ.get("GROQ_API_KEY"))

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# Database initialization
async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS generations (
                id TEXT PRIMARY KEY,
                voice_id TEXT,
                text TEXT,
                type TEXT DEFAULT 'tts',
                created_at TEXT
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS chat_messages (
                id TEXT PRIMARY KEY,
                session_id TEXT,
                role TEXT,
                content TEXT,
                created_at TEXT
            )
        """)
        await db.commit()


# Request models
class TTSRequest(BaseModel):
    text: str
    voice_id: str
    speed: Optional[float] = None


class AudiobookRequest(BaseModel):
    text: str
    narrator_voice_id: str
    character_voice_ids: Optional[List[str]] = None


class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None


class CompareRequest(BaseModel):
    text: str
    voice_ids: List[str]


class BatchTTSRequest(BaseModel):
    text: str
    voice_id: str
    chunk_size: Optional[int] = 4000


# Helper: split text into chunks at sentence boundaries
def split_text_into_chunks(text, chunk_size=4000):
    chunks = []
    while text:
        if len(text) <= chunk_size:
            chunks.append(text)
            break
        cut = chunk_size
        for sep in ['. ', '! ', '? ', '.\n', '!\n', '?\n', '\n\n', '\n', ', ', ' ']:
            idx = text.rfind(sep, 0, chunk_size)
            if idx > chunk_size // 2:
                cut = idx + len(sep)
                break
        chunks.append(text[:cut])
        text = text[cut:]
    return chunks


# Helper: parse dialogue segments
def parse_dialogue(text: str):
    segments = []
    pattern = r'(\u201c[^\u201d]*\u201d|"[^"]*"|\'[^\']*\')'
    parts = re.split(pattern, text)
    for part in parts:
        part = part.strip()
        if not part:
            continue
        is_dialogue = (
            (part.startswith('"') and part.endswith('"')) or
            (part.startswith("'") and part.endswith("'")) or
            (part.startswith('\u201c') and part.endswith('\u201d'))
        )
        if is_dialogue:
            cleaned = part.strip('"\'\u201c\u201d\u2018\u2019')
            segments.append({"type": "dialogue", "text": cleaned})
        else:
            segments.append({"type": "narration", "text": part})
    return segments if segments else [{"type": "narration", "text": text}]


# --- Endpoints ---

@api_router.get("/health")
async def health():
    return {
        "status": "healthy",
        "service": "OpenVoice Clone",
        "version": "1.0.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "voices_count": len(VOICE_PROFILES),
        "tts_engine": "OpenAI TTS HD",
        "chat_model": "openai/gpt-oss-20b"
    }


@api_router.get("/voices")
async def get_voices():
    # Exclude internal sample_file field from response
    public_voices = []
    for v in VOICE_PROFILES:
        pv = {k: val for k, val in v.items() if k != "sample_file"}
        public_voices.append(pv)
    return {"voices": public_voices}


@api_router.get("/voice-sample/{voice_id}")
async def get_voice_sample(voice_id: str):
    voice = get_voice_by_id(voice_id)
    if not voice:
        raise HTTPException(status_code=404, detail="Voice not found")

    # Serve the custom .wav reference file
    sample_path = SAMPLES_DIR / voice["sample_file"]
    if not sample_path.exists():
        raise HTTPException(status_code=404, detail="Voice sample file not found")

    return FileResponse(sample_path, media_type="audio/wav", filename=f"{voice['name']}.wav")


@api_router.post("/tts")
async def generate_tts(request: TTSRequest):
    voice = get_voice_by_id(request.voice_id)
    if not voice:
        raise HTTPException(status_code=404, detail="Voice not found")

    text = request.text[:4096]
    if not text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    speed = request.speed if request.speed else voice["speed"]
    gen_id = str(uuid.uuid4())

    try:
        audio_bytes = await tts_client.generate_speech(
            text=text,
            model="tts-1-hd",
            voice=voice["openai_voice"],
            speed=speed,
            response_format="mp3"
        )
    except Exception as e:
        logger.error(f"TTS generation failed: {e}")
        raise HTTPException(status_code=500, detail="TTS generation failed")

    output_path = GENERATIONS_DIR / f"{gen_id}.mp3"
    with open(output_path, "wb") as f:
        f.write(audio_bytes)

    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO generations (id, voice_id, text, type, created_at) VALUES (?, ?, ?, ?, ?)",
            (gen_id, request.voice_id, text[:500], "tts", datetime.now(timezone.utc).isoformat())
        )
        await db.commit()

    return {
        "id": gen_id,
        "audio_url": f"/api/audio/{gen_id}",
        "voice_id": request.voice_id,
        "voice_name": voice["name"],
        "text_length": len(text)
    }


@api_router.get("/audio/{gen_id}")
async def serve_audio(gen_id: str):
    audio_path = GENERATIONS_DIR / f"{gen_id}.mp3"
    if not audio_path.exists():
        raise HTTPException(status_code=404, detail="Audio not found")
    return FileResponse(audio_path, media_type="audio/mpeg", filename=f"{gen_id}.mp3")


@api_router.post("/audiobook")
async def generate_audiobook(request: AudiobookRequest):
    narrator = get_voice_by_id(request.narrator_voice_id)
    if not narrator:
        raise HTTPException(status_code=404, detail="Narrator voice not found")

    text = request.text
    if not text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    # Get character voices
    char_voices = []
    if request.character_voice_ids:
        for vid in request.character_voice_ids:
            v = get_voice_by_id(vid)
            if v:
                char_voices.append(v)

    if not char_voices:
        char_voices = [
            get_voice_by_id("voice_07"),
            get_voice_by_id("voice_13"),
            get_voice_by_id("voice_19"),
        ]
        char_voices = [v for v in char_voices if v]

    segments = parse_dialogue(text)
    gen_id = str(uuid.uuid4())
    all_audio = []
    char_index = 0

    for segment in segments:
        seg_text = segment["text"].strip()[:4096]
        if not seg_text:
            continue

        if segment["type"] == "narration":
            voice = narrator
        else:
            voice = char_voices[char_index % len(char_voices)] if char_voices else narrator
            char_index += 1

        try:
            audio_bytes = await tts_client.generate_speech(
                text=seg_text,
                model="tts-1-hd",
                voice=voice["openai_voice"],
                speed=voice["speed"],
                response_format="mp3"
            )
            all_audio.append(audio_bytes)
        except Exception as e:
            logger.error(f"Audiobook segment failed: {e}")
            continue

    if not all_audio:
        raise HTTPException(status_code=500, detail="Failed to generate audiobook audio")

    combined = b"".join(all_audio)
    output_path = GENERATIONS_DIR / f"{gen_id}.mp3"
    with open(output_path, "wb") as f:
        f.write(combined)

    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO generations (id, voice_id, text, type, created_at) VALUES (?, ?, ?, ?, ?)",
            (gen_id, request.narrator_voice_id, text[:500], "audiobook", datetime.now(timezone.utc).isoformat())
        )
        await db.commit()

    return {
        "id": gen_id,
        "audio_url": f"/api/audio/{gen_id}",
        "segments_count": len(segments),
        "narrator_voice": narrator["name"],
        "character_voices": [v["name"] for v in char_voices]
    }


@api_router.post("/upload")
async def upload_docx(file: UploadFile = File(...)):
    if not file.filename.endswith('.docx'):
        raise HTTPException(status_code=400, detail="Only .docx files are supported")

    from docx import Document

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="File is empty")

    try:
        doc = Document(io.BytesIO(content))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid or corrupted .docx file")

    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
    text = "\n\n".join(paragraphs)

    return {
        "filename": file.filename,
        "text": text,
        "word_count": len(text.split()),
        "paragraph_count": len(paragraphs)
    }


@api_router.post("/chat")
async def chat(request: ChatRequest):
    session_id = request.session_id or str(uuid.uuid4())

    # Load chat history
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT role, content FROM chat_messages WHERE session_id = ? ORDER BY created_at",
            (session_id,)
        )
        rows = await cursor.fetchall()
        history = [{"role": row["role"], "content": row["content"]} for row in rows]

    messages = [
        {"role": "system", "content": "You are a helpful AI assistant for OpenVoice, a zero-shot voice cloning and text-to-speech platform. Help users with voice selection, text preparation, audiobook creation, and general questions about the platform. Be concise and helpful."}
    ]
    messages.extend(history[-20:])  # Keep last 20 messages
    messages.append({"role": "user", "content": request.message})

    try:
        completion = await groq_client.chat.completions.create(
            messages=messages,
            model="openai/gpt-oss-20b",
            temperature=0.7,
            max_tokens=1024,
        )
        response_text = completion.choices[0].message.content
    except Exception as e:
        logger.error(f"Groq chat failed: {e}")
        error_msg = str(e)
        if "401" in error_msg or "Invalid API Key" in error_msg:
            response_text = "I'm sorry, the Groq API key appears to be invalid. Please update the GROQ_API_KEY in the server configuration to use the chat feature."
        else:
            response_text = f"I encountered an error: {error_msg[:200]}. Please try again."

    # Save messages
    now = datetime.now(timezone.utc).isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO chat_messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
            (str(uuid.uuid4()), session_id, "user", request.message, now)
        )
        await db.execute(
            "INSERT INTO chat_messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
            (str(uuid.uuid4()), session_id, "assistant", response_text, now)
        )
        await db.commit()

    return {
        "response": response_text,
        "session_id": session_id
    }


@api_router.get("/history")
async def get_history():
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT id, voice_id, text, type, created_at FROM generations ORDER BY created_at DESC LIMIT 100"
        )
        rows = await cursor.fetchall()
        results = []
        for row in rows:
            item = dict(row)
            voice = get_voice_by_id(item.get("voice_id", ""))
            item["voice_name"] = voice["name"] if voice else "Unknown"
            item["audio_url"] = f"/api/audio/{item['id']}"
            results.append(item)
        return {"generations": results}


@api_router.get("/history/export")
async def export_history(format: str = "json"):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT id, voice_id, text, type, created_at FROM generations ORDER BY created_at DESC"
        )
        rows = await cursor.fetchall()
        results = []
        for row in rows:
            item = dict(row)
            voice = get_voice_by_id(item.get("voice_id", ""))
            item["voice_name"] = voice["name"] if voice else "Unknown"
            item["audio_url"] = f"/api/audio/{item['id']}"
            results.append(item)

    if format == "csv":
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=["id", "type", "voice_id", "voice_name", "text", "audio_url", "created_at"])
        writer.writeheader()
        for r in results:
            writer.writerow(r)
        content = output.getvalue()
        return StreamingResponse(
            io.BytesIO(content.encode()),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=openvoice_history.csv"}
        )
    else:
        content = json_module.dumps({"generations": results, "exported_at": datetime.now(timezone.utc).isoformat()}, indent=2)
        return StreamingResponse(
            io.BytesIO(content.encode()),
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=openvoice_history.json"}
        )


@api_router.post("/compare")
async def compare_voices(request: CompareRequest):
    if len(request.voice_ids) < 2:
        raise HTTPException(status_code=400, detail="Select at least 2 voices to compare")
    if len(request.voice_ids) > 6:
        raise HTTPException(status_code=400, detail="Maximum 6 voices for comparison")

    text = request.text[:4096]
    if not text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    results = []
    for vid in request.voice_ids:
        voice = get_voice_by_id(vid)
        if not voice:
            continue
        gen_id = str(uuid.uuid4())
        try:
            audio_bytes = await tts_client.generate_speech(
                text=text,
                model="tts-1-hd",
                voice=voice["openai_voice"],
                speed=voice["speed"],
                response_format="mp3"
            )
            output_path = GENERATIONS_DIR / f"{gen_id}.mp3"
            with open(output_path, "wb") as f:
                f.write(audio_bytes)

            async with aiosqlite.connect(DB_PATH) as db:
                await db.execute(
                    "INSERT INTO generations (id, voice_id, text, type, created_at) VALUES (?, ?, ?, ?, ?)",
                    (gen_id, vid, text[:500], "compare", datetime.now(timezone.utc).isoformat())
                )
                await db.commit()

            results.append({
                "voice_id": vid,
                "voice_name": voice["name"],
                "accent": voice["accent"],
                "style": voice["style"],
                "audio_url": f"/api/audio/{gen_id}",
                "gen_id": gen_id
            })
        except Exception as e:
            logger.error(f"Compare voice {vid} failed: {e}")
            results.append({
                "voice_id": vid,
                "voice_name": voice["name"],
                "accent": voice["accent"],
                "style": voice["style"],
                "audio_url": None,
                "error": str(e)[:100]
            })

    return {"results": results, "text": text}


@api_router.post("/batch-tts")
async def batch_tts(request: BatchTTSRequest):
    voice = get_voice_by_id(request.voice_id)
    if not voice:
        raise HTTPException(status_code=404, detail="Voice not found")

    text = request.text
    if not text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    chunk_size = min(max(request.chunk_size or 4000, 500), 4096)

    # Split text into chunks at sentence boundaries
    chunks = []
    while text:
        if len(text) <= chunk_size:
            chunks.append(text)
            break
        # Find last sentence boundary within chunk_size
        cut = chunk_size
        for sep in ['. ', '! ', '? ', '.\n', '!\n', '?\n', '\n\n', '\n', ', ', ' ']:
            idx = text.rfind(sep, 0, chunk_size)
            if idx > chunk_size // 2:
                cut = idx + len(sep)
                break
        chunks.append(text[:cut])
        text = text[cut:]

    gen_id = str(uuid.uuid4())
    all_audio = []
    completed = 0

    for chunk in chunks:
        chunk = chunk.strip()
        if not chunk:
            completed += 1
            continue
        try:
            audio_bytes = await tts_client.generate_speech(
                text=chunk,
                model="tts-1-hd",
                voice=voice["openai_voice"],
                speed=voice["speed"],
                response_format="mp3"
            )
            all_audio.append(audio_bytes)
        except Exception as e:
            logger.error(f"Batch TTS chunk failed: {e}")
        completed += 1

    if not all_audio:
        raise HTTPException(status_code=500, detail="Failed to generate any audio chunks")

    combined = b"".join(all_audio)
    output_path = GENERATIONS_DIR / f"{gen_id}.mp3"
    with open(output_path, "wb") as f:
        f.write(combined)

    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO generations (id, voice_id, text, type, created_at) VALUES (?, ?, ?, ?, ?)",
            (gen_id, request.voice_id, request.text[:500], "batch", datetime.now(timezone.utc).isoformat())
        )
        await db.commit()

    return {
        "id": gen_id,
        "audio_url": f"/api/audio/{gen_id}",
        "voice_name": voice["name"],
        "chunks_total": len(chunks),
        "chunks_generated": len(all_audio),
        "text_length": len(request.text)
    }


@api_router.post("/stream-tts")
async def stream_tts(request: BatchTTSRequest):
    voice = get_voice_by_id(request.voice_id)
    if not voice:
        raise HTTPException(status_code=404, detail="Voice not found")

    text = request.text
    if not text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    chunk_size = min(max(request.chunk_size or 4000, 500), 4096)
    chunks = split_text_into_chunks(text, chunk_size)

    async def event_generator():
        # Send start event
        yield f"data: {json_module.dumps({'type': 'start', 'total_chunks': len(chunks), 'voice_name': voice['name']})}\n\n"

        gen_ids = []
        for i, chunk in enumerate(chunks):
            chunk = chunk.strip()
            if not chunk:
                continue
            gen_id = str(uuid.uuid4())
            try:
                audio_bytes = await tts_client.generate_speech(
                    text=chunk,
                    model="tts-1-hd",
                    voice=voice["openai_voice"],
                    speed=voice["speed"],
                    response_format="mp3"
                )
                output_path = GENERATIONS_DIR / f"{gen_id}.mp3"
                with open(output_path, "wb") as f:
                    f.write(audio_bytes)
                gen_ids.append(gen_id)

                yield f"data: {json_module.dumps({'type': 'chunk', 'chunk_index': i, 'total_chunks': len(chunks), 'audio_url': f'/api/audio/{gen_id}', 'gen_id': gen_id})}\n\n"
            except Exception as e:
                logger.error(f"Stream TTS chunk {i} failed: {e}")
                yield f"data: {json_module.dumps({'type': 'error', 'chunk_index': i, 'error': str(e)[:100]})}\n\n"

        # Save combined to DB
        if gen_ids:
            combined_id = str(uuid.uuid4())
            all_audio = []
            for gid in gen_ids:
                path = GENERATIONS_DIR / f"{gid}.mp3"
                if path.exists():
                    with open(path, "rb") as f:
                        all_audio.append(f.read())
            if all_audio:
                combined_path = GENERATIONS_DIR / f"{combined_id}.mp3"
                with open(combined_path, "wb") as f:
                    f.write(b"".join(all_audio))
                async with aiosqlite.connect(DB_PATH) as db:
                    await db.execute(
                        "INSERT INTO generations (id, voice_id, text, type, created_at) VALUES (?, ?, ?, ?, ?)",
                        (combined_id, request.voice_id, request.text[:500], "stream", datetime.now(timezone.utc).isoformat())
                    )
                    await db.commit()
                yield f"data: {json_module.dumps({'type': 'done', 'combined_id': combined_id, 'combined_url': f'/api/audio/{combined_id}', 'total_generated': len(gen_ids)})}\n\n"
            else:
                yield f"data: {json_module.dumps({'type': 'done', 'total_generated': 0})}\n\n"
        else:
            yield f"data: {json_module.dumps({'type': 'done', 'total_generated': 0})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


# Include router
app.include_router(api_router)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await init_db()
    logger.info("OpenVoice Clone API started successfully")
