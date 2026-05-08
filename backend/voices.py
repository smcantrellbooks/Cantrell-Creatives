# Voice profiles are served dynamically from the R2 worker.
# Endpoint: GET https://cantrell-creatives.smcantrellbooks.workers.dev/voices
# Returns: {"voices": [{"name": "...", "file": "....mp3"}, ...]}
#
# The voice_id used for TTS generation is the full MP3 filename,
# e.g. "Adam - English - British.mp3"
#
# Sample playback endpoint:
# GET https://cantrell-creatives.smcantrellbooks.workers.dev/sample?voice_id=[FILENAME]
#
# The frontend (voice-studio.html) fetches voices dynamically and passes
# the full filename as voice_id to the Cloudflare Worker for TTS generation.

import logging
import time

logger = logging.getLogger(__name__)

WORKER_URL = "https://cantrell-creatives.smcantrellbooks.workers.dev"

# ── Dynamic voice cache ──
# Populated on first access from the R2 worker.  Refreshed every 5 minutes.
VOICE_PROFILES = []
_voice_cache_ts = 0
_VOICE_CACHE_TTL = 300  # seconds


def _parse_voice_filename(filename: str) -> dict:
    """Turn an R2 filename like 'Jae Hyun - English-Korean.mp3' into a profile dict."""
    base = filename.replace(".mp3", "").strip()
    parts = [p.strip() for p in base.split("-")]
    name = parts[0] if parts else base
    accent = " - ".join(parts[1:]).strip() if len(parts) > 1 else "English"
    return {
        "id": filename,
        "name": name,
        "accent": accent,
        "description": f"{name} ({accent})",
    }


def _refresh_voice_cache():
    """Fetch the voice list from the Cloudflare Worker and rebuild VOICE_PROFILES."""
    global VOICE_PROFILES, _voice_cache_ts
    import urllib.request
    import json

    try:
        req = urllib.request.Request(f"{WORKER_URL}/voices", method="GET")
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())

        raw = data.get("voices", data) if isinstance(data, dict) else data
        if not isinstance(raw, list):
            logger.warning("Unexpected voice list format from worker")
            return

        profiles = []
        for item in raw:
            filename = item.get("file") or item.get("name") or (item if isinstance(item, str) else "")
            if not filename or not filename.endswith(".mp3"):
                continue
            profiles.append(_parse_voice_filename(filename))

        profiles.sort(key=lambda v: v["name"])
        VOICE_PROFILES = profiles
        _voice_cache_ts = time.time()
        logger.info("Voice cache refreshed: %d profiles loaded", len(profiles))

    except Exception as exc:
        logger.error("Failed to refresh voice cache: %s", exc)


def ensure_voices_loaded():
    """Ensure VOICE_PROFILES is populated.  Call before any voice resolution."""
    if not VOICE_PROFILES or (time.time() - _voice_cache_ts > _VOICE_CACHE_TTL):
        _refresh_voice_cache()


def get_voice_by_id(voice_id: str):
    """Look up a voice profile by its id (R2 filename)."""
    ensure_voices_loaded()
    if not voice_id:
        return None
    vid_lower = voice_id.lower()
    for v in VOICE_PROFILES:
        if v["id"].lower() == vid_lower:
            return v
    # Partial match: try without .mp3 extension
    vid_no_ext = vid_lower.replace(".mp3", "")
    for v in VOICE_PROFILES:
        if v["id"].lower().replace(".mp3", "") == vid_no_ext:
            return v
    return None


def get_voice_list_url():
    return f"{WORKER_URL}/voices"


def get_sample_url(voice_id: str):
    """Build the sample playback URL for a given voice_id (full filename)."""
    from urllib.parse import quote
    return f"{WORKER_URL}/sample?voice_id={quote(voice_id)}"
