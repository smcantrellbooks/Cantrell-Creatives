import { useState, useEffect } from "react";
import axios from "axios";
import { Plus, Sparkles, BookOpen, Clock, Trash2, Edit2, Save, X, Loader2, Image, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const GENRES = ["Fantasy", "Mystery", "Romance", "Sci-Fi", "Horror", "Adventure", "General"];
const LENGTHS = [
  { value: "short", label: "Short (500 words)" },
  { value: "medium", label: "Medium (1000 words)" },
  { value: "long", label: "Long (2000 words)" }
];

const TEMPLATE_IMAGES = {
  Fantasy: "https://images.unsplash.com/photo-1770708126350-1e2da05942bc?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDk1Nzl8MHwxfHNlYXJjaHwxfHxjcmVhdGl2ZSUyMHdyaXRpbmclMjBzdG9yeXRlbGxpbmclMjBmYW50YXN5JTIwbGFuZHNjYXBlfGVufDB8fHx8MTc3NDM5ODQ4N3ww&ixlib=rb-4.1.0&q=85",
  Mystery: "https://images.pexels.com/photos/4256852/pexels-photo-4256852.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  Classic: "https://images.pexels.com/photos/7978245/pexels-photo-7978245.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"
};

export default function StoryStudioPage() {
  const [stories, setStories] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showNewStory, setShowNewStory] = useState(false);
  const [editingStory, setEditingStory] = useState(null);
  const [viewingStory, setViewingStory] = useState(null);
  const [storyIllustrations, setStoryIllustrations] = useState([]);
  const [isGeneratingIllustration, setIsGeneratingIllustration] = useState(false);
  const [illustrationStyle, setIllustrationStyle] = useState("fantasy");
  
  // New story form
  const [newPrompt, setNewPrompt] = useState("");
  const [newGenre, setNewGenre] = useState("Fantasy");
  const [newLength, setNewLength] = useState("short");
  
  // Edit form
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");

  useEffect(() => {
    fetchStories();
  }, []);

  const fetchStories = async () => {
    try {
      setIsLoading(true);
      const response = await axios.get(`${API}/stories`);
      setStories(response.data);
    } catch (error) {
      console.error("Error fetching stories:", error);
      toast.error("Failed to load stories");
    } finally {
      setIsLoading(false);
    }
  };

  const generateStory = async () => {
    if (!newPrompt.trim()) {
      toast.error("Please enter a story prompt");
      return;
    }

    try {
      setIsGenerating(true);
      
      // Generate story using AI
      const genResponse = await axios.post(`${API}/ai/generate-story`, null, {
        params: {
          prompt: newPrompt,
          genre: newGenre,
          length: newLength
        }
      });
      
      // Save the generated story
      const storyResponse = await axios.post(`${API}/stories`, {
        title: `${newGenre} Story: ${newPrompt.slice(0, 30)}...`,
        content: genResponse.data.story,
        genre: newGenre
      });
      
      setStories(prev => [storyResponse.data, ...prev]);
      setShowNewStory(false);
      setNewPrompt("");
      toast.success("Story generated successfully!");
      
    } catch (error) {
      console.error("Error generating story:", error);
      toast.error("Failed to generate story");
    } finally {
      setIsGenerating(false);
    }
  };

  const saveManualStory = async () => {
    if (!editTitle.trim() || !editContent.trim()) {
      toast.error("Please fill in all fields");
      return;
    }

    try {
      const response = await axios.post(`${API}/stories`, {
        title: editTitle,
        content: editContent,
        genre: newGenre
      });
      
      setStories(prev => [response.data, ...prev]);
      setEditTitle("");
      setEditContent("");
      setShowNewStory(false);
      toast.success("Story saved!");
      
    } catch (error) {
      console.error("Error saving story:", error);
      toast.error("Failed to save story");
    }
  };

  const updateStory = async () => {
    if (!editingStory) return;
    
    try {
      const response = await axios.put(`${API}/stories/${editingStory.id}`, {
        title: editTitle,
        content: editContent
      });
      
      setStories(prev => prev.map(s => s.id === editingStory.id ? response.data : s));
      setEditingStory(null);
      toast.success("Story updated!");
      
    } catch (error) {
      console.error("Error updating story:", error);
      toast.error("Failed to update story");
    }
  };

  const deleteStory = async (id) => {
    try {
      await axios.delete(`${API}/stories/${id}`);
      setStories(prev => prev.filter(s => s.id !== id));
      toast.success("Story deleted");
    } catch (error) {
      console.error("Error deleting story:", error);
      toast.error("Failed to delete story");
    }
  };

  const continueStory = async (story) => {
    try {
      setIsGenerating(true);
      
      const response = await axios.post(`${API}/ai/continue-story`, null, {
        params: {
          story_so_far: story.content,
          direction: ""
        }
      });
      
      const updatedContent = story.content + "\n\n" + response.data.continuation;
      
      await axios.put(`${API}/stories/${story.id}`, {
        content: updatedContent
      });
      
      setStories(prev => prev.map(s => 
        s.id === story.id ? { ...s, content: updatedContent, word_count: updatedContent.split(" ").length } : s
      ));
      
      toast.success("Story continued!");
      
    } catch (error) {
      console.error("Error continuing story:", error);
      toast.error("Failed to continue story");
    } finally {
      setIsGenerating(false);
    }
  };

  const viewStory = async (story) => {
    setViewingStory(story);
    // Fetch illustrations for this story
    try {
      const response = await axios.get(`${API}/ai/images/story/${story.id}`);
      setStoryIllustrations(response.data);
    } catch (error) {
      console.error("Error fetching illustrations:", error);
      setStoryIllustrations([]);
    }
  };

  const generateIllustration = async () => {
    if (!viewingStory) return;
    
    try {
      setIsGeneratingIllustration(true);
      
      const response = await axios.post(`${API}/ai/generate-illustration`, {
        story_id: viewingStory.id,
        chapter_content: viewingStory.content,
        chapter_title: viewingStory.title,
        style: illustrationStyle
      });
      
      setStoryIllustrations(prev => [response.data, ...prev]);
      toast.success("Illustration generated!");
      
    } catch (error) {
      console.error("Error generating illustration:", error);
      toast.error("Failed to generate illustration");
    } finally {
      setIsGeneratingIllustration(false);
    }
  };

  const getGenreBadgeClass = (genre) => {
    const classes = {
      Fantasy: "bg-purple-100 text-purple-800",
      Mystery: "bg-gray-100 text-gray-800",
      Romance: "bg-pink-100 text-pink-800",
      "Sci-Fi": "bg-blue-100 text-blue-800",
      Horror: "bg-red-100 text-red-800",
      Adventure: "bg-green-100 text-green-800",
      General: "bg-stone-100 text-stone-800"
    };
    return classes[genre] || classes.General;
  };

  const startEditing = (story) => {
    setEditingStory(story);
    setEditTitle(story.title);
    setEditContent(story.content);
  };

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#fdfcfb]" data-testid="story-studio-page">
      {/* Hero Section */}
      <div className="relative overflow-hidden bg-gradient-to-b from-[#f5f2eb] to-[#fdfcfb] py-12 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="font-heading text-4xl md:text-5xl font-semibold text-foreground mb-4">
            Story Studio
          </h1>
          <p className="text-lg text-muted-foreground mb-8">
            Let Nyxen help you craft amazing stories with AI-powered generation
          </p>
          
          <Dialog open={showNewStory} onOpenChange={setShowNewStory}>
            <DialogTrigger asChild>
              <Button 
                className="rounded-full px-8 py-6 text-lg shadow-lg hover:shadow-xl transition-all duration-300"
                data-testid="create-story-btn"
              >
                <Plus className="w-5 h-5 mr-2" />
                Create New Story
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle className="font-heading text-2xl">Create a New Story</DialogTitle>
              </DialogHeader>
              
              <div className="space-y-6 mt-4">
                {/* AI Generation Section */}
                <div className="p-6 bg-secondary/50 rounded-xl space-y-4">
                  <div className="flex items-center gap-2 text-primary">
                    <Sparkles className="w-5 h-5" />
                    <span className="font-medium">AI Story Generator</span>
                  </div>
                  
                  <Textarea
                    value={newPrompt}
                    onChange={(e) => setNewPrompt(e.target.value)}
                    placeholder="Describe your story idea... (e.g., 'A young wizard discovers a hidden library')"
                    className="min-h-[100px]"
                    data-testid="story-prompt-input"
                  />
                  
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="text-sm text-muted-foreground mb-1 block">Genre</label>
                      <Select value={newGenre} onValueChange={setNewGenre}>
                        <SelectTrigger data-testid="genre-select">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {GENRES.map(g => (
                            <SelectItem key={g} value={g}>{g}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex-1">
                      <label className="text-sm text-muted-foreground mb-1 block">Length</label>
                      <Select value={newLength} onValueChange={setNewLength}>
                        <SelectTrigger data-testid="length-select">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {LENGTHS.map(l => (
                            <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <Button 
                    onClick={generateStory} 
                    disabled={isGenerating || !newPrompt.trim()}
                    className="w-full rounded-full"
                    data-testid="generate-story-btn"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 mr-2" />
                        Generate Story
                      </>
                    )}
                  </Button>
                </div>

                {/* Manual Entry Section */}
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">Or write manually</span>
                  </div>
                </div>

                <div className="space-y-4">
                  <Input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="Story title"
                    data-testid="story-title-input"
                  />
                  <Textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    placeholder="Write your story here..."
                    className="min-h-[200px] font-editor"
                    data-testid="story-content-input"
                  />
                  <Button 
                    onClick={saveManualStory}
                    variant="outline"
                    className="w-full rounded-full"
                    disabled={!editTitle.trim() || !editContent.trim()}
                    data-testid="save-manual-story-btn"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    Save Story
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stories Grid */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <Card key={i} className="animate-pulse">
                <div className="h-40 bg-muted rounded-t-xl" />
                <CardContent className="p-6">
                  <div className="h-6 bg-muted rounded mb-4" />
                  <div className="h-4 bg-muted rounded w-3/4" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : stories.length === 0 ? (
          <div className="text-center py-16">
            <BookOpen className="w-16 h-16 mx-auto text-muted-foreground/40 mb-4" />
            <h3 className="text-xl font-heading text-muted-foreground mb-2">No stories yet</h3>
            <p className="text-muted-foreground">Create your first story with Nyxen's help!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {stories.map(story => (
              <Card 
                key={story.id} 
                className="group hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
                data-testid={`story-card-${story.id}`}
              >
                <div 
                  className="h-40 bg-cover bg-center rounded-t-xl"
                  style={{ 
                    backgroundImage: `url(${TEMPLATE_IMAGES[story.genre] || TEMPLATE_IMAGES.Classic})` 
                  }}
                />
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-3">
                    <Badge className={getGenreBadgeClass(story.genre)}>{story.genre}</Badge>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      {story.word_count} words
                    </div>
                  </div>
                  
                  <h3 className="font-heading text-lg font-medium mb-2 line-clamp-1">{story.title}</h3>
                  <p className="text-sm text-muted-foreground line-clamp-3 font-editor">
                    {story.content}
                  </p>
                  
                  <div className="flex flex-wrap gap-2 mt-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button 
                      size="sm" 
                      variant="default"
                      onClick={() => viewStory(story)}
                      data-testid={`view-story-${story.id}`}
                    >
                      <Image className="w-3 h-3 mr-1" />
                      View & Illustrate
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => startEditing(story)}
                      data-testid={`edit-story-${story.id}`}
                    >
                      <Edit2 className="w-3 h-3 mr-1" />
                      Edit
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => continueStory(story)}
                      disabled={isGenerating}
                      data-testid={`continue-story-${story.id}`}
                    >
                      <Sparkles className="w-3 h-3 mr-1" />
                      Continue
                    </Button>
                    <Button 
                      size="sm" 
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => deleteStory(story.id)}
                      data-testid={`delete-story-${story.id}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Edit Story Dialog */}
      <Dialog open={!!editingStory} onOpenChange={() => setEditingStory(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="font-heading text-2xl">Edit Story</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 mt-4">
            <Input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="Story title"
            />
            <ScrollArea className="h-[400px]">
              <Textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="min-h-[380px] font-editor text-lg leading-relaxed"
              />
            </ScrollArea>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setEditingStory(null)}>
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
              <Button onClick={updateStory}>
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Story & Illustrations Dialog */}
      <Dialog open={!!viewingStory} onOpenChange={() => setViewingStory(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="font-heading text-2xl">{viewingStory?.title}</DialogTitle>
          </DialogHeader>
          
          <Tabs defaultValue="story" className="mt-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="story">Story Content</TabsTrigger>
              <TabsTrigger value="illustrations">Illustrations ({storyIllustrations.length})</TabsTrigger>
            </TabsList>
            
            <TabsContent value="story" className="mt-4">
              <ScrollArea className="h-[400px] p-4 border rounded-lg bg-secondary/20">
                <div className="font-editor text-lg leading-relaxed whitespace-pre-wrap">
                  {viewingStory?.content}
                </div>
              </ScrollArea>
            </TabsContent>
            
            <TabsContent value="illustrations" className="mt-4">
              {/* Generate Illustration Section */}
              <div className="p-4 border rounded-lg bg-secondary/30 mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <Wand2 className="w-5 h-5 text-primary" />
                  <span className="font-medium">Generate Story Illustration</span>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Nyxen will analyze your story and create a stunning illustration capturing its essence.
                </p>
                <div className="flex gap-4 items-end">
                  <div className="flex-1">
                    <label className="text-sm text-muted-foreground mb-1 block">Style</label>
                    <Select value={illustrationStyle} onValueChange={setIllustrationStyle}>
                      <SelectTrigger data-testid="illustration-style-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fantasy">Fantasy</SelectItem>
                        <SelectItem value="realistic">Realistic</SelectItem>
                        <SelectItem value="artistic">Artistic</SelectItem>
                        <SelectItem value="anime">Anime</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    onClick={generateIllustration}
                    disabled={isGeneratingIllustration}
                    className="rounded-full"
                    data-testid="generate-illustration-btn"
                  >
                    {isGeneratingIllustration ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Image className="w-4 h-4 mr-2" />
                        Generate Illustration
                      </>
                    )}
                  </Button>
                </div>
              </div>
              
              {/* Illustrations Gallery */}
              {storyIllustrations.length === 0 ? (
                <div className="text-center py-12 bg-secondary/20 rounded-lg">
                  <Image className="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" />
                  <p className="text-muted-foreground">No illustrations yet. Generate one above!</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {storyIllustrations.map((img, index) => (
                    <div key={img.id || index} className="relative group rounded-lg overflow-hidden">
                      <img
                        src={img.image_url}
                        alt={img.prompt}
                        className="w-full h-48 object-cover"
                      />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity p-3 flex flex-col justify-end">
                        <p className="text-white text-xs line-clamp-2">{img.prompt}</p>
                        <p className="text-white/70 text-xs mt-1">{img.chapter_title}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
