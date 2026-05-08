===================================================================
--- /dev/null
+++ backend/qwen3_tts_bridge.py
@@ -0,0 +1,276 @@
+"""
+Qwen3-TTS Bridge Server
+========================
+Lightweight FastAPI server that exposes a synchronous POST endpoint
+for the Cloudflare Worker to call.  Loads the Qwen3-TTS base model
+on startup, accepts text + reference audio (multipart), performs
+voice-clone inference, and returns raw WAV bytes.
+
+Designed to run on a GPU-capable machine alongside (or instead of)
+the tts-audiobook-tool server.
+
+Usage:
+    uvicorn backend.qwen3_tts_bridge:app --host 0.0.0.0 --port 8880
+    # or
+    python -m backend.qwen3_tts_bridge
+
+Environment variables:
+    QWEN3_MODEL_ID   - HuggingFace repo id (default: Qwen/Qwen3-TTS-12Hz-1.7B-Base)
+    QWEN3_DEVICE     - "cuda" or "cpu" (default: cuda)
+    QWEN3_PORT       - Port to listen on (default: 8880)
+"""
+
+from __future__ import annotations
+
+import io
+import logging
+import os
+import tempfile
+import struct
+from pathlib import Path
+
+import numpy as np
+import torch
+from fastapi import FastAPI, File, Form, UploadFile, HTTPException
+from fastapi.responses import Response
+from starlette.middleware.cors import CORSMiddleware
+
+logging.basicConfig(level=logging.INFO)
+logger = logging.getLogger("qwen3-tts-bridge")
+
+# ── Configuration ────────────────────────────────────────────────────
+MODEL_ID = os.environ.get("QWEN3_MODEL_ID", "Qwen/Qwen3-TTS-12Hz-1.7B-Base")
+DEVICE = os.environ.get("QWEN3_DEVICE", "cuda" if torch.cuda.is_available() else "cpu")
+PORT = int(os.environ.get("QWEN3_PORT", "8880"))
+
+# ── Globals (loaded on startup) ──────────────────────────────────────
+_model = None
+_whisper_model = None
+_voice_cache: dict[str, object] = {}
+
+app = FastAPI(title="Qwen3-TTS Bridge", version="1.0.0")
+app.add_middleware(
+    CORSMiddleware,
+    allow_origins=["*"],
+    allow_methods=["*"],
+    allow_headers=["*"],
+)
+
+
+# ── Model loading ────────────────────────────────────────────────────
+def get_model():
+    """Lazy-load the Qwen3TTSModel."""
+    global _model
+    if _model is not None:
+        return _model
+
+    from qwen_tts import Qwen3TTSModel  # type: ignore
+
+    logger.info("Loading Qwen3-TTS model: %s on %s", MODEL_ID, DEVICE)
+
+    device_map = "cuda:0" if DEVICE == "cuda" else DEVICE
+    attn_impl = None
+    if DEVICE == "cuda":
+        try:
+            from flash_attn import flash_attn_func  # type: ignore  # noqa: F401
+            attn_impl = "flash_attention_2"
+        except ImportError:
+            pass
+
+    _model = Qwen3TTSModel.from_pretrained(
+        MODEL_ID,
+        device_map=device_map,
+        dtype=torch.bfloat16,
+        attn_implementation=attn_impl,
+    )
+    logger.info("Qwen3-TTS model loaded (type=%s)", _model.model.tts_model_type)
+    return _model
+
+
+def get_whisper():
+    """Lazy-load a faster-whisper model for auto-transcription of reference audio."""
+    global _whisper_model
+    if _whisper_model is not None:
+        return _whisper_model
+
+    import platform
+    if platform.system() == "Darwin" and platform.machine() == "arm64":
+        import mlx_whisper  # type: ignore
+        _whisper_model = ("mlx", mlx_whisper)
+    else:
+        from faster_whisper import WhisperModel  # type: ignore
+        _whisper_model = ("faster", WhisperModel("base", device="cpu", compute_type="int8"))
+
+    logger.info("Whisper model loaded")
+    return _whisper_model
+
+
+def transcribe_audio(audio_path: str) -> str:
+    """Auto-transcribe a reference audio file using Whisper."""
+    kind, model = get_whisper()
+    if kind == "mlx":
+        result = model.transcribe(audio_path, language="en")
+        return result.get("text", "").strip()
+    else:
+        segments, _ = model.transcribe(audio_path, language="en", beam_size=1)
+        return " ".join(seg.text for seg in segments).strip()
+
+
+def get_voice_clone_prompt(model, ref_audio_path: str, ref_text: str):
+    """Create (and cache) a voice clone prompt from reference audio."""
+    cache_key = f"{ref_audio_path}:{ref_text[:100]}"
+    if cache_key in _voice_cache:
+        return _voice_cache[cache_key]
+
+    prompt = model.create_voice_clone_prompt(
+        ref_audio=ref_audio_path,
+        ref_text=ref_text,
+        x_vector_only_mode=False,
+    )[0]
+    _voice_cache[cache_key] = prompt
+    return prompt
+
+
+def numpy_to_wav_bytes(audio: np.ndarray, sample_rate: int) -> bytes:
+    """Convert a float32 numpy array to a WAV byte buffer."""
+    # Clamp to [-1, 1] and convert to int16
+    audio = np.clip(audio, -1.0, 1.0)
+    pcm = (audio * 32767).astype(np.int16)
+    buf = io.BytesIO()
+    # Write WAV header
+    num_samples = pcm.shape[0]
+    data_size = num_samples * 2  # 16-bit = 2 bytes per sample
+    buf.write(b"RIFF")
+    buf.write(struct.pack("<I", 36 + data_size))
+    buf.write(b"WAVE")
+    buf.write(b"fmt ")
+    buf.write(struct.pack("<I", 16))       # chunk size
+    buf.write(struct.pack("<H", 1))        # PCM format
+    buf.write(struct.pack("<H", 1))        # mono
+    buf.write(struct.pack("<I", sample_rate))
+    buf.write(struct.pack("<I", sample_rate * 2))  # byte rate
+    buf.write(struct.pack("<H", 2))        # block align
+    buf.write(struct.pack("<H", 16))       # bits per sample
+    buf.write(b"data")
+    buf.write(struct.pack("<I", data_size))
+    buf.write(pcm.tobytes())
+    return buf.getvalue()
+
+
+# ── Routes ───────────────────────────────────────────────────────────
+
+@app.get("/")
+async def health():
+    return {
+        "status": "active",
+        "engine": "Qwen3-TTS Bridge",
+        "model": MODEL_ID,
+        "device": DEVICE,
+        "model_loaded": _model is not None,
+    }
+
+
+@app.post("/tts_to_audio")
+async def tts_to_audio(
+    text: str = Form(...),
+    language: str = Form("en"),
+    speaker_wav: UploadFile = File(...),
+    ref_text: str = Form(""),
+):
+    """
+    Generate speech using Qwen3-TTS voice cloning.
+
+    Accepts:
+        text         - Text to synthesize
+        language     - Language code (default: en)
+        speaker_wav  - Reference audio file (mp3/wav) for voice cloning
+        ref_text     - Transcript of the reference audio (auto-transcribed if empty)
+
+    Returns:
+        Raw WAV audio bytes (audio/wav)
+    """
+    if not text or not text.strip():
+        raise HTTPException(status_code=400, detail="text is required")
+
+    model = get_model()
+
+    # Save uploaded reference audio to a temp file
+    suffix = Path(speaker_wav.filename or "ref.mp3").suffix or ".mp3"
+    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
+        content = await speaker_wav.read()
+        if not content or len(content) < 100:
+            raise HTTPException(status_code=400, detail="speaker_wav is empty or too small")
+        tmp.write(content)
+        tmp_path = tmp.name
+
+    try:
+        # Auto-transcribe if no ref_text provided
+        if not ref_text.strip():
+            logger.info("Auto-transcribing reference audio (%d bytes)", len(content))
+            ref_text = transcribe_audio(tmp_path)
+            if not ref_text:
+                ref_text = "Hello, this is a voice sample."
+                logger.warning("Whisper returned empty transcript, using fallback")
+            logger.info("Transcribed: %s", ref_text[:100])
+
+        # Resolve language code to Qwen3 format
+        lang_map = {
+            "zh": "chinese", "en": "english", "fr": "french", "de": "german",
+            "it": "italian", "ja": "japanese", "ko": "korean", "pt": "portuguese",
+            "ru": "russian", "es": "spanish",
+        }
+        qwen_lang = lang_map.get(language.lower()[:2], "auto")
+
+        # Create voice clone prompt
+        voice_prompt = get_voice_clone_prompt(model, tmp_path, ref_text)
+
+        # Generate speech
+        logger.info("Generating speech: %d chars, lang=%s", len(text), qwen_lang)
+        wavs, sr = model.generate_voice_clone(
+            text=[text[:4000]],
+            voice_clone_prompt=[voice_prompt],
+            language=[qwen_lang],
+            non_streaming_mode=True,
+            temperature=0.9,
+        )
+
+        if not wavs or len(wavs) == 0:
+            raise HTTPException(status_code=500, detail="Model returned no audio")
+
+        # Convert to WAV bytes
+        audio_data = wavs[0]
+        if isinstance(audio_data, torch.Tensor):
+            audio_data = audio_data.cpu().numpy()
+        if audio_data.dtype != np.float32:
+            audio_data = audio_data.astype(np.float32)
+
+        wav_bytes = numpy_to_wav_bytes(audio_data, sr)
+        logger.info("Generated %d bytes of WAV audio (sr=%d)", len(wav_bytes), sr)
+
+        return Response(
+            content=wav_bytes,
+            media_type="audio/wav",
+            headers={
+                "Content-Length": str(len(wav_bytes)),
+                "Cache-Control": "no-store",
+            },
+        )
+
+    except HTTPException:
+        raise
+    except Exception as e:
+        logger.error("TTS generation failed: %s", e, exc_info=True)
+        raise HTTPException(status_code=500, detail=f"TTS generation failed: {str(e)}")
+    finally:
+        # Clean up temp file
+        try:
+            os.unlink(tmp_path)
+        except OSError:
+            pass
+
+
+# ── Entrypoint ───────────────────────────────────────────────────────
+if __name__ == "__main__":
+    import uvicorn
+    logger.info("Starting Qwen3-TTS Bridge on port %d", PORT)
+    uvicorn.run(app, host="0.0.0.0", port=PORT)
