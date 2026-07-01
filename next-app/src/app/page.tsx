import Link from 'next/link';

const features = [
  {
    title: 'AI Background Matting',
    desc: 'State-of-the-art Robust Video Matting (RVM) with temporal consistency. No flicker, no artifacts.',
    href: '/dashboard',
    accent: 'text-emerald-400',
    tag: 'Dashboard',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    title: 'YouTube Shorts Splitter',
    desc: 'Download any YouTube video and automatically slice it into short, shareable clips at your preferred resolution.',
    href: '/youtube',
    accent: 'text-purple-400',
    tag: 'Shorts',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    title: 'Playlist Downloader',
    desc: 'Batch download entire YouTube playlists with configurable quality limits and video caps.',
    href: '/playlist',
    accent: 'text-teal-400',
    tag: 'Playlists',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    title: 'Text to Speech',
    desc: 'Generate natural-sounding speech from text in 20+ languages using Google TTS. Supports Hindi and Indian languages.',
    href: '/tts',
    accent: 'text-violet-400',
    tag: 'TTS',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
      </svg>
    ),
  },
  {
    title: 'AI Chat',
    desc: 'Converse with local LLMs running on your machine via Ollama. Private, offline chat with models like Qwen, Llama, and more.',
    href: '/chat',
    accent: 'text-violet-400',
    tag: 'Chat',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
      </svg>
    ),
  },
  {
    title: 'Queue Management',
    desc: 'Monitor all jobs, retry failed tasks, and track AI engine health from a single admin panel.',
    href: '/admin',
    accent: 'text-[var(--text-secondary)]',
    tag: 'Admin',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
];

const steps = [
  { num: '01', title: 'Upload or Link', desc: 'Upload a video, paste a YouTube link, or submit text for processing.' },
  { num: '02', title: 'AI Pipeline', desc: 'Your job enters the local queue. PyTorch models process on your GPU or CPU.' },
  { num: '03', title: 'Download Results', desc: 'Retrieve the finished output — green screen video, audio files, or extracted text.' },
];

const faqs = [
  {
    q: 'What AI model powers the video matting?',
    a: 'We use Robust Video Matting (RVM) based on MobileNetV3. It is specifically designed for real-time video matting with temporal consistency, so the mask does not flicker between frames.',
  },
  {
    q: 'Do I need a GPU to run this?',
    a: 'No. The pipeline runs on CPU just fine. If a CUDA-enabled NVIDIA GPU is available, PyTorch will automatically use it for 10-15x faster processing.',
  },
  {
    q: 'How are large video files handled?',
    a: 'Uploads are streamed directly to disk instead of being loaded into memory. This prevents Node.js heap errors for videos up to 2 GB.',
  },
  {
    q: 'Is my data sent anywhere?',
    a: 'Never. All computation runs on your local server. No external API calls are made for video processing. Your files never leave your hardware.',
  },
];

