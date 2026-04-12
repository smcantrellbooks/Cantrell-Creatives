import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import Layout from "@/components/Layout";
import ChatPage from "@/pages/ChatPage";
import StoryStudioPage from "@/pages/StoryStudioPage";
import DocumentEditorPage from "@/pages/DocumentEditorPage";
import ImageGeneratorPage from "@/pages/ImageGeneratorPage";
import VoiceStudioPage from "@/pages/VoiceStudioPage";
import AudiobookPage from "@/pages/AudiobookPage";
import VoiceExplorerPage from "@/pages/VoiceExplorerPage";
import CreditsPage from "@/pages/CreditsPage";
import SettingsPage from "@/pages/SettingsPage";
import NyxenStandalone from "@/pages/NyxenStandalone";

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          {/* Standalone Nyxen Chat - No navigation, just the AI */}
          <Route path="/nyxen" element={<NyxenStandalone />} />
          
          {/* Full App with all features */}
          <Route path="/" element={<Layout />}>
            <Route index element={<ChatPage />} />
            <Route path="stories" element={<StoryStudioPage />} />
            <Route path="editor" element={<DocumentEditorPage />} />
            <Route path="editor/:id" element={<DocumentEditorPage />} />
            <Route path="images" element={<ImageGeneratorPage />} />
            <Route path="voice-studio" element={<VoiceStudioPage />} />
            <Route path="audiobook" element={<AudiobookPage />} />
            <Route path="voices" element={<VoiceExplorerPage />} />
            <Route path="credits" element={<CreditsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" richColors />
    </div>
  );
}

export default App;
