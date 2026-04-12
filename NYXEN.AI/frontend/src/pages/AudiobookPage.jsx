import { useState, useEffect } from "react";
import axios from "axios";
import { BookOpen, Upload, Play, Download, Loader2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function AudiobookPage() {
  const [voices, setVoices] = useState([]);
  const [text, setText] = useState("");
  const [narratorVoice, setNarratorVoice] = useState("");
  const [charVoices, setCharVoices] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);
  const [audioInfo, setAudioInfo] = useState(null);
  const [segments, setSegments] = useState([]);
  const [uploadInfo, setUploadInfo] = useState(null);

  useEffect(() => {
    fetchVoices();
  }, []);

  const fetchVoices = async () => {
    try {
      const res = await axios.get(`${API}/voices`);
      setVoices(res.data.voices);
      if (res.data.voices.length > 0) setNarratorVoice(res.data.voices[0].id);
    } catch (e) {
      console.error("Failed to load voices:", e);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await axios.post(`${API}/upload`, formData);
      setText(res.data.text);
      setUploadInfo(res.data);
      toast.success(`Loaded ${res.data.word_count} words from ${res.data.filename}`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Upload failed");
    }
  };

  const previewSegments = () => {
    if (!text.trim()) return;
    const pattern = /(\u201c[^\u201d]*\u201d|"[^"]*"|'[^']*')/g;
    const parts = text.split(pattern);
    const segs = [];
    parts.forEach(part => {
      part = part.trim();
      if (!part) return;
      const isDlg = (part.startsWith('"') && part.endsWith('"')) ||
        (part.startsWith("'") && part.endsWith("'")) ||
        (part.startsWith('\u201c') && part.endsWith('\u201d'));
      segs.push({ type: isDlg ? "dialogue" : "narration", text: part.substring(0, 120) + (part.length > 120 ? "..." : "") });
    });
    setSegments(segs);
  };

  const toggleCharVoice = (voiceId) => {
    setCharVoices(prev =>
      prev.includes(voiceId) ? prev.filter(v => v !== voiceId) : [...prev, voiceId]
    );
  };

  const generateAudiobook = async () => {
    if (!text.trim()) { toast.error("Enter or upload text"); return; }
    setIsGenerating(true);
    try {
      const body = { text, narrator_voice_id: narratorVoice };
      if (charVoices.length > 0) body.character_voice_ids = charVoices;
      const res = await axios.post(`${API}/audiobook`, body);
      setAudioUrl(`${BACKEND_URL}${res.data.audio_url}`);
      setAudioInfo(res.data);
      toast.success("Audiobook generated!");
    } catch (e) {
      toast.error("Audiobook generation failed");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#fdfcfb] py-8 px-4" data-testid="audiobook-page">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="font-heading text-4xl md:text-5xl font-semibold text-foreground mb-4">Audiobook Studio</h1>
          <p className="text-lg text-muted-foreground">Upload a document or paste text — Nyxen brings it to life with multi-voice narration</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-4">
            {/* Upload */}
            <Card>
              <CardContent className="p-6">
                <label className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-xl p-8 cursor-pointer hover:border-primary/40 transition-colors">
                  <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                  <span className="text-sm text-muted-foreground">Upload .docx file</span>
                  <input type="file" accept=".docx" onChange={handleFileUpload} className="hidden" data-testid="docx-upload" />
                </label>
                {uploadInfo && (
                  <p className="text-xs text-muted-foreground mt-2 text-center">
                    {uploadInfo.filename} — {uploadInfo.word_count} words, {uploadInfo.paragraph_count} paragraphs
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Text */}
            <Card>
              <CardContent className="p-6">
                <Textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Paste your story or book text here..."
                  className="min-h-[300px] font-editor text-base leading-relaxed"
                  data-testid="audiobook-text"
                />
                <div className="flex justify-between mt-3">
                  <span className="text-xs text-muted-foreground">{text.split(/\s+/).filter(Boolean).length} words</span>
                  <Button variant="outline" size="sm" onClick={previewSegments} data-testid="preview-segments-btn">
                    <Eye className="w-4 h-4 mr-1" /> Preview Segments
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Segments Preview */}
            {segments.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-sm">Dialogue Detection</CardTitle></CardHeader>
                <CardContent className="space-y-2 max-h-[200px] overflow-y-auto">
                  {segments.map((seg, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <Badge variant={seg.type === "dialogue" ? "default" : "secondary"} className="text-xs shrink-0">
                        {seg.type === "dialogue" ? "DLG" : "NAR"}
                      </Badge>
                      <span className="text-muted-foreground">{seg.text}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Controls */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Narrator Voice</CardTitle></CardHeader>
              <CardContent>
                <Select value={narratorVoice} onValueChange={setNarratorVoice}>
                  <SelectTrigger data-testid="narrator-select">
                    <SelectValue placeholder="Select narrator" />
                  </SelectTrigger>
                  <SelectContent>
                    {voices.map(v => (
                      <SelectItem key={v.id} value={v.id}>{v.name} — {v.style}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Character Voices</CardTitle></CardHeader>
              <CardContent className="space-y-1 max-h-[200px] overflow-y-auto">
                {voices.map(v => (
                  <label key={v.id} className="flex items-center gap-2 text-sm cursor-pointer py-1">
                    <input
                      type="checkbox"
                      checked={charVoices.includes(v.id)}
                      onChange={() => toggleCharVoice(v.id)}
                      data-testid={`char-voice-${v.id}`}
                    />
                    <span>{v.name} <span className="text-muted-foreground text-xs">({v.accent})</span></span>
                  </label>
                ))}
              </CardContent>
            </Card>

            <Button
              onClick={generateAudiobook}
              disabled={!text.trim() || isGenerating}
              className="w-full py-6 rounded-xl shadow-lg"
              data-testid="generate-audiobook-btn"
            >
              {isGenerating ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <BookOpen className="w-5 h-5 mr-2" />}
              {isGenerating ? "Generating..." : "Generate Audiobook"}
            </Button>
          </div>
        </div>

        {/* Result */}
        {audioUrl && (
          <Card className="mt-6">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="font-medium">Audiobook Ready</p>
                  <p className="text-sm text-muted-foreground">
                    {audioInfo?.segments_count} segments | Narrator: {audioInfo?.narrator_voice} | Characters: {audioInfo?.character_voices?.join(", ")}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => {
                  const a = document.createElement("a");
                  a.href = audioUrl;
                  a.download = `nyxen-audiobook-${audioInfo?.id}.mp3`;
                  a.click();
                }} data-testid="download-audiobook-btn">
                  <Download className="w-4 h-4 mr-1" /> Download
                </Button>
              </div>
              <audio controls src={audioUrl} className="w-full" data-testid="audiobook-audio-player" />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
