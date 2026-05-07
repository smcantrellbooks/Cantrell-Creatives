# Voice profiles are now served dynamically from the R2 worker.
# Endpoint: GET https://cantrell-creatives.smcantrellbooks.workers.dev/voices
# Returns: {"voices": [{"name": "...", "file": "....mp3"}, ...]}
#
# The voice_id used for TTS generation is the full MP3 filename,
# e.g. "Adam - English - British.mp3"
#
# Sample playback endpoint:
# GET https://cantrell-creatives.smcantrellbooks.workers.dev/sample?voice_id=[FILENAME]
#
# Legacy Aura-2 voice IDs (voice_01, voice_02, etc.) are no longer used.
# The frontend (voice-studio.html) now fetches voices dynamically and passes
# the full filename as voice_id to the Cloudflare Worker for TTS generation.

WORKER_URL = "https://cantrell-creatives.smcantrellbooks.workers.dev"

# Backward-compatible exports for server.py
# VOICE_PROFILES is kept as an empty list; the worker handles voice resolution now.
VOICE_PROFILES = []


def get_voice_by_id(voice_id: str):
    """Legacy lookup - returns None. Voice resolution is now handled by the Cloudflare Worker."""
    return None


def get_voice_list_url():
    return f"{WORKER_URL}/voices"


def get_sample_url(voice_id: str):
    """Build the sample playback URL for a given voice_id (full filename)."""
    from urllib.parse import quote
    return f"{WORKER_URL}/sample?voice_id={quote(voice_id)}"
