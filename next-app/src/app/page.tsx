import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">
      {/* Hero Section */}
      <section className="text-center py-12 md:py-20 flex flex-col items-center gap-6 max-w-4xl">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-emerald-500/20 bg-emerald-500/5 text-emerald-400 text-xs sm:text-sm font-semibold tracking-wide">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
          100% Self-Hosted & Local AI Inference
        </div>
        
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-white leading-tight">
          Transform Videos into <br className="hidden sm:inline" />
          <span className="bg-gradient-to-r from-emerald-400 via-green-500 to-teal-400 bg-clip-text text-transparent">
            Perfect Green Screens
          </span>
        </h1>
        
        <p className="text-base sm:text-lg md:text-xl text-zinc-400 max-w-2xl leading-relaxed">
          Remove backgrounds from any video automatically. Zero dependencies on expensive third-party APIs. Preserves original resolution, frame rate, and audio.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 mt-4 w-full sm:w-auto">
          <Link
            href="/dashboard"
            className="flex items-center justify-center px-8 py-3 rounded-2xl bg-emerald-500 text-black hover:bg-emerald-400 font-bold transition-all duration-300 shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_30px_rgba(16,185,129,0.5)] transform hover:-translate-y-0.5 active:scale-95"
          >
            Start Processing
          </Link>
          <Link
            href="/admin"
            className="flex items-center justify-center px-8 py-3 rounded-2xl bg-zinc-900 border border-white/10 text-white hover:bg-zinc-800 font-semibold transition-all duration-300 transform hover:-translate-y-0.5 active:scale-95"
          >
            Monitor Queue
          </Link>
        </div>
      </section>

      {/* Visual Demo Section */}
      <section className="w-full max-w-5xl my-8">
        <div className="glass-card p-4 sm:p-6 md:p-8 flex flex-col md:flex-row gap-6 items-center shadow-2xl relative overflow-hidden">
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-emerald-500/10 rounded-full blur-3xl"></div>
          
          <div className="w-full md:w-1/2 flex flex-col gap-4">
            <div className="text-emerald-400 font-bold text-xs uppercase tracking-widest">How it works</div>
            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">AI-Powered Temporal Consistency</h2>
            <p className="text-sm sm:text-base text-zinc-400 leading-relaxed">
              Using state-of-the-art Robust Video Matting (RVM), ChromaAI separates the foreground subject with pixel-level precision. Unlike frame-by-frame image segmentation, RVM uses a recurrent neural network to remember subjects across frames, eliminating flickering and creating movie-quality masks.
            </p>
            <div className="flex flex-col gap-2.5 mt-2">
              {[
                "Extracts frames & audio automatically",
                "Applies deep neural network segmentation",
                "Composites foreground to pure green screen (#00FF00)",
                "Transcodes back to web-optimized H264 format",
                "Merges original audio tracks seamlessly"
              ].map((step, idx) => (
                <div key={idx} className="flex items-center gap-3 text-sm text-zinc-300">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-[10px] text-emerald-400 font-bold">
                    {idx + 1}
                  </span>
                  {step}
                </div>
              ))}
            </div>
          </div>
          
          <div className="w-full md:w-1/2 flex flex-col gap-4 items-center">
            {/* Visualizer showing source vs green screen */}
            <div className="grid grid-cols-2 gap-4 w-full">
              <div className="flex flex-col gap-2">
                <div className="text-center text-xs font-semibold text-zinc-400">Original Stream</div>
                <div className="aspect-[9/12] w-full rounded-2xl bg-zinc-900 border border-white/5 relative overflow-hidden flex items-center justify-center">
                  <div className="absolute inset-0 bg-[radial-gradient(#1e1b4b_1px,transparent_1px)] [background-size:16px_16px] opacity-30"></div>
                  {/* Mock subject character silhouette */}
                  <div className="w-24 h-40 bg-zinc-700/60 rounded-full relative flex items-center justify-center border border-zinc-600/40">
                    <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Subject</span>
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-3">
                    <span className="text-[10px] font-semibold text-zinc-400">Normal background</span>
                  </div>
                </div>
              </div>
              
              <div className="flex flex-col gap-2">
                <div className="text-center text-xs font-semibold text-zinc-400">Chroma Key Green</div>
                <div className="aspect-[9/12] w-full rounded-2xl bg-[#00ff00] relative overflow-hidden flex items-center justify-center border border-white/5 shadow-inner">
                  {/* Masked subject */}
                  <div className="w-24 h-40 bg-zinc-900 rounded-full relative flex items-center justify-center border border-emerald-500/40 neon-green-shadow animate-pulse">
                    <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">Masked</span>
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent flex items-end p-3">
                    <span className="text-[10px] font-semibold text-emerald-950 font-bold uppercase tracking-wide">#00FF00 Green</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="text-xs text-zinc-500 italic text-center">
              Works on videos up to 2GB including MP4, MOV, AVI, MKV, and WebM
            </div>
          </div>
        </div>
      </section>

      {/* Feature Cards Grid */}
      <section className="w-full py-12 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass-card p-6 flex flex-col gap-4">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            🔒
          </div>
          <h3 className="text-lg font-bold text-white">100% Private & Local</h3>
          <p className="text-sm text-zinc-400 leading-relaxed">
            All AI computation runs on your local server. No external API calls. Your videos, data, and finished products never leave your hardware.
          </p>
        </div>
        <div className="glass-card p-6 flex flex-col gap-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            ⚡
          </div>
          <h3 className="text-lg font-bold text-white">Temporal Consistency</h3>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Utilizes Robust Video Matting (RVM) model structure. Keeps background replacement smooth and flickers-free without losing key details like hair strands.
          </p>
        </div>
        <div className="glass-card p-6 flex flex-col gap-4">
          <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400">
            🎵
          </div>
          <h3 className="text-lg font-bold text-white">Preserves Quality & Audio</h3>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Never compress or alter your media stream attributes. The output retains original FPS, original resolution, audio track encoding, and outputs to standard H264 MP4.
          </p>
        </div>
      </section>

      {/* Mock Pricing Section */}
      <section className="w-full py-12 text-center flex flex-col items-center gap-8 border-t border-white/5">
        <div className="flex flex-col gap-2">
          <h2 className="text-3xl font-bold text-white tracking-tight">Flexible Deployments</h2>
          <p className="text-sm text-zinc-400">Deploy locally or containerized in minutes.</p>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-3xl w-full">
          <div className="glass-card p-8 flex flex-col gap-6 text-left border-emerald-500/20 relative">
            <div className="absolute top-4 right-4 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold uppercase">Active</div>
            <div className="flex flex-col gap-1">
              <h3 className="text-lg font-bold text-white">Self-Hosted Community</h3>
              <div className="text-3xl font-black text-white mt-2">$0 <span className="text-xs font-normal text-zinc-500">/ forever</span></div>
            </div>
            <p className="text-xs text-zinc-400">Perfect for indie devs, content creators, and local servers running on PyTorch.</p>
            <div className="border-t border-white/5 my-1"></div>
            <ul className="flex flex-col gap-2.5 text-xs text-zinc-300">
              <li>✓ Full source code access</li>
              <li>✓ Local CPU or GPU processing</li>
              <li>✓ No limits on video length or size (up to disk space)</li>
              <li>✓ Support for all key formats (MP4, MOV, AVI)</li>
            </ul>
            <Link
              href="/dashboard"
              className="mt-4 w-full py-2.5 rounded-xl border border-white/10 hover:border-emerald-500/40 text-center text-xs font-bold transition-all text-white bg-zinc-900/60"
            >
              Open Dashboard
            </Link>
          </div>
          
          <div className="glass-card p-8 flex flex-col gap-6 text-left opacity-60">
            <div className="flex flex-col gap-1">
              <h3 className="text-lg font-bold text-white">Cloud Enterprise</h3>
              <div className="text-3xl font-black text-white mt-2">Custom <span className="text-xs font-normal text-zinc-500">/ quote</span></div>
            </div>
            <p className="text-xs text-zinc-400">Scale the processing pipeline on AWS ECS/EKS with multi-node GPU worker clusters.</p>
            <div className="border-t border-white/5 my-1"></div>
            <ul className="flex flex-col gap-2.5 text-xs text-zinc-300">
              <li>✓ S3-compatible cloud storage adapter</li>
              <li>✓ Distributed BullMQ concurrency</li>
              <li>✓ Dedicated GPU autoscale configs</li>
              <li>✓ Premium API bindings & webhooks</li>
            </ul>
            <button
              disabled
              className="mt-4 w-full py-2.5 rounded-xl border border-white/5 text-center text-xs font-bold text-zinc-500 cursor-not-allowed bg-zinc-950"
            >
              Contact Sales (Enterprise-only)
            </button>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="w-full py-12 border-t border-white/5 flex flex-col gap-8 max-w-4xl">
        <h2 className="text-2xl sm:text-3xl font-bold text-white text-center">Frequently Asked Questions</h2>
        <div className="flex flex-col gap-4">
          {[
            {
              q: "What AI Model is being run under the hood?",
              a: "We utilize Robust Video Matting (RVM) based on MobileNetV3. RVM is specifically optimized for real-time video matting, ensuring temporal consistency, meaning the mask doesn't flicker or jitter between consecutive video frames."
            },
            {
              q: "Does this require a dedicated GPU to operate?",
              a: "No! The pipeline runs perfectly fine on a standard CPU. However, if a CUDA-enabled NVIDIA GPU is present, PyTorch will automatically leverage GPU acceleration, boosting frame-rate processing by up to 10-15x."
            },
            {
              q: "How does the application manage large file uploads?",
              a: "We stream file uploads directly to a shared volume in the container instead of parsing them in NextJS heap memory. This prevents node out-of-memory errors for heavy videos (up to 2GB)."
            },
            {
              q: "Can I replace the green screen with a custom background image or video?",
              a: "Currently, our pipeline supports green, blue, white, and black solid background chroma-key replacements. The underlying FastAPI matting architecture is built to be easily extensible for custom images or videos, which will be added in future updates."
            }
          ].map((item, idx) => (
            <div key={idx} className="glass-card p-5 flex flex-col gap-2">
              <h4 className="font-bold text-white text-sm sm:text-base">{item.q}</h4>
              <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">{item.a}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
