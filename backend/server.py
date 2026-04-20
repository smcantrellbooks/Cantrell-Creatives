# In server.py, replace your existing resolve_voice and get_voice_by_name functions with these:

def get_voice_by_name(name: str):
    for voice in VOICE_PROFILES:
        if voice["name"].lower() == name.lower():
            return voice
    return None

def get_voice_by_openai_name(openai_voice: str):
    """Match by the actual OpenAI voice name (alloy, echo, nova, etc.)"""
    for voice in VOICE_PROFILES:
        if voice.get("openai_voice", "").lower() == openai_voice.lower():
            return voice
    return None

def resolve_voice(identifier: str):
    if not identifier:
        return VOICE_PROFILES[0] if VOICE_PROFILES else None
    # Try by ID first (voice_01, voice_02 etc.)
    voice = get_voice_by_id(identifier)
    if voice:
        return voice
    # Try by display name
    voice = get_voice_by_name(identifier)
    if voice:
        return voice
    # Try by OpenAI voice name (alloy, echo, nova, shimmer, onyx, fable)
    voice = get_voice_by_openai_name(identifier)
    if voice:
        return voice
    # Last resort — return first voice so generation never fails
    return VOICE_PROFILES[0] if VOICE_PROFILES else None


# Also update run_audiobook_job narrator resolution to use both fields:
# Replace the narrator resolution block at the top of run_audiobook_job with this:

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
