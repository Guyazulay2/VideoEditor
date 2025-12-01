#!/usr/bin/env python3
import os
import json
import subprocess
import threading
import uuid
from datetime import datetime
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from werkzeug.utils import secure_filename
from concurrent.futures import ThreadPoolExecutor
import logging

# --- Configuration ---
BACKEND_PORT = int(os.getenv("BACKEND_PORT", 5000))
BACKEND_HOST = os.getenv("BACKEND_HOST", "0.0.0.0")
UPLOAD_DIR = os.getenv("UPLOAD_FOLDER", "./video-output/uploads")
OUTPUT_DIR = os.getenv("OUTPUT_FOLDER", "./video-output/output")
# קובץ לשמירת הנתונים כדי למנוע איפוסים וריצודים
DB_FILE = os.path.join(OUTPUT_DIR, "jobs_db.json")

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

app.config['UPLOAD_FOLDER'] = UPLOAD_DIR
app.config['MAX_CONTENT_LENGTH'] = 1 * 1024 * 1024 * 1024  # 1 GB
    
ALLOWED = {'mp4', 'webm', 'avi', 'mov', 'mkv', 'flv', 'wmv'}
MAX_WORKERS = 4     

# --- Persistence Manager ---
class PersistentJobManager:
    def __init__(self, db_path):
        self.db_path = db_path
        self.jobs = {}
        self.lock = threading.Lock()
        self.executor = ThreadPoolExecutor(max_workers=MAX_WORKERS)
        self._load_from_disk()
    
    def _save_to_disk(self):
        """Saves current jobs state to JSON file"""
        try:
            with open(self.db_path, 'w') as f:
                json.dump(self.jobs, f, default=str, indent=2)
        except Exception as e:
            logger.error(f"Failed to save DB: {e}")

    def _load_from_disk(self):
        """Loads jobs state from JSON file"""
        if os.path.exists(self.db_path):
            try:
                with open(self.db_path, 'r') as f:
                    self.jobs = json.load(f)
            except Exception as e:
                logger.error(f"Failed to load DB: {e}")
                self.jobs = {}
    
    def create_job(self):
        job_id = str(uuid.uuid4())[:8]
        with self.lock:
            # Load fresh state just in case another worker updated it
            self._load_from_disk() 
            
            self.jobs[job_id] = {
                'id': job_id,
                'status': 'idle',
                'progress': 0,
                'message': 'Ready',
                'output_file': None,
                'error': None,
                'video_path': None,
                'settings': None,
                'created_at': datetime.now().isoformat(),
                'started_at': None,
                'completed_at': None
            }
            self._save_to_disk()
        return job_id
    
    def get_job(self, job_id):
        # Always reload to get latest status from file
        self._load_from_disk()
        return self.jobs.get(job_id)
    
    def update_job(self, job_id, **kwargs):
        with self.lock:
            self._load_from_disk()
            if job_id in self.jobs:
                self.jobs[job_id].update(kwargs)
                self._save_to_disk()
    
    def get_running_jobs(self):
        self._load_from_disk()
        return [j for j in self.jobs.values() if j['status'] in ['processing', 'uploading']]
    
    def get_all_jobs(self):
        self._load_from_disk()
        # Sort by creation date (newest first)
        return sorted(list(self.jobs.values()), key=lambda x: x.get('created_at', ''), reverse=True)

# אתחול המנהל עם נתיב לקובץ השמירה
job_manager = PersistentJobManager(DB_FILE)

# Default settings
default_settings = {
    'output_format': 'mp4',
    'quality': '1080p',
    'aspect_ratio': '16:9',
    'trim_start': 0,
    'trim_end': None,
    'output_filename': 'video',
    'rotation': 'none',
    'framerate': '30',
    'speed': '1'
}

def allowed_file(f):
    return '.' in f and f.rsplit('.', 1)[1].lower() in ALLOWED

def get_duration(path):
    try:
        cmd = ['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
               '-of', 'default=noprint_wrappers=1:nokey=1:nokey=1', path]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        return float(result.stdout.strip())
    except:
        return 0

def get_dimensions(path):
    try:
        cmd = ['ffprobe', '-v', 'error', '-select_streams', 'v:0',
               '-show_entries', 'stream=width,height', '-of', 'csv=s=x:p=0', path]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        parts = result.stdout.strip().split('x')
        if len(parts) == 2:
            return int(parts[0]), int(parts[1])
        return 1920, 1080
    except:
        return 1920, 1080

