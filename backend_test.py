#!/usr/bin/env python3
"""
Comprehensive Backend API Testing for Convento Platform
Tests all API endpoints including auth, users, messages, voice channels, and file uploads
"""

import requests
import sys
import json
import time
from datetime import datetime
from typing import Dict, Any, Optional
from PIL import Image
import io

class ConventoAPITester:
    def __init__(self, base_url="https://convento-social.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.test_user = None
        self.test_user_2 = None
        self.test_voice_channel = None
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []
        self.session = requests.Session()
        
    def log_test(self, name: str, success: bool, details: str = ""):
        """Log test result"""
        self.tests_run += 1
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} - {name}")
        if details:
            print(f"    {details}")
        if success:
            self.tests_passed += 1
        else:
            self.failed_tests.append({"name": name, "details": details})
        print()

    def make_request(self, method: str, endpoint: str, data: Dict = None, files: Dict = None) -> tuple:
        """Make HTTP request and return (success, response_data, status_code)"""
        url = f"{self.base_url}/{endpoint}"
        
        try:
            if method == 'GET':
                response = self.session.get(url)
            elif method == 'POST':
                if files:
                    response = self.session.post(url, data=data, files=files)
                else:
                    response = self.session.post(url, json=data)
            elif method == 'PUT':
                response = self.session.put(url, json=data)
            elif method == 'DELETE':
                response = self.session.delete(url)
            else:
                return False, {"error": f"Unsupported method: {method}"}, 0
            
            # Try to parse JSON response
            try:
                response_data = response.json()
            except:
                response_data = {"raw_response": response.text}
            
            return response.status_code < 400, response_data, response.status_code
            
        except Exception as e:
            return False, {"error": str(e)}, 0

    def test_auth_register(self):
        """Test user registration (access code generation)"""
        success, data, status = self.make_request('POST', 'auth/register')
        
        if success and 'access_code' in data and len(data['access_code']) == 16:
            self.test_user = data
            self.log_test("Auth Registration", True, f"Generated code: {data['access_code']}")
            return True
        else:
            self.log_test("Auth Registration", False, f"Status: {status}, Data: {data}")
            return False

    def test_auth_register_second_user(self):
        """Test second user registration for multi-user tests"""
        success, data, status = self.make_request('POST', 'auth/register')
        
        if success and 'access_code' in data and len(data['access_code']) == 16:
            self.test_user_2 = data
            self.log_test("Second User Registration", True, f"Generated code: {data['access_code']}")
            return True
        else:
            self.log_test("Second User Registration", False, f"Status: {status}, Data: {data}")
            return False

    def test_auth_login(self):
        """Test user login with access code"""
        if not self.test_user:
            self.log_test("Auth Login", False, "No test user available")
            return False
            
        success, data, status = self.make_request('POST', 'auth/login', {
            'access_code': self.test_user['access_code']
        })
        
        if success and 'id' in data and 'username' in data:
            # Update test_user with login response
            self.test_user.update(data)
            self.log_test("Auth Login", True, f"User ID: {data['id']}")
            return True
        else:
            self.log_test("Auth Login", False, f"Status: {status}, Data: {data}")
            return False

    def test_auth_login_invalid_code(self):
        """Test login with invalid access code"""
        success, data, status = self.make_request('POST', 'auth/login', {
            'access_code': 'INVALID_CODE_1234'
        })
        
        # Should fail with 404
        if not success and status == 404:
            self.log_test("Auth Login Invalid Code", True, "Correctly rejected invalid code")
            return True
        else:
            self.log_test("Auth Login Invalid Code", False, f"Expected 404, got {status}")
            return False

    def test_get_user(self):
        """Test getting user by ID"""
        if not self.test_user or 'id' not in self.test_user:
            self.log_test("Get User", False, "No test user ID available")
            return False
            
        success, data, status = self.make_request('GET', f"users/{self.test_user['id']}")
        
        if success and data.get('id') == self.test_user['id']:
            self.log_test("Get User", True, f"Retrieved user: {data.get('username')}")
            return True
        else:
            self.log_test("Get User", False, f"Status: {status}, Data: {data}")
            return False

    def test_update_user(self):
        """Test updating user profile"""
        if not self.test_user or 'id' not in self.test_user:
            self.log_test("Update User", False, "No test user ID available")
            return False
            
        update_data = {
            'username': 'TestUser_Updated',
            'description': 'Test description for Convento',
            'aura_color': '#EC4899'
        }
        
        success, data, status = self.make_request('PUT', f"users/{self.test_user['id']}", update_data)
        
        if success:
            self.log_test("Update User", True, "Profile updated successfully")
            return True
        else:
            self.log_test("Update User", False, f"Status: {status}, Data: {data}")
            return False

    def test_create_message(self):
        """Test creating a text message"""
        if not self.test_user or 'id' not in self.test_user:
            self.log_test("Create Message", False, "No test user ID available")
            return False
            
        message_data = {
            'user_id': self.test_user['id'],
            'content': 'Hola desde el test automatizado! 🚀',
            'message_type': 'text'
        }
        
        success, data, status = self.make_request('POST', 'messages', message_data)
        
        if success and 'id' in data:
            self.log_test("Create Message", True, f"Message ID: {data['id']}")
            return True
        else:
            self.log_test("Create Message", False, f"Status: {status}, Data: {data}")
            return False

    def test_get_messages(self):
        """Test retrieving messages"""
        success, data, status = self.make_request('GET', 'messages?limit=50')
        
        if success and isinstance(data, list):
            self.log_test("Get Messages", True, f"Retrieved {len(data)} messages")
            return True
        else:
            self.log_test("Get Messages", False, f"Status: {status}, Data: {data}")
            return False

    def test_create_voice_channel(self):
        """Test creating a voice channel"""
        if not self.test_user or 'id' not in self.test_user:
            self.log_test("Create Voice Channel", False, "No test user ID available")
            return False
            
        channel_data = {
            'name': 'Test Gaming Room',
            'aura_color': '#8B5CF6',
            'creator_id': self.test_user['id'],
            'is_ghost_mode': False
        }
        
        success, data, status = self.make_request('POST', 'voice-channels', channel_data)
        
        if success and 'id' in data:
            self.test_voice_channel = data
            self.log_test("Create Voice Channel", True, f"Channel ID: {data['id']}")
            return True
        else:
            self.log_test("Create Voice Channel", False, f"Status: {status}, Data: {data}")
            return False

    def test_get_voice_channels(self):
        """Test retrieving voice channels"""
        success, data, status = self.make_request('GET', 'voice-channels')
        
        if success and isinstance(data, list):
            self.log_test("Get Voice Channels", True, f"Retrieved {len(data)} channels")
            return True
        else:
            self.log_test("Get Voice Channels", False, f"Status: {status}, Data: {data}")
            return False

    def test_join_voice_channel(self):
        """Test joining a voice channel"""
        if not self.test_voice_channel or not self.test_user:
            self.log_test("Join Voice Channel", False, "No test channel or user available")
            return False
            
        success, data, status = self.make_request(
            'POST', 
            f"voice-channels/{self.test_voice_channel['id']}/join?user_id={self.test_user['id']}"
        )
        
        if success:
            self.log_test("Join Voice Channel", True, "Successfully joined channel")
            return True
        else:
            self.log_test("Join Voice Channel", False, f"Status: {status}, Data: {data}")
            return False

    def test_toggle_ghost_mode(self):
        """Test toggling ghost mode on voice channel"""
        if not self.test_voice_channel:
            self.log_test("Toggle Ghost Mode", False, "No test channel available")
            return False
            
        success, data, status = self.make_request(
            'PUT', 
            f"voice-channels/{self.test_voice_channel['id']}/ghost-mode?is_ghost=true"
        )
        
        if success:
            self.log_test("Toggle Ghost Mode", True, "Ghost mode toggled successfully")
            return True
        else:
            self.log_test("Toggle Ghost Mode", False, f"Status: {status}, Data: {data}")
            return False

    def test_leave_voice_channel(self):
        """Test leaving a voice channel"""
        if not self.test_voice_channel or not self.test_user:
            self.log_test("Leave Voice Channel", False, "No test channel or user available")
            return False
            
        success, data, status = self.make_request(
            'POST', 
            f"voice-channels/{self.test_voice_channel['id']}/leave?user_id={self.test_user['id']}"
        )
        
        if success:
            self.log_test("Leave Voice Channel", True, "Successfully left channel")
            return True
        else:
            self.log_test("Leave Voice Channel", False, f"Status: {status}, Data: {data}")
            return False

    def test_create_link_message(self):
        """Test creating a link message"""
        if not self.test_user or 'id' not in self.test_user:
            self.log_test("Create Link Message", False, "No test user ID available")
            return False
            
        message_data = {
            'user_id': self.test_user['id'],
            'content': 'https://github.com/convento-platform',
            'message_type': 'link'
        }
        
        success, data, status = self.make_request('POST', 'messages', message_data)
        
        if success and 'id' in data:
            self.log_test("Create Link Message", True, f"Link message ID: {data['id']}")
            return True
        else:
            self.log_test("Create Link Message", False, f"Status: {status}, Data: {data}")
            return False

    def test_message_compression(self):
        """Test message compression with long text"""
        if not self.test_user or 'id' not in self.test_user:
            self.log_test("Message Compression", False, "No test user ID available")
            return False
            
        long_message = "Este es un mensaje muy largo para probar la compresión. " * 50
        message_data = {
            'user_id': self.test_user['id'],
            'content': long_message,
            'message_type': 'text'
        }
        
        success, data, status = self.make_request('POST', 'messages', message_data)
        
        if success and 'id' in data:
            self.log_test("Message Compression", True, "Long message handled successfully")
            return True
        else:
            self.log_test("Message Compression", False, f"Status: {status}, Data: {data}")
            return False

    def test_webrtc_send_signal(self):
        """Test sending WebRTC signal"""
        if not self.test_user or not self.test_user_2 or not self.test_voice_channel:
            self.log_test("WebRTC Send Signal", False, "Missing test users or channel")
            return False
            
        signal_data = {
            'from_user': self.test_user['id'],
            'to_user': self.test_user_2['user']['id'],
            'channel_id': self.test_voice_channel['id'],
            'signal_type': 'offer',
            'data': {
                'sdp': 'v=0\r\no=- 123456789 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n',
                'type': 'offer'
            }
        }
        
        success, data, status = self.make_request('POST', 'webrtc/signal', signal_data)
        
        if success:
            self.log_test("WebRTC Send Signal", True, "Signal sent successfully")
            return True
        else:
            self.log_test("WebRTC Send Signal", False, f"Status: {status}, Data: {data}")
            return False

    def test_webrtc_get_signals(self):
        """Test retrieving WebRTC signals"""
        if not self.test_user_2 or not self.test_voice_channel:
            self.log_test("WebRTC Get Signals", False, "Missing test user or channel")
            return False
            
        success, data, status = self.make_request(
            'GET', 
            f"webrtc/signals/{self.test_voice_channel['id']}/{self.test_user_2['user']['id']}"
        )
        
        if success and isinstance(data, list):
            self.log_test("WebRTC Get Signals", True, f"Retrieved {len(data)} signals")
            return True
        else:
            self.log_test("WebRTC Get Signals", False, f"Status: {status}, Data: {data}")
            return False

    def test_webrtc_ice_candidate(self):
        """Test sending ICE candidate signal"""
        if not self.test_user or not self.test_user_2 or not self.test_voice_channel:
            self.log_test("WebRTC ICE Candidate", False, "Missing test users or channel")
            return False
            
        signal_data = {
            'from_user': self.test_user['id'],
            'to_user': self.test_user_2['user']['id'],
            'channel_id': self.test_voice_channel['id'],
            'signal_type': 'ice-candidate',
            'data': {
                'candidate': 'candidate:1 1 UDP 2130706431 192.168.1.100 54400 typ host',
                'sdpMLineIndex': 0,
                'sdpMid': 'audio'
            }
        }
        
        success, data, status = self.make_request('POST', 'webrtc/signal', signal_data)
        
        if success:
            self.log_test("WebRTC ICE Candidate", True, "ICE candidate sent successfully")
            return True
        else:
            self.log_test("WebRTC ICE Candidate", False, f"Status: {status}, Data: {data}")
            return False

    def test_get_channel_participants(self):
        """Test getting detailed channel participants"""
        if not self.test_voice_channel:
            self.log_test("Get Channel Participants", False, "No test channel available")
            return False
            
        success, data, status = self.make_request(
            'GET', 
            f"voice-channels/{self.test_voice_channel['id']}/participants"
        )
        
        if success and isinstance(data, list):
            self.log_test("Get Channel Participants", True, f"Retrieved {len(data)} participants")
            return True
        else:
            self.log_test("Get Channel Participants", False, f"Status: {status}, Data: {data}")
            return False

    def test_file_upload_avatar(self):
        """Test avatar file upload"""
        if not self.test_user or 'id' not in self.test_user:
            self.log_test("File Upload Avatar", False, "No test user ID available")
            return False
            
        try:
            # Create a small test image
            img = Image.new('RGB', (100, 100), color='red')
            img_bytes = io.BytesIO()
            img.save(img_bytes, format='PNG')
            img_bytes.seek(0)
            
            files = {'file': ('test_avatar.png', img_bytes, 'image/png')}
            
            success, data, status = self.make_request(
                'POST', 
                f"upload/{self.test_user['id']}/avatar",
                files=files
            )
            
            if success and 'file_url' in data:
                self.log_test("File Upload Avatar", True, f"Avatar uploaded: {data['file_url']}")
                return True
            else:
                self.log_test("File Upload Avatar", False, f"Status: {status}, Data: {data}")
                return False
        except Exception as e:
            self.log_test("File Upload Avatar", False, f"Error creating test image: {e}")
            return False

    def test_auto_delete_empty_channel(self):
        """Test that empty channels are auto-deleted when last user leaves"""
        if not self.test_voice_channel:
            self.log_test("Auto Delete Empty Channel", False, "No test channel available")
            return False
            
        # Try to get the channel - should be 404 since it was auto-deleted when user left
        success, data, status = self.make_request(
            'GET', 
            f"voice-channels/{self.test_voice_channel['id']}/participants"
        )
        
        if not success and status == 404:
            self.log_test("Auto Delete Empty Channel", True, "Channel auto-deleted when empty (expected behavior)")
            return True
        else:
            self.log_test("Auto Delete Empty Channel", False, f"Channel still exists: Status {status}")
            return False

    def run_all_tests(self):
        """Run all backend tests"""
        print("🚀 Starting Convento Backend API Tests")
        print("=" * 50)
        
        # Authentication Tests
        print("📝 Authentication Tests")
        self.test_auth_register()
        self.test_auth_login_invalid_code()
        if self.test_user:
            self.test_auth_login()
        
        # User Management Tests
        print("👤 User Management Tests")
        self.test_get_user()
        self.test_update_user()
        
        # Register second user for multi-user tests
        self.test_auth_register_second_user()
        
        # Message Tests
        print("💬 Message Tests")
        self.test_create_message()
        self.test_create_link_message()
        self.test_message_compression()
        self.test_get_messages()
        
        # Voice Channel Tests
        print("🎧 Voice Channel Tests")
        self.test_create_voice_channel()
        self.test_get_voice_channels()
        self.test_join_voice_channel()
        self.test_get_channel_participants()
        self.test_toggle_ghost_mode()
        
        # WebRTC Signaling Tests (CRITICAL)
        print("📡 WebRTC Signaling Tests")
        self.test_webrtc_send_signal()
        self.test_webrtc_get_signals()
        self.test_webrtc_ice_candidate()
        
        # File Upload Tests
        print("📁 File Upload Tests")
        self.test_file_upload_avatar()
        
        # Cleanup Tests
        print("🧹 Cleanup Tests")
        self.test_leave_voice_channel()
        self.test_auto_delete_empty_channel()
        
        # Print Results
        print("=" * 50)
        print(f"📊 Test Results: {self.tests_passed}/{self.tests_run} passed")
        
        if self.failed_tests:
            print("\n❌ Failed Tests:")
            for test in self.failed_tests:
                print(f"  - {test['name']}: {test['details']}")
        
        success_rate = (self.tests_passed / self.tests_run) * 100 if self.tests_run > 0 else 0
        print(f"✨ Success Rate: {success_rate:.1f}%")
        
        return self.tests_passed == self.tests_run

def main():
    """Main test execution"""
    tester = ConventoAPITester()
    
    try:
        success = tester.run_all_tests()
        return 0 if success else 1
    except KeyboardInterrupt:
        print("\n⚠️ Tests interrupted by user")
        return 1
    except Exception as e:
        print(f"\n💥 Unexpected error: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(main())