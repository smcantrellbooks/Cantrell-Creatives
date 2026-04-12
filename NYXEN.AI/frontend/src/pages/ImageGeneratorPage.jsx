import { useState, useEffect } from "react";
import axios from "axios";
import { Image, Sparkles, Download, Trash2, Loader2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const STYLES = [
  { value: "realistic", label: "Realistic", description: "Photorealistic, detailed" },
  { value: "artistic", label: "Artistic", description: "Oil painting style" },
  { value: "fantasy", label: "Fantasy", description: "Magical, ethereal" },
  { value: "anime", label: "Anime", description: "Japanese animation style" }
];

export default function ImageGeneratorPage() {
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("realistic");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState(null);
  const [gallery, setGallery] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    fetchGallery();
  }, []);

  const fetchGallery = async () => {
    try {
      setIsLoading(true);
      const response = await axios.get(`${API}/ai/images`);
      setGallery(response.data);
    } catch (error) {
      console.error("Error fetching gallery:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const generateImage = async () => {
    if (!prompt.trim()) {
      toast.error("Please enter a prompt");
      return;
    }

    try {
      setIsGenerating(true);
      setGeneratedImage(null);
      
      const response = await axios.post(`${API}/ai/generate-image`, {
        prompt: prompt.trim(),
        style
      });
      
      setGeneratedImage(response.data);
      setGallery(prev => [response.data, ...prev]);
      toast.success("Image generated successfully!");
      
    } catch (error) {
      console.error("Error generating image:", error);
      if (error.response?.status === 503) {
        toast.error("Image generation service not configured. Please set up the Cloudflare Worker URL.");
      } else {
        toast.error("Failed to generate image. Please try again.");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadImage = (imageUrl, prompt) => {
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = `nyxen-${prompt.slice(0, 20).replace(/\s+/g, '-')}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Image downloaded!");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      generateImage();
    }
  };

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#fdfcfb]" data-testid="image-generator-page">
      {/* Hero Section */}
      <div className="relative overflow-hidden bg-gradient-to-b from-[#f5f2eb] to-[#fdfcfb] py-12 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="font-heading text-4xl md:text-5xl font-semibold text-foreground mb-4">
            Image Generator
          </h1>
          <p className="text-lg text-muted-foreground mb-8">
            Transform your words into stunning visuals with AI-powered image generation
          </p>
        </div>
      </div>

      {/* Generator Section */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Card className="mb-8">
          <CardContent className="p-6">
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  Describe your image
                </label>
                <Input
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="A serene mountain landscape at sunset with golden light..."
                  className="text-lg py-6"
                  disabled={isGenerating}
                  data-testid="image-prompt-input"
                />
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <label className="text-sm font-medium text-muted-foreground mb-2 block">
                    Style
                  </label>
                  <Select value={style} onValueChange={setStyle} disabled={isGenerating}>
                    <SelectTrigger data-testid="style-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STYLES.map(s => (
                        <SelectItem key={s.value} value={s.value}>
                          <div className="flex flex-col">
                            <span>{s.label}</span>
                            <span className="text-xs text-muted-foreground">{s.description}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-end">
                  <Button
                    onClick={generateImage}
                    disabled={!prompt.trim() || isGenerating}
                    className="w-full sm:w-auto px-8 py-6 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300"
                    data-testid="generate-image-btn"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Wand2 className="w-5 h-5 mr-2" />
                        Generate Image
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Generated Image Display */}
        {generatedImage && (
          <Card className="mb-8 overflow-hidden">
            <CardContent className="p-0">
              <div className="relative">
                <img
                  src={generatedImage.image_url}
                  alt={generatedImage.prompt}
                  className="w-full h-auto"
                  data-testid="generated-image"
                />
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-6">
                  <p className="text-white text-sm mb-2">{generatedImage.prompt}</p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => downloadImage(generatedImage.image_url, generatedImage.prompt)}
                      data-testid="download-image-btn"
                    >
                      <Download className="w-4 h-4 mr-1" />
                      Download
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Gallery */}
        <div>
          <h2 className="font-heading text-2xl font-semibold mb-6">Your Gallery</h2>
          
          {isLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="aspect-square bg-muted rounded-xl animate-pulse" />
              ))}
            </div>
          ) : gallery.length === 0 ? (
            <div className="text-center py-16 bg-secondary/30 rounded-xl">
              <Image className="w-16 h-16 mx-auto text-muted-foreground/40 mb-4" />
              <h3 className="text-xl font-heading text-muted-foreground mb-2">No images yet</h3>
              <p className="text-muted-foreground">Generate your first image above!</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {gallery.map((img, index) => (
                <Card 
                  key={img.id || index} 
                  className="group overflow-hidden cursor-pointer hover:shadow-lg transition-all duration-300"
                  data-testid={`gallery-image-${index}`}
                >
                  <div className="relative aspect-square">
                    <img
                      src={img.image_url}
                      alt={img.prompt}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                      <div className="w-full">
                        <p className="text-white text-xs line-clamp-2 mb-2">{img.prompt}</p>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="w-full"
                          onClick={() => downloadImage(img.image_url, img.prompt)}
                        >
                          <Download className="w-3 h-3 mr-1" />
                          Download
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
