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
import asyncio
from datetime import datetime, timezone
from pathlib import Path
from pydantic import BaseModel
from typing import List, Optional
import aiosqlite
from openai import AsyncOpenAI

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from voices import VOICE_PROFILES, get_voice_by_id

GENERATIONS_DIR = ROOT_DIR / "generations"
UPLOADS_DIR = ROOT_DIR / "uploads"
GENERATIONS_DIR.mkdir(exist_ok=True)
UPLOADS_DIR.mkdir(exist_ok=True)

DB_PATH = str(ROOT_DIR / "openvoice.db")
openai_client = AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

RUNPOD_API = os.environ.get("RUNPOD_API_URL", "https://qezhr3d59svgui-7860.proxy.runpod.net")

audiobook_jobs = {}


async def generate_speech(text: str, voice: str, speed: float = 1.0, response_format: str = "mp3") -> bytes:
    import httpx
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            RUNPOD_API + "/api/tts",
            json={"text": text, "voice_id": voice, "speed": speed, "format": response_format}
        )
        if resp.status_code == 200:
            return resp.content
        raise Exception(f"RunPod TTS failed: {resp.status_code} {resp.text}")


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


def get_voice_by_openai_name(openai_voice: str):
    for voice in VOICE_PROFILES:
        if voice.get("openai_voice", "").lower() == openai_voice.lower():
            return voice
    return None


def resolve_voice(identifier: str):
    if not identifier:
        return VOICE_PROFILES[0] if VOICE_PROFILES else None
    voice = get_voice_by_id(identifier)
    if voice:
        return voice
    voice = get_voice_by_name(identifier)
    if voice:
        return voice
    voice = get_voice_by_openai_name(identifier)
    if voice:
        return voice
    return VOICE_PROFILES[0] if VOICE_PROFILES else None


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


async def run_audiobook_job(job_id: str, request: AudiobookRequest):
    job = audiobook_jobs[job_id]
    job["status"] = "processing"
    try:
        narrator = None
        if request.narrator_voice:
            narrator = resolve_voice(request.narrator_voice)
        if not narrator and request.narrator_voice_id:
            narrator = resolve_voice(request.narrator_voice_id)
        if not narrator:
            narrator = VOICE_PROFILES[0] if VOICE_PROFILES else None
        if not narrator:
            job["status"] = "error"
            job["error"] = "No voices available"
            return

        # Use voice name for RunPod, openai_voice as fallback
        narrator_voice_key = narrator.get("name", narrator.get("openai_voice", "alloy"))

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

        if request.auto_detect and char_voices:
            raw_segments = parse_dialogue(request.text)
            merged = []
            current_type = None
            current_text = []
            current_len = 0
            for seg in raw_segments:
                seg_text = seg["text"].strip()
                if not seg_text:
                    continue
                if seg["type"] == current_type and current_len + len(seg_text) < 3000:
                    current_text.append(seg_text)
                    current_len += len(seg_text)
                else:
                    if current_text:
                        merged.append({"type": current_type, "text": " ".join(current_text)})
                    current_type = seg["type"]
                    current_text = [seg_text]
                    current_len = len(seg_text)
            if current_text:
                merged.append({"type": current_type, "text": " ".join(current_text)})
            segments = merged
        else:
            chunks = split_text_into_chunks(request.text, 4000)
            segments = [{"type": "narration", "text": c} for c in chunks]

        total = len([s for s in segments if s["text"].strip()])
        job["total"] = total
        job["completed"] = 0

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
                voice_key = voice.get("name", voice.get("openai_voice", "alloy"))
                audio_bytes = await generate_speech(
                    text=seg_text,
                    voice=voice_key,
                    speed=voice.get("speed", 1.0)
                )
                all_audio.append(audio_bytes)
                job["completed"] += 1
                job["progress"] = round((job["completed"] / total) * 100)
            except Exception as e:
                logger.error(f"Segment failed: {e}")
                job["completed"] += 1
                continue

        if not all_audio:
            job["status"] = "error"
            job["error"] = "Failed to generate any audio"
            return

        combined = b"".join(all_audio)
        output_path = GENERATIONS_DIR / f"{job_id}.mp3"
        with open(output_path, "wb") as f:
            f.write(combined)

        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute(
                "INSERT INTO generations (id, voice_id, text, type, created_at) VALUES (?, ?, ?, ?, ?)",
                (job_id, narrator["id"], request.text[:500], "audiobook", datetime.now(timezone.utc).isoformat())
            )
            await db.commit()

        job["status"] = "complete"
        job["audio_url"] = f"/api/audio/{job_id}"
        job["narrator_voice"] = narrator["name"]
        job["segments_count"] = len(all_audio)
        job["progress"] = 100

    except Exception as e:
        logger.error(f"Audiobook job failed: {e}")
        job["status"] = "error"
        job["error"] = str(e)


