import { transliterate } from 'transliteration';
import type { Cue, Settings } from './model';

const common: Record<string, string> = {
  है: 'hai',
  हैं: 'hain',
  मैं: 'main',
  में: 'mein',
  नहीं: 'nahi',
  भाई: 'bhai',
  क्या: 'kya',
  ये: 'ye',
  वो: 'woh',
  और: 'aur',
  क्यों: 'kyun',
  मुझे: 'mujhe',
  अच्छा: 'achha',
  रहा: 'raha',
  हूँ: 'hoon',
  तो: 'toh',
  गया: 'gaya',
  अरे: 'arre',
};
const spoken: Record<string, string> = {
  ...common,
  लाइक: 'like',
  मारो: 'maaro',
  लेट्स: "let's",
  गो: 'go',
  गेम: 'game',
  गेमप्ले: 'gameplay',
  स्ट्रीम: 'stream',
  पुलिस: 'police',
  क्रेजी: 'crazy',
  स्किल्स: 'skills',
  मिशन: 'mission',
  मेंबर्स: 'members',
  हेल्प: 'help',
  विद: 'with',
  सिक्स: 'six',
  जीटीए: 'GTA',
  ग्लिच: 'glitch',
  यार: 'yaar',
  यहाँ: 'yahaan',
  यहां: 'yahaan',
  हां: 'haan',
  हाँ: 'haan',
  हूं: 'hoon',
  माँ: 'maa',
  आँखें: 'aankhein',
  बहुत: 'bahut',
  मतलब: 'matlab',
  बिल्कुल: 'bilkul',
  बेवकूफ: 'bewakoof',
  चाहिए: 'chahiye',
  देख: 'dekh',
  ठीक: 'theek',
  मैंने: 'maine',
  एक: 'ek',
  का: 'ka',
  ना: 'na',
  काफ़ी: 'kaafi',
};
const consonants: Record<string, string> = Object.fromEntries(
  Array.from('कखगघङचछजझञटठडढणतथदधनपफबभमयरलवशषसह').map((c, i) => [
    c,
    'k kh g gh n ch chh j jh n t th d dh n t th d dh n p ph b bh m y r l v sh sh s h'.split(' ')[i],
  ]),
);
const vowels: Record<string, string> = {
  अ: 'a',
  आ: 'aa',
  इ: 'i',
  ई: 'ee',
  उ: 'u',
  ऊ: 'oo',
  ए: 'e',
  ऐ: 'ai',
  ओ: 'o',
  औ: 'au',
  ऋ: 'ri',
  'ा': 'aa',
  'ि': 'i',
  'ी': 'i',
  'ु': 'u',
  'ू': 'oo',
  'े': 'e',
  'ै': 'ai',
  'ो': 'o',
  'ौ': 'au',
  'ृ': 'ri',
  'ॉ': 'o',
};
function romanWord(word: string) {
  if (spoken[word]) return spoken[word];
  const letters = Array.from(word.normalize('NFD'));
  const parts: { base: string; vowel: string; implicit: boolean }[] = [];
  for (let i = 0; i < letters.length; i++) {
    const c = letters[i];
    if (consonants[c]) {
      let base = consonants[c];
      if (letters[i + 1] === '़') {
        base = ({ ज: 'z', फ: 'f', ड: 'r', ढ: 'rh', क: 'q' } as Record<string, string>)[c] || base;
        i++;
      }
      const next = letters[i + 1],
        explicit = next === '्' || (!!next && 'ािीुूेैोौृॉ'.includes(next));
      parts.push({ base, vowel: explicit ? vowels[next] || '' : 'a', implicit: !explicit });
      if (explicit) i++;
    } else {
      const value = vowels[c] ?? ('ंँ'.includes(c) ? 'n' : c === 'ः' ? 'h' : transliterate(c));
      parts.push({ base: value, vowel: '', implicit: false });
    }
  }
  for (let i = parts.length - 1; i > 0; i--) {
    const p = parts[i];
    if (p.implicit && (i === parts.length - 1 || (parts[i - 1].vowel && parts[i + 1].vowel))) p.vowel = '';
  }
  return parts.map((p) => p.base + p.vowel).join('');
}
export function roman(text: string) {
  return text
    .replace(/[\u0900-\u097f]+/gu, romanWord)
    .replace(/\s*\/\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
const cached = new WeakMap<Cue[], Cue[]>();
export function captionCues(settings: Settings, source: Cue[]) {
  if (settings.cues) return settings.cues;
  if (!settings.romanCaptions) return source;
  let cues = cached.get(source);
  if (!cues) {
    cues = source.map(c => ({ ...c, text: roman(c.text) }));
    cached.set(source, cues);
  }
  return cues;
}
