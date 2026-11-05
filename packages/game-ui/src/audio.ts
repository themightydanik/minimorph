export interface AudioPreferences { master: number; music: number; effects: number; muted: boolean; }
export const AUDIO_STORAGE_KEY = 'minimorph-audio-v1';
export const DEFAULT_AUDIO: AudioPreferences = { master: .8, music: .35, effects: .75, muted: false };
export type AudioStorage = Pick<Storage, 'getItem' | 'setItem'>;
export function sanitizeAudio(value: unknown): AudioPreferences {
  const v = value && typeof value === 'object' ? value as Partial<AudioPreferences> : {};
  const level = (n: unknown, fallback: number) => typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
  return { master: level(v.master, DEFAULT_AUDIO.master), music: level(v.music, DEFAULT_AUDIO.music), effects: level(v.effects, DEFAULT_AUDIO.effects), muted: typeof v.muted === 'boolean' ? v.muted : false };
}
export function readAudio(storage?: AudioStorage): AudioPreferences {
  try { return sanitizeAudio(JSON.parse(storage?.getItem(AUDIO_STORAGE_KEY) ?? 'null')); } catch { return { ...DEFAULT_AUDIO }; }
}
function browserStorage(): AudioStorage | undefined { try { return localStorage; } catch { return undefined; } }
export const AUDIO_ASSETS = {
  jump: new URL('../../../assets/audio/jump.wav', import.meta.url).href,
  land: new URL('../../../assets/audio/land.wav', import.meta.url).href,
  dive: new URL('../../../assets/audio/dive.wav', import.meta.url).href,
  slide: new URL('../../../assets/audio/slide.wav', import.meta.url).href,
  collision: new URL('../../../assets/audio/collision.wav', import.meta.url).href,
  checkpoint: new URL('../../../assets/audio/checkpoint.wav', import.meta.url).href,
  countdown: new URL('../../../assets/audio/countdown.wav', import.meta.url).href,
  start: new URL('../../../assets/audio/start.wav', import.meta.url).href,
  finish: new URL('../../../assets/audio/finish.wav', import.meta.url).href,
  victory: new URL('../../../assets/audio/victory.wav', import.meta.url).href,
  menu: new URL('../../../assets/audio/menu.wav', import.meta.url).href,
  race: new URL('../../../assets/audio/race.wav', import.meta.url).href,
  results: new URL('../../../assets/audio/results.wav', import.meta.url).href,
};
export type SoundCue = Exclude<keyof typeof AUDIO_ASSETS, 'menu' | 'race' | 'results'>;
type Music = 'menu' | 'race' | 'results';
const priorities: Record<SoundCue, number> = { jump: 1, land: 1, dive: 2, slide: 1, collision: 3, checkpoint: 3, countdown: 3, start: 4, finish: 4, victory: 4 };
interface Voice { gain: GainNode; source?: AudioBufferSourceNode; priority: number; }
/** One context, cached buffers, eight reusable voice gains, two music layers during a fade. */
export class AudioManager {
  preferences: AudioPreferences;
  private context?: AudioContext;
  private master?: GainNode;
  private musicBus?: GainNode;
  private effectsBus?: GainNode;
  private voices: Voice[] = [];
  private buffers = new Map<keyof typeof AUDIO_ASSETS, AudioBuffer>();
  private loading = new Map<keyof typeof AUDIO_ASSETS, Promise<AudioBuffer | undefined>>();
  private music?: { name: Music; source: AudioBufferSourceNode; gain: GainNode };
  private musicSources = new Set<AudioBufferSourceNode>();
  private desired: Music = 'menu';
  private generation = 0;
  private phase = '';
  private countdownSeen = new Set<number>();
  private readonly requests = new AbortController();
  private lastCue = new Map<string, number>();
  private disposed = false;
  private unlocked = false;
  private blocked = false;
  readonly played: Partial<Record<SoundCue, number>> = {};
  constructor(private storage: AudioStorage | undefined = browserStorage(), private contextFactory: () => AudioContext = () => new AudioContext(), private status: (state: string, music?: Music) => void = () => {}) {
    this.preferences = readAudio(storage); this.status('locked');
  }
  get currentMusic() { return this.music?.name; }
  get isUnlocked() { return this.unlocked; }
  private notify() { this.status(this.disposed ? 'closed' : !this.context ? 'locked' : this.context.state, this.music?.name); }
  setPreferences(patch: Partial<AudioPreferences>) {
    this.preferences = sanitizeAudio({ ...this.preferences, ...patch });
    try { this.storage?.setItem(AUDIO_STORAGE_KEY, JSON.stringify(this.preferences)); } catch { /* Session preference remains usable. */ }
    this.applyVolumes();
  }
  private applyVolumes() {
    if (!this.context) return;
    const now = this.context.currentTime, p = this.preferences;
    this.master!.gain.setTargetAtTime(p.muted ? 0 : p.master, now, .025);
    this.musicBus!.gain.setTargetAtTime(p.music, now, .05);
    this.effectsBus!.gain.setTargetAtTime(p.effects, now, .025);
  }
  async unlock() {
    if (this.disposed) return;
    if (this.unlocked && !this.blocked && this.context?.state === 'running' && this.music?.name === this.desired) return;
    try {
      if (!this.context) {
        this.context = this.contextFactory();
        this.master = this.context.createGain();
        const limiter = this.context.createDynamicsCompressor(); limiter.threshold.value = -14; limiter.knee.value = 12; limiter.ratio.value = 6; limiter.attack.value = .003; limiter.release.value = .15;
        this.master.connect(limiter); limiter.connect(this.context.destination);
        this.musicBus = this.context.createGain(); this.musicBus.connect(this.master);
        this.effectsBus = this.context.createGain(); this.effectsBus.connect(this.master);
        this.voices = Array.from({ length: 8 }, () => { const gain = this.context!.createGain(); gain.connect(this.effectsBus!); return { gain, priority: -1 }; });
        this.applyVolumes();
      }
      await this.context.resume();
      if (this.disposed || this.context.state !== 'running') return;
      this.unlocked = true; this.blocked = false; this.notify();
      void this.ensureMusic();
      for (const cue of Object.keys(priorities) as SoundCue[]) void this.load(cue);
    } catch { this.status('unavailable'); }
  }
  private load(name: keyof typeof AUDIO_ASSETS): Promise<AudioBuffer | undefined> {
    if (this.buffers.has(name)) return Promise.resolve(this.buffers.get(name));
    const existing = this.loading.get(name); if (existing) return existing;
    const promise = fetch(AUDIO_ASSETS[name], { signal: this.requests.signal }).then(r => { if (!r.ok) throw Error('Audio unavailable'); return r.arrayBuffer(); })
      .then(data => this.context!.decodeAudioData(data)).then(buffer => { if (!this.disposed) this.buffers.set(name, buffer); return buffer; })
      .catch(() => undefined).finally(() => this.loading.delete(name));
    this.loading.set(name, promise); return promise;
  }
  scene(phase: string, countdown = 0) {
    const next: Music = phase === 'finished' ? 'results' : (phase === 'racing' || phase === 'countdown' || phase === 'paused') ? 'race' : 'menu';
    if (phase === 'countdown' && this.phase !== 'countdown') this.countdownSeen.clear();
    if (phase === 'countdown' && countdown > 0 && !this.countdownSeen.has(countdown)) { this.countdownSeen.add(countdown); this.play('countdown'); }
    if (phase === 'racing' && this.phase === 'countdown') this.play('start');
    this.phase = phase;
    if (next !== this.desired) { this.desired = next; this.generation++; void this.ensureMusic(); }
  }
  private async ensureMusic() {
    const context = this.context;
    if (!context || !this.unlocked || this.blocked || this.disposed || this.music?.name === this.desired) return;
    const name = this.desired, generation = this.generation, buffer = await this.load(name);
    if (!buffer || this.disposed || this.blocked || context.state !== 'running' || name !== this.desired || generation !== this.generation || this.music?.name === name) return;
    const source = context.createBufferSource(), gain = context.createGain(), now = context.currentTime;
    for (const tail of this.musicSources) if (tail !== this.music?.source) { tail.stop(now); this.musicSources.delete(tail); }
    source.buffer = buffer; source.loop = true; source.connect(gain); gain.connect(this.musicBus!);
    gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(.8, now + .8);
    if (this.music) {
      const previous = this.music;
      previous.gain.gain.cancelScheduledValues(now); previous.gain.gain.setValueAtTime(previous.gain.gain.value, now); previous.gain.gain.linearRampToValueAtTime(0, now + .8);
      previous.source.stop(now + .85);
    }
    this.musicSources.add(source);
    source.onended = () => { this.musicSources.delete(source); source.disconnect(); gain.disconnect(); };
    source.start(); this.music = { name, source, gain }; this.notify();
  }
  play(cue: SoundCue, remote = false, distance = 0) {
    const context = this.context, buffer = this.buffers.get(cue), p = this.preferences;
    if (!context || !this.unlocked || this.blocked || this.disposed || context.state !== 'running' || p.muted || p.master === 0 || p.effects === 0 || remote && distance > 9) return;
    if (!buffer) { void this.load(cue); return; } // No late backlog after unlock/network correction.
    const key = `${cue}:${remote ? 'remote' : 'local'}`, now = context.currentTime;
    if (now - (this.lastCue.get(key) ?? -Infinity) < (remote ? .12 : .035)) return;
    const priority = remote ? 0 : priorities[cue];
    let voice = this.voices.find(v => !v.source);
    if (!voice) voice = this.voices.reduce((a, b) => a.priority < b.priority ? a : b);
    if (voice.source && voice.priority > priority) return;
    const previous = voice.source; previous?.stop();
    const source = context.createBufferSource(); source.buffer = buffer; source.connect(voice.gain);
    voice.source = source; voice.priority = priority;
    voice.gain.gain.setValueAtTime(remote ? .2 * Math.max(0, 1 - distance / 12) : .7, now);
    source.onended = () => { source.disconnect(); if (voice!.source === source) { voice!.source = undefined; voice!.priority = -1; } };
    source.start(now + (cue === 'victory' ? .25 : 0));
    this.lastCue.set(key, now); this.played[cue] = (this.played[cue] ?? 0) + 1;
  }
  suspend() {
    this.blocked = true;
    for (const voice of this.voices) { voice.source?.stop(); voice.source = undefined; }
    void this.context?.suspend().then(() => this.notify()).catch(() => {});
  }
  destroy() {
    if (this.disposed) return; this.disposed = true; this.unlocked = false; this.generation++; this.requests.abort();
    for (const voice of this.voices) { voice.source?.stop(); voice.gain.disconnect(); }
    for (const source of this.musicSources) source.stop();
    this.musicSources.clear(); this.music = undefined; this.voices = []; this.buffers.clear(); this.loading.clear(); this.lastCue.clear();
    void this.context?.close().catch(() => {}); this.notify();
  }
}