@api_router.get("/health")
async def health():
    return {
        "status": "healthy",
        "service": "VoiceForge TTS",
        "version": "2.1.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "voices_count": len(VOICE_PROFILES),
        "tts_engine": "OpenAI TTS HD",
    }


@api_router.get("/voices")
async def get_voices():
    import httpx
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(RUNPOD_API + "/api/voices/custom")
            if resp.status_code == 200:
                runpod_voices = resp.json()
                voices = []
                for v in runpod_voices:
                    name = v.get("name", "")
                    parts = name.rsplit(" ", 2)
                    accent = " ".join(parts[1:]) if len(parts) > 1 else "English-US"
                    voices.append({
                        "id": v.get("id", name),
                        "name": name,
                        "gender": "neutral",
                        "style": "narrator",
                        "accent": accent,
                        "description": v.get("description", name + " voice")
                    })
                return {"voices": voices}
    except Exception as e:
        logger.warning(f"RunPod voices fetch failed: {e}, using local profiles")
    # Fallback to local voices
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
    import httpx
    # Try RunPod voice sample first
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(RUNPOD_API + "/api/voice-sample/" + voice_id)
            if resp.status_code == 200:
                return StreamingResponse(
                    io.BytesIO(resp.content),
                    media_type="audio/mpeg",
                    headers={"Content-Disposition": f"inline; filename={voice_id}.mp3"}
                )
    except Exception as e:
        logger.warning(f"RunPod voice sample failed: {e}")
    # Fallback to local
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
        audio_bytes = await generate_speech(text=text, voice=voice["openai_voice"], speed=speed, response_format=resp_format)
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
    gen_id = re.sub(r'[^a-zA-Z0-9\-]', '', gen_id)
    audio_path = GENERATIONS_DIR / f"{gen_id}.mp3"
    if not audio_path.exists():
        raise HTTPException(status_code=404, detail="Audio not found")
    return FileResponse(audio_path, media_type="audio/mpeg", filename=f"{gen_id}.mp3")


