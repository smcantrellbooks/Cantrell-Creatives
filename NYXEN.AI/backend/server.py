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
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
import aiosqlite
from groq import AsyncGroq
from openai import AsyncOpenAI

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import httpx
from voices import VOICE_PROFILES, get_voice_by_id

# Directories
SAMPLES_DIR = ROOT_DIR / "voice_samples"
GENERATIONS_DIR = ROOT_DIR / "generations"
UPLOADS_DIR = ROOT_DIR / "uploads"
SAMPLES_DIR.mkdir(exist_ok=True)
GENERATIONS_DIR.mkdir(exist_ok=True)
UPLOADS_DIR.mkdir(exist_ok=True)

# Database
DB_PATH = str(ROOT_DIR / "nyxen.db")

# Clients
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
groq_client = AsyncGroq(api_key=os.environ.get("GROQ_API_KEY"))
openai_client = AsyncOpenAI(api_key=OPENAI_API_KEY)

# Dual-provider models: Fast/Balanced = Groq, Deep/Writing = OpenAI
GROQ_MODEL = "openai/gpt-oss-120b"
OPENAI_MODEL = "gpt-5.4-mini"

# App
app = FastAPI(title="Nyxen AI Backend", version="2.0.0")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# === NYXEN AVATAR ===
NYXEN_AVATAR = "https://cdn1.site-media.eu/images/0/24185616/nyxen-hucYBsyp6NvKtsJFls-OUg.jpg"

# === NYXEN SYSTEM PROMPTS ===
NYXEN_STORYTELLER_PROMPT = """You are Nyxen, the AI creative writing assistant for Cantrell Creatives — a publishing and creative content platform by S.M. Cantrell.

## Your Identity
- Name: Nyxen
- Role: Creative Writing Assistant (NOT a controller — you assist, enhance, and suggest)
- Home Base: Publisher Workspace
- Personality: Professional yet warm, encouraging, deeply knowledgeable about the craft of writing
- You speak with confidence and creativity, like a seasoned editor who genuinely loves stories

## CRITICAL RULE: User Is Always In Control
- You SUGGEST, ASSIST, and ENHANCE — you never take over
- You do NOT auto-generate content without being asked
- You do NOT override user choices or selections
- You do NOT control tools, assign voices, or force workflows
- The user DECIDES, SELECTS, and EXECUTES — you support them
- Flow: User ↔ Nyxen (assist) → Tool → Output
- NOT: User → Nyxen → System

## Your Role in Publisher Workspace (Home Base — Full Service)
This is where you are fully active:
- Help write and edit manuscripts
- Assist with structure — chapters, flow, dialogue, pacing
- Suggest improvements while respecting the author's voice
- Generate content ONLY when the user asks
- Help with plot development, character creation, world-building
- Assist with editing, proofreading, and formatting
- Help brainstorm ideas, names, settings, plot twists
- Guide manuscript formatting for publishing

## Your Role on Other Pages (Assistive Only)
When users are on Voice Studio, Image tools, or other pages:
- You are a guide, not a director
- Help users choose voices, suggest narrator tone if asked
- Help format text for audio
- Help write image prompts, offer style suggestions
- You do NOT assign voices automatically
- You do NOT control generation or override user choices

## Creative Writing Expertise
You are deeply knowledgeable about:
- **Story Structure**: Three-act structure, Hero's Journey, Save the Cat, Freytag's Pyramid, Kishōtenketsu, In Medias Res
- **Character Development**: Archetypes, character arcs (positive, negative, flat), motivation, backstory, dialogue voice
- **World-Building**: Setting, magic systems, political structures, cultures, geography, history
- **Genre Conventions**: Fantasy, Sci-Fi, Romance, Mystery/Thriller, Horror, Literary Fiction, YA, Children's, Historical Fiction
- **Prose Craft**: Show don't tell, pacing, tension, foreshadowing, symbolism, metaphor, voice, POV (first/third limited/third omniscient/second)
- **Dialogue**: Subtext, dialect, rhythm, attribution, internal monologue
- **Editing**: Developmental editing, line editing, copy editing, proofreading
- **Publishing**: Self-publishing, traditional publishing, query letters, synopses, book proposals, ISBNs, formatting for print/ebook
- **Poetry**: Free verse, sonnets, haiku, spoken word, rhythm and meter
- **Screenwriting**: Script format, scene structure, beat sheets

## Platform Knowledge
The Cantrell Creatives platform includes:
- **Publisher Workspace**: Manuscript writing, editing, AI-assisted content creation (your home)
- **Story Studio**: AI story generation, continuation, story library
- **Document Editor**: Writing with AI rewrite/format tools
- **Voice Studio**: 23 premium AI voices for text-to-speech (you assist with voice selection and text prep)
- **Audiobook Studio**: DOCX upload, dialogue detection, multi-voice audiobook generation
- **Image Generator**: Text-to-image with Seedream 4.5 (you help write prompts when asked)
- **Voice Explorer**: Browse and preview voice profiles

## Voice Knowledge (For Assisting Users)
23 voices available — when users ask for recommendations:
- Narration: Adam (British), Hugh (Scottish storyteller), Jane (British professional), Roger (US steady), Ms. Walker (wise)
- Children's stories: Edith (energetic), Jessica Anne (bright), Palesa (friendly)
- Horror/Thriller: Lamin (deep), Tom (Irish dramatic), Carlton (authoritative)
- Romance: Eve (warm), Linda (gentle), True (intimate), Sonya (expressive)
- Motivational: Carlton (authoritative), Scott (commander), Shayla (dynamic)
- All voices: Adam, Andrew, Carlton, Edith, Eve, Hugh, Jane, Jessica Anne, John D, Kelli, Lamin, Linda, Mandla, Ms. Walker, Palesa, Reese, Roger, Scott, Shayla, Sonya, Tom, True, Will

## Future
- Nyxen will also connect to smcantrellbooks.com (not yet implemented)

Always be helpful, professional, and encouraging. You are a creative partner sitting alongside the user — not between them and the system."""