export default function LandingPage() {
  return (
    <div className="flex-1 flex flex-col">
      {/* ─── HERO ─── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/[0.03] via-transparent to-transparent pointer-events-none" />
        <div className="page-container text-center py-16 md:py-28 flex flex-col items-center gap-6 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-emerald-500/20 bg-emerald-500/5 text-emerald-400 text-xs sm:text-sm font-semibold tracking-wide animate-fade-in">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
            100% Self-Hosted &bull; Local AI Inference
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight text-[var(--text-white)] leading-[1.1] max-w-4xl">
            Transform Videos with{' '}
            <span className="bg-gradient-to-r from-emerald-400 via-green-500 to-teal-400 bg-clip-text text-transparent">
              Local AI
            </span>
          </h1>

          <p className="text-base sm:text-lg md:text-xl text-[var(--text-secondary)] max-w-2xl leading-relaxed">
            Remove backgrounds, split YouTube videos, generate speech, and chat with AI —
            all running privately on your own hardware. Zero API costs, zero data leaving your server.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 mt-4">
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center px-8 py-3.5 rounded-2xl bg-emerald-500 text-black hover:bg-emerald-400 font-bold text-sm transition-all duration-300 shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_40px_rgba(16,185,129,0.5)] active:scale-95"
            >
              Start Processing
            </Link>
            <Link
              href="#features"
              className="inline-flex items-center justify-center px-8 py-3.5 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-white)] hover:bg-[var(--bg-hover)] font-semibold text-sm transition-all duration-300 active:scale-95"
            >
              Explore Tools
            </Link>
          </div>

          <div className="grid grid-cols-3 gap-8 mt-12 pt-8 border-t border-[var(--border-default)] w-full max-w-2xl">
            {[
              { value: '100%', label: 'Local & Private' },
              { value: '6+', label: 'AI Pipelines' },
              { value: '2 GB', label: 'Max File Size' },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-xl sm:text-2xl font-black text-[var(--text-white)]">{stat.value}</div>
                <div className="text-[10px] sm:text-xs text-[var(--text-secondary)] font-semibold uppercase tracking-wider mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── TOOLS GRID ─── */}
      <section id="features" className="page-container scroll-mt-24">
        <div className="text-center mb-12">
          <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">AI Pipeline Suite</span>
          <h2 className="text-3xl sm:text-4xl font-black text-[var(--text-white)] mt-2 tracking-tight">Everything you need</h2>
          <p className="text-sm text-[var(--text-secondary)] mt-2 max-w-xl mx-auto">
            Six integrated tools powered by local PyTorch models. No cloud dependencies, no usage limits.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f) => {
            const CardContent = (
              <>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${f.accent.replace('text-', 'bg-').replace('-400', '-500/10 border border-')} ${f.accent.replace('text-', 'border-')}/20 ${f.accent}`}>
                  {f.icon}
                </div>
                <div>
                  <div className={`text-[9px] font-extrabold uppercase tracking-widest ${f.accent} mb-1`}>
                    {f.tag}
                  </div>
                  <h3 className="text-base font-bold text-[var(--text-white)] group-hover:text-emerald-400 transition-colors">{f.title}</h3>
                  <p className="text-xs text-[var(--text-secondary)] mt-1.5 leading-relaxed">{f.desc}</p>
                </div>
                <div className="mt-auto pt-2">
                  <span className={`text-[10px] font-bold ${f.accent} flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity`}>
                    Open <span className="text-xs">&rarr;</span>
                  </span>
                </div>
              </>
            );
            return f.href.startsWith('http') ? (
              <a key={f.href} href={f.href} target="_blank" rel="noopener noreferrer" className="glass-card p-6 flex flex-col gap-4 group hover:-translate-y-0.5 transition-all duration-300">
                {CardContent}
              </a>
            ) : (
              <Link key={f.href} href={f.href} className="glass-card p-6 flex flex-col gap-4 group hover:-translate-y-0.5 transition-all duration-300">
                {CardContent}
              </Link>
            );
          })}
        </div>
      </section>

      {/* ─── HOW IT WORKS ─── */}
      <section className="page-container border-t border-[var(--border-default)]">
        <div className="text-center mb-12">
          <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Workflow</span>
          <h2 className="text-3xl sm:text-4xl font-black text-[var(--text-white)] mt-2 tracking-tight">How it works</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          {steps.map((step, i) => (
            <div key={step.num} className="text-center flex flex-col items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <span className="text-xl font-black text-emerald-400">{step.num}</span>
              </div>
              <div>
                <h3 className="text-lg font-bold text-[var(--text-white)]">{step.title}</h3>
                <p className="text-xs text-[var(--text-secondary)] mt-1.5 leading-relaxed">{step.desc}</p>
              </div>
              {i < steps.length - 1 && (
                <div className="hidden md:block absolute right-0 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ─── HOW IT WORKS DETAIL ─── */}
      <section className="page-container border-t border-[var(--border-default)]">
        <div className="glass-card p-6 sm:p-8 md:p-10 flex flex-col md:flex-row gap-8 items-center relative overflow-hidden">
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-emerald-500/10 rounded-full blur-3xl" />

          <div className="w-full md:w-1/2 flex flex-col gap-4">
            <span className="text-emerald-400 font-bold text-[10px] uppercase tracking-widest">Technology</span>
            <h2 className="text-2xl sm:text-3xl font-bold text-[var(--text-white)] tracking-tight">AI-Powered Temporal Consistency</h2>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              Using Robust Video Matting (RVM), ChromaAI separates foreground subjects with pixel-level precision.
              Unlike frame-by-frame segmentation, RVM uses a recurrent neural network to remember subjects across frames,
              eliminating flickering and creating movie-quality masks.
            </p>
            <div className="flex flex-col gap-2.5 mt-2">
              {[
                "Extracts frames & audio automatically",
                "Applies deep neural network segmentation",
                "Composites foreground to pure green screen (#00FF00)",
                "Transcodes back to web-optimized H264 format",
                "Merges original audio tracks seamlessly",
              ].map((step, idx) => (
                <div key={idx} className="flex items-center gap-3 text-sm text-[var(--text-primary)]">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-[10px] text-emerald-400 font-bold">
                    {idx + 1}
                  </span>
                  {step}
                </div>
              ))}
            </div>
          </div>

          <div className="w-full md:w-1/2 flex flex-col gap-4 items-center">
            <div className="grid grid-cols-2 gap-4 w-full">
              <div className="flex flex-col gap-2">
                <div className="text-center text-xs font-semibold text-[var(--text-secondary)]">Original Stream</div>
                <div className="aspect-[9/12] w-full rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] relative overflow-hidden flex items-center justify-center">
                  <div className="absolute inset-0 bg-[radial-gradient(#1e1b4b_1px,transparent_1px)] [background-size:16px_16px] opacity-30" />
                  <div className="w-24 h-40 bg-zinc-700/60 rounded-full relative flex items-center justify-center border border-zinc-600/40">
                    <span className="text-[10px] text-[var(--text-secondary)] font-bold uppercase tracking-wider">Subject</span>
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-3">
                    <span className="text-[10px] font-semibold text-[var(--text-secondary)]">Normal background</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <div className="text-center text-xs font-semibold text-[var(--text-secondary)]">Chroma Key Green</div>
                <div className="aspect-[9/12] w-full rounded-2xl bg-[#00ff00] relative overflow-hidden flex items-center justify-center border border-[var(--border-default)] shadow-inner">
                  <div className="w-24 h-40 bg-[var(--bg-elevated)] rounded-full relative flex items-center justify-center border border-emerald-500/40 neon-green-shadow animate-pulse">
                    <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">Masked</span>
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent flex items-end p-3">
                    <span className="text-[10px] font-semibold text-emerald-950 font-bold uppercase tracking-wide">#00FF00 Green</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="text-xs text-[var(--text-secondary)] italic text-center">
              Works on videos up to 2GB including MP4, MOV, AVI, MKV, and WebM
            </div>
          </div>
        </div>
      </section>

      {/* ─── FEATURES GRID ─── */}
      <section className="page-container border-t border-[var(--border-default)]">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="glass-card p-6 flex flex-col gap-4">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-[var(--text-white)]">100% Private & Local</h3>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              All AI computation runs on your local server. No external API calls. Your videos, data, and finished products never leave your hardware.
            </p>
          </div>
          <div className="glass-card p-6 flex flex-col gap-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-[var(--text-white)]">Temporal Consistency</h3>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              Robust Video Matting (RVM) keeps background replacement smooth and flicker-free without losing key details like hair strands.
            </p>
          </div>
          <div className="glass-card p-6 flex flex-col gap-4">
            <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-[var(--text-white)]">Preserves Quality & Audio</h3>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              Output retains original FPS, resolution, and audio track encoding. Standard H264 MP4 format.
            </p>
          </div>
        </div>
      </section>

      {/* ─── PRICING ─── */}
      <section className="page-container border-t border-[var(--border-default)]">
        <div className="text-center flex flex-col items-center gap-8">
          <div>
            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Deployment</span>
            <h2 className="text-3xl font-bold text-[var(--text-white)] mt-2 tracking-tight">Flexible Deployments</h2>
            <p className="text-sm text-[var(--text-secondary)] mt-1">Deploy locally or containerized in minutes.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-3xl w-full">
            <div className="glass-card p-8 flex flex-col gap-6 text-left border-emerald-500/20 relative">
              <div className="absolute top-4 right-4 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold uppercase">
                Active
              </div>
              <div className="flex flex-col gap-1">
                <h3 className="text-lg font-bold text-[var(--text-white)]">Self-Hosted Community</h3>
                <div className="text-3xl font-black text-[var(--text-white)] mt-2">$0 <span className="text-xs font-normal text-[var(--text-secondary)]">/ forever</span></div>
              </div>
              <p className="text-xs text-[var(--text-secondary)]">Perfect for indie devs, content creators, and local servers running PyTorch.</p>
              <div className="border-t border-[var(--border-default)] my-1" />
              <ul className="flex flex-col gap-2.5 text-xs text-[var(--text-primary)]">
                <li>&check; Full source code access</li>
                <li>&check; Local CPU or GPU processing</li>
                <li>&check; No limits on video length or size (up to disk space)</li>
                <li>&check; Support for all key formats (MP4, MOV, AVI)</li>
              </ul>
              <Link
                href="/dashboard"
                className="mt-4 w-full py-2.5 rounded-xl border border-[var(--border-default)] hover:border-emerald-500/40 text-center text-xs font-bold transition-all text-[var(--text-white)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)]"
              >
                Open Dashboard
              </Link>
            </div>

            <div className="glass-card p-8 flex flex-col gap-6 text-left opacity-60">
              <div className="flex flex-col gap-1">
                <h3 className="text-lg font-bold text-[var(--text-white)]">Cloud Enterprise</h3>
                <div className="text-3xl font-black text-[var(--text-white)] mt-2">Custom <span className="text-xs font-normal text-[var(--text-secondary)]">/ quote</span></div>
              </div>
              <p className="text-xs text-[var(--text-secondary)]">Scale the processing pipeline on AWS ECS/EKS with multi-node GPU worker clusters.</p>
              <div className="border-t border-[var(--border-default)] my-1" />
              <ul className="flex flex-col gap-2.5 text-xs text-[var(--text-primary)]">
                <li>&check; S3-compatible cloud storage adapter</li>
                <li>&check; Distributed BullMQ concurrency</li>
                <li>&check; Dedicated GPU autoscale configs</li>
                <li>&check; Premium API bindings & webhooks</li>
              </ul>
              <button
                disabled
                className="mt-4 w-full py-2.5 rounded-xl border border-[var(--border-default)] text-center text-xs font-bold text-[var(--text-secondary)] cursor-not-allowed bg-[var(--bg-base)]"
              >
                Contact Sales (Enterprise-only)
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section className="page-container border-t border-[var(--border-default)]">
        <div className="flex flex-col gap-8 max-w-4xl mx-auto">
          <div className="text-center">
            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">FAQ</span>
            <h2 className="text-2xl sm:text-3xl font-bold text-[var(--text-white)] mt-2">Frequently Asked Questions</h2>
          </div>
          <div className="flex flex-col gap-4">
            {faqs.map((item, idx) => (
              <div key={idx} className="glass-card p-5 flex flex-col gap-2">
                <h4 className="font-bold text-[var(--text-white)] text-sm sm:text-base">{item.q}</h4>
                <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
