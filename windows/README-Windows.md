# ChromaAI Windows package

This package includes a self-contained `ChromaAI.exe` launcher and the application source required by Docker Compose.

## Requirements

- Windows 10/11 64-bit
- Docker Desktop with Linux containers enabled
- At least 8 GB RAM recommended
- Several GB of free disk space for PyTorch, Whisper, FFmpeg, and model images

## Run

Double-click `ChromaAI.exe`. The launcher starts Docker Desktop, waits for Docker Engine, builds the containers, and starts the app.

Open `http://localhost` when the containers are ready.

To stop the stack, run:

```powershell
ChromaAI.exe --stop
```

The first startup can take several minutes because Docker downloads the application images and AI model dependencies.
