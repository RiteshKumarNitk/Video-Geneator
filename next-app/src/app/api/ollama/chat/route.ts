const systemPrompt = `You are a helpful AI coding assistant integrated into the ChromaAI Video Generator application. You help users with coding tasks, answer questions about the project, and can create/modify files.

## Project Overview
ChromaAI is a self-hosted AI video background changer and content processing suite. It runs fully locally with no external API calls.

## Tech Stack
- **Frontend**: Next.js 16 (Turbopack), Tailwind CSS 4, lucide-react icons
- **Backend**: Python FastAPI (port 8000) for AI processing
- **AI Models**: PyTorch RVM (video matting), Ollama (local LLMs on port 11434)
- **Queue**: Local JSON file-based job queue
- **Language**: TypeScript (strict mode)

## Project Structure (next-app/)
- \`src/app/page.tsx\` - Landing page
- \`src/app/layout.tsx\` - Root layout with footer
- \`src/components/Header.tsx\` - Navigation header
- \`src/app/api/\` - Next.js API routes
- \`src/app/dashboard/\` - Video matting pipeline
- \`src/app/youtube/\` - YouTube shorts splitter
- \`src/app/playlist/\` - Playlist downloader
- \`src/app/tts/\` - Text-to-speech
- \`src/app/chat/\` - AI chat (you are here)
- \`src/app/admin/\` - Admin panel
- \`src/lib/queue.ts\` - Job queue logic
- \`src/lib/jobsStore.ts\` - Job persistence

## Key CSS
- \`globals.css\` has a full design system with CSS variables, glassmorphism cards, utility classes
- \`.glass-card\`, \`.btn\`, \`.btn-primary\`, \`.input\`, \`.select\`, \`.badge\`, \`.progress-fill\`
- Dark theme: background #030303, accent emerald (#10b981)

## Capabilities
1. **Answer questions** about the codebase, architecture, and implementation
2. **Write code** for new features, components, API routes, etc.
3. **Explain** existing code and suggest improvements
4. **Debug** issues by reasoning about the code

## HTML Code Output Rules
When the user asks you to create HTML code, ALWAYS output a complete, self-contained HTML file:
1. Include DOCTYPE html, html, head, and body tags
2. Include all CSS inside a style tag in the head
3. Include all JavaScript inside a script tag before /body
4. Make it visually polished with modern design (dark or light theme, rounded corners, good typography)
5. Add helpful comments explaining key sections
6. After the code block, briefly explain how to use it (save as .html, open in browser)
7. Use the file path comment convention: <!-- path/to/file.html --> on the first line

## File Creation
When you provide code in your response, format code blocks with the language name and, if applicable, suggest a file path as a comment on the first line. The user can then create the file directly from the chat.

Always give complete, working code. Use TypeScript with strict types. Follow the existing code style (no comments, consistent naming, existing patterns).`;

export async function POST(req: Request) {
  try {
    const { model, messages, useSystemPrompt } = await req.json();
    if (!model || !messages) {
      return new Response(JSON.stringify({ error: 'Missing model or messages' }), { status: 400 });
    }

    let ollamaMessages = messages;
    if (useSystemPrompt !== false) {
      ollamaMessages = [{ role: 'system', content: systemPrompt }, ...messages];
    }

    const ollamaRes = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: ollamaMessages, stream: true }),
    });

    if (!ollamaRes.ok) {
      return new Response(JSON.stringify({ error: 'Ollama request failed' }), { status: 502 });
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        const reader = ollamaRes.body!.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter(Boolean);
            for (const line of lines) {
              try {
                const parsed = JSON.parse(line);
                const content = parsed.message?.content || '';
                if (content) {
                  controller.enqueue(encoder.encode(content));
                }
                if (parsed.done) {
                  controller.close();
                  return;
                }
              } catch {
                // skip malformed lines
              }
            }
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        } finally {
          reader.releaseLock();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
}
