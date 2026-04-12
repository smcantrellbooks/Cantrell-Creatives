import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { 
  Save, FileText, Sparkles, RotateCcw, List, ListOrdered, 
  AlignLeft, Heading, Plus, Trash2, Loader2, ArrowLeft,
  Wand2, MessageSquare
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const REWRITE_STYLES = [
  { value: "professional", label: "Professional" },
  { value: "casual", label: "Casual" },
  { value: "formal", label: "Formal" },
  { value: "creative", label: "Creative" }
];

const FORMAT_TYPES = [
  { value: "paragraphs", label: "Paragraphs", icon: AlignLeft },
  { value: "bullets", label: "Bullet Points", icon: List },
  { value: "numbered", label: "Numbered List", icon: ListOrdered },
  { value: "headers", label: "With Headers", icon: Heading }
];

export default function DocumentEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [documents, setDocuments] = useState([]);
  const [currentDoc, setCurrentDoc] = useState(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [selectedText, setSelectedText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [suggestions, setSuggestions] = useState("");
  const [rewriteStyle, setRewriteStyle] = useState("professional");

  useEffect(() => {
    fetchDocuments();
  }, []);

  useEffect(() => {
    if (id && documents.length > 0) {
      const doc = documents.find(d => d.id === id);
      if (doc) {
        setCurrentDoc(doc);
        setTitle(doc.title);
        setContent(doc.content);
      }
    }
  }, [id, documents]);

  const fetchDocuments = async () => {
    try {
      setIsLoading(true);
      const response = await axios.get(`${API}/documents`);
      setDocuments(response.data);
    } catch (error) {
      console.error("Error fetching documents:", error);
      toast.error("Failed to load documents");
    } finally {
      setIsLoading(false);
    }
  };

  const createNewDocument = async () => {
    try {
      const response = await axios.post(`${API}/documents`, {
        title: "Untitled Document",
        content: "",
        doc_type: "article"
      });
      
      setDocuments(prev => [response.data, ...prev]);
      setCurrentDoc(response.data);
      setTitle(response.data.title);
      setContent(response.data.content);
      navigate(`/editor/${response.data.id}`);
      toast.success("New document created");
      
    } catch (error) {
      console.error("Error creating document:", error);
      toast.error("Failed to create document");
    }
  };

  const saveDocument = async () => {
    if (!currentDoc) return;
    
    try {
      setIsSaving(true);
      await axios.put(`${API}/documents/${currentDoc.id}?content=${encodeURIComponent(content)}&title=${encodeURIComponent(title)}`);
      
      setDocuments(prev => prev.map(d => 
        d.id === currentDoc.id ? { ...d, title, content } : d
      ));
      
      toast.success("Document saved");
      
    } catch (error) {
      console.error("Error saving document:", error);
      toast.error("Failed to save document");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteDocument = async (docId) => {
    try {
      await axios.delete(`${API}/documents/${docId}`);
      setDocuments(prev => prev.filter(d => d.id !== docId));
      
      if (currentDoc?.id === docId) {
        setCurrentDoc(null);
        setTitle("");
        setContent("");
        navigate("/editor");
      }
      
      toast.success("Document deleted");
      
    } catch (error) {
      console.error("Error deleting document:", error);
      toast.error("Failed to delete document");
    }
  };

  const handleTextSelect = () => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim()) {
      setSelectedText(selection.toString());
      setShowTools(true);
    }
  };

  const rewriteText = async () => {
    const textToRewrite = selectedText || content;
    if (!textToRewrite.trim()) {
      toast.error("No text to rewrite");
      return;
    }

    try {
      setIsProcessing(true);
      const response = await axios.post(`${API}/ai/rewrite`, {
        text: textToRewrite,
        style: rewriteStyle
      });
      
      if (selectedText) {
        setContent(content.replace(selectedText, response.data.rewritten));
        setSelectedText("");
      } else {
        setContent(response.data.rewritten);
      }
      
      toast.success("Text rewritten!");
      
    } catch (error) {
      console.error("Error rewriting:", error);
      toast.error("Failed to rewrite text");
    } finally {
      setIsProcessing(false);
      setShowTools(false);
    }
  };

  const formatText = async (formatType) => {
    const textToFormat = selectedText || content;
    if (!textToFormat.trim()) {
      toast.error("No text to format");
      return;
    }

    try {
      setIsProcessing(true);
      const response = await axios.post(`${API}/ai/format`, {
        text: textToFormat,
        format_type: formatType
      });
      
      if (selectedText) {
        setContent(content.replace(selectedText, response.data.formatted));
        setSelectedText("");
      } else {
        setContent(response.data.formatted);
      }
      
      toast.success("Text formatted!");
      
    } catch (error) {
      console.error("Error formatting:", error);
      toast.error("Failed to format text");
    } finally {
      setIsProcessing(false);
      setShowTools(false);
    }
  };

  const getEditSuggestions = async () => {
    if (!content.trim()) {
      toast.error("No content to analyze");
      return;
    }

    try {
      setIsProcessing(true);
      const response = await axios.post(`${API}/ai/edit-suggestions`, null, {
        params: { text: content }
      });
      
      setSuggestions(response.data.suggestions);
      
    } catch (error) {
      console.error("Error getting suggestions:", error);
      toast.error("Failed to get suggestions");
    } finally {
      setIsProcessing(false);
    }
  };

  const selectDocument = (doc) => {
    setCurrentDoc(doc);
    setTitle(doc.title);
    setContent(doc.content);
    navigate(`/editor/${doc.id}`);
  };

  return (
    <div className="h-[calc(100vh-64px)] flex" data-testid="document-editor-page">
      {/* Sidebar */}
      <div className="w-64 border-r border-border bg-card hidden md:flex flex-col">
        <div className="p-4 border-b border-border">
          <Button 
            onClick={createNewDocument} 
            className="w-full rounded-lg"
            data-testid="new-document-btn"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Document
          </Button>
        </div>
        
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {isLoading ? (
              <div className="p-4 text-center text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mx-auto" />
              </div>
            ) : documents.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground text-sm">
                No documents yet
              </div>
            ) : (
              documents.map(doc => (
                <div
                  key={doc.id}
                  className={`group flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                    currentDoc?.id === doc.id 
                      ? "bg-secondary text-foreground" 
                      : "hover:bg-secondary/50 text-muted-foreground"
                  }`}
                  onClick={() => selectDocument(doc)}
                  data-testid={`doc-item-${doc.id}`}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <FileText className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate text-sm">{doc.title}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteDocument(doc.id);
                    }}
                    data-testid={`delete-doc-${doc.id}`}
                  >
                    <Trash2 className="w-3 h-3 text-destructive" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Main Editor */}
      <div className="flex-1 flex flex-col">
        {currentDoc ? (
          <>
            {/* Editor Toolbar */}
            <div className="border-b border-border bg-white p-4">
              <div className="flex items-center justify-between gap-4">
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="font-heading text-xl border-0 bg-transparent focus-visible:ring-0 p-0 h-auto"
                  placeholder="Document title..."
                  data-testid="doc-title-input"
                />
                
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={getEditSuggestions}
                    disabled={isProcessing}
                    data-testid="get-suggestions-btn"
                  >
                    <MessageSquare className="w-4 h-4 mr-1" />
                    Suggestions
                  </Button>
                  <Button
                    onClick={saveDocument}
                    disabled={isSaving}
                    size="sm"
                    data-testid="save-doc-btn"
                  >
                    {isSaving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-1" />
                        Save
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>

            {/* Editor Content */}
            <div className="flex-1 flex">
              <div className="flex-1 p-6 md:p-12">
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  onMouseUp={handleTextSelect}
                  className="w-full h-full min-h-[400px] font-editor text-lg leading-relaxed border-0 bg-transparent focus-visible:ring-0 resize-none"
                  placeholder="Start writing your masterpiece..."
                  data-testid="doc-content-textarea"
                />
              </div>

              {/* Suggestions Panel */}
              {suggestions && (
                <div className="w-80 border-l border-border bg-secondary/30 p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-medium text-sm">Edit Suggestions</h3>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => setSuggestions("")}
                    >
                      <ArrowLeft className="w-4 h-4" />
                    </Button>
                  </div>
                  <ScrollArea className="h-[calc(100vh-200px)]">
                    <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {suggestions}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <FileText className="w-16 h-16 mx-auto text-muted-foreground/40 mb-4" />
              <h3 className="text-xl font-heading text-muted-foreground mb-2">No document selected</h3>
              <p className="text-muted-foreground mb-6">Create a new document or select one from the sidebar</p>
              <Button onClick={createNewDocument} data-testid="create-first-doc-btn">
                <Plus className="w-4 h-4 mr-2" />
                Create Document
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Text Tools Dialog */}
      <Dialog open={showTools} onOpenChange={setShowTools}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">AI Writing Tools</DialogTitle>
          </DialogHeader>
          
          <Tabs defaultValue="rewrite" className="mt-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="rewrite">Rewrite</TabsTrigger>
              <TabsTrigger value="format">Format</TabsTrigger>
            </TabsList>
            
            <TabsContent value="rewrite" className="space-y-4 mt-4">
              <div>
                <label className="text-sm text-muted-foreground mb-2 block">Style</label>
                <Select value={rewriteStyle} onValueChange={setRewriteStyle}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REWRITE_STYLES.map(s => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="p-3 bg-secondary rounded-lg text-sm">
                <p className="text-muted-foreground mb-1">Selected text:</p>
                <p className="line-clamp-3">{selectedText || "No text selected - will rewrite entire document"}</p>
              </div>
              
              <Button 
                onClick={rewriteText} 
                className="w-full"
                disabled={isProcessing}
                data-testid="rewrite-btn"
              >
                {isProcessing ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Wand2 className="w-4 h-4 mr-2" />
                )}
                Rewrite
              </Button>
            </TabsContent>
            
            <TabsContent value="format" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-2">
                {FORMAT_TYPES.map(f => (
                  <Button
                    key={f.value}
                    variant="outline"
                    className="h-auto py-4 flex-col gap-2"
                    onClick={() => formatText(f.value)}
                    disabled={isProcessing}
                    data-testid={`format-${f.value}-btn`}
                  >
                    <f.icon className="w-5 h-5" />
                    <span className="text-xs">{f.label}</span>
                  </Button>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
