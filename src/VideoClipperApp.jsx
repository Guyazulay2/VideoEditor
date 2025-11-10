import React, { useState, useEffect, useRef } from 'react';
import { Upload, Settings, Download, Loader, CheckCircle, AlertCircle } from 'lucide-react';

export default function VideoClipperApp() {
  const [file, setFile] = useState(null);
  const [videoInfo, setVideoInfo] = useState(null);
  const [settings, setSettings] = useState({
    output_format: 'mp4',
    quality: '1080p',
    aspect_ratio: '16:9',
    trim_start: 0,
    trim_end: null,
    output_filename: 'video',
    rotation: 'none',
    framerate: '30',
    speed: '1'
  });
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const fileInputRef = useRef(null);
  const [history, setHistory] = useState([]);

  // Poll progress
  useEffect(() => {
    if (!processing) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch('http://localhost:5000/api/progress');
        const data = await res.json();
        setProgress(data);

        if (data.status === 'complete') {
          setProcessing(false);
          setSuccess({ message: data.message, file: data.output_file });
          // Save to history
          setTimeout(() => saveToHistory(), 500);
        } else if (data.status === 'error') {
          setProcessing(false);
          setError(data.message);
        }
      } catch (e) {
        console.error('Error:', e);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [processing]);

  const handleFileSelect = async (e) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setError(null);
    setSuccess(null);
    setProcessing(true);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const res = await fetch('http://localhost:5000/api/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Upload failed');

      setVideoInfo(data);
      setSettings(prev => ({ ...prev, trim_end: data.duration }));
      setProcessing(false);
    } catch (err) {
      setError(err.message);
      setProcessing(false);
    }
  };

  const handleProcess = async () => {
    try {
      await fetch('http://localhost:5000/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });

      const res = await fetch('http://localhost:5000/api/process', {
        method: 'POST'
      });

      if (!res.ok) throw new Error('Failed to start');
      setProcessing(true);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDownload = () => {
    if (success?.file) {
      window.location.href = `http://localhost:5000/download/${success.file}`;
    }
  };

  const saveToHistory = () => {
    if (success?.file && progress?.settings_info) {
      const historyEntry = {
        id: Date.now(),
        filename: success.file,
        settings: settings,
        timestamp: new Date().toLocaleString(),
        settingsInfo: progress.settings_info
      };
      setHistory(prev => [historyEntry, ...prev]);
    }
  };

  const reprocessFromHistory = (entry) => {
    setSettings(entry.settings);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-black p-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-white mb-2">🎬 Video Editor</h1>
          <p className="text-gray-300">Format • Quality • Trim • Subtitles</p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-6 bg-red-500/20 border border-red-500/50 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="text-red-400 mt-0.5 flex-shrink-0" size={20} />
            <p className="text-red-200">{error}</p>
          </div>
        )}

        {/* Main Card */}
        <div className="bg-gray-900 rounded-2xl shadow-2xl overflow-hidden">
          {/* Upload Section */}
          <div className="p-8 border-b border-gray-800">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-purple-500 rounded-lg p-8 text-center cursor-pointer hover:border-purple-400 transition"
            >
              <Upload className="w-12 h-12 text-purple-400 mx-auto mb-3" />
              <p className="text-white font-semibold mb-2">Upload Video</p>
              <p className="text-gray-400 text-sm">MP4, WebM, AVI, MOV, MKV (max 1GB)</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                onChange={handleFileSelect}
                disabled={processing}
                className="hidden"
              />
            </div>
            {file && <p className="text-green-400 text-sm mt-3">✅ {file.name}</p>}
          </div>

          {/* Video Info */}
          {videoInfo && (
            <div className="p-8 bg-gray-800/50 border-b border-gray-800">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-gray-400 text-sm">Duration</p>
                  <p className="text-white font-bold">{videoInfo.duration.toFixed(1)}s</p>
                </div>
                <div>
                  <p className="text-gray-400 text-sm">Resolution</p>
                  <p className="text-white font-bold">{videoInfo.width}x{videoInfo.height}</p>
                </div>
                <div>
                  <p className="text-gray-400 text-sm">Format</p>
                  <p className="text-white font-bold">{settings.output_format.toUpperCase()}</p>
                </div>
              </div>
            </div>
          )}

          {/* Settings */}
          {videoInfo && !processing && !success && (
            <div className="p-8 space-y-6">
              <h2 className="text-white font-bold text-lg flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Edit Video
              </h2>

              {/* Output Format */}
              <div>
                <label className="block text-gray-300 text-sm font-semibold mb-3">
                  📁 Output Format
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {['mp4', 'webm', 'avi', 'mkv'].map(fmt => (
                    <button
                      key={fmt}
                      onClick={() => setSettings(p => ({ ...p, output_format: fmt }))}
                      className={`p-3 rounded-lg font-semibold transition ${
                        settings.output_format === fmt
                          ? 'bg-purple-600 text-white'
                          : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                      }`}
                    >
                      {fmt.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quality */}
              <div>
                <label className="block text-gray-300 text-sm font-semibold mb-3">
                  ⚡ Video Quality
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {['720p', '1080p', '2160p'].map(q => (
                    <button
                      key={q}
                      onClick={() => setSettings(p => ({ ...p, quality: q }))}
                      className={`p-3 rounded-lg font-semibold transition ${
                        settings.quality === q
                          ? 'bg-purple-600 text-white'
                          : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                      }`}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>

              {/* Aspect Ratio */}
              <div>
                <label className="block text-gray-300 text-sm font-semibold mb-3">
                  📐 Aspect Ratio
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {['16:9', '9:16', '1:1', '4:3'].map(ar => (
                    <button
                      key={ar}
                      onClick={() => setSettings(p => ({ ...p, aspect_ratio: ar }))}
                      className={`p-3 rounded-lg font-semibold transition ${
                        settings.aspect_ratio === ar
                          ? 'bg-purple-600 text-white'
                          : 'bg-gray-800 text-gray-300'
                      }`}
                    >
                      {ar}
                    </button>
                  ))}
                </div>
              </div>

              {/* Output Filename */}
              <div>
                <label className="block text-gray-300 text-sm font-semibold mb-3">
                  📝 Output Filename
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={settings.output_filename || 'video'}
                    onChange={(e) => setSettings(p => ({ ...p, output_filename: e.target.value }))}
                    placeholder="Enter filename (without extension)"
                    className="flex-1 bg-gray-800 border border-gray-700 text-white px-4 py-2 rounded-lg focus:outline-none focus:border-purple-500"
                  />
                  <span className="flex items-center text-gray-400 font-semibold">
                    .{settings.output_format}
                  </span>
                </div>
              </div>

              {/* Video Rotation */}
              <div>
                <label className="block text-gray-300 text-sm font-semibold mb-3">
                  🔄 Video Rotation
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: '90° Left', value: '90' },
                    { label: '90° Right', value: '-90' },
                    { label: '180°', value: '180' },
                    { label: 'Mirror', value: 'mirror' }
                  ].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setSettings(p => ({ ...p, rotation: opt.value }))}
                      className={`p-3 rounded-lg font-semibold transition text-sm ${
                        settings.rotation === opt.value
                          ? 'bg-purple-600 text-white'
                          : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Frame Rate */}
              <div>
                <label className="block text-gray-300 text-sm font-semibold mb-3">
                  ⚡ Frame Rate
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: '24fps (Cinema)', value: '24' },
                    { label: '30fps (Standard)', value: '30' },
                    { label: '60fps (Smooth)', value: '60' }
                  ].map(fps => (
                    <button
                      key={fps.value}
                      onClick={() => setSettings(p => ({ ...p, framerate: fps.value }))}
                      className={`p-3 rounded-lg font-semibold transition ${
                        settings.framerate === fps.value
                          ? 'bg-purple-600 text-white'
                          : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                      }`}
                    >
                      {fps.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Speed Control */}
              <div>
                <label className="block text-gray-300 text-sm font-semibold mb-3">
                  ⏱️ Playback Speed
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {[
                    { label: '0.5x', value: '0.5' },
                    { label: '0.75x', value: '0.75' },
                    { label: '1x', value: '1' },
                    { label: '1.5x', value: '1.5' },
                    { label: '2x', value: '2' }
                  ].map(speed => (
                    <button
                      key={speed.value}
                      onClick={() => setSettings(p => ({ ...p, speed: speed.value }))}
                      className={`p-3 rounded-lg font-semibold transition text-sm ${
                        settings.speed === speed.value
                          ? 'bg-purple-600 text-white'
                          : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                      }`}
                    >
                      {speed.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Trim */}
              <div className="bg-gray-800/50 p-6 rounded-lg">
                <label className="block text-gray-300 text-sm font-semibold mb-4">
                  ✂️ Trim (From Second to Second)
                </label>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between mb-2">
                      <label className="text-gray-400 text-xs">From:</label>
                      <span className="text-white font-bold">{settings.trim_start.toFixed(2)}s</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max={videoInfo.duration}
                      step="0.1"
                      value={settings.trim_start}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (val < settings.trim_end) {
                          setSettings(p => ({ ...p, trim_start: val }));
                        }
                      }}
                      className="w-full"
                      style={{ accentColor: '#a855f7' }}
                    />
                  </div>
                  <div>
                    <div className="flex justify-between mb-2">
                      <label className="text-gray-400 text-xs">To:</label>
                      <span className="text-white font-bold">{settings.trim_end.toFixed(2)}s</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max={videoInfo.duration}
                      step="0.1"
                      value={settings.trim_end}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (val > settings.trim_start) {
                          setSettings(p => ({ ...p, trim_end: val }));
                        }
                      }}
                      className="w-full"
                      style={{ accentColor: '#a855f7' }}
                    />
                  </div>
                  <p className="text-gray-400 text-sm">
                    Duration: {(settings.trim_end - settings.trim_start).toFixed(2)}s
                  </p>
                </div>
              </div>

              {/* Process Button */}
              <button
                onClick={handleProcess}
                className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-bold py-4 rounded-lg transition text-lg"
              >
                🚀 Process Video
              </button>
            </div>
          )}

          {/* Processing */}
          {processing && progress && (
            <div className="p-8">
              <div className="text-center">
                <Loader className="w-12 h-12 text-purple-400 animate-spin mx-auto mb-4" />
                <p className="text-white font-bold text-lg mb-4">{progress.message}</p>
                <div className="bg-gray-800 rounded-full overflow-hidden h-3">
                  <div
                    className="bg-gradient-to-r from-purple-600 to-blue-600 h-full transition-all"
                    style={{ width: `${progress.progress}%` }}
                  />
                </div>
                <p className="text-gray-400 text-sm mt-3">{progress.progress}%</p>
              </div>
            </div>
          )}

          {/* History Section */}
          {history.length > 0 && !processing && (
            <div className="p-8 border-t border-gray-800">
              <h2 className="text-white font-bold text-lg mb-4">📋 History</h2>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {history.map((entry) => (
                  <div key={entry.id} className="bg-gray-800/50 p-4 rounded-lg flex justify-between items-start">
                    <div className="flex-1">
                      <p className="text-white font-semibold text-sm">{entry.filename}</p>
                      <p className="text-gray-400 text-xs mt-1">{entry.timestamp}</p>
                      <p className="text-purple-300 text-xs mt-1">
                        {entry.settings.quality} • {entry.settings.aspect_ratio} • {entry.settings.speed}x
                      </p>
                    </div>
                    <button
                      onClick={() => reprocessFromHistory(entry)}
                      className="ml-4 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded font-semibold transition"
                    >
                      Reuse
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Success */}
          {success && (
            <div className="p-8">
              <div className="text-center">
                <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
                <p className="text-white font-bold text-lg mb-6">{success.message}</p>

                {/* Settings Display */}
                {progress?.settings_info && (
                  <div className="bg-gray-800/50 p-6 rounded-lg mb-6 text-left">
                    <h3 className="text-white font-bold mb-4">📊 Video Settings:</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-gray-400">Filename</p>
                        <p className="text-white font-semibold break-all">{progress.settings_info.filename}</p>
                      </div>
                      <div>
                        <p className="text-gray-400">Format</p>
                        <p className="text-white font-semibold">{progress.settings_info.output_format.toUpperCase()}</p>
                      </div>
                      <div>
                        <p className="text-gray-400">Quality</p>
                        <p className="text-white font-semibold">{progress.settings_info.quality}</p>
                      </div>
                      <div>
                        <p className="text-gray-400">Resolution</p>
                        <p className="text-white font-semibold">{progress.settings_info.output_resolution}</p>
                      </div>
                      <div>
                        <p className="text-gray-400">Aspect Ratio</p>
                        <p className="text-white font-semibold">{progress.settings_info.aspect_ratio}</p>
                      </div>
                      <div>
                        <p className="text-gray-400">Trim Duration</p>
                        <p className="text-white font-semibold">{progress.settings_info.trim_duration.toFixed(2)}s</p>
                      </div>
                      <div>
                        <p className="text-gray-400">Bitrate</p>
                        <p className="text-white font-semibold">{progress.settings_info.bitrate}</p>
                      </div>
                      <div>
                        <p className="text-gray-400">Rotation</p>
                        <p className="text-white font-semibold">{progress.settings_info.rotation || 'None'}</p>
                      </div>
                      <div>
                        <p className="text-gray-400">Frame Rate</p>
                        <p className="text-white font-semibold">{progress.settings_info.framerate}fps</p>
                      </div>
                      <div>
                        <p className="text-gray-400">Speed</p>
                        <p className="text-white font-semibold">{progress.settings_info.speed}x</p>
                      </div>
                    </div>
                  </div>
                )}

                <button
                  onClick={handleDownload}
                  className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-8 rounded-lg transition text-lg"
                >
                  <Download className="w-5 h-5" />
                  Download Video
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}