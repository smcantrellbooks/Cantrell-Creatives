import { useState, useEffect } from "react";
import { Volume2, VolumeX, Sparkles, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";

const NYXEN_AVATAR = "https://cdn1.site-media.eu/images/0/24185616/nyxen-hucYBsyp6NvKtsJFls-OUg.jpg";

export default function SettingsPage() {
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [voiceRate, setVoiceRate] = useState([1]);
  const [voicePitch, setVoicePitch] = useState([1]);
  const [selectedVoice, setSelectedVoice] = useState("");
  const [availableVoices, setAvailableVoices] = useState([]);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [temperature, setTemperature] = useState([0.7]);

  useEffect(() => {
    // Load available voices
    const loadVoices = () => {
      const voices = window.speechSynthesis?.getVoices() || [];
      setAvailableVoices(voices);
      
      // Select a default female voice if available
      const femaleVoice = voices.find(v => 
        v.name.includes("Female") || 
        v.name.includes("Samantha") || 
        v.name.includes("Victoria") ||
        v.name.includes("Karen") ||
        v.name.includes("Zira")
      );
      if (femaleVoice && !selectedVoice) {
        setSelectedVoice(femaleVoice.name);
      }
    };

    loadVoices();
    window.speechSynthesis?.addEventListener("voiceschanged", loadVoices);
    
    return () => {
      window.speechSynthesis?.removeEventListener("voiceschanged", loadVoices);
    };
  }, []);

  const testVoice = () => {
    if (!window.speechSynthesis) {
      toast.error("Speech synthesis not supported in this browser");
      return;
    }

    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(
      "Hello! I'm Nyxen, your AI writing assistant. How can I help you today?"
    );
    
    utterance.rate = voiceRate[0];
    utterance.pitch = voicePitch[0];
    
    const voice = availableVoices.find(v => v.name === selectedVoice);
    if (voice) utterance.voice = voice;
    
    window.speechSynthesis.speak(utterance);
    toast.success("Playing voice sample");
  };

  const saveSettings = () => {
    // In a real app, this would save to localStorage or backend
    localStorage.setItem("nyxen-settings", JSON.stringify({
      voiceEnabled,
      voiceRate: voiceRate[0],
      voicePitch: voicePitch[0],
      selectedVoice,
      autoSpeak,
      temperature: temperature[0]
    }));
    toast.success("Settings saved");
  };

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#fdfcfb] py-8 px-4" data-testid="settings-page">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center mb-8">
          <h1 className="font-heading text-3xl font-semibold text-foreground mb-2">Settings</h1>
          <p className="text-muted-foreground">Customize your Nyxen experience</p>
        </div>

        {/* Nyxen Profile */}
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-xl">About Nyxen</CardTitle>
            <CardDescription>Your AI writing assistant</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <Avatar className="h-24 w-24 border-4 border-white shadow-xl">
                <AvatarImage src={NYXEN_AVATAR} alt="Nyxen" />
                <AvatarFallback className="bg-primary text-primary-foreground text-2xl font-heading">N</AvatarFallback>
              </Avatar>
              <div>
                <h3 className="font-heading text-2xl font-semibold">Nyxen</h3>
                <p className="text-muted-foreground">The Professional Muse</p>
                <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                  <Sparkles className="w-4 h-4" />
                  <span>Powered by Llama 3.1 8B via Groq</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Voice Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-xl flex items-center gap-2">
              <Volume2 className="w-5 h-5" />
              Voice Settings
            </CardTitle>
            <CardDescription>Configure Nyxen's text-to-speech voice</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="voice-enabled">Enable Voice</Label>
                <p className="text-sm text-muted-foreground">Nyxen will speak responses aloud</p>
              </div>
              <Switch
                id="voice-enabled"
                checked={voiceEnabled}
                onCheckedChange={setVoiceEnabled}
                data-testid="voice-enabled-switch"
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="auto-speak">Auto-speak Responses</Label>
                <p className="text-sm text-muted-foreground">Automatically read new messages</p>
              </div>
              <Switch
                id="auto-speak"
                checked={autoSpeak}
                onCheckedChange={setAutoSpeak}
                data-testid="auto-speak-switch"
              />
            </div>

            <div className="space-y-3">
              <Label>Voice Selection</Label>
              <Select value={selectedVoice} onValueChange={setSelectedVoice}>
                <SelectTrigger data-testid="voice-select">
                  <SelectValue placeholder="Select a voice" />
                </SelectTrigger>
                <SelectContent>
                  {availableVoices.map(voice => (
                    <SelectItem key={voice.name} value={voice.name}>
                      {voice.name} ({voice.lang})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Speech Rate</Label>
                <span className="text-sm text-muted-foreground">{voiceRate[0].toFixed(1)}x</span>
              </div>
              <Slider
                value={voiceRate}
                onValueChange={setVoiceRate}
                min={0.5}
                max={2}
                step={0.1}
                data-testid="voice-rate-slider"
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Voice Pitch</Label>
                <span className="text-sm text-muted-foreground">{voicePitch[0].toFixed(1)}</span>
              </div>
              <Slider
                value={voicePitch}
                onValueChange={setVoicePitch}
                min={0.5}
                max={2}
                step={0.1}
                data-testid="voice-pitch-slider"
              />
            </div>

            <Button 
              variant="outline" 
              onClick={testVoice}
              className="w-full"
              data-testid="test-voice-btn"
            >
              <Volume2 className="w-4 h-4 mr-2" />
              Test Voice
            </Button>
          </CardContent>
        </Card>

        {/* AI Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-xl flex items-center gap-2">
              <Sparkles className="w-5 h-5" />
              AI Settings
            </CardTitle>
            <CardDescription>Configure AI response behavior</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Creativity (Temperature)</Label>
                  <p className="text-sm text-muted-foreground">Higher = more creative, lower = more focused</p>
                </div>
                <span className="text-sm text-muted-foreground">{temperature[0].toFixed(1)}</span>
              </div>
              <Slider
                value={temperature}
                onValueChange={setTemperature}
                min={0}
                max={1}
                step={0.1}
                data-testid="temperature-slider"
              />
            </div>

            <div className="p-4 bg-secondary/50 rounded-lg">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium text-sm">About Temperature</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Low (0-0.3): Best for factual, consistent responses<br />
                    Medium (0.4-0.7): Balanced creativity and coherence<br />
                    High (0.8-1): More creative, varied responses
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Save Button */}
        <Button 
          onClick={saveSettings} 
          className="w-full rounded-full py-6 text-lg shadow-lg hover:shadow-xl transition-all duration-300"
          data-testid="save-settings-btn"
        >
          Save Settings
        </Button>
      </div>
    </div>
  );
}
