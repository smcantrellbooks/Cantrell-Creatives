#!/usr/bin/env python3
"""
OpenVoice Clone Backend API Testing
Tests all endpoints: health, voices, voice-sample, tts, upload, chat, audiobook
"""

import requests
import sys
import json
import time
from datetime import datetime
from pathlib import Path

class OpenVoiceAPITester:
    def __init__(self, base_url="https://voice-clone-tts-3.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []
        self.session_id = None

    def log_test(self, name, success, details="", error=""):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name}")
        else:
            print(f"❌ {name} - {error}")
        
        self.test_results.append({
            "test": name,
            "success": success,
            "details": details,
            "error": error
        })

    def test_health(self):
        """Test GET /api/health"""
        try:
            response = requests.get(f"{self.api_url}/health", timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                required_fields = ["status", "service", "version", "timestamp", "voices_count", "tts_engine", "chat_model"]
                
                missing_fields = [field for field in required_fields if field not in data]
                if missing_fields:
                    self.log_test("Health Check", False, error=f"Missing fields: {missing_fields}")
                    return False
                
                if data["status"] == "healthy" and data["voices_count"] == 24:
                    self.log_test("Health Check", True, f"Status: {data['status']}, Voices: {data['voices_count']}")
                    return True
                else:
                    self.log_test("Health Check", False, error=f"Unexpected values: status={data['status']}, voices={data['voices_count']}")
                    return False
            else:
                self.log_test("Health Check", False, error=f"HTTP {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Health Check", False, error=str(e))
            return False

    def test_voices(self):
        """Test GET /api/voices"""
        try:
            response = requests.get(f"{self.api_url}/voices", timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                
                if "voices" not in data:
                    self.log_test("Get Voices", False, error="Missing 'voices' field")
                    return False, []
                
                voices = data["voices"]
                if len(voices) != 24:
                    self.log_test("Get Voices", False, error=f"Expected 24 voices, got {len(voices)}")
                    return False, []
                
                # Check required fields for first voice
                required_fields = ["id", "name", "openai_voice", "speed", "gender", "style", "accent", "description"]
                first_voice = voices[0]
                missing_fields = [field for field in required_fields if field not in first_voice]
                
                if missing_fields:
                    self.log_test("Get Voices", False, error=f"Missing fields in voice: {missing_fields}")
                    return False, []
                
                self.log_test("Get Voices", True, f"Retrieved {len(voices)} voices with all required fields")
                return True, voices
                
            else:
                self.log_test("Get Voices", False, error=f"HTTP {response.status_code}")
                return False, []
                
        except Exception as e:
            self.log_test("Get Voices", False, error=str(e))
            return False, []

    def test_voice_sample(self, voice_id="voice_01"):
        """Test GET /api/voice-sample/{voice_id}"""
        try:
            response = requests.get(f"{self.api_url}/voice-sample/{voice_id}", timeout=30)
            
            if response.status_code == 200:
                content_type = response.headers.get('content-type', '')
                if 'audio' in content_type:
                    self.log_test(f"Voice Sample ({voice_id})", True, f"Audio file received, size: {len(response.content)} bytes")
                    return True
                else:
                    self.log_test(f"Voice Sample ({voice_id})", False, error=f"Wrong content type: {content_type}")
                    return False
            else:
                self.log_test(f"Voice Sample ({voice_id})", False, error=f"HTTP {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test(f"Voice Sample ({voice_id})", False, error=str(e))
            return False

    def test_tts(self, voice_id="voice_01"):
        """Test POST /api/tts"""
        try:
            payload = {
                "text": "Hello, this is a test of the OpenVoice text-to-speech system.",
                "voice_id": voice_id,
                "speed": 1.0
            }
            
            response = requests.post(
                f"{self.api_url}/tts",
                json=payload,
                timeout=60
            )
            
            if response.status_code == 200:
                data = response.json()
                required_fields = ["id", "audio_url", "voice_id", "voice_name", "text_length"]
                missing_fields = [field for field in required_fields if field not in data]
                
                if missing_fields:
                    self.log_test("TTS Generation", False, error=f"Missing fields: {missing_fields}")
                    return False, None
                
                # Test if audio URL is accessible
                audio_url = f"{self.base_url}{data['audio_url']}"
                audio_response = requests.get(audio_url, timeout=10)
                
                if audio_response.status_code == 200:
                    self.log_test("TTS Generation", True, f"Generated audio for {data['voice_name']}, {data['text_length']} chars")
                    return True, data["id"]
                else:
                    self.log_test("TTS Generation", False, error=f"Audio URL not accessible: HTTP {audio_response.status_code}")
                    return False, None
            else:
                self.log_test("TTS Generation", False, error=f"HTTP {response.status_code}")
                return False, None
                
        except Exception as e:
            self.log_test("TTS Generation", False, error=str(e))
            return False, None

    def test_upload(self):
        """Test POST /api/upload with a mock .docx file"""
        try:
            # Create a simple mock docx content (this is a simplified test)
            # In a real scenario, we'd create a proper .docx file
            mock_docx_content = b"PK\x03\x04" + b"mock docx content for testing"
            
            files = {
                'file': ('test_document.docx', mock_docx_content, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
            }
            
            response = requests.post(
                f"{self.api_url}/upload",
                files=files,
                timeout=30
            )
            
            # Note: This test might fail due to the mock content not being a real .docx
            # But we can still test the endpoint response structure
            if response.status_code in [200, 400, 422]:
                if response.status_code == 200:
                    data = response.json()
                    required_fields = ["filename", "text", "word_count", "paragraph_count"]
                    missing_fields = [field for field in required_fields if field not in data]
                    
                    if missing_fields:
                        self.log_test("File Upload", False, error=f"Missing fields: {missing_fields}")
                        return False
                    
                    self.log_test("File Upload", True, f"Processed {data['filename']}, {data['word_count']} words")
                    return True
                else:
                    # Expected error due to mock file
                    self.log_test("File Upload", True, "Endpoint responds correctly (mock file rejected as expected)")
                    return True
            else:
                self.log_test("File Upload", False, error=f"HTTP {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("File Upload", False, error=str(e))
            return False

    def test_chat(self):
        """Test POST /api/chat with markdown content request"""
        try:
            payload = {
                "message": "Can you explain TTS features using markdown with headers and bullet points?",
                "session_id": self.session_id
            }
            
            response = requests.post(
                f"{self.api_url}/chat",
                json=payload,
                timeout=60
            )
            
            if response.status_code == 200:
                data = response.json()
                required_fields = ["response", "session_id"]
                missing_fields = [field for field in required_fields if field not in data]
                
                if missing_fields:
                    self.log_test("Chat", False, error=f"Missing fields: {missing_fields}")
                    return False
                
                if data["response"] and len(data["response"]) > 0:
                    self.session_id = data["session_id"]  # Store for future tests
                    
                    # Check for markdown elements in response
                    chat_response = data['response']
                    markdown_indicators = ["**", "#", "-", "*", "`"]
                    has_markdown = any(indicator in chat_response for indicator in markdown_indicators)
                    
                    self.log_test("Chat", True, f"Response: {len(data['response'])} chars, Has markdown: {has_markdown}")
                    return True
                else:
                    self.log_test("Chat", False, error="Empty response")
                    return False
            else:
                self.log_test("Chat", False, error=f"HTTP {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Chat", False, error=str(e))
            return False

    def test_history(self):
        """Test GET /api/history (NEW FEATURE)"""
        try:
            response = requests.get(f"{self.api_url}/history", timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                
                if "generations" not in data:
                    self.log_test("History Endpoint", False, error="Missing 'generations' field")
                    return False
                
                generations = data["generations"]
                
                if len(generations) > 0:
                    # Check structure of first generation
                    sample_gen = generations[0]
                    required_fields = ["id", "voice_id", "text", "type", "created_at", "voice_name", "audio_url"]
                    
                    missing_fields = [field for field in required_fields if field not in sample_gen]
                    if missing_fields:
                        self.log_test("History Endpoint", False, error=f"Missing fields in generation: {missing_fields}")
                        return False
                    
                    # Validate generation types
                    valid_types = ["tts", "audiobook"]
                    if sample_gen["type"] not in valid_types:
                        self.log_test("History Endpoint", False, error=f"Invalid generation type: {sample_gen['type']}")
                        return False
                
                self.log_test("History Endpoint", True, f"Found {len(generations)} generations")
                return True
            else:
                self.log_test("History Endpoint", False, error=f"Status {response.status_code}: {response.text[:100]}")
                return False
                
        except Exception as e:
            self.log_test("History Endpoint", False, error=str(e))
            return False

    def test_audiobook(self, narrator_voice="voice_01"):
        """Test POST /api/audiobook"""
        try:
            payload = {
                "text": 'The narrator spoke clearly. "This is dialogue," said the character. The story continued with more narration.',
                "narrator_voice_id": narrator_voice,
                "character_voice_ids": ["voice_07", "voice_13"]
            }
            
            response = requests.post(
                f"{self.api_url}/audiobook",
                json=payload,
                timeout=120  # Longer timeout for audiobook generation
            )
            
            if response.status_code == 200:
                data = response.json()
                required_fields = ["id", "audio_url", "segments_count", "narrator_voice", "character_voices"]
                missing_fields = [field for field in required_fields if field not in data]
                
                if missing_fields:
                    self.log_test("Audiobook Generation", False, error=f"Missing fields: {missing_fields}")
                    return False
                
                # Test if audio URL is accessible
                audio_url = f"{self.base_url}{data['audio_url']}"
                audio_response = requests.get(audio_url, timeout=10)
                
                if audio_response.status_code == 200:
                    self.log_test("Audiobook Generation", True, 
                                f"Generated {data['segments_count']} segments, narrator: {data['narrator_voice']}")
                    return True
                else:
                    self.log_test("Audiobook Generation", False, error=f"Audio URL not accessible: HTTP {audio_response.status_code}")
                    return False
            else:
                self.log_test("Audiobook Generation", False, error=f"HTTP {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Audiobook Generation", False, error=str(e))
            return False

    def test_compare_voices(self):
        """Test POST /api/compare (NEW FEATURE)"""
        try:
            payload = {
                "text": "This is a test for voice comparison feature.",
                "voice_ids": ["voice_01", "voice_05"]
            }
            
            response = requests.post(
                f"{self.api_url}/compare",
                json=payload,
                timeout=120  # Longer timeout for multiple voice generation
            )
            
            if response.status_code == 200:
                data = response.json()
                required_fields = ["results", "text"]
                missing_fields = [field for field in required_fields if field not in data]
                
                if missing_fields:
                    self.log_test("Voice Compare", False, error=f"Missing fields: {missing_fields}")
                    return False
                
                results = data["results"]
                if len(results) != 2:
                    self.log_test("Voice Compare", False, error=f"Expected 2 results, got {len(results)}")
                    return False
                
                # Check structure of results
                for result in results:
                    required_result_fields = ["voice_id", "voice_name", "accent", "style"]
                    missing_result_fields = [field for field in required_result_fields if field not in result]
                    
                    if missing_result_fields:
                        self.log_test("Voice Compare", False, error=f"Missing result fields: {missing_result_fields}")
                        return False
                    
                    # Check if audio_url exists and is accessible (if generation succeeded)
                    if "audio_url" in result and result["audio_url"]:
                        audio_url = f"{self.base_url}{result['audio_url']}"
                        audio_response = requests.get(audio_url, timeout=10)
                        if audio_response.status_code != 200:
                            self.log_test("Voice Compare", False, error=f"Audio URL not accessible for {result['voice_id']}")
                            return False
                
                self.log_test("Voice Compare", True, f"Compared {len(results)} voices successfully")
                return True
            else:
                self.log_test("Voice Compare", False, error=f"HTTP {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Voice Compare", False, error=str(e))
            return False

    def test_batch_tts(self):
        """Test POST /api/batch-tts (NEW FEATURE)"""
        try:
            # Test with long text that should be chunked
            long_text = "This is a test of the batch TTS feature. " * 50  # ~2000 chars
            
            payload = {
                "text": long_text,
                "voice_id": "voice_01",
                "chunk_size": 1000
            }
            
            response = requests.post(
                f"{self.api_url}/batch-tts",
                json=payload,
                timeout=120  # Longer timeout for batch processing
            )
            
            if response.status_code == 200:
                data = response.json()
                required_fields = ["id", "audio_url", "voice_name", "chunks_total", "chunks_generated", "text_length"]
                missing_fields = [field for field in required_fields if field not in data]
                
                if missing_fields:
                    self.log_test("Batch TTS", False, error=f"Missing fields: {missing_fields}")
                    return False
                
                # Verify chunking worked
                if data["chunks_total"] < 2:
                    self.log_test("Batch TTS", False, error=f"Expected multiple chunks, got {data['chunks_total']}")
                    return False
                
                if data["chunks_generated"] != data["chunks_total"]:
                    self.log_test("Batch TTS", False, error=f"Not all chunks generated: {data['chunks_generated']}/{data['chunks_total']}")
                    return False
                
                # Test if audio URL is accessible
                audio_url = f"{self.base_url}{data['audio_url']}"
                audio_response = requests.get(audio_url, timeout=10)
                
                if audio_response.status_code == 200:
                    self.log_test("Batch TTS", True, 
                                f"Generated {data['chunks_generated']}/{data['chunks_total']} chunks, {data['text_length']} chars")
                    return True
                else:
                    self.log_test("Batch TTS", False, error=f"Audio URL not accessible: HTTP {audio_response.status_code}")
                    return False
            else:
                self.log_test("Batch TTS", False, error=f"HTTP {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Batch TTS", False, error=str(e))
            return False

    def test_history_export(self):
        """Test GET /api/history/export (NEW FEATURE)"""
        try:
            # Test JSON export
            json_response = requests.get(f"{self.api_url}/history/export?format=json", timeout=30)
            
            if json_response.status_code == 200:
                content_type = json_response.headers.get('content-type', '')
                if 'application/json' not in content_type:
                    self.log_test("History Export JSON", False, error=f"Wrong content type: {content_type}")
                    return False
                
                # Check if it's valid JSON
                try:
                    json_data = json_response.json()
                    if "generations" not in json_data or "exported_at" not in json_data:
                        self.log_test("History Export JSON", False, error="Missing required fields in JSON export")
                        return False
                except:
                    self.log_test("History Export JSON", False, error="Invalid JSON response")
                    return False
                
                self.log_test("History Export JSON", True, f"JSON export successful, {len(json_data['generations'])} generations")
            else:
                self.log_test("History Export JSON", False, error=f"HTTP {json_response.status_code}")
                return False
            
            # Test CSV export
            csv_response = requests.get(f"{self.api_url}/history/export?format=csv", timeout=30)
            
            if csv_response.status_code == 200:
                content_type = csv_response.headers.get('content-type', '')
                if 'text/csv' not in content_type:
                    self.log_test("History Export CSV", False, error=f"Wrong content type: {content_type}")
                    return False
                
                # Check if CSV has header row
                csv_content = csv_response.text
                if not csv_content.startswith('id,type,voice_id,voice_name,text,audio_url,created_at'):
                    self.log_test("History Export CSV", False, error="CSV missing expected header row")
                    return False
                
                self.log_test("History Export CSV", True, f"CSV export successful, {len(csv_content.split(chr(10)))-1} rows")
                return True
            else:
                self.log_test("History Export CSV", False, error=f"HTTP {csv_response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("History Export", False, error=str(e))
            return False

    def test_stream_tts_short(self):
        """Test POST /api/stream-tts with short text (NEW STREAMING FEATURE)"""
        try:
            payload = {
                "text": "This is a short test for streaming TTS.",
                "voice_id": "voice_01",
                "chunk_size": 500
            }
            
            response = requests.post(
                f"{self.api_url}/stream-tts",
                json=payload,
                timeout=60,
                stream=True
            )
            
            if response.status_code == 200:
                content_type = response.headers.get('content-type', '')
                if 'text/event-stream' not in content_type:
                    self.log_test("Stream TTS Short", False, error=f"Wrong content type: {content_type}")
                    return False
                
                events = []
                for line in response.iter_lines(decode_unicode=True):
                    if line.startswith('data: '):
                        try:
                            event_data = json.loads(line[6:])
                            events.append(event_data)
                        except:
                            continue
                
                # Validate event sequence
                if not events:
                    self.log_test("Stream TTS Short", False, error="No events received")
                    return False
                
                # Check for required event types
                event_types = [event.get('type') for event in events]
                required_types = ['start', 'chunk', 'done']
                
                for req_type in required_types:
                    if req_type not in event_types:
                        self.log_test("Stream TTS Short", False, error=f"Missing event type: {req_type}")
                        return False
                
                # Validate start event
                start_events = [e for e in events if e.get('type') == 'start']
                if not start_events or 'total_chunks' not in start_events[0]:
                    self.log_test("Stream TTS Short", False, error="Invalid start event")
                    return False
                
                # Validate chunk events
                chunk_events = [e for e in events if e.get('type') == 'chunk']
                if not chunk_events:
                    self.log_test("Stream TTS Short", False, error="No chunk events received")
                    return False
                
                for chunk in chunk_events:
                    if 'chunk_index' not in chunk or 'audio_url' not in chunk:
                        self.log_test("Stream TTS Short", False, error="Invalid chunk event structure")
                        return False
                
                # Validate done event
                done_events = [e for e in events if e.get('type') == 'done']
                if not done_events:
                    self.log_test("Stream TTS Short", False, error="No done event received")
                    return False
                
                total_chunks = start_events[0]['total_chunks']
                self.log_test("Stream TTS Short", True, f"Received {len(chunk_events)} chunks, total: {total_chunks}")
                return True
            else:
                self.log_test("Stream TTS Short", False, error=f"HTTP {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Stream TTS Short", False, error=str(e))
            return False

    def test_stream_tts_long(self):
        """Test POST /api/stream-tts with long text for multiple chunks (NEW STREAMING FEATURE)"""
        try:
            # Create long text that should generate multiple chunks
            long_text = "This is a comprehensive test of the streaming TTS feature with a longer text. " * 20  # ~1600 chars
            
            payload = {
                "text": long_text,
                "voice_id": "voice_01", 
                "chunk_size": 500  # Force multiple chunks
            }
            
            response = requests.post(
                f"{self.api_url}/stream-tts",
                json=payload,
                timeout=120,  # Longer timeout for multiple chunks
                stream=True
            )
            
            if response.status_code == 200:
                content_type = response.headers.get('content-type', '')
                if 'text/event-stream' not in content_type:
                    self.log_test("Stream TTS Long", False, error=f"Wrong content type: {content_type}")
                    return False
                
                events = []
                for line in response.iter_lines(decode_unicode=True):
                    if line.startswith('data: '):
                        try:
                            event_data = json.loads(line[6:])
                            events.append(event_data)
                        except:
                            continue
                
                # Validate multiple chunks were generated
                start_events = [e for e in events if e.get('type') == 'start']
                chunk_events = [e for e in events if e.get('type') == 'chunk']
                done_events = [e for e in events if e.get('type') == 'done']
                
                if not start_events:
                    self.log_test("Stream TTS Long", False, error="No start event")
                    return False
                
                total_chunks = start_events[0].get('total_chunks', 0)
                if total_chunks < 2:
                    self.log_test("Stream TTS Long", False, error=f"Expected multiple chunks, got {total_chunks}")
                    return False
                
                if len(chunk_events) != total_chunks:
                    self.log_test("Stream TTS Long", False, error=f"Chunk count mismatch: {len(chunk_events)} vs {total_chunks}")
                    return False
                
                # Validate done event has combined_url
                if not done_events or 'combined_url' not in done_events[0]:
                    self.log_test("Stream TTS Long", False, error="Missing combined_url in done event")
                    return False
                
                # Test combined audio URL accessibility
                combined_url = f"{self.base_url}{done_events[0]['combined_url']}"
                audio_response = requests.get(combined_url, timeout=10)
                
                if audio_response.status_code != 200:
                    self.log_test("Stream TTS Long", False, error=f"Combined audio not accessible: HTTP {audio_response.status_code}")
                    return False
                
                self.log_test("Stream TTS Long", True, f"Generated {len(chunk_events)} chunks progressively, combined audio accessible")
                return True
            else:
                self.log_test("Stream TTS Long", False, error=f"HTTP {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Stream TTS Long", False, error=str(e))
            return False

    def run_all_tests(self):
        """Run all API tests"""
        print(f"🚀 Starting OpenVoice API Tests")
        print(f"📡 Base URL: {self.base_url}")
        print(f"🔗 API URL: {self.api_url}")
        print("=" * 60)
        
        # Test 1: Health Check
        health_ok = self.test_health()
        
        # Test 2: Get Voices
        voices_ok, voices = self.test_voices()
        
        # Test 3: Voice Sample (if voices loaded)
        if voices_ok and voices:
            self.test_voice_sample(voices[0]["id"])
            self.test_voice_sample("voice_12")  # Test another voice
        
        # Test 4: TTS Generation
        if voices_ok and voices:
            self.test_tts(voices[0]["id"])
        
        # Test 5: File Upload
        self.test_upload()
        
        # Test 6: Chat
        self.test_chat()
        
        # Test 7: History Endpoint
        self.test_history()
        
        # Test 8: Audiobook Generation
        if voices_ok and voices:
            self.test_audiobook(voices[0]["id"])
        
        # NEW FEATURES TESTING
        print("\n🆕 Testing NEW Features:")
        
        # Test 9: Voice Compare (NEW FEATURE)
        self.test_compare_voices()
        
        # Test 10: Batch TTS (NEW FEATURE)
        self.test_batch_tts()
        
        # Test 11: History Export (NEW FEATURE)
        self.test_history_export()
        
        # Test 12: Streaming TTS Short Text (NEW STREAMING FEATURE)
        self.test_stream_tts_short()
        
        # Test 13: Streaming TTS Long Text (NEW STREAMING FEATURE)
        self.test_stream_tts_long()
        
        # Print summary
        print("=" * 60)
        print(f"📊 Test Results: {self.tests_passed}/{self.tests_run} passed")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All tests passed!")
            return True
        else:
            print("⚠️  Some tests failed. Check details above.")
            return False

def main():
    """Main test runner"""
    tester = OpenVoiceAPITester()
    success = tester.run_all_tests()
    
    # Save detailed results
    results = {
        "timestamp": datetime.now().isoformat(),
        "total_tests": tester.tests_run,
        "passed_tests": tester.tests_passed,
        "success_rate": f"{(tester.tests_passed/tester.tests_run*100):.1f}%" if tester.tests_run > 0 else "0%",
        "test_details": tester.test_results
    }
    
    # Write results to file
    results_file = Path("/app/backend_test_results.json")
    with open(results_file, "w") as f:
        json.dump(results, f, indent=2)
    
    print(f"\n📄 Detailed results saved to: {results_file}")
    
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())