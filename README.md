# ChromaAI - Private & Self-Hosted AI Video Background Changer

ChromaAI is a production-ready web application that automatically converts any uploaded video into a high-quality green-screen video. It uses a self-hosted AI model (Robust Video Matting) running locally on PyTorch and does not depend on paid third-party AI APIs.

---

## System Architecture

```
                    ┌─────────────────────────────────────────┐
                    │            Next.js Frontend             │
                    └────────────────────┬────────────────────┘
                                         │  1. Uploads Video & 
                                         │     Triggers Processing
                                         ▼
                    ┌─────────────────────────────────────────┐
                    │            Next.js Backend              │
                    │      (Route Handlers & PostgreSQL)      │
                    └────────────────────┬────────────────────┘
                                         │  2. Enqueues job in
                                         │     BullMQ Redis Queue
                                         ▼
                    ┌─────────────────────────────────────────┐
                    │              BullMQ Worker              │
                    │       (Blocks on Redis Pub/Sub)         │
                    └────────────────────┬────────────────────┘
                                         │  3. POST /process-video
                                         ▼
                    ┌─────────────────────────────────────────┐
                    │            FastAPI Service              │
                    │  (PyTorch Robust Video Matting Model)   │
                    └────────────────────┬────────────────────┘
                                         │  4. Runs segmentation,
                                         │     transcodes via FFmpeg
                                         │     and updates progress
                                         ▼
                    ┌─────────────────────────────────────────┐
                    │             Completed Video             │
                    │     (Saved to Shared Volume Disk)       │
                    └─────────────────────────────────────────┘
```

---

## Technical Stack

*   **Frontend**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS, Lucide icons, glassmorphic UI layout.
*   **Backend**: Next.js Node API, FastAPI (Python 3.10), PyTorch, OpenCV, FFmpeg CLI.
*   **Database**: PostgreSQL, Prisma ORM.
*   **Job Queue**: Redis, BullMQ.
*   **Storage**: Shared Docker volume (`shared_storage`) for direct zero-copy file sharing between Node and Python.
*   **Proxy & Gateway**: Nginx proxy.

---

## Features

1.  **Drag & Drop Upload**: Stream uploads up to 2GB directly to disk (using `busboy` node stream helper) avoiding Node out-of-memory errors.
2.  **Temporal AI Segmentation**: Uses **Robust Video Matting (RVM)** MobileNetV3 to generate high-fidelity, flicker-free background removal.
3.  **H.264 Web Transcoding**: Uses FFmpeg to transcode the OpenCV output matrix to standard H.264 formats compatible across all modern web browsers.
4.  **Original Audio Merging**: Preserves, extracts, and re-stiches original AAC/MP3 audio channels from the source video into the final video file.
5.  **Queue Rate-Limiting**: Enforces strict execution limits (default `concurrency: 1`) in BullMQ to protect your server's CPU/GPU from crashes under heavy usage.

---

## Quickstart Guide

### Prerequisites
Make sure you have [Docker](https://docs.docker.com/get-dir/) and [Docker Compose](https://docs.docker.com/compose/install/) installed.

### Start the Application
Run the following command in the project root:

```bash
docker-compose up --build
```

This will automatically build and start the entire stack:
*   **Nginx Proxy** on `http://localhost`
*   **Next.js Web Interface** on `http://localhost` (proxied)
*   **PostgreSQL** on port `5432`
*   **Redis Cache** on port `6379`
*   **FastAPI AI engine** on port `8000` (proxied to `/python-ai/`)

During the build process, PyTorch will pre-cache the RVM model weights inside the Docker image cache, enabling 100% offline startup.

---

## Directory Structure

```
├── docker-compose.yml       # Orchestration file
├── nginx/                   # Nginx reverse proxy configuration
│   └── nginx.conf
├── next-app/                # Next.js web application
│   ├── Dockerfile
│   ├── prisma/              # Prisma DB schemas
│   │   └── schema.prisma
│   └── src/
│       ├── app/             # Landing page, dashboard, and route handlers
│       ├── lib/             # Redis, DB, and queue connections
│       ├── workers/         # BullMQ queue workers
│       └── instrumentation.ts
└── python-ai/               # Python AI server
    ├── Dockerfile
    ├── requirements.txt     # Python requirements
    ├── download_model.py    # Torch Hub precaching script
    └── app/
        ├── main.py          # FastAPI server
        ├── matting.py       # Robust Video Matting code
        └── ffmpeg_utils.py  # Audio extraction and merge utilities
```

---

## Swapping AI Models
If you wish to upgrade from Robust Video Matting to a newer model (e.g., BiRefNet or MODNet):
1.  Add new model code or libraries in `python-ai/app/matting.py`.
2.  Update the dependencies in `python-ai/requirements.txt`.
3.  Rewrite `process_video_matting` function signature to use the new model inference.
No change to Next.js API or frontend is required, as the communications are fully decoupled via the `/process-video` REST request.