@api_router.post("/audiobook")
async def generate_audiobook(request: AudiobookRequest):
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")
    job_id = str(uuid.uuid4())
    audiobook_jobs[job_id] = {
        "status": "queued",
        "progress": 0,
        "completed": 0,
        "total": 0,
        "audio_url": None,
        "error": None,
        "narrator_voice": None,
        "segments_count": 0,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    asyncio.create_task(run_audiobook_job(job_id, request))
    return {"job_id": job_id, "status": "queued"}


@api_router.get("/audiobook/status/{job_id}")
async def audiobook_status(job_id: str):
    job_id = re.sub(r'[^a-zA-Z0-9\-]', '', job_id)
    if job_id not in audiobook_jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    return audiobook_jobs[job_id]


@api_router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    filename = file.filename.lower()
    if not (filename.endswith('.docx') or filename.endswith('.epub')):
        raise HTTPException(status_code=400, detail="Only .docx and .epub files are supported")
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="File is empty")
    if filename.endswith('.docx'):
        try:
            from docx import Document
            doc = Document(io.BytesIO(content))
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid or corrupted .docx file")
        paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
        text = "\n\n".join(paragraphs)
    elif filename.endswith('.epub'):
        try:
            import ebooklib
            from ebooklib import epub
            from html.parser import HTMLParser

            class _TextExtractor(HTMLParser):
                def __init__(self):
                    super().__init__()
                    self.chunks = []
                def handle_data(self, data):
                    stripped = data.strip()
                    if stripped:
                        self.chunks.append(stripped)

            book = epub.read_epub(io.BytesIO(content))
            parts = []
            for item in book.get_items_of_type(ebooklib.ITEM_DOCUMENT):
                raw_html = item.get_content().decode('utf-8', errors='ignore')
                parser = _TextExtractor()
                parser.feed(raw_html)
                chunk = "\n".join(parser.chunks).strip()
                if chunk:
                    parts.append(chunk)
            text = "\n\n".join(parts)
        except ImportError:
            raise HTTPException(status_code=500, detail="EPUB support not installed. Run: pip install ebooklib")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid or corrupted .epub file: {str(e)}")
    if not text.strip():
        raise HTTPException(status_code=400, detail="No readable text found in file")
    return {
        "filename": file.filename,
        "content": text,
        "text": text,
        "word_count": len(text.split()),
        "paragraph_count": len(text.split("\n\n"))
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
        zf.writestr('META-INF/container.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n  <rootfiles>\n    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>\n  </rootfiles>\n</container>')
        manifest_items = []
        spine_items = []
        for i, ch in enumerate(chapters):
            fname = f"chapter{i+1}.xhtml"
            content_html = ch["content"].replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            body = "\n".join(f"<p>{p.strip()}</p>" for p in content_html.split("\n") if p.strip())
            ch_title_escaped = ch["title"].replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            xhtml = f'<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml">\n<head><title>{ch_title_escaped}</title></head>\n<body><h1>{ch_title_escaped}</h1>{body}</body>\n</html>'
            zf.writestr(f'OEBPS/{fname}', xhtml)
            manifest_items.append(f'<item id="ch{i+1}" href="{fname}" media-type="application/xhtml+xml"/>')
            spine_items.append(f'<itemref idref="ch{i+1}"/>')
        title_escaped = title.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        author_escaped = author.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        opf = f'<?xml version="1.0" encoding="UTF-8"?>\n<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">\n  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n    <dc:identifier id="uid">urn:uuid:{uuid.uuid4()}</dc:identifier>\n    <dc:title>{title_escaped}</dc:title>\n    <dc:creator>{author_escaped}</dc:creator>\n    <dc:language>en</dc:language>\n    <meta property="dcterms:modified">{datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}</meta>\n  </metadata>\n  <manifest>{"".join(manifest_items)}</manifest>\n  <spine>{"".join(spine_items)}</spine>\n</package>'
        zf.writestr('OEBPS/content.opf', opf)
    buf.seek(0)
    safe_title = re.sub(r'[^a-zA-Z0-9 ]', '', title).replace(' ', '_') or 'book'
    return StreamingResponse(buf, media_type="application/epub+zip",
        headers={"Content-Disposition": f'attachment; filename="{safe_title}.epub"'})


@api_router.post("/chat")
async def chat(request: ChatRequest):
    import httpx
    if not request.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    groq_key = os.environ.get("GROQ_API_KEY", "")
    if not groq_key:
        raise HTTPException(status_code=500, detail="Chat service not configured")
    session_id = request.session_id or str(uuid.uuid4())
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {groq_key}", "Content-Type": "application/json"},
                json={
                    "model": "openai/gpt-oss-20b",
                    "messages": [
                        {"role": "system", "content": "You are a helpful voice studio assistant for Cantrell Creatives. Help users with voice selection, TTS generation, and audiobook creation."},
                        {"role": "user", "content": request.message}
                    ],
                    "max_tokens": 1000
                }
            )
        data = resp.json()
        reply = data["choices"][0]["message"]["content"]
        return {"response": reply, "session_id": session_id}
    except Exception as e:
        logger.error(f"Chat failed: {e}")
        raise HTTPException(status_code=500, detail="Chat service error")


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
