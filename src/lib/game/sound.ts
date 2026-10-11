// Short feedback sounds made with the Web Audio API. No audio files.

export type SoundName = "win" | "lose" | "belt" | "tap";

const SOUND_KEY = "fakedojo.sound";

/** Notes as [frequency in Hz, start in s, length in s]. */
const TUNES: Record<SoundName, readonly (readonly [number, number, number])[]> = {
  win: [
    [523.25, 0, 0.09],
    [659.25, 0.08, 0.09],
    [783.99, 0.16, 0.2],
  ],
  lose: [
    [220, 0, 0.14],
    [164.81, 0.13, 0.26],
  ],
  belt: [
    [523.25, 0, 0.1],
    [659.25, 0.1, 0.1],
    [783.99, 0.2, 0.1],
    [1046.5, 0.3, 0.38],
  ],
  tap: [[440, 0, 0.05]],
};

let context: AudioContext | null = null;

export function isSoundOn(): boolean {
  try {
    return window.localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundOn(on: boolean): void {
  try {
    window.localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {
    // Without storage the choice lasts until the page is reloaded.
  }
}

export function playSound(name: SoundName): void {
  if (typeof window === "undefined" || !isSoundOn()) return;
  try {
    context ??= new AudioContext();
    if (context.state === "suspended") void context.resume();
    const start = context.currentTime + 0.01;
    for (const [frequency, at, length] of TUNES[name]) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = name === "lose" ? "sawtooth" : "triangle";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start + at);
      gain.gain.linearRampToValueAtTime(name === "lose" ? 0.07 : 0.16, start + at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + at + length);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start + at);
      oscillator.stop(start + at + length + 0.02);
    }
  } catch {
    // Sound is a bonus. A browser that blocks audio must not break the game.
  }
}
