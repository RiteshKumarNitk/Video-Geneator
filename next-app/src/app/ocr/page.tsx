import Link from 'next/link';
import { ExternalLink, ArrowLeft } from 'lucide-react';

export default function OcrPage() {
  return (
    <div className="page-container flex flex-col items-center justify-center min-h-[60vh] text-center gap-6">
      <div className="glass-card p-10 flex flex-col items-center gap-6 max-w-lg w-full">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
          <ExternalLink className="w-8 h-8" />
        </div>

        <div className="flex flex-col gap-2">
          <h2 className="text-2xl font-black text-white tracking-tight">OCR Extraction</h2>
          <p className="text-sm text-zinc-400 leading-relaxed max-w-sm">
            For the best OCR experience with support for complex documents, tables, and multi-column layouts, use the official olmOCR web service.
          </p>
        </div>

        <a
          href="https://olmocr.allenai.org/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-amber-500 text-black hover:bg-amber-400 font-bold text-sm transition-all duration-300 shadow-[0_0_20px_rgba(245,158,11,0.3)] hover:shadow-[0_0_30px_rgba(245,158,11,0.5)] active:scale-95"
        >
          Open olmOCR Website
          <ExternalLink className="w-4 h-4" />
        </a>

        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs text-zinc-500 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Home
        </Link>
      </div>
    </div>
  );
}
