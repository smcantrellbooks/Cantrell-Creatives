import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { Play, Square, Volume2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function VoiceExplorerPage() {
  const [voices, setVoices] = useState([]);
  const [filter, setFilter] = useState("");
  const [playingId, setPlayingId] = useState(null);
  const audioRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchVoices();
  }, []);

  const fetchVoices = async () => {
    try {
      const res = await axios.get(`${API}/voices`);
      setVoices(res.data.voices);
    } catch (e) {
      console.error("Failed to load voices:", e);
    }
  };

  const playSample = (voiceId) => {
    if (playingId === voiceId) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    if (audioRef.current) audioRef.current.pause();
    const audio = new Audio(`${BACKEND_URL}/api/voice-sample/${voiceId}`);
    audioRef.current = audio;
    setPlayingId(voiceId);
    audio.play().catch(() => toast.error("Sample not available"));
    audio.onended = () => setPlayingId(null);
    audio.onerror = () => setPlayingId(null);
  };

  const filtered = voices.filter(v =>
    !filter || v.name.toLowerCase().includes(filter.toLowerCase()) ||
    v.style.toLowerCase().includes(filter.toLowerCase()) ||
    v.accent.toLowerCase().includes(filter.toLowerCase()) ||
    v.gender.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#fdfcfb] py-8 px-4" data-testid="voice-explorer-page">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="font-heading text-4xl md:text-5xl font-semibold text-foreground mb-4">Voice Explorer</h1>
          <p className="text-lg text-muted-foreground mb-6">Browse and preview 23 premium AI voices</p>
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by name, style, accent, or gender..."
            className="max-w-md mx-auto"
            data-testid="voice-filter"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(voice => (
            <Card
              key={voice.id}
              className="group hover:shadow-md hover:-translate-y-0.5 transition-all duration-300"
              data-testid={`voice-card-${voice.id}`}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-heading text-lg font-medium">{voice.name}</h3>
                    <p className="text-xs text-muted-foreground">{voice.id}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge variant="secondary" className="text-xs">{voice.gender}</Badge>
                  </div>
                </div>

                <p className="text-sm text-muted-foreground mb-3">{voice.description}</p>

                <div className="flex flex-wrap gap-1 mb-4">
                  <Badge variant="outline" className="text-xs">{voice.style}</Badge>
                  <Badge variant="outline" className="text-xs">{voice.accent}</Badge>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant={playingId === voice.id ? "destructive" : "outline"}
                    size="sm"
                    onClick={() => playSample(voice.id)}
                    data-testid={`play-${voice.id}`}
                  >
                    {playingId === voice.id ? <Square className="w-3 h-3 mr-1" /> : <Play className="w-3 h-3 mr-1" />}
                    {playingId === voice.id ? "Stop" : "Play"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate("/voice-studio")}
                    data-testid={`use-${voice.id}`}
                  >
                    <ArrowRight className="w-3 h-3 mr-1" /> Use
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-16">
            <Volume2 className="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">No voices match your filter</p>
          </div>
        )}
      </div>
    </div>
  );
}