NYXEN_ASSISTANT_PROMPT = """You are Nyxen, the AI assistant for Cantrell Creatives — a publishing and creative content platform by S.M. Cantrell.

## Your Identity
- Name: Nyxen
- Role: General Platform Assistant (NOT a controller — you assist, enhance, and suggest)
- Personality: Professional, smart, friendly, helpful — you adapt your tone to whatever the user needs

## CRITICAL RULE: User Is Always In Control
- You SUGGEST, ASSIST, and ENHANCE — you never take over
- You do NOT auto-execute actions without being asked
- You do NOT override user choices or selections
- You do NOT control tools or force workflows
- The user DECIDES, SELECTS, and EXECUTES — you support them

## What You Help With
- Answer questions about the platform and its features
- Guide users to the right tool for their task
- Help with general knowledge questions
- Assist with technical issues
- Provide writing tips and creative guidance when asked
- Help users understand voice options and recommend voices when asked
- Help write image prompts or suggest styles when asked
- Explain how features work

## Platform Knowledge
Cantrell Creatives includes:
- **Publisher Workspace**: Manuscript writing and editing (Nyxen's home base for full creative assistance)
- **Story Studio**: AI story generation and management
- **Document Editor**: Writing with AI rewrite/format tools
- **Voice Studio**: 23 premium AI voices for TTS — you help choose voices and prep text
- **Audiobook Studio**: DOCX upload, dialogue detection, multi-voice audiobooks
- **Image Generator**: Text-to-image with Seedream 4.5
- **Voice Explorer**: Browse and preview voice profiles
- **Credits**: Platform credit system for AI features

## Your Limitations
- No autonomous execution
- No background automation
- No overriding user selections
- No forced workflow changes
- You sit alongside the user, not between system layers

Be concise, helpful, and direct. If a user needs deep creative writing help, suggest they use the Publisher Workspace where you can provide full-service assistance."""


