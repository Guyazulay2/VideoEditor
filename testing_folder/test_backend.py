import requests
import os

BASE_URL = "http://localhost:5000"

def test_healthcheck():
    """Check that the backend is running"""
    r = requests.get(f"{BASE_URL}/health")
    assert r.status_code == 200
    print("Healthcheck passed")

def test_video_upload():
    """Test uploading a sample video"""
    test_file_path = os.path.join('testing_folder', '3.mp4')
    assert os.path.exists(test_file_path), "Missing test video (3.mp4)"
    
    with open(test_file_path, 'rb') as f:
        files = {'file': f}
        r = requests.post(f"{BASE_URL}/api/upload", files=files)
        assert r.status_code == 200, f"Upload failed: {r.text}"
        print("Upload test passed")