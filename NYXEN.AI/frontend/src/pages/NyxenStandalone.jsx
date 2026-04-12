import { useState, useRef, useEffect } from "react";
import axios from "axios";
import { Send, Volume2, VolumeX, Sparkles, Loader2, Trash2, Settings, X } from "lucide-react";

// Standalone Nyxen Chat App - Can be deployed separately
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "";
const API = `${BACKEND_URL}/api`;

const NYXEN_AVATAR = "https://cdn1.site-media.eu/images/0/24185616/nyxen-hucYBsyp6NvKtsJFls-OUg.jpg";

const WELCOME_MESSAGE = {
  role: "assistant",
  content: "Hello! I'm Nyxen, your AI assistant. I'm here to help you with creative writing, storytelling, editing, and more. How can I assist you today?"
};

export default function NyxenChatApp() {
  const [messages, setMessages] = useState([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [voiceRate, setVoiceRate] = useState(1);
  const [voicePitch, setVoicePitch] = useState(1);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const speak = (text) => {
    if (!voiceEnabled || !window.speechSynthesis) return;
    
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = voiceRate;
    utterance.pitch = voicePitch;
    
    const voices = window.speechSynthesis.getVoices();
    const femaleVoice = voices.find(v => 
      v.name.includes("Female") || v.name.includes("Samantha") || 
      v.name.includes("Victoria") || v.name.includes("Karen")
    );
    if (femaleVoice) utterance.voice = femaleVoice;
    
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    
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
        messages: [...messages.filter(m => m !== WELCOME_MESSAGE), userMessage],
        conversation_id: conversationId,
        temperature: 0.7,
        max_tokens: 1024
      });

      const assistantMessage = { role: "assistant", content: response.data.content };
      setMessages(prev => [...prev, assistantMessage]);
      setConversationId(response.data.conversation_id);
      speak(response.data.content);
      
    } catch (error) {
      console.error("Chat error:", error);
      setMessages(prev => [...prev, { 
        role: "assistant", 
        content: "I apologize, but I'm having trouble connecting right now. Please try again." 
      }]);
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
  };

  return (
    <div className="nyxen-chat-app" data-testid="nyxen-standalone-chat">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=Playfair+Display:wght@400;500;600&display=swap');
        
        .nyxen-chat-app {
          font-family: 'Inter', -apple-system, sans-serif;
          height: 100vh;
          display: flex;
          flex-direction: column;
          background: linear-gradient(180deg, #f5f2eb 0%, #fdfcfb 100%);
        }
        
        .nyxen-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1rem 1.5rem;
          background: rgba(255,255,255,0.9);
          backdrop-filter: blur(10px);
          border-bottom: 1px solid rgba(0,0,0,0.06);
        }
        
        .nyxen-logo {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }
        
        .nyxen-avatar {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          border: 2px solid white;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
          object-fit: cover;
        }
        
        .nyxen-title {
          font-family: 'Playfair Display', serif;
          font-size: 1.5rem;
          font-weight: 600;
          color: #32251a;
          margin: 0;
        }
        
        .nyxen-subtitle {
          font-size: 0.75rem;
          color: #666;
          margin: 0;
        }
        
        .nyxen-actions {
          display: flex;
          gap: 0.5rem;
        }
        
        .icon-btn {
          padding: 0.5rem;
          border: none;
          background: transparent;
          border-radius: 50%;
          cursor: pointer;
          color: #666;
          transition: all 0.2s;
        }
        
        .icon-btn:hover {
          background: rgba(0,0,0,0.05);
          color: #32251a;
        }
        
        .nyxen-messages {
          flex: 1;
          overflow-y: auto;
          padding: 1.5rem;
        }
        
        .message-container {
          max-width: 800px;
          margin: 0 auto;
        }
        
        .message {
          display: flex;
          gap: 0.75rem;
          margin-bottom: 1.5rem;
          animation: fadeIn 0.3s ease-out;
        }
        
        .message.user {
          flex-direction: row-reverse;
        }
        
        .message-avatar {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        
        .message-avatar.user {
          background: #e5e5e5;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.75rem;
          color: #666;
        }
        
        .message-bubble {
          max-width: 75%;
          padding: 1rem 1.25rem;
          border-radius: 1.25rem;
          line-height: 1.6;
        }
        
        .message.assistant .message-bubble {
          background: white;
          border-radius: 1.25rem 1.25rem 1.25rem 0.25rem;
          box-shadow: 0 2px 8px rgba(0,0,0,0.06);
        }
        
        .message.user .message-bubble {
          background: #32251a;
          color: white;
          border-radius: 1.25rem 1.25rem 0.25rem 1.25rem;
        }
        
        .typing-indicator {
          display: flex;
          gap: 4px;
          padding: 0.5rem 0;
        }
        
        .typing-dot {
          width: 8px;
          height: 8px;
          background: #999;
          border-radius: 50%;
          animation: bounce 1.4s infinite ease-in-out;
        }
        
        .typing-dot:nth-child(2) { animation-delay: 0.2s; }
        .typing-dot:nth-child(3) { animation-delay: 0.4s; }
        
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-4px); }
        }
        
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        .speaking-indicator {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 0.5rem;
          background: rgba(50,37,26,0.05);
          font-size: 0.75rem;
          color: #666;
        }
        
        .waveform {
          display: flex;
          gap: 2px;
          align-items: center;
        }
        
        .wave-bar {
          width: 3px;
          height: 16px;
          background: #32251a;
          border-radius: 2px;
          animation: wave 0.8s ease-in-out infinite;
        }
        
        .wave-bar:nth-child(2) { animation-delay: 0.1s; }
        .wave-bar:nth-child(3) { animation-delay: 0.2s; }
        .wave-bar:nth-child(4) { animation-delay: 0.3s; }
        .wave-bar:nth-child(5) { animation-delay: 0.4s; }
        
        @keyframes wave {
          0%, 100% { transform: scaleY(0.5); }
          50% { transform: scaleY(1); }
        }
        
        .nyxen-input-area {
          padding: 1rem 1.5rem 1.5rem;
          background: white;
          border-top: 1px solid rgba(0,0,0,0.06);
        }
        
        .input-container {
          max-width: 800px;
          margin: 0 auto;
        }
        
        .input-wrapper {
          display: flex;
          gap: 0.75rem;
        }
        
        .input-field-wrapper {
          flex: 1;
          position: relative;
        }
        
        .input-field {
          width: 100%;
          padding: 1rem 3rem 1rem 1rem;
          border: 1px solid rgba(0,0,0,0.1);
          border-radius: 1rem;
          font-size: 1rem;
          font-family: inherit;
          resize: none;
          min-height: 56px;
          max-height: 150px;
          line-height: 1.5;
        }
        
        .input-field:focus {
          outline: none;
          border-color: #32251a;
          box-shadow: 0 0 0 3px rgba(50,37,26,0.1);
        }
        
        .voice-toggle {
          position: absolute;
          right: 0.75rem;
          bottom: 0.75rem;
          padding: 0.5rem;
          border: none;
          background: transparent;
          cursor: pointer;
          color: #32251a;
          border-radius: 50%;
        }
        
        .voice-toggle:hover {
          background: rgba(0,0,0,0.05);
        }
        
        .voice-toggle.disabled {
          color: #999;
        }
        
        .send-btn {
          padding: 1rem 1.5rem;
          background: #32251a;
          color: white;
          border: none;
          border-radius: 1rem;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .send-btn:hover:not(:disabled) {
          background: #4a3828;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(50,37,26,0.3);
        }
        
        .send-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        .input-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 0.5rem;
          font-size: 0.75rem;
          color: #999;
        }
        
        .powered-by {
          display: flex;
          align-items: center;
          gap: 0.25rem;
        }
        
        .clear-btn {
          padding: 0.25rem 0.5rem;
          border: none;
          background: transparent;
          cursor: pointer;
          color: #999;
          font-size: 0.75rem;
          display: flex;
          align-items: center;
          gap: 0.25rem;
          border-radius: 0.25rem;
        }
        
        .clear-btn:hover {
          background: rgba(0,0,0,0.05);
          color: #666;
        }
        
        .settings-panel {
          position: fixed;
          top: 0;
          right: 0;
          width: 320px;
          height: 100vh;
          background: white;
          box-shadow: -4px 0 24px rgba(0,0,0,0.1);
          z-index: 100;
          padding: 1.5rem;
          animation: slideIn 0.3s ease-out;
        }
        
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        
        .settings-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
        }
        
        .settings-title {
          font-family: 'Playfair Display', serif;
          font-size: 1.25rem;
          font-weight: 600;
          color: #32251a;
        }
        
        .settings-section {
          margin-bottom: 1.5rem;
        }
        
        .settings-label {
          font-size: 0.875rem;
          font-weight: 500;
          color: #32251a;
          margin-bottom: 0.5rem;
          display: block;
        }
        
        .settings-slider {
          width: 100%;
          height: 6px;
          border-radius: 3px;
          background: #e5e5e5;
          appearance: none;
          cursor: pointer;
        }
        
        .settings-slider::-webkit-slider-thumb {
          appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #32251a;
          cursor: pointer;
        }
        
        .slider-value {
          font-size: 0.75rem;
          color: #999;
          margin-top: 0.25rem;
        }
        
        .overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.3);
          z-index: 99;
        }
        
        @media (max-width: 640px) {
          .nyxen-header {
            padding: 0.75rem 1rem;
          }
          .nyxen-title {
            font-size: 1.25rem;
          }
          .nyxen-messages {
            padding: 1rem;
          }
          .message-bubble {
            max-width: 85%;
          }
          .nyxen-input-area {
            padding: 0.75rem 1rem 1rem;
          }
          .settings-panel {
            width: 100%;
          }
        }
      `}</style>

      {/* Header */}
      <header className="nyxen-header">
        <div className="nyxen-logo">
          <img src={NYXEN_AVATAR} alt="Nyxen" className="nyxen-avatar" />
          <div>
            <h1 className="nyxen-title">Nyxen</h1>
            <p className="nyxen-subtitle">AI Writing Assistant</p>
          </div>
        </div>
        <div className="nyxen-actions">
          <button 
            className="icon-btn" 
            onClick={() => setShowSettings(true)}
            title="Settings"
          >
            <Settings size={20} />
          </button>
        </div>
      </header>

      {/* Messages */}
      <div className="nyxen-messages">
        <div className="message-container">
          {messages.map((message, index) => (
            <div key={index} className={`message ${message.role}`}>
              {message.role === "assistant" ? (
                <img src={NYXEN_AVATAR} alt="Nyxen" className="message-avatar" />
              ) : (
                <div className="message-avatar user">You</div>
              )}
              <div className="message-bubble">
                {message.content}
              </div>
            </div>
          ))}
          
          {isLoading && (
            <div className="message assistant">
              <img src={NYXEN_AVATAR} alt="Nyxen" className="message-avatar" />
              <div className="message-bubble">
                <div className="typing-indicator">
                  <span className="typing-dot"></span>
                  <span className="typing-dot"></span>
                  <span className="typing-dot"></span>
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Speaking Indicator */}
      {isSpeaking && (
        <div className="speaking-indicator">
          <span>Nyxen is speaking</span>
          <div className="waveform">
            <div className="wave-bar"></div>
            <div className="wave-bar"></div>
            <div className="wave-bar"></div>
            <div className="wave-bar"></div>
            <div className="wave-bar"></div>
          </div>
          <button className="icon-btn" onClick={stopSpeaking}>
            <VolumeX size={16} />
          </button>
        </div>
      )}

      {/* Input Area */}
      <div className="nyxen-input-area">
        <div className="input-container">
          <form onSubmit={handleSubmit} className="input-wrapper">
            <div className="input-field-wrapper">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask Nyxen anything..."
                className="input-field"
                disabled={isLoading}
                rows={1}
              />
              <button
                type="button"
                className={`voice-toggle ${!voiceEnabled ? 'disabled' : ''}`}
                onClick={() => setVoiceEnabled(!voiceEnabled)}
                title={voiceEnabled ? "Disable voice" : "Enable voice"}
              >
                {voiceEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
              </button>
            </div>
            <button
              type="submit"
              className="send-btn"
              disabled={!input.trim() || isLoading}
            >
              {isLoading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
            </button>
          </form>
          
          <div className="input-footer">
            <div className="powered-by">
              <Sparkles size={12} />
              <span>Powered by Llama 3.1</span>
            </div>
            <button className="clear-btn" onClick={clearChat}>
              <Trash2 size={12} />
              Clear chat
            </button>
          </div>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <>
          <div className="overlay" onClick={() => setShowSettings(false)} />
          <div className="settings-panel">
            <div className="settings-header">
              <h2 className="settings-title">Settings</h2>
              <button className="icon-btn" onClick={() => setShowSettings(false)}>
                <X size={20} />
              </button>
            </div>
            
            <div className="settings-section">
              <label className="settings-label">Voice Speed</label>
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.1"
                value={voiceRate}
                onChange={(e) => setVoiceRate(parseFloat(e.target.value))}
                className="settings-slider"
              />
              <div className="slider-value">{voiceRate.toFixed(1)}x</div>
            </div>
            
            <div className="settings-section">
              <label className="settings-label">Voice Pitch</label>
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.1"
                value={voicePitch}
                onChange={(e) => setVoicePitch(parseFloat(e.target.value))}
                className="settings-slider"
              />
              <div className="slider-value">{voicePitch.toFixed(1)}</div>
            </div>
            
            <button
              onClick={() => {
                speak("Hello! I'm Nyxen, your AI writing assistant.");
              }}
              style={{
                width: '100%',
                padding: '0.75rem',
                background: '#32251a',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                fontSize: '0.875rem'
              }}
            >
              Test Voice
            </button>
          </div>
        </>
      )}
    </div>
  );
}
