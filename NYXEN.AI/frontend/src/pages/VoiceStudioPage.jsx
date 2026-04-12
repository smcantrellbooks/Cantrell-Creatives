import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { Volume2, Play, Square, Download, Loader2, Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function VoiceStudioPage() {
  const [voices, setVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState("");
  const [text, setText] = useState("");
  const [speed, setSpeed] = useState([1.0]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);
  const [audioInfo, setAudioInfo] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const audioRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  useEffect(() => {
    fetchVoices();
  }, []);

  const fetchVoices = async () => {
    try {
      const res = await axios.get(`${API}/voices`);
      setVoices(res.data.voices);
      if (res.data.voices.length > 0) setSelectedVoice(res.data.voices[0].id);
    } catch (e) {
      console.error("Failed to load voices:", e);
    }
  };

  const generateTTS = async () => {
    if (!text.trim()) { toast.error("Enter some text"); return; }
    setIsGenerating(true);
    try {
      const res = await axios.post(`${API}/tts`, {
        text, voice_id: selectedVoice, speed: speed[0]
      });
      const url = `${BACKEND_URL}${res.data.audio_url}`;
      setAudioUrl(url);
      setAudioInfo(res.data);
      toast.success(`Generated with ${res.data.voice_name}`);
    } catch (e) {
      toast.error("TTS generation failed");
    } finally {
      setIsGenerating(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach(t => t.stop());
        const formData = new FormData();
        formData.append("file", blob, "recording.webm");
        try {
          const res = await axios.post(`${API}/stt`, formData);
          setText(prev => prev + (prev ? " " : "") + res.data.text);
          toast.success("Transcription added");
        } catch (e) {
          toast.error("Transcription failed");
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch (e) {
      toast.error("Microphone access denied");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const downloadAudio = () => {
    if (!audioUrl) return;
    const a = document.createElement("a");
    a.href = audioUrl;
    a.download = `nyxen-tts-${audioInfo?.id || "audio"}.mp3`;
    a.click();
  };

  const selectedVoiceData = voices.find(v => v.id === selectedVoice);

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#fdfcfb] py-8 px-4" data-testid="voice-studio-page">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="font-heading text-4xl md:text-5xl font-semibold text-foreground mb-4">Voice Studio</h1>
          <p className="text-lg text-muted-foreground">Transform text into speech with 23 premium AI voices</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Text Input */}
          <div className="md:col-span-2">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium text-muted-foreground">Your Text</label>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{text.length} / 4096</span>
                    <Button
                      variant={isRecording ? "destructive" : "outline"}
                      size="sm"
                      onClick={isRecording ? stopRecording : startRecording}
                      data-testid="stt-btn"
                    >
                      {isRecording ? <MicOff className="w-4 h-4 mr-1" /> : <Mic className="w-4 h-4 mr-1" />}
                      {isRecording ? "Stop" : "Dictate"}
                    </Button>
                  </div>
                </div>
                <Textarea
                  value={text}
                  onChange={(e) => setText(e.target.value.slice(0, 4096))}
                  placeholder="Type or dictate your text here..."
                  className="min-h-[250px] font-editor text-lg leading-relaxed"
                  data-testid="tts-text-input"
                />
              </CardContent>
            </Card>
          </div>

          {/* Controls */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Voice</CardTitle>
              </CardHeader>
              <CardContent>
                <Select value={selectedVoice} onValueChange={setSelectedVoice}>
                  <SelectTrigger data-testid="voice-select">
                    <SelectValue placeholder="Select voice" />
                  </SelectTrigger>
                  <SelectContent>
                    {voices.map(v => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name} — {v.style} ({v.accent})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedVoiceData && (
                  <p className="text-xs text-muted-foreground mt-2">{selectedVoiceData.description}</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Speed</CardTitle>
              </CardHeader>
              <CardContent>
                <Slider value={speed} onValueChange={setSpeed} min={0.5} max={2} step={0.05} data-testid="speed-slider" />
                <p className="text-xs text-muted-foreground mt-2 text-center">{speed[0].toFixed(2)}x</p>
              </CardContent>
            </Card>

            <Button
              onClick={generateTTS}
              disabled={!text.trim() || isGenerating}
              className="w-full py-6 rounded-xl shadow-lg hover:shadow-xl transition-all"
              data-testid="generate-tts-btn"
            >
              {isGenerating ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Volume2 className="w-5 h-5 mr-2" />}
              {isGenerating ? "Generating..." : "Generate Speech"}
            </Button>
          </div>
        </div>

        {/* Audio Result */}
        {audioUrl && (
          <Card className="mt-6">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="font-medium">{audioInfo?.voice_name}</p>
                  <p className="text-sm text-muted-foreground">{audioInfo?.text_length} characters</p>
                </div>
                <Button variant="outline" size="sm" onClick={downloadAudio} data-testid="download-tts-btn">
                  <Download className="w-4 h-4 mr-1" /> Download
                </Button>
              </div>
              <audio ref={audioRef} controls src={audioUrl} className="w-full" data-testid="tts-audio-player" />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
