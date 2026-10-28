import type { Soundboard } from '../hooks/useSoundboard';
import { formatDuration } from '../types';
import { Icon } from './Icon';
import { Waveform } from './SoundCard';

export function Transport({ board }: { board: Soundboard }) {
  const active = board.active.at(-1);
  const clip = board.library?.clips.find(clip => clip.id === active?.id);
  const elapsed = active ? (board.clock - active.startedAt) % active.duration : 0;
  return <footer className="transport" aria-label="Playback controls">
    <div className={`now-playing-icon ${clip?.color ?? 'violet'} ${active ? 'active' : ''}`}><Icon name="AudioLines" size={24} /></div>
    <div className="now-playing-copy"><strong>{clip?.name ?? 'Ready when you are.'}</strong><span>{active ? `${board.active.length > 1 ? `${board.active.length} sounds playing` : 'Now playing'}${active.loop ? ' · Looping' : ''}` : 'Pick a sound. Set the moment.'}</span></div>
    <div className="transport-wave"><Waveform peaks={clip && board.analysis[clip.id]?.peaks} progress={active ? elapsed / active.duration : 0} active={Boolean(active)} /></div>
    <span className="transport-time">{formatDuration(elapsed)} <span>/ {formatDuration(active?.duration ?? 0)}</span></span>
    <div className="level-meter" aria-label={`Output level ${Math.round(board.level * 100)} percent`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(board.level * 100)}>{Array.from({ length: 14 }, (_, i) => <i key={i} className={i / 14 < board.level ? 'lit' : ''} />)}</div>
    <button className="stop-button" onClick={board.stopAll} disabled={!board.active.length}><Icon name="Square" size={13} />Stop all <kbd>CTRL ALT SPACE</kbd></button>
  </footer>;
}
