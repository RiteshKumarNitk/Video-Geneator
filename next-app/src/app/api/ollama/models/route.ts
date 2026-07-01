import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const res = await fetch('http://localhost:11434/api/tags');
    if (!res.ok) {
      return NextResponse.json({ models: [] });
    }
    const data = await res.json();
    const models = (data.models || []).map((m: any) => ({
      name: m.name,
      size: m.size,
      details: m.details,
    }));
    return NextResponse.json({ models });
  } catch {
    return NextResponse.json({ models: [] });
  }
}
