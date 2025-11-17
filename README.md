# 🎬 VideoEditor

**VideoEditor** is a lightweight video processing application that allows users to upload, cut, merge, and export video files through a simple and intuitive interface.  
The backend handles video processing, while the frontend provides a user-friendly experience.

---

## 📚 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Installation & Running](#installation--running)
- [Environment Variables (.env)](#environment-variables-env)
- [Project Structure](#project-structure)
- [Usage](#usage)
- [Testing](#testing)
- [Contributing](#contributing)
- [License](#license)
- [Contact](#contact)

---

## Overview

VideoEditor provides a simple workflow for importing and processing video directly from your browser.  
It supports trimming, joining clips, exporting processed files, and managing videos through the backend.

The project is ideal for learning video pipelines, web-based editors, and backend media processing.

---

## Features

- Upload video files from the browser  
- Trim or merge clips  
- Server-side video processing  
- Download final exported video  
- Responsive frontend UI  
- Configuration through `.env`  
- Docker + Docker Compose setup

---

## Tech Stack

- **Backend:** Python (FFmpeg-powered processing)  
- **Frontend:** JavaScript / HTML / CSS  
- **Deployment:** Docker & Docker Compose  
- **Scripts:** `setup.sh`, `quick-start.sh`  
- **Tests:** included under `testing_folder/`

---

## Installation & Running

### Environment Variables (.env)
The project uses a .env file to configure backend and frontend behavior.
```
# Backend vars
BACKEND_PORT=5000
BACKEND_HOST=0.0.0.0

# Frontend vars
FRONTEND_PORT=3000

# Output videos Paths
UPLOAD_FOLDER=./backend/video-output/uploads
OUTPUT_FOLDER=./backend/video-output/output
```


### 1. Clone the repository
```bash
git clone https://github.com/Guyazulay2/VideoEditor.git
cd VideoEditor
```

### 2. Build & run using Docker Compose
```
docker-compose up --build
```

### 3. Open the app
```
http://localhost:3000
```

