'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Send, Plus, Trash2, Bot, User, MessageSquare, ChevronDown,
  PanelLeftOpen, PanelLeftClose, Copy, Check, FilePlus, FileCode,
  X, AlertCircle, FolderOpen, Sparkles, Pencil, Download, Undo2,
  ArrowDown, Mic, MicOff, Search, Settings, SlidersHorizontal,
  FileDown, Quote, HelpCircle, Image, GitBranch, BarChart3,
  GripVertical, PanelRightOpen, PanelRightClose, FolderTree,
  Hash, Type, ListOrdered, ExternalLink, Code2,
} from 'lucide-react';

/* ─── Types ─── */
interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  model: string;
  createdAt: number;
  updatedAt: number;
  temperature: number;
  topP: number;
  maxTokens: number;
  customPrompt: string;
}

interface CodeBlock { language: string; code: string; filePath: string | null; }

interface SlashCommand { name: string; desc: string; action: () => void; }

interface ReactComponentInfo {
  name: string;
  type: 'component' | 'hook' | 'utility' | 'type' | 'style';
  exports: string[];
  imports: string[];
  hooks: string[];
  props: string[];
  subComponents: string[];
}

/* ─── Utils ─── */
function genId() { return crypto.randomUUID(); }

function trunc(s: string, n = 40) {
  const c = s.replace(/[^\w\s]/g, '').trim();
  return c.length > n ? c.slice(0, n) + '...' : c || 'New Chat';
}

function fmtTime(ts: number) {
  const d = new Date(ts), n = new Date();
  const diff = n.getTime() - d.getTime();
  if (diff < 6e4) return 'Just now';
  if (diff < 36e5) return `${Math.floor(diff / 6e4)}m ago`;
  if (diff < 864e5) return `${Math.floor(diff / 36e5)}h ago`;
  return d.toLocaleDateString();
}

function fmtFullTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function detectFilePath(code: string, lang: string): string | null {
  const fl = code.split('\n')[0]?.trim();
  if (!fl) return null;
  const map: Record<string, RegExp> = {
    js: /^\/\/\s*(.+)$/, ts: /^\/\/\s*(.+)$/, tsx: /^\/\/\s*(.+)$/, jsx: /^\/\/\s*(.+)$/,
    py: /^#\s*(.+)$/, sh: /^#\s*(.+)$/, css: /^\/\*\s*(.+)\s*\*\/$/, html: /^<!--\s*(.+)\s*-->/,
    yml: /^#\s*(.+)$/, json: /^\/\/\s*(.+)$/,
  };
  const m = (map[lang] || /^(\/\/|#|<!--)\s*(.+?)\s*(-->)?$/).exec(fl);
  if (m) { const p = (m[2] || m[1] || '').trim(); if (p.includes('/') || p.includes('\\')) return p; }
  return null;
}

function parseCodeBlocks(content: string) {
  const segs: ({ type: 'text'; content: string } | { type: 'code'; block: CodeBlock })[] = [];
  const re = /```(\w*)\n?([\s\S]*?)```/g;
  let li = 0, m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    if (m.index > li) segs.push({ type: 'text', content: content.slice(li, m.index) });
    const lang = m[1] || 'text', code = m[2].replace(/\n$/, '');
    const fp = detectFilePath(code, lang);
    const dc = fp ? code.split('\n').slice(1).join('\n').trimStart() : code;
    segs.push({ type: 'code', block: { language: lang, code: dc || code, filePath: fp } });
    li = m.index + m[0].length;
  }
  if (li < content.length) segs.push({ type: 'text', content: content.slice(li) });
  return segs;
}

/* ─── Markdown Renderer ─── */
function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];
  let inList: 'ul' | 'ol' | null = null;
  let listItems: React.ReactNode[] = [];

  const flushList = (key: string) => {
    if (inList && listItems.length > 0) {
      const Tag = inList === 'ul' ? 'ul' : 'ol';
      nodes.push(<Tag key={key} className="list-inside my-1 space-y-0.5 text-sm text-[var(--text-primary)]">{listItems}</Tag>);
      listItems = [];
      inList = null;
    }
  };

  const inlineMd = (s: string, ik: string): React.ReactNode => {
    const parts: React.ReactNode[] = [];
    let lastIdx = 0;
    const ir = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`|~~(.+?)~~|!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]+)\]\(([^)]+)\))/g;
    let m: RegExpExecArray | null;
    while ((m = ir.exec(s)) !== null) {
      if (m.index > lastIdx) parts.push(s.slice(lastIdx, m.index));
      if (m[1]?.startsWith('***')) parts.push(<strong key={ik + m.index}><em>{m[2]}</em></strong>);
      else if (m[1]?.startsWith('**')) parts.push(<strong key={ik + m.index}>{m[3]}</strong>);
      else if (m[1]?.startsWith('*')) parts.push(<em key={ik + m.index}>{m[4]}</em>);
      else if (m[1]?.startsWith('`')) parts.push(<code key={ik + m.index} className="px-1 py-0.5 rounded bg-[var(--bg-code)] text-[var(--text-primary)] text-[12px] font-mono">{m[5]}</code>);
      else if (m[1]?.startsWith('~~')) parts.push(<del key={ik + m.index} className="text-[var(--text-tertiary)]">{m[6]}</del>);
      else if (m[1]?.startsWith('![')) parts.push(<img key={ik + m.index} src={m[8]} alt={m[7] || 'image'} className="max-w-full h-auto rounded-xl my-2 border border-[var(--border-default)]" loading="lazy" />);
      else if (m[1]?.startsWith('[')) parts.push(<a key={ik + m.index} href={m[10]} target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2">{m[9]}</a>);
      lastIdx = m.index + m[0].length;
    }
    if (lastIdx < s.length) parts.push(s.slice(lastIdx));
    return parts.length === 1 ? parts[0] : <>{parts}</>;
  };

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    const key = `md-${i}`;

    if (!trimmed) { flushList(key); nodes.push(<br key={key} />); return; }

    // Headings
    const hd = trimmed.match(/^(#{1,6})\s+(.+)/);
    if (hd) { flushList(key); const H = `h${hd[1].length}` as keyof React.JSX.IntrinsicElements; nodes.push(<H key={key} className="font-bold text-[var(--text-white)]" style={{ fontSize: `${1.4 - hd[1].length * 0.1}rem`, lineHeight: 1.3, margin: '0.5em 0 0.25em' }}>{inlineMd(hd[2], key)}</H>); return; }

    // Blockquote
    const bq = trimmed.match(/^>\s*(.+)/);
    if (bq) { flushList(key); nodes.push(<blockquote key={key} className="border-l-2 border-emerald-500/40 pl-3 italic text-[var(--text-secondary)] my-1">{inlineMd(bq[1], key)}</blockquote>); return; }

    // Unordered list
    const ul = trimmed.match(/^[-*+]\s+(.+)/);
    if (ul) { inList = 'ul'; listItems.push(<li key={key} className="text-[var(--text-primary)]">{inlineMd(ul[1], key)}</li>); return; }

    // Ordered list
    const ol = trimmed.match(/^\d+\.\s+(.+)/);
    if (ol) { inList = 'ol'; listItems.push(<li key={key} className="text-[var(--text-primary)]">{inlineMd(ol[1], key)}</li>); return; }

    flushList(key);
    // Regular paragraph with inline formatting
    nodes.push(<div key={key} className="text-sm leading-relaxed text-[var(--text-primary)]">{inlineMd(line, key)}</div>);
  });

  flushList('final-list');
  return nodes;
}

