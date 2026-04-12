import { useState, useRef, useEffect } from "react";
import axios from "axios";
import { Send, Volume2, VolumeX, Sparkles, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const NYXEN_AVATAR = "https://cdn1.site-media.eu/images/0/24185616/nyxen-hucYBsyp6NvKtsJFls-OUg.jpg";

const WELCOME_MESSAGE = {
  role: "assistant",
  content: "Hello! I'm Nyxen, your AI writing assistant. I'm here to help you with creative writing, storytelling, editing, and more. How can I assist you today?"
};

export default function ChatPage() {
  const [messages, setMessages] = useState([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const speechSynthRef = useRef(null);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const speak = (text) => {
    if (!voiceEnabled || !window.speechSynthesis) return;
    
    // Cancel any ongoing speech
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    
    // Try to find a female voice
    const voices = window.speechSynthesis.getVoices();
    const femaleVoice = voices.find(v => 
      v.name.includes("Female") || 
      v.name.includes("Samantha") || 
      v.name.includes("Victoria") ||
      v.name.includes("Karen")
    );
    if (femaleVoice) utterance.voice = femaleVoice;
    
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    
    speechSynthRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  };

  const stopSpeaking = () => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = { role: "user", content: input.trim() };
    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await axios.post(`${API}/chat`, {
        messages: [...messages.filter(m => m.role !== "assistant" || messages.indexOf(m) !== 0), userMessage],
        conversation_id: conversationId,
        temperature: 0.7,
        max_tokens: 1024
      });

      const assistantMessage = { role: "assistant", content: response.data.content };
      setMessages(prev => [...prev, assistantMessage]);
      setConversationId(response.data.conversation_id);
      
      // Speak the response
      speak(response.data.content);
      
    } catch (error) {
      console.error("Chat error:", error);
      toast.error("Failed to get response. Please try again.");
      // Remove the user message if we failed
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const clearChat = () => {
    setMessages([WELCOME_MESSAGE]);
    setConversationId(null);
    stopSpeaking();
    toast.success("Chat cleared");
  };

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col" data-testid="chat-page">
      {/* Chat Messages */}
      <ScrollArea className="flex-1 p-4 md:p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex gap-3 animate-fade-in-up ${
                message.role === "user" ? "flex-row-reverse" : ""
              }`}
              data-testid={`message-${message.role}-${index}`}
            >
              {message.role === "assistant" && (
                <Avatar className="h-10 w-10 border-2 border-white shadow-lg flex-shrink-0">
                  <AvatarImage src={NYXEN_AVATAR} alt="Nyxen" />
                  <AvatarFallback className="bg-primary text-primary-foreground font-heading">N</AvatarFallback>
                </Avatar>
              )}
              
              <div
                className={`px-5 py-4 rounded-2xl max-w-[80%] ${
                  message.role === "user"
                    ? "bg-primary text-primary-foreground rounded-tr-sm"
                    : "bg-secondary text-secondary-foreground rounded-tl-sm shadow-sm"
                }`}
              >
                <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
              </div>
              
              {message.role === "user" && (
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-medium text-muted-foreground">You</span>
                </div>
              )}
            </div>
          ))}
          
          {isLoading && (
            <div className="flex gap-3" data-testid="loading-indicator">
              <Avatar className="h-10 w-10 border-2 border-white shadow-lg flex-shrink-0">
                <AvatarImage src={NYXEN_AVATAR} alt="Nyxen" />
                <AvatarFallback className="bg-primary text-primary-foreground font-heading">N</AvatarFallback>
              </Avatar>
              <div className="bg-secondary rounded-2xl rounded-tl-sm px-5 py-4 shadow-sm">
                <div className="flex gap-1">
                  <span className="typing-dot w-2 h-2 bg-muted-foreground/60 rounded-full"></span>
                  <span className="typing-dot w-2 h-2 bg-muted-foreground/60 rounded-full"></span>
                  <span className="typing-dot w-2 h-2 bg-muted-foreground/60 rounded-full"></span>
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Voice Waveform (when speaking) */}
      {isSpeaking && (
        <div className="flex items-center justify-center gap-1 py-2 bg-primary/5">
          <span className="text-xs text-muted-foreground mr-2">Nyxen is speaking</span>
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="waveform-bar w-1 h-4 bg-primary/60 rounded-full"
            />
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={stopSpeaking}
            className="ml-2"
            data-testid="stop-speaking-btn"
          >
            <VolumeX className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Input Area */}
      <div className="border-t border-border/40 bg-white p-4">
        <div className="max-w-3xl mx-auto">
          <form onSubmit={handleSubmit} className="flex gap-3">
            <div className="flex-1 relative">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask Nyxen anything about writing, stories, or get creative help..."
                className="min-h-[56px] max-h-[200px] resize-none pr-12 rounded-xl border-border/60 focus:border-primary/40 focus:ring-primary/20"
                disabled={isLoading}
                data-testid="chat-input"
              />
              <div className="absolute right-3 bottom-3 flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setVoiceEnabled(!voiceEnabled)}
                  title={voiceEnabled ? "Disable voice" : "Enable voice"}
                  data-testid="toggle-voice-btn"
                >
                  {voiceEnabled ? (
                    <Volume2 className="w-4 h-4 text-primary" />
                  ) : (
                    <VolumeX className="w-4 h-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </div>
            
            <div className="flex flex-col gap-2">
              <Button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="h-[56px] px-6 rounded-xl bg-primary hover:bg-primary/90 shadow-lg hover:shadow-xl transition-all duration-300"
                data-testid="send-btn"
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </Button>
            </div>
          </form>
          
          <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <Sparkles className="w-3 h-3" />
              <span>Powered by Llama 3.1</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearChat}
              className="h-6 text-xs"
              data-testid="clear-chat-btn"
            >
              <Trash2 className="w-3 h-3 mr-1" />
              Clear chat
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
