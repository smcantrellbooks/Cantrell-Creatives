VOICE_PROFILES = [
    {
        "id": "voice_01",
        "name": "Alloy",
        "openai_voice": "alloy",
        "speed": 1.0,
        "gender": "neutral",
        "style": "balanced",
        "accent": "English-US",
        "description": "Neutral and balanced. Versatile for any content type.",
        "sample_file": "alloy.mp3"
    },
    {
        "id": "voice_02",
        "name": "Ash",
        "openai_voice": "ash",
        "speed": 1.0,
        "gender": "male",
        "style": "narrator",
        "accent": "English-US",
        "description": "Clear and articulate. Ideal for narration and documentary content.",
        "sample_file": "ash.mp3"
    },
    {
        "id": "voice_03",
        "name": "Coral",
        "openai_voice": "coral",
        "speed": 1.0,
        "gender": "female",
        "style": "warm",
        "accent": "English-US",
        "description": "Warm and friendly. Perfect for conversational and educational content.",
        "sample_file": "coral.mp3"
    },
    {
        "id": "voice_04",
        "name": "Echo",
        "openai_voice": "echo",
        "speed": 1.0,
        "gender": "male",
        "style": "smooth",
        "accent": "English-US",
        "description": "Smooth and calm. Perfect for podcasts and meditation.",
        "sample_file": "echo.mp3"
    },
    {
        "id": "voice_05",
        "name": "Fable",
        "openai_voice": "fable",
        "speed": 1.0,
        "gender": "male",
        "style": "storyteller",
        "accent": "English-British",
        "description": "Expressive and engaging. Born for storytelling and audiobooks.",
        "sample_file": "fable.mp3"
    },
    {
        "id": "voice_06",
        "name": "Nova",
        "openai_voice": "nova",
        "speed": 1.0,
        "gender": "female",
        "style": "energetic",
        "accent": "English-US",
        "description": "Bright and upbeat. Great for presentations and announcements.",
        "sample_file": "nova.mp3"
    },
    {
        "id": "voice_07",
        "name": "Onyx",
        "openai_voice": "onyx",
        "speed": 1.0,
        "gender": "male",
        "style": "authoritative",
        "accent": "English-US",
        "description": "Deep and commanding. Built for leadership and motivational content.",
        "sample_file": "onyx.mp3"
    },
    {
        "id": "voice_08",
        "name": "Sage",
        "openai_voice": "sage",
        "speed": 1.0,
        "gender": "female",
        "style": "professional",
        "accent": "English-US",
        "description": "Measured and professional. Ideal for corporate and educational material.",
        "sample_file": "sage.mp3"
    },
    {
        "id": "voice_09",
        "name": "Shimmer",
        "openai_voice": "shimmer",
        "speed": 1.0,
        "gender": "female",
        "style": "bright",
        "accent": "English-US",
        "description": "Cheerful and articulate. Excellent for explainers and tutorials.",
        "sample_file": "shimmer.mp3"
    }
]


def get_voice_by_id(voice_id):
    for voice in VOICE_PROFILES:
        if voice["id"] == voice_id:
            return voice
    return None


def get_voices_by_style(style):
    return [v for v in VOICE_PROFILES if v["style"] == style]
