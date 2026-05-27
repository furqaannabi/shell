/** Two-note ascending bell chime (C6 → E6). Short attack, long decay. */
export function playBellChime(): void {
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    ([[1046.5, 0], [1318.5, 0.13]] as [number, number][]).forEach(([freq, delay]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + delay);
      gain.gain.linearRampToValueAtTime(0.35, now + delay + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.8);
      osc.start(now + delay);
      osc.stop(now + delay + 0.85);
    });
  } catch {
    // AudioContext blocked — silent fail.
  }
}

/** Single high ding — for proposal arrival. */
export function playDing(): void {
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = 1318.5;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.25, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc.start(now);
    osc.stop(now + 0.55);
  } catch {
    // silent fail
  }
}
