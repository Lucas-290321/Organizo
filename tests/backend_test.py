import requests
import sys
import json
from datetime import datetime, timedelta
import uuid

class OrganizoBEAPITester:
    def __init__(self, base_url="https://organizo-32.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.token = None
        self.user_id = None
        self.tests_run = 0
        self.tests_passed = 0
        self.created_event_id = None
        self.created_inventory_id = None

    def run_test(self, name, method, endpoint, expected_status, data=None, params=None):
        """Run a single API test"""
        url = f"{self.api_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        if self.token:
            headers['Authorization'] = f'Bearer {self.token}'

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, params=params)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    response_data = response.json()
                    print(f"   Response: {json.dumps(response_data, indent=2)[:200]}...")
                    return True, response_data
                except:
                    return True, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    error_data = response.json()
                    print(f"   Error: {error_data}")
                except:
                    print(f"   Error: {response.text}")
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_user_registration(self):
        """Test user registration"""
        test_user_data = {
            "username": f"testuser_{datetime.now().strftime('%H%M%S')}",
            "email": f"test_{datetime.now().strftime('%H%M%S')}@example.com",
            "password": "TestPass123!",
            "full_name": "Test User",
            "department": "IT"
        }
        
        success, response = self.run_test(
            "User Registration",
            "POST",
            "auth/register",
            200,
            data=test_user_data
        )
        
        if success:
            self.user_id = response.get('id')
            self.test_username = test_user_data['username']
            self.test_password = test_user_data['password']
            return True
        return False

    def test_user_login(self):
        """Test user login"""
        if not hasattr(self, 'test_username'):
            print("❌ Cannot test login - no user registered")
            return False
            
        success, response = self.run_test(
            "User Login",
            "POST",
            "auth/login",
            200,
            data={"username": self.test_username, "password": self.test_password}
        )
        
        if success and 'access_token' in response:
            self.token = response['access_token']
            return True
        return False

    def test_get_current_user(self):
        """Test getting current user info"""
        success, response = self.run_test(
            "Get Current User",
            "GET",
            "auth/me",
            200
        )
        return success

    def test_create_event(self):
        """Test creating an event"""
        event_data = {
            "event_name": "Test Meeting",
            "date": (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d'),
            "time": "14:30",
            "requester": "Test User",
            "department": "IT",
            "notes": "This is a test event"
        }
        
        success, response = self.run_test(
            "Create Event",
            "POST",
            "events",
            200,
            data=event_data
        )
        
        if success:
            self.created_event_id = response.get('id')
            return True
        return False

    def test_get_events(self):
        """Test getting all events"""
        success, response = self.run_test(
            "Get All Events",
            "GET",
            "events",
            200
        )
        return success

    def test_get_single_event(self):
        """Test getting a single event"""
        if not self.created_event_id:
            print("❌ Cannot test get single event - no event created")
            return False
            
        success, response = self.run_test(
            "Get Single Event",
            "GET",
            f"events/{self.created_event_id}",
            200
        )
        return success

    def test_update_event(self):
        """Test updating an event"""
        if not self.created_event_id:
            print("❌ Cannot test update event - no event created")
            return False
            
        update_data = {
            "event_name": "Updated Test Meeting",
            "notes": "Updated notes"
        }
        
        success, response = self.run_test(
            "Update Event",
            "PUT",
            f"events/{self.created_event_id}",
            200,
            data=update_data
        )
        return success

    def test_create_inventory_item(self):
        """Test creating an inventory item"""
        inventory_data = {
            "product_name": "Test Product",
            "quantity": 50.0,
            "expiration_date": (datetime.now() + timedelta(days=30)).strftime('%Y-%m-%d'),
            "price": 25.99,
            "unit_type": "Package",
            "category": "Escritório"
        }
        
        success, response = self.run_test(
            "Create Inventory Item",
            "POST",
            "inventory",
            200,
            data=inventory_data
        )
        
        if success:
            self.created_inventory_id = response.get('id')
            return True
        return False

    def test_get_inventory(self):
        """Test getting all inventory items"""
        success, response = self.run_test(
            "Get All Inventory",
            "GET",
            "inventory",
            200
        )
        return success

    def test_get_inventory_categories(self):
        """Test getting inventory by categories"""
        success, response = self.run_test(
            "Get Inventory Categories",
            "GET",
            "inventory/categories",
            200
        )
        return success

    def test_get_single_inventory_item(self):
        """Test getting a single inventory item"""
        if not self.created_inventory_id:
            print("❌ Cannot test get single inventory item - no item created")
            return False
            
        success, response = self.run_test(
            "Get Single Inventory Item",
            "GET",
            f"inventory/{self.created_inventory_id}",
            200
        )
        return success

    def test_update_inventory_item(self):
        """Test updating an inventory item"""
        if not self.created_inventory_id:
            print("❌ Cannot test update inventory item - no item created")
            return False
            
        update_data = {
            "product_name": "Updated Test Product",
            "quantity": 75.0
        }
        
        success, response = self.run_test(
            "Update Inventory Item",
            "PUT",
            f"inventory/{self.created_inventory_id}",
            200,
            data=update_data
        )
        return success

    def test_dashboard_stats(self):
        """Test getting dashboard statistics"""
        success, response = self.run_test(
            "Get Dashboard Stats",
            "GET",
            "stats/dashboard",
            200
        )
        return success

    def test_search_events(self):
        """Test searching events"""
        success, response = self.run_test(
            "Search Events",
            "GET",
            "search/events",
            200,
            params={"q": "Test"}
        )
        return success

    def test_search_inventory(self):
        """Test searching inventory"""
        success, response = self.run_test(
            "Search Inventory",
            "GET",
            "search/inventory",
            200,
            params={"q": "Test"}
        )
        return success

    def test_export_events_csv(self):
        """Test exporting events to CSV"""
        success, response = self.run_test(
            "Export Events CSV",
            "GET",
            "export/events/csv",
            200
        )
        return success

    def test_export_inventory_csv(self):
        """Test exporting inventory to CSV"""
        success, response = self.run_test(
            "Export Inventory CSV",
            "GET",
            "export/inventory/csv",
            200
        )
        return success

    def test_get_notifications(self):
        """Test getting notifications"""
        success, response = self.run_test(
            "Get Notifications",
            "GET",
            "notifications",
            200
        )
        return success

    def test_delete_event(self):
        """Test deleting an event"""
        if not self.created_event_id:
            print("❌ Cannot test delete event - no event created")
            return False
            
        success, response = self.run_test(
            "Delete Event",
            "DELETE",
            f"events/{self.created_event_id}",
            200
        )
        return success

    def test_delete_inventory_item(self):
        """Test deleting an inventory item"""
        if not self.created_inventory_id:
            print("❌ Cannot test delete inventory item - no item created")
            return False
            
        success, response = self.run_test(
            "Delete Inventory Item",
            "DELETE",
            f"inventory/{self.created_inventory_id}",
            200
        )
        return success

def main():
    print("🚀 Starting Organizo Backend API Tests")
    print("=" * 50)
    
    tester = OrganizoBEAPITester()
    
    # Test sequence
    test_sequence = [
        # Authentication tests
        tester.test_user_registration,
        tester.test_user_login,
        tester.test_get_current_user,
        
        # Event management tests
        tester.test_create_event,
        tester.test_get_events,
        tester.test_get_single_event,
        tester.test_update_event,
        
        # Inventory management tests
        tester.test_create_inventory_item,
        tester.test_get_inventory,
        tester.test_get_inventory_categories,
        tester.test_get_single_inventory_item,
        tester.test_update_inventory_item,
        
        # Dashboard and search tests
        tester.test_dashboard_stats,
        tester.test_search_events,
        tester.test_search_inventory,
        
        # Export tests
        tester.test_export_events_csv,
        tester.test_export_inventory_csv,
        
        # Notification tests
        tester.test_get_notifications,
        
        # Cleanup tests
        tester.test_delete_event,
        tester.test_delete_inventory_item,
    ]
    
    # Run all tests
    for test_func in test_sequence:
        try:
            test_func()
        except Exception as e:
            print(f"❌ Test {test_func.__name__} failed with exception: {str(e)}")
    
    # Print final results
    print("\n" + "=" * 50)
    print(f"📊 Final Results: {tester.tests_passed}/{tester.tests_run} tests passed")
    
    if tester.tests_passed == tester.tests_run:
        print("🎉 All backend tests passed!")
        return 0
    else:
        print(f"⚠️  {tester.tests_run - tester.tests_passed} tests failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())