def process_video_job(job_id, video_path, job_settings):
    """Process video with error handling"""
    # Note: We don't need get_job here immediately because update_job handles locking/loading
    
    try:
        job_manager.update_job(job_id, 
            status='processing',
            progress=10,
            message='Analyzing video...',
            started_at=datetime.now().isoformat()
        )
        
        if not os.path.exists(video_path):
             raise Exception("Source video file not found")

        duration = get_duration(video_path)
        w, h = get_dimensions(video_path)
        
        trim_start = float(job_settings.get('trim_start', 0))
        trim_end = job_settings.get('trim_end')
        
        if not trim_end or str(trim_end) == 'None':
            trim_end = duration
        else:
            trim_end = float(trim_end)
        
        if trim_start >= trim_end:
            # Fix invalid trim automatically if possible
            trim_start = 0
            trim_end = duration
        
        job_manager.update_job(job_id, progress=30, message='Processing video...')
        
        output_fmt = job_settings.get('output_format', 'mp4')
        quality = job_settings.get('quality', '1080p')
        aspect = job_settings.get('aspect_ratio', '16:9')
        output_filename = job_settings.get('output_filename', 'video')
        
        # Clean filename
        if '.' in output_filename:
            output_filename = output_filename.rsplit('.', 1)[0]
        output_filename = ''.join(c for c in output_filename if c.isalnum() or c in ('-', '_'))
        if not output_filename:
            output_filename = f'video_{job_id}'
        
        quality_map = {
            '720p': {'bitrate': '2500k', 'width': 1280, 'height': 720},
            '1080p': {'bitrate': '5000k', 'width': 1920, 'height': 1080},
            '2160p': {'bitrate': '12000k', 'width': 3840, 'height': 2160}
        }
        q_settings = quality_map.get(quality, quality_map['1080p'])
        bitrate = q_settings['bitrate']
        base_width = q_settings['width']
        base_height = q_settings['height']
        
        aspect_map = {
            '16:9': f'scale={base_width}:{base_height}:force_original_aspect_ratio=decrease,pad={base_width}:{base_height}:(ow-iw)/2:(oh-ih)/2',
            '9:16': f'scale={int(base_height*9/16)}:{base_height}:force_original_aspect_ratio=decrease,pad={int(base_height*9/16)}:{base_height}:(ow-iw)/2:(oh-ih)/2',
            '1:1': f'scale={base_height}:{base_height}:force_original_aspect_ratio=decrease,pad={base_height}:{base_height}:(ow-iw)/2:(oh-ih)/2',
            '4:3': f'scale={int(base_height*4/3)}:{base_height}:force_original_aspect_ratio=decrease,pad={int(base_height*4/3)}:{base_height}:(ow-iw)/2:(oh-ih)/2'
        }
        scale = aspect_map.get(aspect, aspect_map['16:9'])
        
        rotation = job_settings.get('rotation', 'none')
        rotation_filter = ''
        if rotation == '90':
            rotation_filter = 'transpose=1'
        elif rotation == '-90':
            rotation_filter = 'transpose=2'
        elif rotation == '180':
            rotation_filter = 'hflip,vflip'
        elif rotation == 'mirror':
            rotation_filter = 'hflip'
        
        filters = [scale]
        if rotation_filter:
            filters.append(rotation_filter)
        
        speed = float(job_settings.get('speed', '1'))
        if speed != 1:
            filters.append(f'setpts={1/speed}*PTS')
        
        final_filter = ','.join(filters)
        output_file_path = os.path.join(OUTPUT_DIR, f'{output_filename}.{output_fmt}')
        framerate = job_settings.get('framerate', '30')
        
        cmd = [
            'ffmpeg', '-i', video_path,
            '-ss', str(trim_start), '-to', str(trim_end),
            '-vf', final_filter,
            '-r', framerate,
            '-c:v', 'libx264', '-preset', 'fast', '-b:v', bitrate,
            '-c:a', 'aac', '-b:a', '128k',
            '-y', output_file_path
        ]
        
        logger.info(f"Running ffmpeg for job {job_id}")
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)
        
        if result.returncode != 0:
            logger.error(f"FFmpeg stderr: {result.stderr}")
            raise Exception("FFmpeg encoding failed")
        
        if not os.path.exists(output_file_path):
            raise Exception("Output file not created")
        
        settings_info = {
            'filename': f'{output_filename}.{output_fmt}',
            'output_format': output_fmt,
            'quality': quality,
            'aspect_ratio': aspect,
            'trim_start': trim_start,
            'trim_end': trim_end,
            'trim_duration': trim_end - trim_start,
            'output_resolution': f'{base_width}x{base_height}',
            'bitrate': bitrate,
            'rotation': rotation if rotation != 'none' else 'None',
            'framerate': framerate,
            'speed': speed
        }
        
        job_manager.update_job(job_id,
            status='complete',
            progress=100,
            message='Video ready!',
            output_file=os.path.basename(output_file_path),
            settings=settings_info,
            completed_at=datetime.now().isoformat()
        )
        
        logger.info(f"[{job_id}] Video completed: {output_file_path}")
        
    except Exception as e:
        logger.error(f"[{job_id}] Error: {str(e)}")
        job_manager.update_job(job_id,
            status='error',
            progress=0,
            message=f'Error: {str(e)}',
            error=str(e),
            completed_at=datetime.now().isoformat()
        )