# === DATABASE INIT ===
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
            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                title TEXT DEFAULT 'New Conversation',
                mode TEXT DEFAULT 'assistant',
                created_at TEXT,
                updated_at TEXT
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS chat_messages (
                id TEXT PRIMARY KEY,
                conversation_id TEXT,
                role TEXT,
                content TEXT,
                created_at TEXT
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS stories (
                id TEXT PRIMARY KEY,
                title TEXT,
                content TEXT,
                genre TEXT DEFAULT 'General',
                word_count INTEGER DEFAULT 0,
                created_at TEXT,
                updated_at TEXT
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY,
                title TEXT,
                content TEXT,
                doc_type TEXT DEFAULT 'article',
                created_at TEXT,
                updated_at TEXT
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS generated_images (
                id TEXT PRIMARY KEY,
                prompt TEXT,
                image_url TEXT,
                style TEXT DEFAULT 'realistic',
                story_id TEXT,
                chapter_title TEXT,
                created_at TEXT
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS user_memory (
                id TEXT PRIMARY KEY,
                user_id TEXT DEFAULT 'default',
                category TEXT,
                key TEXT,
                value TEXT,
                created_at TEXT,
                updated_at TEXT
            )
        """)
        await db.execute("CREATE INDEX IF NOT EXISTS idx_memory_user ON user_memory(user_id)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_memory_category ON user_memory(user_id, category)")
        await db.commit()


# === REQUEST MODELS ===
class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    conversation_id: Optional[str] = None
    mode: str = "assistant"  # "assistant" or "storyteller"
    response_mode: str = "balanced"  # "fast", "balanced", "deep"
    temperature: float = 0.7
    max_tokens: int = 1024

class TTSRequest(BaseModel):
    text: str
    voice_id: str
    speed: Optional[float] = None

class BatchTTSRequest(BaseModel):
    text: str
    voice_id: str
    chunk_size: Optional[int] = 4000

class AudiobookRequest(BaseModel):
    text: str
    narrator_voice_id: str
    character_voice_ids: Optional[List[str]] = None

class CompareRequest(BaseModel):
    text: str
    voice_ids: List[str]

class StoryCreate(BaseModel):
    title: str
    content: str
    genre: str = "General"

class StoryUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    genre: Optional[str] = None

class DocumentCreate(BaseModel):
    title: str
    content: str
    doc_type: str = "article"

class RewriteRequest(BaseModel):
    text: str
    style: str = "professional"

class FormatRequest(BaseModel):
    text: str
    format_type: str = "paragraphs"

class ImageGenerationRequest(BaseModel):
    prompt: str
    style: str = "realistic"
    model: str = "imagen4"  # "imagen4" or "seedream"

class StoryIllustrationRequest(BaseModel):
    story_id: str
    chapter_content: str
    chapter_title: str = "Chapter"
    style: str = "fantasy"

class MemoryStore(BaseModel):
    category: str  # "preference", "project", "style", "fact", "note"
    key: str
    value: str

class MemoryQuery(BaseModel):
    user_id: str = "default"
    category: Optional[str] = None


# === MEMORY HELPERS ===
async def get_user_memories(user_id: str = "default", limit: int = 50) -> List[dict]:
    """Load all memories for a user."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT category, key, value FROM user_memory WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?",
            (user_id, limit)
        )
        return [dict(row) for row in await cursor.fetchall()]


async def save_memory(user_id: str, category: str, key: str, value: str):
    """Save or update a memory."""
    now = datetime.now(timezone.utc).isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        existing = await db.execute(
            "SELECT id FROM user_memory WHERE user_id = ? AND category = ? AND key = ?",
            (user_id, category, key)
        )
        row = await existing.fetchone()
        if row:
            await db.execute(
                "UPDATE user_memory SET value = ?, updated_at = ? WHERE user_id = ? AND category = ? AND key = ?",
                (value, now, user_id, category, key)
            )
        else:
            await db.execute(
                "INSERT INTO user_memory (id, user_id, category, key, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (str(uuid.uuid4()), user_id, category, key, value, now, now)
            )
        await db.commit()


async def extract_and_save_memories(user_id: str, user_message: str, assistant_response: str):
    """Use AI to extract memorable facts from the conversation and save them."""
    try:
        extraction = await groq_client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[
                {"role": "system", "content": """Extract any important facts worth remembering from this conversation exchange. Return a JSON array of objects with "category", "key", and "value" fields.

Categories: "preference" (user likes/dislikes), "project" (current work, story details), "style" (writing style preferences), "fact" (personal facts like name, genre preferences), "note" (anything else important)

Only extract genuinely useful information. If nothing worth remembering, return an empty array [].
Return ONLY valid JSON, no explanation."""},
                {"role": "user", "content": f"User said: {user_message}\n\nAssistant replied: {assistant_response[:500]}"}
            ],
            temperature=0.3, max_tokens=500,
        )
        content = extraction.choices[0].message.content.strip()
        # Parse JSON from response
        if content.startswith("["):
            memories = json_module.loads(content)
            for mem in memories:
                if isinstance(mem, dict) and "category" in mem and "key" in mem and "value" in mem:
                    await save_memory(user_id, mem["category"], mem["key"], mem["value"])
    except Exception as e:
        logger.debug(f"Memory extraction skipped: {e}")


def format_memories_for_prompt(memories: List[dict]) -> str:
    """Format memories into a string for the system prompt."""
    if not memories:
        return ""
    lines = ["\n## What You Remember About This User"]
    by_category = {}
    for m in memories:
        cat = m["category"]
        if cat not in by_category:
            by_category[cat] = []
        by_category[cat].append(f"- {m['key']}: {m['value']}")
    for cat, items in by_category.items():
        lines.append(f"**{cat.title()}**:")
        lines.extend(items)
    return "\n".join(lines)


# === WRITING CLASSIFICATION & FEATURES (Nyara-style) ===
WRITING_KEYWORDS = [
    "write a scene", "write a chapter", "write the next",
    "next scene", "next chapter", "continue the story",
    "continue writing", "pick up where", "carry on from",
    "write me a story", "tell me a story"
]

def classify_input(text: str) -> str:
    """Classify if user input is a writing request or a question."""
    lower = text.lower()
    if any(kw in lower for kw in WRITING_KEYWORDS):
        return "writing"
    return "question"


def _token_overlap(a: str, b: str) -> float:
    """Detect repetitive/looping responses."""
    if not a or not b:
        return 0.0
    tokens_a = set(a.lower().split())
    tokens_b = set(b.lower().split())
    if not tokens_a or not tokens_b:
        return 0.0
    intersection = tokens_a & tokens_b
    return len(intersection) / min(len(tokens_a), len(tokens_b))


async def auto_extract_memory_rules(user_msg: str, user_id: str):
    """Auto-detect preferences and decisions without AI call (fast, rule-based)."""
    lower = user_msg.lower()

    # Writing pace
    if any(x in lower for x in ["write shorter", "too long", "shorter parts", "less words"]):
        await save_memory(user_id, "preference", "writing_pace", "user prefers shorter — stay under 800 words per part")
    elif any(x in lower for x in ["write longer", "more detail", "too short", "expand more"]):
        await save_memory(user_id, "preference", "writing_pace", "user prefers longer — aim for 1200+ words per part")

    # Dialogue preference
    if any(x in lower for x in ["too much dialogue", "less dialogue"]):
        await save_memory(user_id, "preference", "dialogue_pref", "reduce dialogue — more action and description")
    elif any(x in lower for x in ["more dialogue", "not enough dialogue"]):
        await save_memory(user_id, "preference", "dialogue_pref", "increase dialogue — characters talking more")

    # User name
    import re as _rm
    name_match = _rm.search(r"(?:my name is|i am|i'm|call me)\s+([A-Z][a-z]+)", user_msg)
    if name_match:
        await save_memory(user_id, "fact", "user_name", name_match.group(1))

    # Positive/negative feedback
    if any(x in lower for x in ["i loved that", "perfect", "exactly right", "that was great", "yes that"]):
        await save_memory(user_id, "note", "last_liked", user_msg[:120])
    elif any(x in lower for x in ["that's wrong", "not right", "fix this", "that's not", "incorrect"]):
        await save_memory(user_id, "note", "last_corrected", user_msg[:120])

    # Story decisions
    decision_markers = ["let's make", "let's keep", "make sure", "don't let her", "don't let him",
                        "she should always", "he should always", "i want her to", "i want him to"]
    for marker in decision_markers:
        if marker in lower:
            idx = lower.find(marker)
            decision = user_msg[idx:idx+120].strip()
            key = f"story_note_{abs(hash(decision)) % 9999}"
            await save_memory(user_id, "project", key, decision)
            break


def process_ai_response(reply: str) -> tuple:
    """Extract [REMEMBER:] and [GENERATE_IMAGE:] tags from AI response."""
    # Extract memory tags
    mem_matches = re.findall(r'\[REMEMBER:\s*(.+?)\s*=\s*(.+?)\]', reply)
    clean_reply = re.sub(r'\[REMEMBER:\s*.+?\s*=\s*.+?\]', '', reply).strip()

    # Extract image generation tags
    img_matches = re.findall(r'\[GENERATE_IMAGE:\s*(.+?)\]', clean_reply)
    clean_reply = re.sub(r'\[GENERATE_IMAGE:\s*.+?\]', '', clean_reply).strip()

    return clean_reply, mem_matches, img_matches


WRITING_RULES_BLOCK = """
WRITING RULES (ACTIVE — follow these for every writing output):

PRE-WRITE CHECKLIST (internal — do NOT show in output):
□ What is the PURPOSE of this scene? (plot / character / tension / reveal)
□ What does each character WANT in this scene?
□ What is the EMOTIONAL temperature? (charged / tender / tense / quiet)
□ How does this scene connect to what came before and after?
□ What single DETAIL will make this scene unforgettable?

STRUCTURE:
- Open with a grounded environment description that places the reader immediately
- Follow with character actions and physical details
- Weave in internal reactions and emotional undercurrents
- Dialogue: 40% maximum. Every line must reveal character or advance plot.
- End each part on a beat that makes the reader need the next one

STYLE:
- Show don't tell. Every sentence earns its place. No filler. No rushing.
- Stories should be vivid, immersive, and emotionally compelling
- Match the energy of the genre and tone the user is working in

FORMAT:
- No markdown symbols (no **, no ##, no --)
- Scene break: ✦  ✦  ✦
- End with: word count + "Ready to continue? Tell me the next part title."

HARD STOP RULE (non-negotiable):
Write ONE part only then STOP completely. Do NOT continue writing.
Do NOT write the next part. Do NOT add more scenes. WAIT for the user.

WORD COUNT TARGET: 800–1200 words for deep mode, ~400 words for fast/balanced.

MEMORY INSTRUCTIONS:
When the user tells you something worth remembering, include: [REMEMBER: key = value]

IMAGE GENERATION:
When the user asks to generate/create/draw/make an image, include: [GENERATE_IMAGE: detailed description]
"""


# === HELPERS ===
async def generate_tts_audio(text: str, voice: str, speed: float = 1.0, response_format: str = "mp3") -> bytes:
    """Generate TTS audio using OpenAI API directly."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            "https://api.openai.com/v1/audio/speech",
            headers={"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"},
            json={"model": "tts-1-hd", "input": text, "voice": voice, "speed": speed, "response_format": response_format}
        )
        if response.status_code != 200:
            raise Exception(f"OpenAI TTS failed: {response.status_code} {response.text[:200]}")
        return response.content


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


# === HEALTH & VOICES ===
@api_router.get("/health")
async def health():
    return {
        "status": "healthy",
        "service": "Nyxen AI",
        "version": "2.0.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "voices_count": len(VOICE_PROFILES),
        "avatar": NYXEN_AVATAR,
        "tts_engine": "OpenAI TTS HD",
        "chat_model": "openai/gpt-oss-20b",
        "stt_model": "whisper-large-v3-turbo"
    }


@api_router.get("/voices")
async def get_voices():
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
    sample_path = SAMPLES_DIR / voice["sample_file"]
    if not sample_path.exists():
        raise HTTPException(status_code=404, detail="Voice sample file not found")
    return FileResponse(sample_path, media_type="audio/wav", filename=f"{voice['name']}.wav")


# === CHAT (Dual-Provider: Fast/Balanced = Groq, Deep = OpenAI) ===
@api_router.post("/chat")
async def chat(request: ChatRequest):
    conversation_id = request.conversation_id or str(uuid.uuid4())
    user_id = "default"  # TODO: replace with real user auth
    system_prompt = NYXEN_STORYTELLER_PROMPT if request.mode == "storyteller" else NYXEN_ASSISTANT_PROMPT

    # Load user memories and inject into system prompt
    memories = await get_user_memories(user_id)
    memory_context = format_memories_for_prompt(memories)
    full_system_prompt = system_prompt + memory_context

    # Load history if existing conversation
    history = []
    if request.conversation_id:
        async with aiosqlite.connect(DB_PATH) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute(
                "SELECT role, content FROM chat_messages WHERE conversation_id = ? ORDER BY created_at",
                (conversation_id,)
            )
            rows = await cursor.fetchall()
            history = [{"role": row["role"], "content": row["content"]} for row in rows]

    messages = [{"role": "system", "content": full_system_prompt}]
    messages.extend(history[-20:])
    messages.extend([{"role": m.role, "content": m.content} for m in request.messages])

    # Dual-provider: Deep/Writing = OpenAI, Fast/Balanced = Groq
    use_openai = request.response_mode == "deep"
    max_tok = 4096 if use_openai else min(request.max_tokens, 1024)

    try:
        if use_openai:
            # Deep mode — OpenAI gpt-5.4-mini
            try:
                completion = await openai_client.chat.completions.create(
                    messages=messages,
                    model=OPENAI_MODEL,
                    temperature=request.temperature,
                    max_tokens=max_tok,
                )
                response_text = completion.choices[0].message.content
                logger.info(f"[OpenAI {OPENAI_MODEL}] responded")
            except Exception as e:
                logger.error(f"OpenAI failed, falling back to Groq: {e}")
                completion = await groq_client.chat.completions.create(
                    messages=messages,
                    model=GROQ_MODEL,
                    temperature=request.temperature,
                    max_tokens=max_tok,
                )
                response_text = completion.choices[0].message.content
        else:
            # Fast/Balanced — Groq
            completion = await groq_client.chat.completions.create(
                messages=messages,
                model=GROQ_MODEL,
                temperature=request.temperature,
                max_tokens=max_tok,
            )
            response_text = completion.choices[0].message.content
            logger.info(f"[Groq {GROQ_MODEL}] responded")
    except Exception as e:
        logger.error(f"Chat failed: {e}")
        response_text = f"I encountered an error: {str(e)[:200]}. Please try again."

    # Save conversation and messages
    now = datetime.now(timezone.utc).isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT OR IGNORE INTO conversations (id, title, mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            (conversation_id, "New Conversation", request.mode, now, now)
        )
        for m in request.messages:
            await db.execute(
                "INSERT INTO chat_messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
                (str(uuid.uuid4()), conversation_id, m.role, m.content, now)
            )
        await db.execute(
            "INSERT INTO chat_messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
            (str(uuid.uuid4()), conversation_id, "assistant", response_text, now)
        )
        await db.execute("UPDATE conversations SET updated_at = ? WHERE id = ?", (now, conversation_id))
        await db.commit()

    # Extract and save memories in background (non-blocking)
    user_msg = request.messages[-1].content if request.messages else ""
    try:
        await extract_and_save_memories(user_id, user_msg, response_text)
    except Exception:
        pass  # Don't fail the chat if memory extraction fails

    return {
        "response": response_text,
        "conversation_id": conversation_id,
        "content": response_text,
        "created_at": now
    }


@api_router.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    system_prompt = NYXEN_STORYTELLER_PROMPT if request.mode == "storyteller" else NYXEN_ASSISTANT_PROMPT
    messages = [{"role": "system", "content": system_prompt}]
    messages.extend([{"role": m.role, "content": m.content} for m in request.messages])

    use_openai = request.response_mode == "deep"
    max_tok = 4096 if use_openai else min(request.max_tokens, 1024)

    async def generate():
        try:
            if use_openai:
                stream = await openai_client.chat.completions.create(
                    messages=messages,
                    model=OPENAI_MODEL,
                    temperature=request.temperature,
                    max_tokens=max_tok,
                    stream=True
                )
            else:
                stream = await groq_client.chat.completions.create(
                    messages=messages,
                    model=GROQ_MODEL,
                    temperature=request.temperature,
                    max_tokens=max_tok,
                    stream=True
                )
            async for chunk in stream:
                if chunk.choices[0].delta.content:
                    data = {"content": chunk.choices[0].delta.content, "done": False}
                    yield f"data: {json_module.dumps(data)}\n\n"
                if chunk.choices[0].finish_reason:
                    data = {"content": "", "done": True, "finish_reason": chunk.choices[0].finish_reason}
                    yield f"data: {json_module.dumps(data)}\n\n"
        except Exception as e:
            logger.error(f"Stream error: {e}")
            yield f"data: {json_module.dumps({'content': str(e)[:200], 'done': True, 'error': True})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "Connection": "keep-alive"})


# === STT (whisper-large-v3-turbo via Groq) ===
@api_router.post("/stt")
async def speech_to_text(file: UploadFile = File(...)):
    audio_data = await file.read()
    if not audio_data:
        raise HTTPException(status_code=400, detail="Audio file is empty")

    try:
        transcription = await groq_client.audio.transcriptions.create(
            file=(file.filename, audio_data),
            model="whisper-large-v3-turbo",
            response_format="json"
        )
        return {"text": transcription.text}
    except Exception as e:
        logger.error(f"STT failed: {e}")
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)[:200]}")


# === TTS ===
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
        audio_bytes = await generate_tts_audio(
            text=text, voice=voice["openai_voice"],
            speed=speed, response_format="mp3"
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
        "id": gen_id, "audio_url": f"/api/audio/{gen_id}",
        "voice_id": request.voice_id, "voice_name": voice["name"], "text_length": len(text)
    }


@api_router.get("/audio/{gen_id}")
async def serve_audio(gen_id: str):
    audio_path = GENERATIONS_DIR / f"{gen_id}.mp3"
    if not audio_path.exists():
        raise HTTPException(status_code=404, detail="Audio not found")
    return FileResponse(audio_path, media_type="audio/mpeg", filename=f"{gen_id}.mp3")


# === BATCH TTS ===
@api_router.post("/batch-tts")
async def batch_tts(request: BatchTTSRequest):
    voice = get_voice_by_id(request.voice_id)
    if not voice:
        raise HTTPException(status_code=404, detail="Voice not found")
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    chunk_size = min(max(request.chunk_size or 4000, 500), 4096)
    chunks = split_text_into_chunks(request.text, chunk_size)
    gen_id = str(uuid.uuid4())
    all_audio = []

    for chunk in chunks:
        chunk = chunk.strip()
        if not chunk:
            continue
        try:
            audio_bytes = await generate_tts_audio(
                text=chunk, voice=voice["openai_voice"],
                speed=voice["speed"], response_format="mp3"
            )
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
            (gen_id, request.voice_id, request.text[:500], "batch", datetime.now(timezone.utc).isoformat())
        )
        await db.commit()

    return {
        "id": gen_id, "audio_url": f"/api/audio/{gen_id}", "voice_name": voice["name"],
        "chunks_total": len(chunks), "chunks_generated": len(all_audio), "text_length": len(request.text)
    }


# === STREAMING TTS ===
@api_router.post("/stream-tts")
async def stream_tts(request: BatchTTSRequest):
    voice = get_voice_by_id(request.voice_id)
    if not voice:
        raise HTTPException(status_code=404, detail="Voice not found")
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    chunk_size = min(max(request.chunk_size or 4000, 500), 4096)
    chunks = split_text_into_chunks(request.text, chunk_size)

    async def event_generator():
        yield f"data: {json_module.dumps({'type': 'start', 'total_chunks': len(chunks), 'voice_name': voice['name']})}\n\n"
        gen_ids = []
        for i, chunk in enumerate(chunks):
            chunk = chunk.strip()
            if not chunk:
                continue
            gid = str(uuid.uuid4())
            try:
                audio_bytes = await generate_tts_audio(
                    text=chunk, voice=voice["openai_voice"],
                    speed=voice["speed"], response_format="mp3"
                )
                path = GENERATIONS_DIR / f"{gid}.mp3"
                with open(path, "wb") as f:
                    f.write(audio_bytes)
                gen_ids.append(gid)
                yield f"data: {json_module.dumps({'type': 'chunk', 'chunk_index': i, 'total_chunks': len(chunks), 'audio_url': f'/api/audio/{gid}', 'gen_id': gid})}\n\n"
            except Exception as e:
                logger.error(f"Stream TTS chunk {i} failed: {e}")
                yield f"data: {json_module.dumps({'type': 'error', 'chunk_index': i, 'error': str(e)[:100]})}\n\n"

        if gen_ids:
            combined_id = str(uuid.uuid4())
            all_audio = []
            for gid in gen_ids:
                p = GENERATIONS_DIR / f"{gid}.mp3"
                if p.exists():
                    with open(p, "rb") as f:
                        all_audio.append(f.read())
            if all_audio:
                with open(GENERATIONS_DIR / f"{combined_id}.mp3", "wb") as f:
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


# === VOICE COMPARE ===
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
            audio_bytes = await generate_tts_audio(
                text=text, voice=voice["openai_voice"],
                speed=voice["speed"], response_format="mp3"
            )
            with open(GENERATIONS_DIR / f"{gen_id}.mp3", "wb") as f:
                f.write(audio_bytes)
            async with aiosqlite.connect(DB_PATH) as db:
                await db.execute(
                    "INSERT INTO generations (id, voice_id, text, type, created_at) VALUES (?, ?, ?, ?, ?)",
                    (gen_id, vid, text[:500], "compare", datetime.now(timezone.utc).isoformat())
                )
                await db.commit()
            results.append({
                "voice_id": vid, "voice_name": voice["name"], "accent": voice["accent"],
                "style": voice["style"], "audio_url": f"/api/audio/{gen_id}", "gen_id": gen_id
            })
        except Exception as e:
            logger.error(f"Compare voice {vid} failed: {e}")
            results.append({
                "voice_id": vid, "voice_name": voice["name"], "accent": voice["accent"],
                "style": voice["style"], "audio_url": None, "error": str(e)[:100]
            })
    return {"results": results, "text": text}


# === AUDIOBOOK STUDIO ===
@api_router.post("/audiobook")
async def generate_audiobook(request: AudiobookRequest):
    narrator = get_voice_by_id(request.narrator_voice_id)
    if not narrator:
        raise HTTPException(status_code=404, detail="Narrator voice not found")
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    char_voices = []
    if request.character_voice_ids:
        for vid in request.character_voice_ids:
            v = get_voice_by_id(vid)
            if v:
                char_voices.append(v)
    if not char_voices:
        char_voices = [get_voice_by_id("voice_07"), get_voice_by_id("voice_13"), get_voice_by_id("voice_18")]
        char_voices = [v for v in char_voices if v]

    segments = parse_dialogue(request.text)
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
            audio_bytes = await generate_tts_audio(
                text=seg_text, voice=voice["openai_voice"],
                speed=voice["speed"], response_format="mp3"
            )
            all_audio.append(audio_bytes)
        except Exception as e:
            logger.error(f"Audiobook segment failed: {e}")

    if not all_audio:
        raise HTTPException(status_code=500, detail="Failed to generate audiobook audio")

    combined = b"".join(all_audio)
    with open(GENERATIONS_DIR / f"{gen_id}.mp3", "wb") as f:
        f.write(combined)

    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO generations (id, voice_id, text, type, created_at) VALUES (?, ?, ?, ?, ?)",
            (gen_id, request.narrator_voice_id, request.text[:500], "audiobook", datetime.now(timezone.utc).isoformat())
        )
        await db.commit()

    return {
        "id": gen_id, "audio_url": f"/api/audio/{gen_id}",
        "segments_count": len(segments), "narrator_voice": narrator["name"],
        "character_voices": [v["name"] for v in char_voices]
    }


# === DOCX UPLOAD ===
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
    return {"filename": file.filename, "text": text, "word_count": len(text.split()), "paragraph_count": len(paragraphs)}


# === GENERATION HISTORY ===
@api_router.get("/history")
async def get_history():
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT id, voice_id, text, type, created_at FROM generations ORDER BY created_at DESC LIMIT 100")
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
        cursor = await db.execute("SELECT id, voice_id, text, type, created_at FROM generations ORDER BY created_at DESC")
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
        return StreamingResponse(io.BytesIO(output.getvalue().encode()), media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=nyxen_history.csv"})
    else:
        content = json_module.dumps({"generations": results, "exported_at": datetime.now(timezone.utc).isoformat()}, indent=2)
        return StreamingResponse(io.BytesIO(content.encode()), media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=nyxen_history.json"})


# === CONVERSATIONS ===
@api_router.get("/conversations")
async def get_conversations():
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM conversations ORDER BY updated_at DESC LIMIT 50")
        return [dict(row) for row in await cursor.fetchall()]


@api_router.get("/conversations/{conversation_id}")
async def get_conversation(conversation_id: str):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        conv = await db.execute("SELECT * FROM conversations WHERE id = ?", (conversation_id,))
        conv_row = await conv.fetchone()
        if not conv_row:
            raise HTTPException(status_code=404, detail="Conversation not found")
        msgs = await db.execute("SELECT role, content, created_at FROM chat_messages WHERE conversation_id = ? ORDER BY created_at", (conversation_id,))
        messages = [dict(row) for row in await msgs.fetchall()]
        result = dict(conv_row)
        result["messages"] = messages
        return result


@api_router.delete("/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM chat_messages WHERE conversation_id = ?", (conversation_id,))
        result = await db.execute("DELETE FROM conversations WHERE id = ?", (conversation_id,))
        await db.commit()
    return {"message": "Conversation deleted"}


# === STORIES ===
@api_router.post("/stories")
async def create_story(story: StoryCreate):
    story_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    word_count = len(story.content.split())
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO stories (id, title, content, genre, word_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (story_id, story.title, story.content, story.genre, word_count, now, now)
        )
        await db.commit()
    return {"id": story_id, "title": story.title, "content": story.content, "genre": story.genre, "word_count": word_count, "created_at": now, "updated_at": now}


@api_router.get("/stories")
async def get_stories():
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM stories ORDER BY updated_at DESC LIMIT 100")
        return [dict(row) for row in await cursor.fetchall()]


@api_router.get("/stories/{story_id}")
async def get_story(story_id: str):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM stories WHERE id = ?", (story_id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Story not found")
        return dict(row)


@api_router.put("/stories/{story_id}")
async def update_story(story_id: str, update: StoryUpdate):
    updates = {k: v for k, v in update.model_dump().items() if v is not None}
    if "content" in updates:
        updates["word_count"] = len(updates["content"].split())
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [story_id]
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(f"UPDATE stories SET {set_clause} WHERE id = ?", values)
        await db.commit()
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM stories WHERE id = ?", (story_id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Story not found")
        return dict(row)


@api_router.delete("/stories/{story_id}")
async def delete_story(story_id: str):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM stories WHERE id = ?", (story_id,))
        await db.commit()
    return {"message": "Story deleted"}


# === DOCUMENTS ===
@api_router.post("/documents")
async def create_document(doc: DocumentCreate):
    doc_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO documents (id, title, content, doc_type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            (doc_id, doc.title, doc.content, doc.doc_type, now, now)
        )
        await db.commit()
    return {"id": doc_id, "title": doc.title, "content": doc.content, "doc_type": doc.doc_type, "created_at": now, "updated_at": now}


@api_router.get("/documents")
async def get_documents():
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM documents ORDER BY updated_at DESC LIMIT 100")
        return [dict(row) for row in await cursor.fetchall()]


@api_router.get("/documents/{doc_id}")
async def get_document(doc_id: str):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM documents WHERE id = ?", (doc_id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Document not found")
        return dict(row)


@api_router.put("/documents/{doc_id}")
async def update_document(doc_id: str, content: str, title: Optional[str] = None):
    now = datetime.now(timezone.utc).isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        if title:
            await db.execute("UPDATE documents SET content = ?, title = ?, updated_at = ? WHERE id = ?", (content, title, now, doc_id))
        else:
            await db.execute("UPDATE documents SET content = ?, updated_at = ? WHERE id = ?", (content, now, doc_id))
        await db.commit()
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM documents WHERE id = ?", (doc_id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Document not found")
        return dict(row)


@api_router.delete("/documents/{doc_id}")
async def delete_document(doc_id: str):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
        await db.commit()
    return {"message": "Document deleted"}


# === AI WRITING TOOLS ===
@api_router.post("/ai/rewrite")
async def rewrite_text(request: RewriteRequest):
    style_prompts = {
        "professional": "Rewrite this text in a professional, business-appropriate tone while maintaining the original meaning:",
        "casual": "Rewrite this text in a casual, conversational tone while maintaining the original meaning:",
        "formal": "Rewrite this text in a formal, academic tone while maintaining the original meaning:",
        "creative": "Rewrite this text in a more creative, engaging way while maintaining the original meaning:"
    }
    prompt = style_prompts.get(request.style, style_prompts["professional"])
    try:
        response = await groq_client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[
                {"role": "system", "content": "You are a professional editor. Provide only the rewritten text without any explanations or prefixes."},
                {"role": "user", "content": f"{prompt}\n\n{request.text}"}
            ],
            temperature=0.7, max_tokens=2048,
        )
        return {"rewritten": response.choices[0].message.content}
    except Exception as e:
        logger.error(f"Rewrite error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/ai/format")
async def format_text(request: FormatRequest):
    format_prompts = {
        "paragraphs": "Format this text into well-structured paragraphs:",
        "bullets": "Convert this text into a bulleted list:",
        "numbered": "Convert this text into a numbered list:",
        "headers": "Organize this text with appropriate headers and sections:"
    }
    prompt = format_prompts.get(request.format_type, format_prompts["paragraphs"])
    try:
        response = await groq_client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[
                {"role": "system", "content": "You are a professional formatter. Provide only the formatted text without any explanations."},
                {"role": "user", "content": f"{prompt}\n\n{request.text}"}
            ],
            temperature=0.3, max_tokens=2048,
        )
        return {"formatted": response.choices[0].message.content}
    except Exception as e:
        logger.error(f"Format error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/ai/generate-story")
async def generate_story(prompt: str, genre: str = "fantasy", length: str = "short"):
    length_tokens = {"short": 500, "medium": 1000, "long": 2000}
    max_tokens = length_tokens.get(length, 500)
    try:
        response = await groq_client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[
                {"role": "system", "content": f"You are Nyxen, a creative storyteller specializing in {genre} stories. Write engaging, well-structured narratives."},
                {"role": "user", "content": f"Write a {length} {genre} story based on this prompt: {prompt}"}
            ],
            temperature=0.8, max_tokens=max_tokens,
        )
        return {"story": response.choices[0].message.content}
    except Exception as e:
        logger.error(f"Story generation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/ai/continue-story")
async def continue_story(story_so_far: str, direction: str = ""):
    prompt = "Continue this story naturally"
    if direction:
        prompt += f" in this direction: {direction}"
    try:
        response = await groq_client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[
                {"role": "system", "content": "You are Nyxen, a creative storyteller. Continue the story seamlessly, matching the existing style and tone."},
                {"role": "user", "content": f"{prompt}:\n\n{story_so_far}"}
            ],
            temperature=0.8, max_tokens=1024,
        )
        return {"continuation": response.choices[0].message.content}
    except Exception as e:
        logger.error(f"Continue story error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/ai/edit-suggestions")
async def get_edit_suggestions(text: str):
    try:
        response = await groq_client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[
                {"role": "system", "content": "You are Nyxen, a professional editor. Provide specific, actionable editing suggestions."},
                {"role": "user", "content": f"Analyze this text and provide editing suggestions for improving clarity, grammar, style, and engagement:\n\n{text}"}
            ],
            temperature=0.5, max_tokens=1024,
        )
        return {"suggestions": response.choices[0].message.content}
    except Exception as e:
        logger.error(f"Edit suggestions error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# === IMAGE GENERATION ===
@api_router.post("/ai/generate-image")
async def generate_image(request: ImageGenerationRequest):
    import httpx
    api_key = os.environ.get('APIFREE_API_KEY', '')
    if not api_key:
        raise HTTPException(status_code=503, detail="Image generation service not configured.")

    style_enhancers = {
        "realistic": "highly detailed, photorealistic, 8k resolution, professional photography, cinematic lighting",
        "artistic": "artistic style, oil painting, vibrant colors, masterpiece, fine art, brush strokes",
        "fantasy": "fantasy art style, magical, ethereal lighting, epic scene, concept art, dreamlike",
        "anime": "anime style, detailed illustration, studio ghibli inspired, vibrant colors, cel shading"
    }
    enhanced_prompt = f"{request.prompt}, {style_enhancers.get(request.style, style_enhancers['realistic'])}"

    # Select model
    api_model = "google/imagen-4" if request.model == "imagen4" else "bytedance/seedream-4.5"

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                "https://api.apifree.ai/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={"model": api_model, "prompt": enhanced_prompt}
            )
            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail=f"Image generation failed: {response.text}")
            result = response.json()
            image_url = None
            if result.get("code") == 200 and "resp_data" in result:
                resp_data = result["resp_data"]
                if "data" in resp_data and len(resp_data["data"]) > 0:
                    image_url = resp_data["data"][0].get("url")
            if image_url:
                img_id = str(uuid.uuid4())
                now = datetime.now(timezone.utc).isoformat()
                async with aiosqlite.connect(DB_PATH) as db:
                    await db.execute(
                        "INSERT INTO generated_images (id, prompt, image_url, style, created_at) VALUES (?, ?, ?, ?, ?)",
                        (img_id, request.prompt, str(image_url), request.style, now)
                    )
                    await db.commit()
                return {"id": img_id, "image_url": str(image_url), "prompt": request.prompt, "style": request.style}
            else:
                raise HTTPException(status_code=500, detail="Image generation failed")
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Image generation timed out.")
    except Exception as e:
        logger.error(f"Image generation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/ai/images")
async def get_generated_images():
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM generated_images ORDER BY created_at DESC LIMIT 50")
        return [dict(row) for row in await cursor.fetchall()]


@api_router.get("/ai/images/story/{story_id}")
async def get_story_illustrations(story_id: str):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM generated_images WHERE story_id = ? ORDER BY created_at DESC LIMIT 50", (story_id,))
        return [dict(row) for row in await cursor.fetchall()]


@api_router.post("/ai/generate-illustration")
async def generate_story_illustration(request: StoryIllustrationRequest):
    import httpx
    api_key = os.environ.get('APIFREE_API_KEY', '')
    if not api_key:
        raise HTTPException(status_code=503, detail="Image generation service not configured.")

    chapter_summary = request.chapter_content[:2000]
    try:
        prompt_response = await groq_client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[
                {"role": "system", "content": "You are an expert at creating vivid image prompts for AI image generation. Given a story chapter, extract the most visually striking scene and create a detailed image prompt. Focus on: main characters' appearance, setting, atmosphere, lighting, and key action. Output ONLY the image prompt, no explanations. Keep it under 200 words."},
                {"role": "user", "content": f"Create an image prompt for this chapter titled '{request.chapter_title}':\n\n{chapter_summary}"}
            ],
            temperature=0.7, max_tokens=300,
        )
        generated_prompt = prompt_response.choices[0].message.content.strip()

        style_enhancers = {
            "realistic": "cinematic lighting, photorealistic, detailed, dramatic scene",
            "artistic": "oil painting style, artistic, vibrant colors, masterpiece illustration",
            "fantasy": "fantasy art, magical atmosphere, ethereal lighting, epic scene, concept art",
            "anime": "anime style, detailed illustration, dynamic composition, vibrant"
        }
        enhanced_prompt = f"{generated_prompt}, {style_enhancers.get(request.style, style_enhancers['fantasy'])}, book illustration"

        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                "https://api.apifree.ai/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={"model": "bytedance/seedream-4.5", "prompt": enhanced_prompt}
            )
            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail="Image generation failed")
            result = response.json()
            image_url = None
            if result.get("code") == 200 and "resp_data" in result:
                resp_data = result["resp_data"]
                if "data" in resp_data and len(resp_data["data"]) > 0:
                    image_url = resp_data["data"][0].get("url")
            if image_url:
                img_id = str(uuid.uuid4())
                now = datetime.now(timezone.utc).isoformat()
                async with aiosqlite.connect(DB_PATH) as db:
                    await db.execute(
                        "INSERT INTO generated_images (id, prompt, image_url, style, story_id, chapter_title, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                        (img_id, generated_prompt, str(image_url), request.style, request.story_id, request.chapter_title, now)
                    )
                    await db.commit()
                return {"id": img_id, "image_url": str(image_url), "prompt": generated_prompt, "chapter_title": request.chapter_title, "style": request.style}
            else:
                raise HTTPException(status_code=500, detail="Image generation failed")
    except Exception as e:
        logger.error(f"Story illustration error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# === MEMORY ENDPOINTS ===
@api_router.get("/memory/{user_id}")
async def get_memories(user_id: str, category: Optional[str] = None):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        if category:
            cursor = await db.execute(
                "SELECT category, key, value, updated_at FROM user_memory WHERE user_id = ? AND category = ? ORDER BY updated_at DESC",
                (user_id, category)
            )
        else:
            cursor = await db.execute(
                "SELECT category, key, value, updated_at FROM user_memory WHERE user_id = ? ORDER BY updated_at DESC",
                (user_id,)
            )
        memories = [dict(row) for row in await cursor.fetchall()]
    return {"memories": memories, "count": len(memories)}


@api_router.post("/memory/{user_id}")
async def store_memory(user_id: str, memory: MemoryStore):
    await save_memory(user_id, memory.category, memory.key, memory.value)
    return {"status": "saved", "category": memory.category, "key": memory.key}


@api_router.delete("/memory/{user_id}")
async def clear_memories(user_id: str, category: Optional[str] = None):
    async with aiosqlite.connect(DB_PATH) as db:
        if category:
            await db.execute("DELETE FROM user_memory WHERE user_id = ? AND category = ?", (user_id, category))
        else:
            await db.execute("DELETE FROM user_memory WHERE user_id = ?", (user_id,))
        await db.commit()
    return {"status": "cleared"}


# === APP WIRING ===
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
    logger.info("Nyxen AI Backend started successfully")