/* ─── React Code Analyzer ─── */
function analyzeReactCode(code: string, language: string): ReactComponentInfo | null {
  if (!['jsx', 'tsx', 'js', 'ts'].includes(language)) return null;
  const info: ReactComponentInfo = {
    name: '',
    type: 'component',
    exports: [],
    imports: [],
    hooks: [],
    props: [],
    subComponents: [],
  };

  const imps = code.match(/import\s+(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+['"][^'"]+['"]/g);
  if (imps) info.imports = imps.map(i => i.replace(/import\s+/, '').replace(/\s+from\s+['"][^'"]+['"]/, ''));

  const exp = code.match(/export\s+(default\s+)?(const|function|class)\s+(\w+)/g);
  if (exp) info.exports = exp.map(e => e.replace(/export\s+(default\s+)?(const|function|class)\s+/, ''));

  const comps = code.match(/(?:const|function)\s+(\w+)\s*(?::\s*\w+)?\s*=\s*(?:\([^)]*\)|\(\))\s*=>|function\s+(\w+)\s*\(/g);
  if (comps) {
    const all = comps.map(c => { const m = c.match(/(?:const|function)\s+(\w+)/); return m ? m[1] : ''; }).filter(Boolean);
    info.name = all[0] || '';
    if (all.length > 1) info.subComponents = all.slice(1);
  }

  const hooksMatch = code.match(/use(\w+)\(/g);
  if (hooksMatch) info.hooks = [...new Set(hooksMatch.map(h => h.replace('(', '')))];

  const propsMatch = code.match(/interface\s+(\w+Props)\s*{|type\s+(\w+Props)\s*=/g);
  if (propsMatch) info.props = propsMatch.map(p => { const m = p.match(/(\w+Props)/); return m ? m[1] : ''; }).filter(Boolean);

  if (code.includes('styled') || code.includes('css`') || code.includes('styles')) info.type = 'style';
  if (info.hooks.length > 0 && info.hooks.some(h => h.startsWith('use'))) info.type = 'component';
  if (!info.exports.length && !info.hooks.length) info.type = 'utility';

  return info.name ? info : null;
}

function analyzeReactComponentsInContent(content: string): ReactComponentInfo[] {
  const blockRe = /```(\w+)\n?([\s\S]*?)```/g;
  const components: ReactComponentInfo[] = [];
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(content)) !== null) {
    const lang = m[1];
    const code = m[2];
    const info = analyzeReactCode(code, lang);
    if (info) components.push(info);
  }
  return components;
}

function formatTokenCount(text: string): string {
  // Approximate token count: ~4 chars per token for English text
  const chars = text.length;
  const words = text.split(/\s+/).filter(Boolean).length;
  const tokens = Math.round(chars / 4);
  return `${tokens.toLocaleString()} tokens · ${words.toLocaleString()} words · ${chars.toLocaleString()} chars`;
}

function estimateTokens(text: string): number {
  return Math.round(text.length / 4);
}

function countMessageTokens(messages: Message[]): number {
  return messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
}

function exportChat(conv: Conversation, format: 'md' | 'json') {
  if (format === 'json') {
    const blob = new Blob([JSON.stringify(conv, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${conv.title}.json`; a.click();
    URL.revokeObjectURL(url);
  } else {
    let md = `# ${conv.title}\n\n*Model: ${conv.model}*  \n*Exported: ${new Date().toLocaleString()}*\n\n---\n\n`;
    for (const msg of conv.messages) {
      md += `### ${msg.role === 'user' ? '👤 User' : '🤖 Assistant'}\n${msg.content}\n\n---\n\n`;
    }
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${conv.title}.md`; a.click();
    URL.revokeObjectURL(url);
  }
}

/* ─── Code Block ─── */
function CodeBlockRenderer({ block, onLivePreview, dragHandle }: {
  block: CodeBlock; onLivePreview?: (html: string) => void; dragHandle?: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const [showFileDialog, setShowFileDialog] = useState(false);
  const [filePath, setFilePath] = useState(block.filePath || '');
  const [ws, setWs] = useState<'idle' | 'writing' | 'done' | 'error'>('idle');
  const [we, setWe] = useState('');
  const [showEdit, setShowEdit] = useState(false);
  const [ec, setEc] = useState(block.code);
  const reactInfo = analyzeReactCode(block.code, block.language);

  const copy = async (c = block.code) => { await navigator.clipboard.writeText(c); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  const extMap: Record<string, string> = { js: 'js', ts: 'ts', tsx: 'tsx', jsx: 'jsx', py: 'py', html: 'html', css: 'css', json: 'json', md: 'md', yml: 'yml', sh: 'sh' };
  const download = () => {
    const ext = extMap[block.language] || 'txt';
    const name = block.filePath?.split('/').pop() || `code.${ext}`;
    const blob = new Blob([block.code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  };
  const createFile = async (ow = false) => {
    if (!filePath.trim()) return;
    setWs('writing'); setWe('');
    try {
      const r = await fetch('/api/file/write', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: filePath.trim(), content: block.code, overwrite: ow }),
      });
      const d = await r.json();
      if (r.ok) { setWs('done'); setTimeout(() => { setShowFileDialog(false); setWs('idle'); }, 1500); }
      else if (r.status === 409) { setWe('File exists. Click "Overwrite" to replace.'); setWs('idle'); }
      else { setWe(d.error || 'Failed'); setWs('idle'); }
    } catch { setWe('Network error'); setWs('idle'); }
  };

  return (<>
    <div className="my-3 rounded-xl overflow-hidden border border-[var(--border-default)] bg-[var(--bg-code)] group">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--bg-card)] border-b border-white/5">
        <div className="flex items-center gap-2 min-w-0">
          {dragHandle}
          <FileCode size={12} className="text-[var(--text-secondary)] flex-shrink-0" />
          <span className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider flex-shrink-0">{block.language || 'code'}</span>
          {reactInfo && (
            <span className="text-[10px] text-emerald-400 font-medium flex-shrink-0 hidden sm:inline">{reactInfo.name}</span>
          )}
          {block.filePath && <span className="text-[10px] text-[var(--text-tertiary)] font-mono truncate hidden sm:inline">{block.filePath}</span>}
          <span className="text-[10px] text-[var(--text-tertiary)] flex-shrink-0 hidden sm:inline">&middot; {block.code.split('\n').length} lines</span>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button onClick={download} className="p-1 rounded-md text-[var(--text-secondary)] hover:text-emerald-400 hover:bg-emerald-500/10 transition-all" title="Download"><Download size={13} /></button>
          <button onClick={() => { setEc(block.code); setShowEdit(true); }} className="p-1 rounded-md text-[var(--text-secondary)] hover:text-amber-400 hover:bg-amber-500/10 transition-all" title="Edit"><Pencil size={13} /></button>
          {block.filePath && <button onClick={() => { setFilePath(block.filePath || ''); setShowFileDialog(true); }} className="p-1 rounded-md text-[var(--text-secondary)] hover:text-emerald-400 hover:bg-emerald-500/10 transition-all" title="Create file"><FilePlus size={13} /></button>}
          {(block.language === 'html' || block.language === 'htm') && (
            <>
              <button onClick={() => { onLivePreview?.(block.code); }} className="p-1 rounded-md text-[var(--text-secondary)] hover:text-sky-400 hover:bg-sky-500/10 transition-all" title="Live Preview (inline)">
                <PanelRightOpen size={13} />
              </button>
              <button onClick={() => { const blob = new Blob([block.code], { type: 'text/html' }); const url = URL.createObjectURL(blob); const w = window.open(url, '_blank'); if (!w) { alert('Popup blocked. Please allow popups for this site.'); URL.revokeObjectURL(url); } else { setTimeout(() => URL.revokeObjectURL(url), 10000); } }} className="p-1 rounded-md text-[var(--text-secondary)] hover:text-sky-400 hover:bg-sky-500/10 transition-all" title="Preview in new tab">
                <ExternalLink size={13} />
              </button>
            </>
          )}
          <button onClick={() => copy()} className="p-1 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-white)] hover:bg-white/5 transition-all" title="Copy">{copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}</button>
        </div>
      </div>
      {/* React component info bar */}
      {reactInfo && (
        <div className="flex items-center gap-3 px-3 py-1.5 bg-[var(--bg-card)] border-b border-white/5">
          <div className="flex items-center gap-1.5 text-[9px] text-[var(--text-tertiary)]"><Code2 size={10} className="text-violet-400" /><span className="font-mono text-violet-400">{reactInfo.name}</span></div>
          {reactInfo.hooks.length > 0 && <div className="flex items-center gap-1 text-[9px] text-[var(--text-tertiary)]"><Hash size={9} /><span>{reactInfo.hooks.join(', ')}</span></div>}
          {reactInfo.props.length > 0 && <div className="flex items-center gap-1 text-[9px] text-[var(--text-tertiary)]"><Type size={9} /><span>{reactInfo.props.join(', ')}</span></div>}
          {reactInfo.exports.length > 0 && <div className="flex items-center gap-1 text-[9px] text-[var(--text-tertiary)]"><ListOrdered size={9} /><span>{reactInfo.exports.join(', ')}</span></div>}
          {reactInfo.subComponents.length > 0 && <div className="flex items-center gap-1 text-[9px] text-[var(--text-tertiary)]"><FolderTree size={9} /><span>{reactInfo.subComponents.join(', ')}</span></div>}
          <span className={`ml-auto text-[9px] font-medium px-1.5 py-0.5 rounded-full ${reactInfo.type === 'component' ? 'bg-emerald-500/10 text-emerald-400' : reactInfo.type === 'hook' ? 'bg-violet-500/10 text-violet-400' : reactInfo.type === 'style' ? 'bg-pink-500/10 text-pink-400' : 'bg-amber-500/10 text-amber-400'}`}>{reactInfo.type}</span>
        </div>
      )}
      <div className="overflow-y-auto max-h-64">
        <pre className="px-4 py-3 text-[13px] leading-relaxed font-mono text-[var(--text-primary)]"><code>{block.code}</code></pre>
      </div>
      <div className="flex items-center justify-between px-3 py-1 bg-[var(--bg-card)] border-t border-white/5">
        <span className="text-[9px] text-[var(--text-tertiary)]">{block.code.split('\n').length} lines &middot; {block.code.length} chars</span>
        <button onClick={download} className="text-[9px] font-semibold text-[var(--text-secondary)] hover:text-emerald-400 transition-all flex items-center gap-1"><Download size={10} /> Download</button>
      </div>
    </div>

    {showEdit && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowEdit(false)}>
        <div className="bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-2xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-default)] flex-shrink-0">
            <div className="flex items-center gap-2"><Pencil size={16} className="text-amber-400" /><h3 className="font-bold text-[var(--text-white)] text-sm">Edit Code</h3><span className="text-[10px] text-[var(--text-tertiary)]">{block.language}</span></div>
            <button onClick={() => setShowEdit(false)} className="p-1 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-white)] hover:bg-white/5 transition-all"><X size={16} /></button>
          </div>
          <textarea value={ec} onChange={e => setEc(e.target.value)} className="flex-1 min-h-[300px] p-4 bg-[var(--bg-code)] text-[13px] leading-relaxed font-mono text-[var(--text-primary)] outline-none resize-none border-0" spellCheck={false} />
          <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--border-default)] flex-shrink-0">
            <span className="text-[10px] text-[var(--text-tertiary)]">{ec.split('\n').length} lines &middot; {ec.length} chars</span>
            <div className="flex gap-2">
              <button onClick={async () => { await navigator.clipboard.writeText(ec); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="px-3 py-1.5 rounded-xl text-[10px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-white)] hover:bg-white/5 transition-all flex items-center gap-1.5">{copied ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}</button>
              <button onClick={() => { copy(ec); setShowEdit(false); }} className="px-4 py-1.5 rounded-xl bg-emerald-500 text-black text-[10px] font-bold hover:bg-emerald-400 transition-all active:scale-95 flex items-center gap-1.5"><Check size={11} /> Done</button>
            </div>
          </div>
        </div>
      </div>
    )}

    {showFileDialog && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowFileDialog(false)}>
        <div className="bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-2xl p-6 max-w-lg w-full mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-4"><div className="flex items-center gap-2"><FilePlus size={18} className="text-emerald-400" /><h3 className="font-bold text-[var(--text-white)] text-sm">Create File</h3></div><button onClick={() => setShowFileDialog(false)} className="p-1 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-white)] hover:bg-white/5 transition-all"><X size={16} /></button></div>
          <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5 block">File Path</label>
          <div className="flex items-center gap-2 mb-3"><FolderOpen size={14} className="text-[var(--text-tertiary)] flex-shrink-0" /><input value={filePath} onChange={e => setFilePath(e.target.value)} className="flex-1 bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-xs text-[var(--text-white)] font-mono outline-none focus:border-emerald-500/40 transition-all" placeholder="src/app/something/page.tsx" /></div>
          <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5 block">Preview</label>
          <pre className="bg-[var(--bg-input)] rounded-xl border border-[var(--border-default)] p-3 max-h-40 overflow-auto text-[11px] font-mono text-[var(--text-secondary)] leading-relaxed mb-4">{block.code}</pre>
          {we && <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[11px]"><AlertCircle size={12} />{we}<button onClick={() => createFile(true)} className="ml-auto text-[10px] font-bold uppercase tracking-wider hover:text-red-300">Overwrite</button></div>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowFileDialog(false)} className="px-4 py-2 rounded-xl text-[11px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-white)] hover:bg-white/5 transition-all">Cancel</button>
            <button onClick={() => createFile()} disabled={ws === 'writing' || !filePath.trim()} className="px-4 py-2 rounded-xl bg-emerald-500 text-black text-[11px] font-bold hover:bg-emerald-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 flex items-center gap-1.5">
              {ws === 'writing' ? <>Writing...</> : ws === 'done' ? <><Check size={12} /> Created</> : <><FilePlus size={12} /> Create File</>}
            </button>
          </div>
        </div>
      </div>
    )}
  </>);
}

/* ─── Message Bubble ─── */
function MessageBubble({ msg, onEdit, onDelete, onRegenerate, onBranch, onLivePreview, onResendFrom, onDragStart, showActions, msgIdx }: {
  msg: Message; onEdit?: (id: string, newText: string) => void;
  onDelete?: (id: string) => void; onRegenerate?: (id: string) => void; showActions?: boolean;
  onBranch?: (msgId: string) => void; onLivePreview?: (html: string) => void;
  onResendFrom?: (msgId: string) => void; onDragStart?: (msgId: string, idx: number) => void;
  msgIdx?: number;
}) {
  const isUser = msg.role === 'user';
  const segments = parseCodeBlocks(msg.content);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(msg.content);

  const handleSaveEdit = () => {
    if (editText.trim() && editText !== msg.content) onEdit?.(msg.id, editText);
    setEditing(false);
  };

  return (
    <div className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'} animate-fade-in group`}>
      {!isUser && (
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500/20 to-emerald-500/20 border border-[var(--border-default)] flex items-center justify-center flex-shrink-0 mt-0.5">
          <Bot size={16} className="text-violet-400" />
        </div>
      )}

      <div className={`max-w-[90%] sm:max-w-[75%] ${isUser ? 'order-first' : ''}`}>
        {editing ? (
          <div className="bg-[var(--bg-card)] border border-emerald-500/40 rounded-2xl p-3">
            <textarea value={editText} onChange={e => setEditText(e.target.value)} className="w-full bg-transparent text-sm text-[var(--text-primary)] outline-none resize-none min-h-[60px]" autoFocus />
            <div className="flex justify-end gap-2 mt-2">
              <button onClick={() => setEditing(false)} className="px-3 py-1 rounded-lg text-[10px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-white)] transition-all">Cancel</button>
              <button onClick={handleSaveEdit} className="px-3 py-1 rounded-lg bg-emerald-500 text-black text-[10px] font-bold hover:bg-emerald-400 transition-all">Save</button>
            </div>
          </div>
        ) : (
          <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${isUser ? 'bg-emerald-500/10 border border-emerald-500/20 text-[var(--text-primary)]' : 'bg-[var(--bg-card)] border border-[var(--border-default)] text-[var(--text-primary)]'}`}>
            {isUser ? (
              <div className="leading-relaxed text-[var(--text-primary)]">{renderMarkdown(msg.content)}</div>
            ) : (
              <div className="space-y-1">
                {segments.map((seg, i) => seg.type === 'text' ? (
                  <div key={i} className="leading-relaxed text-[var(--text-primary)]">{renderMarkdown(seg.content)}</div>
                ) : (
                  <CodeBlockRenderer key={i} block={seg.block} onLivePreview={onLivePreview} dragHandle={
                    onDragStart ? <button onMouseDown={() => onDragStart(msg.id, i)} className="p-0.5 rounded cursor-grab active:cursor-grabbing text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors opacity-0 group-hover:opacity-100" title="Drag to reorder"><GripVertical size={12} /></button> : undefined
                  } />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Actions bar */}
        {showActions && !editing && (
          <div className={`flex items-center gap-1 mt-1 ${isUser ? 'justify-end' : 'justify-start'}`}>
            <span className="text-[9px] text-[var(--text-tertiary)] mr-1">{fmtFullTime(msg.timestamp)}</span>
            {isUser && onEdit && (
              <button onClick={() => { setEditText(msg.content); setEditing(true); }} className="p-0.5 rounded text-[var(--text-tertiary)] hover:text-amber-400 transition-all opacity-0 group-hover:opacity-100" title="Edit message"><Pencil size={11} /></button>
            )}
            {isUser && onResendFrom && (
              <button onClick={() => onResendFrom(msg.id)} className="p-0.5 rounded text-[var(--text-tertiary)] hover:text-sky-400 transition-all opacity-0 group-hover:opacity-100" title="Resend from here (branch)"><GitBranch size={11} /></button>
            )}
            {!isUser && onRegenerate && (
              <button onClick={() => onRegenerate(msg.id)} className="p-0.5 rounded text-[var(--text-tertiary)] hover:text-emerald-400 transition-all opacity-0 group-hover:opacity-100" title="Regenerate"><Undo2 size={11} /></button>
            )}
            {!isUser && onBranch && (
              <button onClick={() => onBranch(msg.id)} className="p-0.5 rounded text-[var(--text-tertiary)] hover:text-violet-400 transition-all opacity-0 group-hover:opacity-100" title="Branch from here"><GitBranch size={11} /></button>
            )}
            {onDelete && (
              <button onClick={() => onDelete(msg.id)} className="p-0.5 rounded text-[var(--text-tertiary)] hover:text-red-400 transition-all opacity-0 group-hover:opacity-100" title="Delete message"><Trash2 size={11} /></button>
            )}
          </div>
        )}
      </div>

      {isUser && (
        <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
          <User size={16} className="text-emerald-400" />
        </div>
      )}
    </div>
  );
}

/* ─── Voice Button ─── */
function VoiceButton({ onResult }: { onResult: (text: string) => void }) {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const toggle = () => {
    if (listening) { recognitionRef.current?.stop(); setListening(false); return; }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) { alert('Voice input not supported in this browser.'); return; }
    const r = new SpeechRecognition();
    r.lang = 'en-US';
    r.interimResults = false;
    r.onresult = (e: any) => { onResult(e.results[0][0].transcript); setListening(false); };
    r.onerror = () => setListening(false);
    r.onend = () => setListening(false);
    r.start();
    recognitionRef.current = r;
    setListening(true);
  };

  return (
    <button onClick={toggle} className={`flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition-all active:scale-95 ${listening ? 'bg-red-500/15 border border-red-500/30 text-red-400' : 'text-[var(--text-secondary)] hover:text-[var(--text-white)] hover:bg-[var(--bg-hover)]'}`} title={listening ? 'Stop listening' : 'Voice input'}>
      {listening ? <MicOff size={16} /> : <Mic size={16} />}
    </button>
  );
}

/* ─── Scroll To Bottom ─── */
function ScrollToBottom({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 w-9 h-9 rounded-full bg-emerald-500 text-black shadow-lg shadow-emerald-500/20 flex items-center justify-center hover:bg-emerald-400 transition-all active:scale-95 animate-fade-in">
      <ArrowDown size={16} />
    </button>
  );
}

/* ─── Main Chat Page ─── */
export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [sc, setSc] = useState(''); // streaming content
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showParams, setShowParams] = useState(false);
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [userScrolledUp, setUserScrolledUp] = useState(false);
  const [slashCmd, setSlashCmd] = useState('');
  const [showSlash, setShowSlash] = useState(false);

  const [projectTree, setProjectTree] = useState<any>(null);
  const [livePreviewHtml, setLivePreviewHtml] = useState<string | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [draggedBlock, setDraggedBlock] = useState<{ msgId: string; fromIdx: number } | null>(null);
  const [showFolderTree, setShowFolderTree] = useState(false);
  const [reactComponents, setReactComponents] = useState<Record<string, ReactComponentInfo[]>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeConv = conversations.find(c => c.id === activeId) || null;

  useEffect(() => { document.body.classList.add('chat-active'); return () => document.body.classList.remove('chat-active'); }, []);

  useEffect(() => {
    try { const s = localStorage.getItem('chromaai-chats-v3'); if (s) { const p: Conversation[] = JSON.parse(s); setConversations(p); if (p.length > 0) setActiveId(p[0].id); } } catch { }
    fetchModels();
    fetchProjectTree();
  }, []);

  useEffect(() => { localStorage.setItem('chromaai-chats-v3', JSON.stringify(conversations)); }, [conversations]);

  // Auto-scroll with user scroll detection
  useEffect(() => {
    if (!userScrolledUp) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConv?.messages, sc, userScrolledUp]);

  const handleScroll = useCallback(() => {
    const el = messagesRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setUserScrolledUp(!atBottom);
  }, []);

  const scrollToBottom = () => { setUserScrolledUp(false); messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); };

  const fetchModels = async () => {
    try { const r = await fetch('/api/ollama/models'); const d = await r.json(); const n = (d.models || []).map((m: any) => m.name); setModels(n); if (n.length > 0 && !selectedModel) setSelectedModel(n[0]); } catch { }
  };
  const fetchProjectTree = async () => { try { const r = await fetch('/api/project/tree'); const d = await r.json(); if (d.tree) setProjectTree(d.tree); } catch { } };

  const getActive = () => conversations.find(c => c.id === activeId) || null;

  const createNewChat = useCallback(() => {
    const id = genId();
    setConversations(p => [{ id, title: 'New Chat', messages: [], model: selectedModel, createdAt: Date.now(), updatedAt: Date.now(), temperature: 0.7, topP: 0.9, maxTokens: 2048, customPrompt: '' }, ...p]);
    setActiveId(id); setSc(''); setShowParams(false); setShowPromptEditor(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [selectedModel]);

  const deleteChat = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setConversations(p => { const f = p.filter(c => c.id !== id); if (activeId === id) setActiveId(f[0]?.id || null); return f; });
  }, [activeId]);

  const updMsgs = useCallback((fn: (msgs: Message[]) => Message[]) => {
    setConversations(p => p.map(c => c.id === activeId ? { ...c, messages: fn(c.messages), updatedAt: Date.now() } : c));
  }, [activeId]);

  const updConv = useCallback((fn: (c: Conversation) => Conversation) => {
    setConversations(p => p.map(c => c.id === activeId ? fn(c) : c));
  }, [activeId]);

  const editMessage = useCallback((msgId: string, newText: string) => {
    updMsgs(msgs => msgs.map(m => m.id === msgId ? { ...m, content: newText } : m));
  }, [updMsgs]);

  const deleteMessage = useCallback((msgId: string) => {
    updMsgs(msgs => msgs.filter(m => m.id !== msgId));
  }, [updMsgs]);

  const sendMessage = async (textOverride?: string) => {
    let text = (textOverride || input).trim();
    if (!text && images.length === 0) return;
    if (!activeId || !selectedModel) return;
    // Append images as markdown
    if (images.length > 0) {
      const imgMd = images.map(d => `![image](${d})`).join('\n');
      text = text ? `${text}\n\n${imgMd}` : imgMd;
    }
    setInput('');
    setImages([]);

    const userMsg: Message = { id: genId(), role: 'user', content: text, timestamp: Date.now() };

    setConversations(p => p.map(c =>
      c.id === activeId
        ? { ...c, title: c.messages.length === 0 ? trunc(text) : c.title, messages: [...c.messages, userMsg], updatedAt: Date.now() }
        : c
    ));

    setStreaming(true); setSc('');
    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const conv = getActive();
      const allMsgs = conv ? [...conv.messages, userMsg] : [userMsg];
      const apiMsgs = allMsgs.map(m => ({ role: m.role, content: m.content }));
      if (conv?.customPrompt) apiMsgs.unshift({ role: 'system', content: conv.customPrompt });

      const body: any = { model: selectedModel, messages: apiMsgs };
      if (conv) { body.temperature = conv.temperature; body.top_p = conv.topP; body.max_tokens = conv.maxTokens; }

      const res = await fetch('/api/ollama/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: abort.signal,
      });

      if (!res.ok || !res.body) throw new Error('Request failed');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = '';
      while (true) { const { done, value } = await reader.read(); if (done) break; full += decoder.decode(value, { stream: true }); setSc(full); }

      const asstMsg: Message = { id: genId(), role: 'assistant', content: full, timestamp: Date.now() };
      updMsgs(msgs => [...msgs, asstMsg]);
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      updMsgs(msgs => [...msgs, { id: genId(), role: 'assistant', content: 'Sorry, the request failed. Is Ollama running?', timestamp: Date.now() }]);
    } finally { setStreaming(false); setSc(''); abortRef.current = null; }
  };

  const regenerate = useCallback((msgId: string) => {
    const conv = getActive();
    if (!conv) return;
    const idx = conv.messages.findIndex(m => m.id === msgId);
    if (idx < 1) return; // Need at least user + assistant
    // Remove this message and all after it
    const msgs = conv.messages.slice(0, idx);
    updMsgs(() => msgs);
    // Rebuild the last user message
    const lastUser = msgs[msgs.length - 1];
    if (lastUser?.role === 'user') {
      setInput(lastUser.content);
    }
  }, [getActive, updMsgs]);

  const branchFrom = useCallback((msgId: string) => {
    const conv = getActive();
    if (!conv) return;
    const idx = conv.messages.findIndex(m => m.id === msgId);
    if (idx < 0) return;
    // Create a new conversation with messages up to and including this one (only keep up to this msg for assistant, or up to previous for user)
    const branchMsgs = conv.messages.slice(0, idx + 1);
    const newId = genId();
    const branchTitle = `Branch: ${trunc(branchMsgs[branchMsgs.length - 1]?.content || 'branch', 30)}`;
    setConversations(p => [{
      id: newId, title: branchTitle, messages: branchMsgs, model: selectedModel,
      createdAt: Date.now(), updatedAt: Date.now(),
      temperature: conv.temperature, topP: conv.topP, maxTokens: conv.maxTokens, customPrompt: conv.customPrompt,
    }, ...p]);
    setActiveId(newId);
  }, [getActive, selectedModel]);

  const resendFrom = useCallback((msgId: string) => {
    const conv = getActive();
    if (!conv) return;
    const idx = conv.messages.findIndex(m => m.id === msgId);
    if (idx < 0) return;
    // Remove all messages after this one
    const keptMsgs = conv.messages.slice(0, idx + 1);
    updMsgs(() => keptMsgs);
    // Put the content back in the input
    setInput(conv.messages[idx].content);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [getActive, updMsgs]);

  const handleLivePreview = useCallback((html: string) => {
    setLivePreviewHtml(html);
  }, []);

  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        if (dataUrl) setImages(p => [...p, dataUrl]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  }, []);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    Array.from(items).forEach(item => {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          const dataUrl = ev.target?.result as string;
          if (dataUrl) setImages(p => [...p, dataUrl]);
        };
        reader.readAsDataURL(file);
      }
    });
  }, []);

  const handleDragStart = useCallback((msgId: string, idx: number) => {
    setDraggedBlock({ msgId, fromIdx: idx });
  }, []);

  const handleDropBlock = useCallback((targetMsgId: string, targetIdx: number) => {
    if (!draggedBlock) return;
    // Simple reorder: just move content between blocks (for now, we store the rearrangement in a map)
    setDraggedBlock(null);
  }, [draggedBlock]);

  const stopGeneration = () => {
    abortRef.current?.abort();
    if (sc) { updMsgs(msgs => [...msgs, { id: genId(), role: 'assistant', content: sc, timestamp: Date.now() }]); }
    setStreaming(false); setSc('');
  };

  // Slash commands
  const slashCommands: SlashCommand[] = [
    { name: '/clear', desc: 'Clear all messages in this chat', action: () => { if (confirm('Clear all messages?')) updMsgs(() => []); } },
    { name: '/export-md', desc: 'Export as Markdown', action: () => { const c = getActive(); if (c) exportChat(c, 'md'); } },
    { name: '/export-json', desc: 'Export as JSON', action: () => { const c = getActive(); if (c) exportChat(c, 'json'); } },
    { name: '/help', desc: 'Show available commands', action: () => { alert('/clear - Clear chat\n/export-md - Export as Markdown\n/export-json - Export as JSON\n/help - Show this help'); } },
  ];

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (streaming) { stopGeneration(); return; }
      if (slashCmd) {
        const cmd = slashCommands.find(c => c.name === slashCmd);
        if (cmd) cmd.action();
        setSlashCmd(''); setShowSlash(false); setInput('');
        return;
      }
      sendMessage();
    }
    if (e.key === '/' && input === '') { setShowSlash(true); }
    if (e.key === 'Escape') { setShowSlash(false); setSlashCmd(''); }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    if (val.startsWith('/')) { setSlashCmd(val.split(' ')[0]); setShowSlash(true); }
    else { setShowSlash(false); setSlashCmd(''); }
  };

  const handleVoiceResult = (text: string) => {
    setInput(p => p + text);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const clearAllChats = () => { setConversations([]); setActiveId(null); };

  const displayModel = selectedModel.split(':')[0];

  // Filter conversations by search
  const filteredConvs = (searchQuery
    ? conversations.filter(c =>
      c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.messages.some(m => m.content.toLowerCase().includes(searchQuery.toLowerCase()))
    )
    : conversations
  ).sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="flex-1 flex screen-full overflow-hidden">
      {sidebarOpen && <div className="chat-sidebar-backdrop md:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* ─── Sidebar ─── */}
      <aside className={`${sidebarOpen ? 'w-72 md:w-72' : 'w-0'} chat-sidebar transition-all duration-300 md:border-r md:border-[var(--border-default)] md:bg-[var(--bg-footer)] bg-[var(--bg-elevated)] flex flex-col overflow-hidden flex-shrink-0`}>
        <div className="flex flex-col h-full min-w-72">
          <div className="px-4 pt-4 pb-3 flex items-center justify-between border-b border-[var(--border-default)]">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-emerald-500 flex items-center justify-center"><Sparkles size={14} className="text-[var(--text-white)]" /></div>
              <span className="font-bold text-sm text-[var(--text-white)]">AI Chat</span>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-white)] hover:bg-white/5 transition-colors"><PanelLeftClose size={16} /></button>
          </div>

          <div className="px-3 pt-3"><button onClick={createNewChat} className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 font-semibold text-xs transition-all active:scale-95"><Plus size={14} /> New Chat</button></div>

          {/* Search */}
          <div className="px-3 pt-3">
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-default)] text-[var(--text-tertiary)]">
              <Search size={13} />
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search chats..." className="flex-1 bg-transparent text-xs text-[var(--text-primary)] outline-none placeholder-[var(--text-tertiary)]" />
              {searchQuery && <button onClick={() => setSearchQuery('')} className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"><X size={13} /></button>}
            </div>
          </div>

          {/* Model selector */}
          <div className="px-3 pt-3 relative">
            <button onClick={() => setModelMenuOpen(!modelMenuOpen)} className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-default)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] text-xs font-medium transition-all">
              <div className="flex items-center gap-2 truncate"><Bot size={14} className="text-violet-400 flex-shrink-0" /><span className="truncate">{displayModel || 'Select model'}</span></div>
              <ChevronDown size={14} className={`text-[var(--text-secondary)] transition-transform flex-shrink-0 ${modelMenuOpen ? 'rotate-180' : ''}`} />
            </button>
            {modelMenuOpen && (
              <div className="absolute left-3 right-3 top-full mt-1 z-50 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl overflow-hidden shadow-xl">
                {models.map(m => (
                  <button key={m} onClick={() => { setSelectedModel(m); setModelMenuOpen(false); }} className={`w-full text-left px-3 py-2.5 text-xs font-medium transition-colors flex items-center gap-2 ${m === selectedModel ? 'bg-emerald-500/10 text-emerald-400' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-white)]'}`}>
                    <Bot size={12} /><span>{m.split(':')[0]}</span>{m.includes(':') && <span className="text-[10px] text-[var(--text-tertiary)] ml-auto">{m.split(':')[1]}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Conversations */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
            {filteredConvs.length === 0 && (
              <div className="text-center py-10"><MessageSquare size={28} className="mx-auto text-[var(--text-tertiary)]" />
                <p className="text-xs text-[var(--text-tertiary)] mt-2">{searchQuery ? 'No matching chats' : 'No conversations yet'}</p></div>
            )}
            {filteredConvs.map(conv => {
              const lastMsg = conv.messages[conv.messages.length - 1];
              return (
                <button key={conv.id} onClick={() => setActiveId(conv.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-medium transition-all flex items-center gap-2.5 group ${conv.id === activeId ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-white)] border border-transparent'}`}>
                  <MessageSquare size={14} className="flex-shrink-0 opacity-60" />
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{conv.title}</div>
                    <div className="text-[10px] text-[var(--text-tertiary)] mt-0.5 flex items-center gap-1.5">
                      <span>{fmtTime(conv.updatedAt)}</span>
                      {lastMsg && <><span>&middot;</span><span className="truncate">{lastMsg.content.slice(0, 25)}...</span></>}
                    </div>
                  </div>
                  <button onClick={e => deleteChat(e, conv.id)} className="p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-400 transition-all flex-shrink-0"><Trash2 size={12} /></button>
                </button>
              );
            })}
          </div>

          {/* Bottom area */}
          <div className="px-3 pb-3 space-y-1">
            {conversations.length > 0 && <button onClick={clearAllChats} className="w-full py-2 rounded-xl text-[10px] font-semibold text-[var(--text-tertiary)] hover:text-red-400 hover:bg-red-500/5 transition-all">Clear all chats</button>}
          </div>
        </div>
      </aside>

      {/* ─── Main Area ─── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border-default)] bg-[var(--bg-header)]">
          <div className="flex items-center gap-2">
            {!sidebarOpen && <button onClick={() => setSidebarOpen(true)} className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-white)] hover:bg-[var(--bg-hover)] transition-colors"><PanelLeftOpen size={18} /></button>}
            <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
              <Bot size={14} className="text-violet-400" />
              <span className="hidden sm:inline">{displayModel || 'Model'}</span>
              {streaming && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {activeConv && (<>
              {/* Parameters */}
              <button onClick={() => setShowParams(!showParams)} className={`p-1.5 rounded-lg transition-all ${showParams ? 'bg-emerald-500/10 text-emerald-400' : 'text-[var(--text-secondary)] hover:text-[var(--text-white)] hover:bg-[var(--bg-hover)]'}`} title="AI Parameters"><SlidersHorizontal size={15} /></button>
              {/* System prompt */}
              <button onClick={() => setShowPromptEditor(true)} className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-white)] hover:bg-[var(--bg-hover)] transition-all" title="Custom system prompt"><Quote size={15} /></button>
              {/* Export */}
              <div className="relative">
                <button onClick={() => setShowExportMenu(!showExportMenu)} className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-white)] hover:bg-[var(--bg-hover)] transition-all" title="Export"><FileDown size={15} /></button>
                {showExportMenu && (
                  <div className="absolute right-0 top-full mt-1 z-50 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl overflow-hidden shadow-xl min-w-[140px]">
                    <button onClick={() => { const c = getActive(); if (c) exportChat(c, 'md'); setShowExportMenu(false); }} className="w-full text-left px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-white)] transition-colors">Export as Markdown</button>
                    <button onClick={() => { const c = getActive(); if (c) exportChat(c, 'json'); setShowExportMenu(false); }} className="w-full text-left px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-white)] transition-colors">Export as JSON</button>
                  </div>
                )}
              </div>
              {/* Token counter */}
              <button onClick={() => { const comps = analyzeReactComponentsInContent(activeConv.messages.map(m => m.content).join('\n')); if (comps.length > 0) { setReactComponents(p => ({ ...p, [activeConv.id]: comps })); setShowFolderTree(true); } }} className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-emerald-400 hover:bg-emerald-500/10 transition-all" title="React component tree">
                <FolderTree size={14} />
              </button>
              <span className="text-[9px] text-[var(--text-tertiary)] ml-1 hidden sm:inline flex items-center gap-1">
                <BarChart3 size={11} />
                {countMessageTokens(activeConv.messages).toLocaleString()} tok
              </span>
              <span className="text-[10px] text-[var(--text-tertiary)] ml-1 hidden sm:inline">{activeConv.messages.length} msgs</span>
            </>)}
          </div>
        </div>

        {/* Parameters panel */}
        {showParams && activeConv && (
          <div className="border-b border-[var(--border-default)] bg-[var(--bg-card)] px-4 py-3 animate-fade-in">
            <div className="max-w-3xl mx-auto flex flex-wrap items-center gap-4">
              {([['Temperature', 'temperature', 0, 2, 0.1], ['Top P', 'topP', 0, 1, 0.05], ['Max Tokens', 'maxTokens', 64, 8192, 64]] as const).map(([label, key, min, max, step]) => (
                <div key={key} className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider min-w-[60px]">{label}</span>
                  <input type="range" min={min} max={max} step={step} value={activeConv[key]} onChange={e => updConv(c => ({ ...c, [key]: parseFloat(e.target.value) }))} className="w-20 accent-emerald-500" />
                  <span className="text-[11px] font-mono text-[var(--text-primary)] w-10 text-right">{activeConv[key]}</span>
                </div>
              ))}
              <button onClick={() => updConv(c => ({ ...c, temperature: 0.7, topP: 0.9, maxTokens: 2048 }))} className="text-[9px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] underline ml-auto">Reset</button>
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 chat-messages-scroll relative" ref={messagesRef} onScroll={handleScroll}>
          {!activeConv ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-6">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-500/10 to-emerald-500/10 border border-[var(--border-default)] flex items-center justify-center mb-5"><Sparkles size={36} className="text-violet-400" /></div>
              <h2 className="text-2xl font-bold text-[var(--text-white)] mb-2">AI Chat</h2>
              <p className="text-sm text-[var(--text-secondary)] max-w-md leading-relaxed">Chat with local AI models via Ollama. Ask coding questions, generate components, or get help with the project.</p>
              <button onClick={createNewChat} className="mt-6 px-5 py-2.5 rounded-xl bg-emerald-500 text-black font-bold text-xs hover:bg-emerald-400 transition-all active:scale-95">Start a conversation</button>
            </div>
          ) : activeConv.messages.length === 0 && !streaming ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-6">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500/20 to-emerald-500/20 border border-[var(--border-default)] flex items-center justify-center mb-4"><MessageSquare size={28} className="text-violet-400" /></div>
              <h3 className="text-lg font-bold text-[var(--text-white)] mb-1">{trunc(activeConv.title)}</h3>
              <p className="text-xs text-[var(--text-secondary)] max-w-sm mb-6">Send a message to start chatting with <span className="text-[var(--text-primary)]">{displayModel}</span>.</p>
              <div className="flex flex-wrap gap-2 max-w-md justify-center">
                {['Create a new React component', 'Show me the project structure', 'Explain the video matting pipeline', 'Add a dark mode toggle'].map(q => (
                  <button key={q} onClick={() => { setInput(q); inputRef.current?.focus(); }} className="px-3 py-1.5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-card)] text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-white)] hover:bg-[var(--bg-hover)] transition-all">{q}</button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-5xl mx-auto px-3 sm:px-4 py-6 space-y-3">
              {/* Conversation block header */}
              {activeConv.messages.length > 0 && (
                <div className="sticky top-0 z-10 -mx-3 sm:-mx-4 px-3 sm:px-4 py-2 bg-[var(--bg-footer)]/90 backdrop-blur-md border-b border-[var(--border-default)] flex items-center justify-between mb-4 rounded-t-xl">
                  <div className="flex items-center gap-2 text-[10px] text-[var(--text-tertiary)]">
                    <MessageSquare size={12} />
                    <span className="font-medium text-[var(--text-secondary)]">{trunc(activeConv.title, 50)}</span>
                    <span>&middot;</span>
                    <span>{activeConv.messages.length} messages</span>
                    <span>&middot;</span>
                    <span>{countMessageTokens(activeConv.messages).toLocaleString()} tokens</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => { const comps = analyzeReactComponentsInContent(activeConv.messages.map(m => m.content).join('\n')); if (comps.length > 0) { setReactComponents(p => ({ ...p, [activeConv.id]: comps })); setShowFolderTree(true); } }} className="p-1 rounded text-[var(--text-tertiary)] hover:text-emerald-400 hover:bg-emerald-500/10 transition-all" title="View React component tree">
                      <FolderTree size={13} />
                    </button>
                    <span className="text-[9px] text-[var(--text-tertiary)]">{formatTokenCount(activeConv.messages.map(m => m.content).join('\n'))}</span>
                  </div>
                </div>
              )}
              {activeConv.messages.map((msg, i) => (
                <MessageBubble key={msg.id} msg={msg} onEdit={editMessage} onDelete={deleteMessage} onRegenerate={regenerate} onBranch={branchFrom} onLivePreview={handleLivePreview} onResendFrom={resendFrom} onDragStart={handleDragStart} showActions msgIdx={i} />
              ))}

              {streaming && sc && (
                <div className="flex gap-3 justify-start animate-fade-in">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500/20 to-emerald-500/20 border border-[var(--border-default)] flex items-center justify-center flex-shrink-0 mt-0.5"><Bot size={16} className="text-violet-400" /></div>
                  <div className="max-w-[90%] sm:max-w-[75%]"><div className="px-4 py-3 rounded-2xl text-sm leading-relaxed bg-[var(--bg-card)] border border-[var(--border-default)] text-[var(--text-primary)]"><StreamingContentRenderer content={sc} /><span className="inline-block w-1.5 h-4 bg-emerald-400 ml-0.5 animate-pulse align-text-bottom rounded-sm" /></div></div>
                </div>
              )}

              {streaming && !sc && (
                <div className="flex gap-3 justify-start animate-fade-in">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500/20 to-emerald-500/20 border border-[var(--border-default)] flex items-center justify-center flex-shrink-0 mt-0.5"><Bot size={16} className="text-violet-400" /></div>
                  <div className="px-4 py-3 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-default)]"><div className="flex gap-1.5"><span className="w-2 h-2 rounded-full bg-[var(--text-tertiary)] animate-bounce" style={{ animationDelay: '0ms' }} /><span className="w-2 h-2 rounded-full bg-[var(--text-tertiary)] animate-bounce" style={{ animationDelay: '150ms' }} /><span className="w-2 h-2 rounded-full bg-[var(--text-tertiary)] animate-bounce" style={{ animationDelay: '300ms' }} /></div></div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}

          {userScrolledUp && activeConv && activeConv.messages.length > 0 && <ScrollToBottom onClick={scrollToBottom} />}
        </div>

        {/* Input Area */}
        {activeConv && (
          <div className="border-t border-[var(--border-default)] bg-[var(--bg-header)] backdrop-blur-md px-3 sm:px-4 py-3">
            <div className="max-w-3xl mx-auto">
              {/* Slash command suggestions */}
              {showSlash && input.startsWith('/') && (
                <div className="mb-2 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl overflow-hidden shadow-lg animate-fade-in">
                  {slashCommands.filter(c => c.name.startsWith(slashCmd)).map(cmd => (
                    <button key={cmd.name} onClick={() => { cmd.action(); setShowSlash(false); setSlashCmd(''); setInput(''); }} className="w-full text-left px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-white)] transition-colors flex items-center gap-2">
                      <span className="font-mono font-bold text-emerald-400">{cmd.name}</span>
                      <span className="text-[var(--text-tertiary)]">{cmd.desc}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="flex items-end gap-2">
                <VoiceButton onResult={handleVoiceResult} />
                <button onClick={() => fileInputRef.current?.click()} className="flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition-all active:scale-95 text-[var(--text-secondary)] hover:text-emerald-400 hover:bg-emerald-500/10" title="Attach image">
                  <Image size={16} />
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageSelect} />
                <textarea
                  ref={inputRef} value={input} onChange={handleInputChange} onKeyDown={handleKeyDown} onPaste={handlePaste}
                  placeholder={streaming ? 'Generating...' : 'Ask something... (/ for commands)'}
                  rows={1} disabled={streaming}
                  className="flex-1 resize-none rounded-xl bg-[var(--bg-card)] border border-[var(--border-default)] px-4 py-3 text-sm text-[var(--text-white)] placeholder-[var(--text-tertiary)] outline-none focus:border-emerald-500/40 focus:bg-[var(--bg-hover)] transition-all disabled:opacity-50"
                  style={{ minHeight: '44px', maxHeight: '120px' }}
                  onInput={e => { const el = e.currentTarget; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px'; }}
                />
                <button onClick={streaming ? stopGeneration : () => sendMessage()}
                  disabled={(!input.trim() && !streaming) || !selectedModel}
                  className={`flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition-all active:scale-95 ${streaming ? 'bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25' : 'bg-emerald-500 text-black hover:bg-emerald-400 disabled:opacity-30 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(16,185,129,0.15)]'}`}>
                  {streaming ? <span className="w-3.5 h-3.5 rounded-sm border-2 border-red-400" /> : <Send size={16} />}
                </button>
              </div>
              <div className="flex items-center justify-between mt-1.5">
                <p className="text-[10px] text-[var(--text-tertiary)]">{displayModel} &middot; Enter to send &middot; Shift+Enter new line{showParams && ' &middot; Parameters active'}</p>
                {streaming && <p className="text-[10px] text-[var(--text-tertiary)] flex items-center gap-1"><span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />Generating...</p>}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Live Preview Modal */}
      {livePreviewHtml && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setLivePreviewHtml(null)}>
          <div className="w-full h-full max-w-5xl max-h-[90vh] m-4 rounded-2xl overflow-hidden border border-[var(--border-default)] shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-2 bg-[var(--bg-card)] border-b border-[var(--border-default)]">
              <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]"><PanelRightOpen size={14} className="text-sky-400" />Live Preview</div>
              <button onClick={() => setLivePreviewHtml(null)} className="p-1 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-white)] hover:bg-white/5 transition-all"><X size={16} /></button>
            </div>
            <iframe srcDoc={livePreviewHtml} className="flex-1 bg-white w-full" sandbox="allow-scripts allow-same-origin" title="Live Preview" />
          </div>
        </div>
      )}

      {/* Folder Tree Modal */}
      {showFolderTree && activeConv && reactComponents[activeConv.id] && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowFolderTree(false)}>
          <div className="bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-2xl w-full max-w-lg mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-default)]">
              <div className="flex items-center gap-2"><FolderTree size={16} className="text-emerald-400" /><h3 className="font-bold text-[var(--text-white)] text-sm">React Components</h3></div>
              <button onClick={() => setShowFolderTree(false)} className="p-1 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-white)] hover:bg-white/5 transition-all"><X size={16} /></button>
            </div>
            <div className="p-4 max-h-[60vh] overflow-y-auto">
              {reactComponents[activeConv.id].map((comp, i) => (
                <div key={i} className="mb-4 last:mb-0">
                  <div className="flex items-center gap-2 mb-2">
                    <Code2 size={14} className="text-violet-400" />
                    <span className="font-bold text-sm text-[var(--text-white)] font-mono">{comp.name}</span>
                    <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${comp.type === 'component' ? 'bg-emerald-500/10 text-emerald-400' : comp.type === 'hook' ? 'bg-violet-500/10 text-violet-400' : comp.type === 'style' ? 'bg-pink-500/10 text-pink-400' : 'bg-amber-500/10 text-amber-400'}`}>{comp.type}</span>
                  </div>
                  <div className="ml-5 space-y-1.5 text-xs">
                    {comp.imports.length > 0 && (
                      <div className="flex items-start gap-2">
                        <span className="text-[var(--text-tertiary)] flex-shrink-0 mt-0.5"><FileCode size={11} /></span>
                        <div className="flex flex-wrap gap-1"><span className="text-[var(--text-tertiary)]">Imports:</span>{comp.imports.map((imp, j) => <span key={j} className="px-1.5 py-0.5 rounded bg-[var(--bg-code)] text-[var(--text-primary)] font-mono text-[10px]">{imp}</span>)}</div>
                      </div>
                    )}
                    {comp.hooks.length > 0 && (
                      <div className="flex items-start gap-2">
                        <span className="text-[var(--text-tertiary)] flex-shrink-0 mt-0.5"><Hash size={11} /></span>
                        <div className="flex flex-wrap gap-1"><span className="text-[var(--text-tertiary)]">Hooks:</span>{comp.hooks.map((h, j) => <span key={j} className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-mono text-[10px]">{h}</span>)}</div>
                      </div>
                    )}
                    {comp.props.length > 0 && (
                      <div className="flex items-start gap-2">
                        <span className="text-[var(--text-tertiary)] flex-shrink-0 mt-0.5"><Type size={11} /></span>
                        <div className="flex flex-wrap gap-1"><span className="text-[var(--text-tertiary)]">Props:</span>{comp.props.map((p, j) => <span key={j} className="px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 font-mono text-[10px]">{p}</span>)}</div>
                      </div>
                    )}
                    {comp.exports.length > 0 && (
                      <div className="flex items-start gap-2">
                        <span className="text-[var(--text-tertiary)] flex-shrink-0 mt-0.5"><ListOrdered size={11} /></span>
                        <div className="flex flex-wrap gap-1"><span className="text-[var(--text-tertiary)]">Exports:</span>{comp.exports.map((e, j) => <span key={j} className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono text-[10px]">{e}</span>)}</div>
                      </div>
                    )}
                    {comp.subComponents.length > 0 && (
                      <div className="flex items-start gap-2">
                        <span className="text-[var(--text-tertiary)] flex-shrink-0 mt-0.5"><FolderTree size={11} /></span>
                        <div className="flex flex-wrap gap-1"><span className="text-[var(--text-tertiary)]">Sub-components:</span>{comp.subComponents.map((s, j) => <span key={j} className="px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 font-mono text-[10px]">{s}</span>)}</div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {(!reactComponents[activeConv.id] || reactComponents[activeConv.id].length === 0) && (
                <p className="text-xs text-[var(--text-tertiary)] text-center py-8">No React components detected in this conversation.</p>
              )}
            </div>
            <div className="flex justify-end px-5 py-3 border-t border-[var(--border-default)]">
              <button onClick={() => setShowFolderTree(false)} className="px-4 py-2 rounded-xl bg-emerald-500 text-black text-[11px] font-bold hover:bg-emerald-400 transition-all active:scale-95">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Image preview area */}
      {images.length > 0 && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl shadow-xl">
          {images.map((img, i) => (
            <div key={i} className="relative group">
              <img src={img} alt={`Attachment ${i + 1}`} className="w-12 h-12 rounded-lg object-cover border border-[var(--border-default)]" />
              <button onClick={() => setImages(p => p.filter((_, j) => j !== i))} className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-400 transition-all opacity-0 group-hover:opacity-100"><X size={8} /></button>
            </div>
          ))}
          <button onClick={() => setImages([])} className="text-[10px] text-[var(--text-tertiary)] hover:text-red-400 transition-all px-1">Clear all</button>
        </div>
      )}

      {/* System Prompt Editor */}
      {showPromptEditor && activeConv && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowPromptEditor(false)}>
          <div className="bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-2xl w-full max-w-2xl mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-default)]">
              <div className="flex items-center gap-2"><Quote size={16} className="text-emerald-400" /><h3 className="font-bold text-[var(--text-white)] text-sm">Custom System Prompt</h3></div>
              <button onClick={() => setShowPromptEditor(false)} className="p-1 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-white)] hover:bg-white/5 transition-all"><X size={16} /></button>
            </div>
            <textarea value={activeConv.customPrompt} onChange={e => updConv(c => ({ ...c, customPrompt: e.target.value }))} className="w-full min-h-[200px] p-4 bg-[var(--bg-code)] text-[13px] leading-relaxed font-mono text-[var(--text-primary)] outline-none resize-none border-0" placeholder="Optional: Set a custom system prompt for this conversation..." />
            <div className="flex justify-end px-5 py-3 border-t border-[var(--border-default)]">
              <button onClick={() => setShowPromptEditor(false)} className="px-4 py-2 rounded-xl bg-emerald-500 text-black text-[11px] font-bold hover:bg-emerald-400 transition-all active:scale-95">Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StreamingContentRenderer({ content }: { content: string }) {
  const segments = parseCodeBlocks(content);
  return (
    <div className="space-y-1">
      {segments.map((seg, i) => seg.type === 'text' ? (
        <div key={i} className="leading-relaxed text-[var(--text-primary)]">{renderMarkdown(seg.content)}</div>
      ) : (
        <CodeBlockRenderer key={i} block={seg.block} />
      ))}
    </div>
  );
}