# --- Routes ---

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok'}), 200

@app.route('/api/upload', methods=['POST'])
def upload():
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file'}), 400
        
        file = request.files['file']
        if not file or not allowed_file(file.filename):
            return jsonify({'error': 'Invalid file'}), 400
        
        job_id = job_manager.create_job()
        job_manager.update_job(job_id, status='uploading', message='Uploading...')
        
        filename = secure_filename(file.filename)
        filepath = os.path.join(UPLOAD_DIR, f'{job_id}_{filename}')
        file.save(filepath)
        
        duration = get_duration(filepath)
        width, height = get_dimensions(filepath)
        
        job_manager.update_job(job_id, 
            video_path=filepath,
            status='idle',
            message='Ready'
        )
        
        logger.info(f"[{job_id}] Uploaded: {filename}")
        
        return jsonify({
            'job_id': job_id,
            'status': 'ready',
            'duration': duration,
            'width': width,
            'height': height
        }), 200
        
    except Exception as e:
        logger.error(f"Upload error: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/settings/<job_id>', methods=['GET', 'POST'])
def settings_route(job_id):
    job = job_manager.get_job(job_id)
    if not job:
        return jsonify({'error': 'Job not found'}), 404
    
    if request.method == 'GET':
        return jsonify(job.get('settings') or default_settings), 200
    
    try:
        data = request.get_json()
        job_settings = job.get('settings') or default_settings.copy()
        
        # Safe update of settings
        for key in default_settings.keys():
            if key in data and data[key] is not None:
                 job_settings[key] = data[key]
        
        job_manager.update_job(job_id, settings=job_settings)
        return jsonify(job_settings), 200
    except Exception as e:
        logger.error(f"Settings error: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/process/<job_id>', methods=['POST'])
def process(job_id):
    job = job_manager.get_job(job_id)
    if not job:
        return jsonify({'error': 'Job not found'}), 404
    
    if not job.get('video_path'):
        return jsonify({'error': 'No video uploaded'}), 400
    
    # Allow retrying if error or idle
    if job['status'] in ['processing', 'uploading']:
        return jsonify({'error': f'Job is {job["status"]}'}), 400
    
    try:
        job_settings = job.get('settings') or default_settings
        job_manager.executor.submit(process_video_job, job_id, job['video_path'], job_settings)
        return jsonify({'job_id': job_id, 'status': 'queued'}), 202
    except Exception as e:
        logger.error(f"Process error: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/jobs', methods=['GET'])
def get_jobs():
    try:
        all_jobs = job_manager.get_all_jobs()
        running = len(job_manager.get_running_jobs())
        
        return jsonify({
            'jobs': all_jobs,
            'stats': {
                'total': len(all_jobs),
                'running': running,
                'completed': sum(1 for j in all_jobs if j['status'] == 'complete'),
                'errors': sum(1 for j in all_jobs if j['status'] == 'error')
            }
        }), 200
    except Exception as e:
        logger.error(f"Get jobs error: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/status/<job_id>', methods=['GET'])
def get_status(job_id):
    job = job_manager.get_job(job_id)
    if not job:
        return jsonify({'error': 'Job not found'}), 404
    return jsonify(job), 200

@app.route('/download/<filename>', methods=['GET'])
def download(filename):
    try:
        # Security check - sanitize filename
        filename = secure_filename(filename)
        filepath = os.path.join(OUTPUT_DIR, filename)
        if not os.path.exists(filepath):
            return jsonify({'error': 'File not found'}), 404
        return send_file(filepath, as_attachment=True, download_name=filename)
    except Exception as e:
        logger.error(f"Download error: {str(e)}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    logger.info(f"Video Editor Backend Started")
    logger.info(f"Storage: {OUTPUT_DIR}")
    # In production with Gunicorn, this line is skipped, but app object is used
    app.run(debug=False, host=BACKEND_HOST, port=BACKEND_PORT)