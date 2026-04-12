#!/usr/bin/env python3

import requests
import json
import sys
from datetime import datetime
import time

class NyxenAPITester:
    def __init__(self, base_url="https://ai-storyteller-77.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.tests_run = 0
        self.tests_passed = 0
        self.conversation_id = None
        self.story_id = None
        self.document_id = None

    def log_test(self, name, success, details=""):
        """Log test results"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name} - PASSED")
        else:
            print(f"❌ {name} - FAILED: {details}")
        
        if details:
            print(f"   Details: {details}")

    def test_health_endpoints(self):
        """Test basic health endpoints"""
        print("\n🔍 Testing Health Endpoints...")
        
        # Test root endpoint
        try:
            response = requests.get(f"{self.api_url}/", timeout=10)
            success = response.status_code == 200
            details = f"Status: {response.status_code}"
            if success:
                details += f", Response: {response.json()}"
            self.log_test("Root endpoint (/api/)", success, details)
        except Exception as e:
            self.log_test("Root endpoint (/api/)", False, str(e))

        # Test health endpoint
        try:
            response = requests.get(f"{self.api_url}/health", timeout=10)
            success = response.status_code == 200
            details = f"Status: {response.status_code}"
            if success:
                details += f", Response: {response.json()}"
            self.log_test("Health endpoint (/api/health)", success, details)
        except Exception as e:
            self.log_test("Health endpoint (/api/health)", False, str(e))

    def test_chat_functionality(self):
        """Test chat endpoints with Groq integration"""
        print("\n🔍 Testing Chat Functionality...")
        
        # Test basic chat
        try:
            chat_data = {
                "messages": [
                    {"role": "user", "content": "Hello Nyxen! Can you help me with creative writing?"}
                ],
                "temperature": 0.7,
                "max_tokens": 100
            }
            
            response = requests.post(f"{self.api_url}/chat", json=chat_data, timeout=30)
            success = response.status_code == 200
            
            if success:
                data = response.json()
                self.conversation_id = data.get("conversation_id")
                content = data.get("content", "")
                details = f"Status: {response.status_code}, Content length: {len(content)}, Conv ID: {self.conversation_id}"
                
                # Check if response contains expected content
                if len(content) > 10 and "nyxen" in content.lower():
                    details += " - Response looks good"
                else:
                    success = False
                    details += " - Response content seems invalid"
            else:
                details = f"Status: {response.status_code}, Error: {response.text}"
                
            self.log_test("Chat with Groq/Llama 3.1", success, details)
            
        except Exception as e:
            self.log_test("Chat with Groq/Llama 3.1", False, str(e))

        # Test conversation retrieval
        if self.conversation_id:
            try:
                response = requests.get(f"{self.api_url}/conversations/{self.conversation_id}", timeout=10)
                success = response.status_code == 200
                details = f"Status: {response.status_code}"
                if success:
                    data = response.json()
                    details += f", Messages count: {len(data.get('messages', []))}"
                self.log_test("Get conversation", success, details)
            except Exception as e:
                self.log_test("Get conversation", False, str(e))

    def test_story_endpoints(self):
        """Test story CRUD operations"""
        print("\n🔍 Testing Story Endpoints...")
        
        # Create story
        try:
            story_data = {
                "title": "Test Fantasy Story",
                "content": "Once upon a time in a magical kingdom, there lived a brave knight who discovered an ancient secret.",
                "genre": "Fantasy"
            }
            
            response = requests.post(f"{self.api_url}/stories", json=story_data, timeout=10)
            success = response.status_code == 200
            
            if success:
                data = response.json()
                self.story_id = data.get("id")
                details = f"Status: {response.status_code}, Story ID: {self.story_id}"
            else:
                details = f"Status: {response.status_code}, Error: {response.text}"
                
            self.log_test("Create story", success, details)
            
        except Exception as e:
            self.log_test("Create story", False, str(e))

        # Get stories
        try:
            response = requests.get(f"{self.api_url}/stories", timeout=10)
            success = response.status_code == 200
            details = f"Status: {response.status_code}"
            if success:
                stories = response.json()
                details += f", Stories count: {len(stories)}"
            self.log_test("Get stories", success, details)
        except Exception as e:
            self.log_test("Get stories", False, str(e))

        # Get specific story
        if self.story_id:
            try:
                response = requests.get(f"{self.api_url}/stories/{self.story_id}", timeout=10)
                success = response.status_code == 200
                details = f"Status: {response.status_code}"
                if success:
                    story = response.json()
                    details += f", Title: {story.get('title')}"
                self.log_test("Get specific story", success, details)
            except Exception as e:
                self.log_test("Get specific story", False, str(e))

        # Update story
        if self.story_id:
            try:
                update_data = {
                    "content": "Once upon a time in a magical kingdom, there lived a brave knight who discovered an ancient secret. The knight embarked on a quest to save the realm."
                }
                
                response = requests.put(f"{self.api_url}/stories/{self.story_id}", json=update_data, timeout=10)
                success = response.status_code == 200
                details = f"Status: {response.status_code}"
                if success:
                    story = response.json()
                    details += f", Updated word count: {story.get('word_count')}"
                self.log_test("Update story", success, details)
            except Exception as e:
                self.log_test("Update story", False, str(e))

    def test_document_endpoints(self):
        """Test document CRUD operations"""
        print("\n🔍 Testing Document Endpoints...")
        
        # Create document
        try:
            doc_data = {
                "title": "Test Article",
                "content": "This is a test article about creative writing techniques and storytelling methods.",
                "doc_type": "article"
            }
            
            response = requests.post(f"{self.api_url}/documents", json=doc_data, timeout=10)
            success = response.status_code == 200
            
            if success:
                data = response.json()
                self.document_id = data.get("id")
                details = f"Status: {response.status_code}, Document ID: {self.document_id}"
            else:
                details = f"Status: {response.status_code}, Error: {response.text}"
                
            self.log_test("Create document", success, details)
            
        except Exception as e:
            self.log_test("Create document", False, str(e))

        # Get documents
        try:
            response = requests.get(f"{self.api_url}/documents", timeout=10)
            success = response.status_code == 200
            details = f"Status: {response.status_code}"
            if success:
                docs = response.json()
                details += f", Documents count: {len(docs)}"
            self.log_test("Get documents", success, details)
        except Exception as e:
            self.log_test("Get documents", False, str(e))

    def test_ai_writing_tools(self):
        """Test AI writing tool endpoints"""
        print("\n🔍 Testing AI Writing Tools...")
        
        # Test rewrite
        try:
            rewrite_data = {
                "text": "This is a simple sentence that needs improvement.",
                "style": "professional"
            }
            
            response = requests.post(f"{self.api_url}/ai/rewrite", json=rewrite_data, timeout=30)
            success = response.status_code == 200
            
            if success:
                data = response.json()
                rewritten = data.get("rewritten", "")
                details = f"Status: {response.status_code}, Rewritten length: {len(rewritten)}"
                if len(rewritten) > 10:
                    details += " - Rewrite successful"
                else:
                    success = False
                    details += " - Rewrite failed"
            else:
                details = f"Status: {response.status_code}, Error: {response.text}"
                
            self.log_test("AI Rewrite", success, details)
            
        except Exception as e:
            self.log_test("AI Rewrite", False, str(e))

        # Test format
        try:
            format_data = {
                "text": "First point. Second point. Third point. Fourth point.",
                "format_type": "bullets"
            }
            
            response = requests.post(f"{self.api_url}/ai/format", json=format_data, timeout=30)
            success = response.status_code == 200
            
            if success:
                data = response.json()
                formatted = data.get("formatted", "")
                details = f"Status: {response.status_code}, Formatted length: {len(formatted)}"
                if "•" in formatted or "*" in formatted or "-" in formatted:
                    details += " - Format successful"
                else:
                    details += " - Format may not have worked as expected"
            else:
                details = f"Status: {response.status_code}, Error: {response.text}"
                
            self.log_test("AI Format", success, details)
            
        except Exception as e:
            self.log_test("AI Format", False, str(e))

        # Test story generation
        try:
            params = {
                "prompt": "A young wizard discovers a hidden library",
                "genre": "fantasy",
                "length": "short"
            }
            
            response = requests.post(f"{self.api_url}/ai/generate-story", params=params, timeout=45)
            success = response.status_code == 200
            
            if success:
                data = response.json()
                story = data.get("story", "")
                details = f"Status: {response.status_code}, Story length: {len(story)}"
                if len(story) > 100:
                    details += " - Story generation successful"
                else:
                    success = False
                    details += " - Story too short"
            else:
                details = f"Status: {response.status_code}, Error: {response.text}"
                
            self.log_test("AI Story Generation", success, details)
            
        except Exception as e:
            self.log_test("AI Story Generation", False, str(e))

        # Test edit suggestions
        try:
            params = {
                "text": "This is a test document that could use some improvement in terms of clarity and engagement."
            }
            
            response = requests.post(f"{self.api_url}/ai/edit-suggestions", params=params, timeout=30)
            success = response.status_code == 200
            
            if success:
                data = response.json()
                suggestions = data.get("suggestions", "")
                details = f"Status: {response.status_code}, Suggestions length: {len(suggestions)}"
                if len(suggestions) > 20:
                    details += " - Suggestions generated"
                else:
                    success = False
                    details += " - No meaningful suggestions"
            else:
                details = f"Status: {response.status_code}, Error: {response.text}"
                
            self.log_test("AI Edit Suggestions", success, details)
            
        except Exception as e:
            self.log_test("AI Edit Suggestions", False, str(e))

    def cleanup_test_data(self):
        """Clean up test data"""
        print("\n🧹 Cleaning up test data...")
        
        # Delete test story
        if self.story_id:
            try:
                response = requests.delete(f"{self.api_url}/stories/{self.story_id}", timeout=10)
                success = response.status_code == 200
                self.log_test("Delete test story", success, f"Status: {response.status_code}")
            except Exception as e:
                self.log_test("Delete test story", False, str(e))

        # Delete test document
        if self.document_id:
            try:
                response = requests.delete(f"{self.api_url}/documents/{self.document_id}", timeout=10)
                success = response.status_code == 200
                self.log_test("Delete test document", success, f"Status: {response.status_code}")
            except Exception as e:
                self.log_test("Delete test document", False, str(e))

        # Delete test conversation
        if self.conversation_id:
            try:
                response = requests.delete(f"{self.api_url}/conversations/{self.conversation_id}", timeout=10)
                success = response.status_code == 200
                self.log_test("Delete test conversation", success, f"Status: {response.status_code}")
            except Exception as e:
                self.log_test("Delete test conversation", False, str(e))

    def run_all_tests(self):
        """Run all backend tests"""
        print("🚀 Starting Nyxen Backend API Tests")
        print(f"🌐 Testing against: {self.base_url}")
        print("=" * 60)
        
        start_time = time.time()
        
        # Run test suites
        self.test_health_endpoints()
        self.test_chat_functionality()
        self.test_story_endpoints()
        self.test_document_endpoints()
        self.test_ai_writing_tools()
        self.cleanup_test_data()
        
        end_time = time.time()
        duration = end_time - start_time
        
        # Print summary
        print("\n" + "=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)
        print(f"Tests Run: {self.tests_run}")
        print(f"Tests Passed: {self.tests_passed}")
        print(f"Tests Failed: {self.tests_run - self.tests_passed}")
        print(f"Success Rate: {(self.tests_passed/self.tests_run)*100:.1f}%")
        print(f"Duration: {duration:.2f} seconds")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All tests passed!")
            return 0
        else:
            print("⚠️  Some tests failed!")
            return 1

def main():
    tester = NyxenAPITester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())