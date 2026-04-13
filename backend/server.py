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
from openai import AsyncOpenAI

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from voices import VOICE_PROFILES, get_voice_by_id

# Directories
GENERATIONS_DIR = ROOT_DIR / "generations"
UPLOADS_DIR = ROOT_DIR / "uploads"
GENERATIONS_DIR.mkdir(exist_ok=True)
UPLOADS_DIR.mkdir(exist_ok=True)

# Database
DB_PATH = str(ROOT_DIR / "openvoice.db")

# Clients
openai_client = AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


async def generate_speech(text: str, voice: str, speed: float = 1.0, response_format: str = "mp3") -> bytes:
    response = await openai_client.audio.speech.create(
        model="tts-1-hd",
        voice=voice,
        input=text,
        speed=speed,
        response_format=response_format,
    )
    return response.content


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


class TTSRequest(BaseModel):
    text: str
    voice_id: str
    speed: Optional[float] = None
    format: Optional[str] = "mp3"


class AudiobookRequest(BaseModel):
    text: str
    narrator_voice: Optional[str] = None
    narrator_voice_id: Optional[str] = None
    characters: Optional[list] = None
    character_voice_ids: Optional[List[str]] = None
    auto_detect: Optional[bool] = True
    format: Optional[str] = "mp3"


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


class EpubRequest(BaseModel):
    text: str
    title: str = "Untitled"
    author: str = "Unknown"


def get_voice_by_name(name: str):
    for voice in VOICE_PROFILES:
        if voice["name"].lower() == name.lower():
            return voice
    return None


def resolve_voice(identifier: str):
    voice = get_voice_by_id(identifier)
    if not voice:
        voice = get_voice_by_name(identifier)
    return voice


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
        "service": "VoiceForge TTS",
        "version": "2.0.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "voices_count": len(VOICE_PROFILES),
        "tts_engine": "OpenAI TTS HD",
    }


@api_router.get("/voices")
async def get_voices():
    public_voices = []
    for v in VOICE_PROFILES:
        pv = {k: val for k, val in v.items() if k != "sample_file"}
        public_voices.append(pv)
    return {"voices": public_voices}


@api_router.get("/voices/custom")
async def get_custom_voices():
    return [
        {"name": v["name"], "id": v["id"], "gender": v["gender"],
         "accent": v["accent"], "style": v["style"], "description": v["description"]}
        for v in VOICE_PROFILES
    ]


@api_router.get("/voice-sample/{voice_id}")
async def get_voice_sample(voice_id: str):
    voice = resolve_voice(voice_id)
    if not voice:
        raise HTTPException(status_code=404, detail="Voice not found")

    sample_text = f"Hi, I'm {voice['name']}. {voice['description']}"

    try:
        audio_bytes = await generate_speech(
            text=sample_text,
            voice=voice["openai_voice"],
            speed=voice["speed"],
            response_format="mp3"
        )
    except Exception as e:
        logger.error(f"Voice sample generation failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate voice sample")

    return StreamingResponse(
        io.BytesIO(audio_bytes),
        media_type="audio/mpeg",
        headers={"Content-Disposition": f"inline; filename={voice['name']}.mp3"}
    )


@api_router.post("/tts")
async def generate_tts(request: TTSRequest):
    voice = resolve_voice(request.voice_id)
    if not voice:
        raise HTTPException(status_code=404, detail="Voice not found")

    text = request.text[:4096]
    if not text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    speed = request.speed if request.speed else voice["speed"]
    gen_id = str(uuid.uuid4())
    resp_format = request.format if request.format in ("mp3", "wav", "opus", "aac", "flac") else "mp3"

    try:
        audio_bytes = await generate_speech(
            text=text,
            voice=voice["openai_voice"],
            speed=speed,
            response_format=resp_format,
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
            (gen_id, voice["id"], text[:500], "tts", datetime.now(timezone.utc).isoformat())
        )
        await db.commit()

    return FileResponse(output_path, media_type="audio/mpeg", filename=f"{gen_id}.mp3")


