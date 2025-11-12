import React, { useState, useEffect, useRef } from 'react';
import { Upload, Download, Loader, CheckCircle, AlertCircle, X, Trash2 } from 'lucide-react';

export default function VideoClipperApp() {
  const fileInputRef = useRef(null);
  
  // Running videos tracking
  const [allJobs, setAllJobs] = useState([]);
  const [runningVideos, setRunningVideos] = useState({});
  const [removedJobs, setRemovedJobs] = useState(new Set());
  const [activeTab, setActiveTab] = useState('ready'); // ready, running, completed
  
  // Jobs map for each video
  const [jobsSettings, setJobsSettings] = useState({});
  const [jobsInfo, setJobsInfo] = useState({});
  const [jobsFilenames, setJobsFilenames] = useState({});

  // Load removed jobs from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('removedJobs');
    if (saved) {
      setRemovedJobs(new Set(JSON.parse(saved)));
    }
  }, []);

  // Save removed jobs to localStorage
  useEffect(() => {
    localStorage.setItem('removedJobs', JSON.stringify(Array.from(removedJobs)));
  }, [removedJobs]);

  // Poll all jobs
  useEffect(() => {
    const fetchAllJobs = async () => {
      try {
        const res = await fetch('http://localhost:5000/api/jobs');
        const data = await res.json();
        setAllJobs(data.jobs || []);
        setRunningVideos(data.stats || {});
      } catch (e) {
        console.error('Fetch jobs error:', e);
      }
    };

    fetchAllJobs();
    const interval = setInterval(fetchAllJobs, 500);
    return () => clearInterval(interval);
  }, []);

  const updateJobSettings = (jobId, newSettings) => {
    setJobsSettings(prev => ({
      ...prev,
      [jobId]: { ...(prev[jobId] || {}), ...newSettings }
    }));
  };

  const handleFileSelect = async (e) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const res = await fetch('http://localhost:5000/api/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Upload failed');

      const jobId = data.job_id;
      const filename = selectedFile.name;
      
      setRemovedJobs(prev => {
        const newSet = new Set(prev);
        newSet.delete(jobId);
        return newSet;
      });
      
      setJobsInfo(prev => ({
        ...prev,
        [jobId]: {
          duration: data.duration,
          width: data.width,
          height: data.height
        }
      }));

      setJobsFilenames(prev => ({
        ...prev,
        [jobId]: filename
      }));
      
      setJobsSettings(prev => ({
        ...prev,
        [jobId]: {
          output_format: 'mp4',
          quality: '1080p',
          aspect_ratio: '16:9',
          trim_start: 0,
          trim_end: data.duration,
          output_filename: filename.split('.')[0],
          rotation: 'none',
          framerate: '30',
          speed: '1'
        }
      }));

    } catch (err) {
      alert('Upload error: ' + err.message);
    }

    e.target.value = '';
  };

  const handleProcess = async (jobId) => {
    try {
      const settings = jobsSettings[jobId];
      if (!settings) {
        alert('Settings not found');
        return;
      }
      
      // Warn about heavy formats
      if ((settings.quality === '2160p' || settings.output_format === 'mkv') && settings.quality === '2160p' && settings.output_format === 'mkv') {
        const confirm = window.confirm('⚠️ Warning: 2160p + MKV format is very heavy and may take a long time (10+ minutes). Continue?');
        if (!confirm) return;
      }

      await fetch(`http://localhost:5000/api/settings/${jobId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });

      const res = await fetch(`http://localhost:5000/api/process/${jobId}`, {
        method: 'POST'
      });

      if (!res.ok) throw new Error('Failed to start');
    } catch (err) {
      alert('Process error: ' + err.message);
    }
  };

  const handleDownload = (jobId) => {
    const job = allJobs.find(j => j.id === jobId);
    if (job?.output_file) {
      window.location.href = `http://localhost:5000/download/${job.output_file}`;
    }
  };

  const handleRemoveJob = (jobId) => {
    setRemovedJobs(prev => new Set(prev).add(jobId));
    
    setJobsSettings(prev => {
      const newSettings = { ...prev };
      delete newSettings[jobId];
      return newSettings;
    });
    
    setJobsInfo(prev => {
      const newInfo = { ...prev };
      delete newInfo[jobId];
      return newInfo;
    });

    setJobsFilenames(prev => {
      const newFilenames = { ...prev };
      delete newFilenames[jobId];
      return newFilenames;
    });
  };

  const handleClearAll = () => {
    if (window.confirm('Clear all completed and error jobs?')) {
      const jobsToRemove = allJobs
        .filter(j => j.status === 'complete' || j.status === 'error')
        .map(j => j.id);
      
      jobsToRemove.forEach(id => handleRemoveJob(id));
    }
  };

  // Filter jobs
  const filteredJobs = allJobs.filter(j => {
    if (removedJobs.has(j.id)) return false;
    if (j.status === 'idle' && !jobsSettings[j.id]) return false;
    return true;
  });

  // Get jobs by status
  const idleJobs = filteredJobs.filter(j => j.status === 'idle');
  const processingJobs = filteredJobs.filter(j => j.status === 'processing');
  const completedJobs = filteredJobs.filter(j => j.status === 'complete');
  const errorJobs = filteredJobs.filter(j => j.status === 'error');

  // Determine which jobs to show based on tab
  let displayJobs = [];
  if (activeTab === 'ready') {
    displayJobs = idleJobs;
  } else if (activeTab === 'running') {
    displayJobs = processingJobs;
  } else if (activeTab === 'completed') {
    displayJobs = [...completedJobs, ...errorJobs];
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-black p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-3">🎬 Video Editor</h1>
          <p className="text-gray-300 text-lg mb-8">Concurrent Processing • Multi Video • Real-time Editing</p>
          
          {/* Stats Tabs */}
          <div className="flex justify-center gap-3 mb-8 flex-wrap">
            <button
              onClick={() => setActiveTab('ready')}
              className={`px-6 py-3 rounded-xl font-bold transition ${
                activeTab === 'ready'
                  ? 'bg-blue-600 text-white'
                  : 'bg-blue-600/30 text-gray-300 hover:bg-blue-600/50'
              }`}
            >
              <span className="text-sm">📝 Ready</span>
              <p className="text-2xl font-bold">{idleJobs.length}</p>
            </button>
            
            <button
              onClick={() => setActiveTab('running')}
              className={`px-6 py-3 rounded-xl font-bold transition ${
                activeTab === 'running'
                  ? 'bg-purple-600 text-white'
                  : 'bg-purple-600/30 text-gray-300 hover:bg-purple-600/50'
              }`}
            >
              <span className="text-sm">⏳ Running</span>
              <p className="text-2xl font-bold">{processingJobs.length}</p>
            </button>
            
            <button
              onClick={() => setActiveTab('completed')}
              className={`px-6 py-3 rounded-xl font-bold transition ${
                activeTab === 'completed'
                  ? 'bg-green-600 text-white'
                  : 'bg-green-600/30 text-gray-300 hover:bg-green-600/50'
              }`}
            >
              <span className="text-sm">✅ Completed</span>
              <p className="text-2xl font-bold">{completedJobs.length + errorJobs.length}</p>
            </button>

            {(completedJobs.length > 0 || errorJobs.length > 0) && (
              <button
                onClick={handleClearAll}
                className="px-4 py-3 rounded-xl font-bold bg-red-600/30 text-red-300 hover:bg-red-600/50 transition flex items-center gap-2"
                title="Clear completed and error jobs"
              >
                <Trash2 size={20} />
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Upload Section - Always Visible */}
        <div className="bg-gray-900 rounded-xl shadow-xl p-8 mb-12 border border-gray-800">
          <h2 className="text-white font-bold text-xl mb-6">📤 Add Video</h2>
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-3 border-dashed border-purple-500 rounded-xl p-12 text-center cursor-pointer hover:border-purple-400 transition hover:bg-purple-900/10"
          >
            <Upload className="w-16 h-16 text-purple-400 mx-auto mb-4" />
            <p className="text-white font-bold text-lg mb-2">Upload Video</p>
            <p className="text-gray-400 text-base mb-2">MP4, WebM, AVI, MOV, MKV (max 1GB)</p>
            <p className="text-gray-500 text-sm">Best results: MP4 format, up to 1080p</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
        </div>

        {/* Jobs Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Ready to Edit Jobs */}
          {activeTab === 'ready' && idleJobs.map(job => {
            const settings = jobsSettings[job.id] || {};
            const info = jobsInfo[job.id] || {};
            const filename = jobsFilenames[job.id] || 'Video';
            const duration = info.duration || 100;
            
            return (
              <div key={job.id} className="bg-gray-900 rounded-xl shadow-xl overflow-hidden border-2 border-blue-500/30 hover:border-blue-500/60 transition">
                <div className="p-6 bg-blue-900/20 border-b border-gray-800">
                  <div className="flex justify-between items-start gap-4">
                    <div>
                      <p className="text-blue-300 font-bold text-lg">📝 Ready to Edit</p>
                      <p className="text-white font-semibold text-base mt-3">📹 Video = <span className="text-purple-300">{filename}</span></p>
                    </div>
                    <button
                      onClick={() => handleRemoveJob(job.id)}
                      className="text-gray-400 hover:text-red-400 transition flex-shrink-0 p-2 hover:bg-red-900/20 rounded"
                      title="Remove this video"
                    >
                      <X size={24} />
                    </button>
                  </div>
                </div>

                <div className="p-6 space-y-5">
                  {/* Info */}
                  <div className="bg-gray-800/50 p-4 rounded-lg">
                    <p className="text-gray-300 text-base">Duration: <span className="text-white font-bold text-lg">{duration.toFixed(1)}s</span></p>
                    {info.width && <p className="text-gray-300 text-base mt-2">Resolution: <span className="text-white font-bold text-lg">{info.width}x{info.height}</span></p>}
                  </div>

                  {/* Format */}
                  <div>
                    <label className="block text-gray-300 font-semibold mb-3 text-base">📁 Format</label>
                    <div className="grid grid-cols-4 gap-2">
                      {['mp4', 'webm', 'avi', 'mkv'].map(fmt => (
                        <button
                          key={fmt}
                          onClick={() => updateJobSettings(job.id, { output_format: fmt })}
                          className={`p-3 rounded-lg font-bold text-sm transition ${
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
                    <label className="block text-gray-300 font-semibold mb-3 text-base">⚡ Quality</label>
                    <div className="grid grid-cols-3 gap-2">
                      {['720p', '1080p', '2160p'].map(q => (
                        <button
                          key={q}
                          onClick={() => updateJobSettings(job.id, { quality: q })}
                          className={`p-3 rounded-lg font-bold text-sm transition ${
                            settings.quality === q
                              ? 'bg-purple-600 text-white'
                              : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                          }`}
                          title={q === '2160p' ? '⚠️ Very slow conversion' : ''}
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Aspect Ratio */}
                  <div>
                    <label className="block text-gray-300 font-semibold mb-3 text-base">📐 Aspect Ratio</label>
                    <div className="grid grid-cols-4 gap-2">
                      {['16:9', '9:16', '1:1', '4:3'].map(ar => (
                        <button
                          key={ar}
                          onClick={() => updateJobSettings(job.id, { aspect_ratio: ar })}
                          className={`p-3 rounded-lg font-bold text-sm transition ${
                            settings.aspect_ratio === ar
                              ? 'bg-purple-600 text-white'
                              : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                          }`}
                        >
                          {ar}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Speed */}
                  <div>
                    <label className="block text-gray-300 font-semibold mb-3 text-base">⏱️ Speed</label>
                    <div className="grid grid-cols-5 gap-2">
                      {['0.5', '0.75', '1', '1.5', '2'].map(speed => (
                        <button
                          key={speed}
                          onClick={() => updateJobSettings(job.id, { speed })}
                          className={`p-3 rounded-lg font-bold text-sm transition ${
                            settings.speed === speed
                              ? 'bg-purple-600 text-white'
                              : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                          }`}
                        >
                          {speed}x
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Trim */}
                  <div className="bg-gray-800/50 p-5 rounded-lg space-y-4">
                    <label className="block text-gray-300 font-semibold text-base">✂️ Trim Video</label>
                    
                    <div>
                      <div className="flex justify-between mb-2">
                        <span className="text-gray-400 font-semibold">From:</span>
                        <span className="text-white font-bold text-lg">{(settings.trim_start || 0).toFixed(1)}s</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max={duration}
                        step="0.1"
                        value={settings.trim_start || 0}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          const currentEnd = settings.trim_end !== undefined ? settings.trim_end : duration;
                          if (val < currentEnd) {
                            updateJobSettings(job.id, { trim_start: val });
                          }
                        }}
                        className="w-full h-2 bg-gray-700 rounded cursor-pointer appearance-none"
                        style={{ accentColor: '#a855f7' }}
                      />
                    </div>
                    
                    <div>
                      <div className="flex justify-between mb-2">
                        <span className="text-gray-400 font-semibold">To:</span>
                        <span className="text-white font-bold text-lg">{(settings.trim_end !== undefined ? settings.trim_end : duration).toFixed(1)}s</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max={duration}
                        step="0.1"
                        value={settings.trim_end !== undefined ? settings.trim_end : duration}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          const currentStart = settings.trim_start || 0;
                          if (val > currentStart) {
                            updateJobSettings(job.id, { trim_end: val });
                          }
                        }}
                        className="w-full h-2 bg-gray-700 rounded cursor-pointer appearance-none"
                        style={{ accentColor: '#a855f7' }}
                      />
                    </div>
                    
                    <p className="text-gray-400 font-semibold mt-4">
                      Duration: <span className="text-white font-bold text-lg">{((settings.trim_end !== undefined ? settings.trim_end : duration) - (settings.trim_start || 0)).toFixed(2)}s</span>
                    </p>
                  </div>

                  {/* Process Button */}
                  <button
                    onClick={() => handleProcess(job.id)}
                    className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-bold py-4 rounded-lg transition text-lg"
                  >
                    🚀 Start Processing
                  </button>
                </div>
              </div>
            );
          })}

          {/* Processing Jobs */}
          {activeTab === 'running' && processingJobs.map(job => (
            <div key={job.id} className="bg-gray-900 rounded-xl shadow-xl overflow-hidden border-2 border-yellow-500/30">
              <div className="p-6 bg-yellow-900/20 border-b border-gray-800">
                <div className="flex items-center gap-3">
                  <Loader className="w-6 h-6 text-yellow-400 animate-spin" />
                  <p className="text-yellow-300 font-bold text-lg">⏳ Processing</p>
                  <p className="text-gray-400 text-sm ml-auto">📹 {jobsFilenames[job.id] || 'Video'}</p>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-white text-lg">{job.message}</p>
                <div className="bg-gray-800 rounded-full overflow-hidden h-4">
                  <div
                    className="bg-gradient-to-r from-yellow-400 to-orange-500 h-full transition-all"
                    style={{ width: `${job.progress}%` }}
                  />
                </div>
                <p className="text-gray-400 text-center font-bold text-lg">{job.progress}%</p>
              </div>
            </div>
          ))}

          {/* Completed & Error Jobs */}
          {activeTab === 'completed' && completedJobs.map(job => (
            <div key={job.id} className="bg-gray-900 rounded-xl shadow-xl overflow-hidden border-2 border-green-500/30">
              <div className="p-6 bg-green-900/20 border-b border-gray-800">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-6 h-6 text-green-400" />
                  <p className="text-green-300 font-bold text-lg">✅ Completed</p>
                  {/* <p className="text-gray-400 text-sm ml-auto">📹 {jobsFilenames[job.id] || 'Video'}</p> */}
                  {/* <p className="text-green-300 font-bold text-lg"> Video Name:  {jobsFilenames[job.id] || 'Video'}</p> */}

                </div>
              </div>
              <div className="p-6 space-y-4">
                {job.settings && (

                  <div className="bg-gray-800/50 p-4 rounded-lg space-y-2">
                    <p className="text-green-300 font-bold text-lg"> Video Name:  {jobsFilenames[job.id] || 'Video'}</p>

                    <p className="text-gray-300 text-base"><span className="text-gray-500">Format:</span> <span className="text-white font-bold">{job.settings.output_format.toUpperCase()}</span></p>
                    <p className="text-gray-300 text-base"><span className="text-gray-500">Quality:</span> <span className="text-white font-bold">{job.settings.quality}</span></p>
                    <p className="text-gray-300 text-base"><span className="text-gray-500">Duration:</span> <span className="text-white font-bold">{job.settings.trim_duration?.toFixed(2)}s</span></p>
                  </div>
                )}
                <button
                  onClick={() => handleDownload(job.id)}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 rounded-lg transition text-lg flex items-center justify-center gap-2"
                >
                  <Download size={20} />
                  Download Video
                </button>
              </div>
            </div>
          ))}

          {/* Error Jobs */}
          {activeTab === 'completed' && errorJobs.map(job => (
            <div key={job.id} className="bg-gray-900 rounded-xl shadow-xl overflow-hidden border-2 border-red-500/30">
              <div className="p-6 bg-red-900/20 border-b border-gray-800">
                <div className="flex items-center gap-3">
                  <AlertCircle className="w-6 h-6 text-red-400" />
                  <p className="text-red-300 font-bold text-lg">❌ Error</p>
                  <p className="text-gray-400 text-sm ml-auto">📹 {jobsFilenames[job.id] || 'Video'}</p>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-red-200 text-base break-words font-semibold">{job.error || job.message}</p>
                <p className="text-red-300 text-sm">💡 Tip: Try using MP4 format or lower quality (1080p)</p>
                <button
                  onClick={() => handleRemoveJob(job.id)}
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-lg transition text-base"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Empty State */}
        {displayJobs.length === 0 && (
          <div className="text-center py-20">
            {activeTab === 'ready' && <p className="text-gray-400 text-2xl">📹 No videos ready. Upload one to get started!</p>}
            {activeTab === 'running' && <p className="text-gray-400 text-2xl">⏳ No videos processing right now.</p>}
            {activeTab === 'completed' && <p className="text-gray-400 text-2xl">✅ No completed videos yet.</p>}
          </div>
        )}
      </div>
    </div>
  );
}