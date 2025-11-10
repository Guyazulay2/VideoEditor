#!/usr/bin/env python3
import os
import json
import subprocess
import threading
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from werkzeug.utils import secure_filename

app = Flask(__name__)
CORS(app)

BASE_DIR = os.path.expanduser('~/video-editor')
UPLOAD_DIR = os.path.join(BASE_DIR, 'uploads')
OUTPUT_DIR = os.path.join(BASE_DIR, 'output')

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

app.config['UPLOAD_FOLDER'] = UPLOAD_DIR
app.config['MAX_CONTENT_LENGTH'] = 1000 * 1024 * 1024

ALLOWED = {'mp4', 'webm', 'avi', 'mov', 'mkv', 'flv', 'wmv'}

state = {
    'status': 'idle',
    'progress': 0,
    'message': '',
    'output_file': None,
    'error': None,
    'video_path': None
}

settings = {
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
        return None

def get_dimensions(path):
    try:
        cmd = ['ffprobe', '-v', 'error', '-select_streams', 'v:0',
               '-show_entries', 'stream=width,height', '-of', 'csv=s=x:p=0', path]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        w, h = result.stdout.strip().split('x')
        return int(w), int(h)
    except:
        return 1920, 1080

import json

def process_video(video_path):
    global state
    
    try:
        state['status'] = 'processing'
        state['progress'] = 10
        state['message'] = 'Analyzing video...'
        
        duration = get_duration(video_path)
        w, h = get_dimensions(video_path)
        
        trim_start = float(settings.get('trim_start', 0))
        trim_end = settings.get('trim_end')
        
        # Fix: Check if trim_end is None or convert it properly
        if trim_end is None or trim_end == 'None':
            trim_end = duration
        else:
            trim_end = float(trim_end)
        
        if trim_start >= trim_end:
            raise Exception("Invalid trim times")
        
        state['progress'] = 30
        state['message'] = 'Processing video...'
        
        output_fmt = settings.get('output_format', 'mp4')
        quality = settings.get('quality', '1080p')
        aspect = settings.get('aspect_ratio', '16:9')
        output_filename = settings.get('output_filename', 'video')
        
        # Clean filename - remove extension if user added it
        if '.' in output_filename:
            output_filename = output_filename.rsplit('.', 1)[0]
        
        # Remove invalid characters
        output_filename = ''.join(c for c in output_filename if c.isalnum() or c in ('-', '_'))
        if not output_filename:
            output_filename = 'video'
        
        quality_map = {
            '720p': {'bitrate': '2500k', 'width': 1280, 'height': 720},
            '1080p': {'bitrate': '5000k', 'width': 1920, 'height': 1080},
            '2160p': {'bitrate': '12000k', 'width': 3840, 'height': 2160}
        }
        q_settings = quality_map.get(quality, quality_map['1080p'])
        bitrate = q_settings['bitrate']
        base_width = q_settings['width']
        base_height = q_settings['height']
        
        # Generate scale filter based on aspect ratio and resolution
        aspect_map = {
            '16:9': f'scale={base_width}:{base_height}:force_original_aspect_ratio=decrease,pad={base_width}:{base_height}:(ow-iw)/2:(oh-ih)/2',
            '9:16': f'scale={int(base_height*9/16)}:{base_height}:force_original_aspect_ratio=decrease,pad={int(base_height*9/16)}:{base_height}:(ow-iw)/2:(oh-ih)/2',
            '1:1': f'scale={base_height}:{base_height}:force_original_aspect_ratio=decrease,pad={base_height}:{base_height}:(ow-iw)/2:(oh-ih)/2',
            '4:3': f'scale={int(base_height*4/3)}:{base_height}:force_original_aspect_ratio=decrease,pad={int(base_height*4/3)}:{base_height}:(ow-iw)/2:(oh-ih)/2'
        }
        scale = aspect_map.get(aspect, aspect_map['16:9'])
        
        # Build rotation filter
        rotation = settings.get('rotation', 'none')
        rotation_filter = ''
        if rotation == '90':
            rotation_filter = 'transpose=1'  # 90 degrees clockwise
        elif rotation == '-90':
            rotation_filter = 'transpose=2'  # 90 degrees counter-clockwise
        elif rotation == '180':
            rotation_filter = 'hflip,vflip'  # 180 degrees
        elif rotation == 'mirror':
            rotation_filter = 'hflip'  # Mirror/horizontal flip
        
        # Combine filters
        filters = [scale]
        if rotation_filter:
            filters.append(rotation_filter)
        
        # Speed control
        speed = float(settings.get('speed', '1'))
        if speed != 1:
            filters.append(f'setpts={1/speed}*PTS')
        
        final_filter = ','.join(filters)
        
        output_file = os.path.join(OUTPUT_DIR, f'{output_filename}.{output_fmt}')
        
        # Frame rate
        framerate = settings.get('framerate', '30')
        
        cmd = [
            'ffmpeg', '-i', video_path,
            '-ss', str(trim_start), '-to', str(trim_end),
            '-vf', final_filter,
            '-r', framerate,
            '-c:v', 'libx264', '-preset', 'fast', '-b:v', bitrate,
            '-c:a', 'aac', '-b:a', '128k',
            '-y', output_file
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
        
        if result.returncode != 0:
            raise Exception("FFmpeg error")
        
        if not os.path.exists(output_file):
            raise Exception("Output file not created")
        
        # Save settings info
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
        
        settings_file = os.path.join(OUTPUT_DIR, 'video_settings.json')
        with open(settings_file, 'w') as f:
            json.dump(settings_info, f, indent=2)
        
        state['status'] = 'complete'
        state['progress'] = 100
        state['message'] = '✅ Video ready!'
        state['output_file'] = os.path.basename(output_file)
        state['settings_info'] = settings_info
        
        print(f"✅ Video: {output_file}")
        print(f"📊 Settings: {settings_info}")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        state['error'] = str(e)
        state['status'] = 'error'
        state['message'] = f'Error: {str(e)}'

@app.route('/api/upload', methods=['POST'])
def upload():
    if 'file' not in request.files:
        return jsonify({'error': 'No file'}), 400
    
    file = request.files['file']
    if not file or not allowed_file(file.filename):
        return jsonify({'error': 'Invalid file'}), 400
    
    filename = secure_filename(file.filename)
    filepath = os.path.join(UPLOAD_DIR, filename)
    file.save(filepath)
    
    state['video_path'] = filepath
    
    duration = get_duration(filepath)
    width, height = get_dimensions(filepath)
    
    return jsonify({
        'status': 'ready',
        'duration': duration,
        'width': width,
        'height': height
    }), 200

@app.route('/api/settings', methods=['GET', 'POST'])
def settings_route():
    if request.method == 'GET':
        return jsonify(settings), 200
    
    data = request.get_json()
    for key in ['output_format', 'quality', 'aspect_ratio', 'output_filename', 'rotation', 'framerate', 'speed']:
        if key in data:
            settings[key] = data[key]
    for key in ['trim_start', 'trim_end']:
        if key in data and data[key] is not None:
            settings[key] = float(data[key])
    
    return jsonify(settings), 200

@app.route('/api/process', methods=['POST'])
def process():
    if not state['video_path']:
        return jsonify({'error': 'No video'}), 400
    
    state['status'] = 'processing'
    state['progress'] = 0
    state['error'] = None
    
    thread = threading.Thread(target=process_video, args=(state['video_path'],))
    thread.daemon = True
    thread.start()
    
    return jsonify({'status': 'processing'}), 202

@app.route('/api/progress', methods=['GET'])
def progress():
    return jsonify(state), 200

@app.route('/download/<filename>', methods=['GET'])
def download(filename):
    filepath = os.path.join(OUTPUT_DIR, secure_filename(filename))
    if not os.path.exists(filepath):
        return jsonify({'error': 'Not found'}), 404
    return send_file(filepath, as_attachment=True, download_name=filename)

if __name__ == '__main__':
    print("🎬 Video Editor - http://localhost:5000")
    app.run(debug=True, host='0.0.0.0', port=5000)