// Original, deterministic starter sounds. No downloaded or copyrighted samples.
function createWave(kind, duration) {
  const rate = 44100;
  const count = Math.floor(rate * duration);
  const buffer = Buffer.alloc(44 + count * 2);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write('WAVEfmt ', 8); buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24); buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(count * 2, 40);
  let seed = 12345;
  for (let i = 0; i < count; i++) {
    const t = i / rate;
    const fade = Math.min(1, t / 0.015, (duration - t) / 0.08);
    let value = 0;
    if (kind === 'chime') {
      for (const [j, frequency] of [523.25, 659.25, 783.99].entries()) {
        const local = t - j * 0.14;
        if (local >= 0) value += Math.sin(2 * Math.PI * frequency * local) * Math.exp(-local * 3.5) * 0.18;
      }
    } else if (kind === 'arcade') {
      const step = Math.min(5, Math.floor(t / 0.11));
      value = Math.sin(2 * Math.PI * [392, 523, 659, 784, 659, 1047][step] * t) * Math.exp(-t * 1.1) * 0.25;
    } else if (kind === 'pulse') {
      const local = t % 0.45;
      value = Math.sin(2 * Math.PI * 110 * local) * Math.exp(-local * 15) * 0.4;
    } else if (kind === 'whoosh') {
      seed = (seed * 16807) % 2147483647;
      value = ((seed / 2147483647) * 2 - 1) * Math.sin(Math.PI * t / duration) ** 2 * 0.25;
    } else if (kind === 'bloom') {
      value = [261.63, 329.63, 392].reduce((sum, frequency) => sum + Math.sin(2 * Math.PI * frequency * t), 0) * 0.1 * Math.sin(Math.PI * t / duration);
    } else {
      value = Math.sin(2 * Math.PI * (220 * t + 260 * t * t)) * Math.exp(-t * 3) * 0.35;
    }
    buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value * fade)) * 32767), 44 + i * 2);
  }
  return buffer;
}

const STARTER_SOUNDS = [
  { name: 'Little victory', kind: 'arcade', duration: 1.2, color: 'violet', category: 'Reactions' },
  { name: 'Soft signal', kind: 'chime', duration: 1.8, color: 'mint', category: 'Essentials' },
  { name: 'The transition', kind: 'whoosh', duration: 1.4, color: 'peach', category: 'Effects' },
  { name: 'After hours', kind: 'bloom', duration: 3.2, color: 'blue', category: 'Music' },
  { name: 'Plot twist', kind: 'rise', duration: 1.5, color: 'pink', category: 'Reactions' },
  { name: 'Heartbeat', kind: 'pulse', duration: 2.7, color: 'yellow', category: 'Effects' },
];
module.exports = { createWave, STARTER_SOUNDS };
