import requests
import json
from datetime import datetime

base_url = "https://organizo-32.preview.emergentagent.com"
api_url = f"{base_url}/api"

# Create a test user
test_user_data = {
    "username": f"debuguser_{datetime.now().strftime('%H%M%S')}",
    "email": f"debug_{datetime.now().strftime('%H%M%S')}@example.com",
    "password": "TestPass123!",
    "full_name": "Debug User",
    "department": "IT"
}

print("Creating user...")
register_response = requests.post(f"{api_url}/auth/register", json=test_user_data)
print(f"Register status: {register_response.status_code}")
print(f"Register response: {register_response.json()}")

if register_response.status_code == 200:
    print("\nTrying to login...")
    login_data = {
        "username": test_user_data["username"],
        "password": test_user_data["password"]
    }
    
    login_response = requests.post(f"{api_url}/auth/login", json=login_data)
    print(f"Login status: {login_response.status_code}")
    print(f"Login response: {login_response.json()}")
    
    if login_response.status_code == 200:
        token = login_response.json()["access_token"]
        print(f"\nToken received: {token[:50]}...")
        
        # Test authenticated endpoint
        headers = {"Authorization": f"Bearer {token}"}
        me_response = requests.get(f"{api_url}/auth/me", headers=headers)
        print(f"Me endpoint status: {me_response.status_code}")
        print(f"Me endpoint response: {me_response.json()}")