@api_router.get("/audio/{gen_id}")
async def serve_audio(gen_id: str):
    audio_path = GENERATIONS_DIR / f"{gen_id}.mp3"
    if not audio_path.exists():
        raise HTTPException(status_code=404, detail="Audio not found")
    return FileResponse(audio_path, media_type="audio/mpeg", filename=f"{gen_id}.mp3")


@api_router.post("/audiobook")
async def generate_audiobook(request: AudiobookRequest):
    narrator = None
    if request.narrator_voice:
        narrator = resolve_voice(request.narrator_voice)
    if not narrator and request.narrator_voice_id:
        narrator = resolve_voice(request.narrator_voice_id)
    if not narrator:
        narrator = VOICE_PROFILES[0] if VOICE_PROFILES else None
    if not narrator:
        raise HTTPException(status_code=404, detail="Narrator voice not found")

    text = request.text
    if not text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    char_voices = []
    if request.characters:
        for char in request.characters:
            if isinstance(char, dict) and char.get("voice_id"):
                v = resolve_voice(char["voice_id"])
                if v:
                    char_voices.append(v)
    if not char_voices and request.character_voice_ids:
        for vid in request.character_voice_ids:
            v = resolve_voice(vid)
            if v:
                char_voices.append(v)

    if not char_voices:
        char_voices = [v for v in [get_voice_by_id("voice_06"), get_voice_by_id("voice_03"), get_voice_by_id("voice_08")] if v]

    chunks = split_text_into_chunks(text, 4000)
    gen_id = str(uuid.uuid4())
    all_audio = []

    if request.auto_detect and char_voices:
        segments = parse_dialogue(text)
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
                audio_bytes = await generate_speech(text=seg_text, voice=voice["openai_voice"], speed=voice["speed"])
                all_audio.append(audio_bytes)
            except Exception as e:
                logger.error(f"Audiobook segment failed: {e}")
                continue
    else:
        for chunk in chunks:
            chunk = chunk.strip()
            if not chunk:
                continue
            try:
                audio_bytes = await generate_speech(text=chunk, voice=narrator["openai_voice"], speed=narrator["speed"])
                all_audio.append(audio_bytes)
            except Exception as e:
                logger.error(f"Audiobook chunk failed: {e}")
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
            (gen_id, narrator["id"], text[:500], "audiobook", datetime.now(timezone.utc).isoformat())
        )
        await db.commit()

    return FileResponse(output_path, media_type="audio/mpeg", filename=f"{gen_id}.mp3")


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
        "content": text,
        "text": text,
        "word_count": len(text.split()),
        "paragraph_count": len(paragraphs)
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
            headers={"Content-Disposition": "attachment; filename=voiceforge_history.csv"}
        )
    else:
        content = json_module.dumps({"generations": results, "exported_at": datetime.now(timezone.utc).isoformat()}, indent=2)
        return StreamingResponse(
            io.BytesIO(content.encode()),
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=voiceforge_history.json"}
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
        voice = resolve_voice(vid)
        if not voice:
            continue
        gen_id = str(uuid.uuid4())
        try:
            audio_bytes = await generate_speech(text=text, voice=voice["openai_voice"], speed=voice["speed"])
            output_path = GENERATIONS_DIR / f"{gen_id}.mp3"
            with open(output_path, "wb") as f:
                f.write(audio_bytes)

            async with aiosqlite.connect(DB_PATH) as db:
                await db.execute(
                    "INSERT INTO generations (id, voice_id, text, type, created_at) VALUES (?, ?, ?, ?, ?)",
                    (gen_id, voice["id"], text[:500], "compare", datetime.now(timezone.utc).isoformat())
                )
                await db.commit()

            results.append({
                "voice_id": voice["id"],
                "voice_name": voice["name"],
                "accent": voice["accent"],
                "style": voice["style"],
                "audio_url": f"/api/audio/{gen_id}",
                "gen_id": gen_id
            })
        except Exception as e:
            logger.error(f"Compare voice {vid} failed: {e}")
            results.append({
                "voice_id": voice["id"],
                "voice_name": voice["name"],
                "accent": voice["accent"],
                "style": voice["style"],
                "audio_url": None,
                "error": str(e)[:100]
            })

    return {"results": results, "text": text}


@api_router.post("/batch-tts")
async def batch_tts(request: BatchTTSRequest):
    voice = resolve_voice(request.voice_id)
    if not voice:
        raise HTTPException(status_code=404, detail="Voice not found")

    text = request.text
    if not text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    chunk_size = min(max(request.chunk_size or 4000, 500), 4096)
    chunks = split_text_into_chunks(text, chunk_size)

    gen_id = str(uuid.uuid4())
    all_audio = []

    for chunk in chunks:
        chunk = chunk.strip()
        if not chunk:
            continue
        try:
            audio_bytes = await generate_speech(text=chunk, voice=voice["openai_voice"], speed=voice["speed"])
            all_audio.append(audio_bytes)
        except Exception as e:
            logger.error(f"Batch TTS chunk failed: {e}")

    if not all_audio:
        raise HTTPException(status_code=500, detail="Failed to generate any audio chunks")

    combined = b"".join(all_audio)
    output_path = GENERATIONS_DIR / f"{gen_id}.mp3"
    with open(output_path, "wb") as f:
        f.write(combined)

    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO generations (id, voice_id, text, type, created_at) VALUES (?, ?, ?, ?, ?)",
            (gen_id, voice["id"], request.text[:500], "batch", datetime.now(timezone.utc).isoformat())
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


@api_router.post("/convert-epub")
async def convert_epub(request: EpubRequest):
    import zipfile
    text = request.text
    title = request.title
    author = request.author

    chapter_regex = re.compile(r'(?:^|\n)\s*(chapter\s+\d+[^\n]*)', re.IGNORECASE)
    matches = list(chapter_regex.finditer(text))
    chapters = []
    if matches:
        for i, match in enumerate(matches):
            start = match.start()
            end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
            ch_title = match.group(1).strip()
            ch_content = text[start:end].strip()[len(ch_title):].strip()
            chapters.append({"title": ch_title, "content": ch_content})
    else:
        chapters.append({"title": title, "content": text})

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr('mimetype', 'application/epub+zip', compress_type=zipfile.ZIP_STORED)
        zf.writestr('META-INF/container.xml', '''<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>''')
        manifest_items = []
        spine_items = []
        for i, ch in enumerate(chapters):
            fname = f"chapter{i+1}.xhtml"
            content_html = ch["content"].replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            body = "\n".join(f"<p>{p.strip()}</p>" for p in content_html.split("\n") if p.strip())
            ch_title_escaped = ch["title"].replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            xhtml = f'''<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>{ch_title_escaped}</title></head>
<body><h1>{ch_title_escaped}</h1>{body}</body>
</html>'''
            zf.writestr(f'OEBPS/{fname}', xhtml)
            manifest_items.append(f'<item id="ch{i+1}" href="{fname}" media-type="application/xhtml+xml"/>')
            spine_items.append(f'<itemref idref="ch{i+1}"/>')

        title_escaped = title.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        author_escaped = author.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        opf = f'''<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:uuid:{uuid.uuid4()}</dc:identifier>
    <dc:title>{title_escaped}</dc:title>
    <dc:creator>{author_escaped}</dc:creator>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">{datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}</meta>
  </metadata>
  <manifest>{"".join(manifest_items)}</manifest>
  <spine>{"".join(spine_items)}</spine>
</package>'''
        zf.writestr('OEBPS/content.opf', opf)

    buf.seek(0)
    safe_title = re.sub(r'[^a-zA-Z0-9 ]', '', title).replace(' ', '_') or 'book'
    return StreamingResponse(buf, media_type="application/epub+zip",
        headers={"Content-Disposition": f'attachment; filename="{safe_title}.epub"'})


# Include router
app.include_router(api_router)

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
    logger.info("VoiceForge TTS API started successfully")
