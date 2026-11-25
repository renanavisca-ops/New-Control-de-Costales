'use client';
// Voz del dispositivo: síntesis (TTS) y reconocimiento opcional. Sin servicios de pago ni audio
// guardado. El reconocimiento depende del navegador; si no existe o no hay permiso, la app ofrece
// una alternativa y marca la modalidad como no evaluada en vez de penalizar.

export function puedeHablar() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function decir(texto: string, idioma = 'en-US', lento = false) {
  if (!puedeHablar()) return false;
  const u = new SpeechSynthesisUtterance(texto);
  u.lang = idioma;
  u.rate = lento ? 0.65 : 0.95;
  const voz = window.speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith(idioma.toLowerCase().slice(0, 2)));
  if (voz) u.voice = voz;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
  return true;
}

type Reconocedor = {
  lang: string; interimResults: boolean; maxAlternatives: number;
  onresult: ((e: { results: { 0: { transcript: string; confidence: number } }[] }) => void) | null;
  onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null;
  start(): void; stop(): void;
};

export function puedeReconocer() {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as Record<string, unknown>;
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export function escucharUnaVez(idioma = 'en-US'): Promise<{ texto: string; fiabilidad: number }> {
  return new Promise((resolve, reject) => {
    const w = window as unknown as Record<string, new () => Reconocedor>;
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return reject(new Error('sin_reconocimiento'));
    const r = new Ctor();
    r.lang = idioma; r.interimResults = false; r.maxAlternatives = 1;
    let listo = false;
    r.onresult = (e) => { listo = true; resolve({ texto: e.results[0][0].transcript, fiabilidad: e.results[0][0].confidence ?? 0.5 }); };
    r.onerror = (e) => { if (!listo) reject(new Error(e.error)); };
    r.onend = () => { if (!listo) reject(new Error('sin_audio')); };
    r.start();
  });
}
