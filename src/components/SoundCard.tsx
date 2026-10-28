import type { CSSProperties } from 'react';
import type { ActiveClip, ClipAnalysis } from '../audio/AudioEngine';
import { formatDuration, type Clip } from '../types';
import { Icon, type IconName } from './Icon';

const categoryIcons: Record<string, IconName> = { Reactions: 'Sparkles', Essentials: 'Radio', Effects: 'Zap', Music: 'Music2' };
export function Waveform({ peaks, progress = 0, active = false }: { peaks?: number[]; progress?: number; active?: boolean }) {
  return <svg className={`waveform ${active ? 'playing' : ''}`} viewBox="0 0 264 48" preserveAspectRatio="none" aria-hidden="true">
    {(peaks ?? Array.from({ length: 44 }, () => 0.09)).map((peak, i) => <rect key={i} x={i * 6 + 1} y={24 - peak * 22} width="3" height={Math.max(3, peak * 44)} rx="1.5" className={active && i / 44 <= progress ? 'played' : ''} />)}
  </svg>;
}

export function SoundCard({ clip, analysis, active, clock, onPlay, onFavorite, onEdit, list }: {
  clip: Clip; analysis?: ClipAnalysis; active?: ActiveClip; clock: number;
  onPlay(): void; onFavorite(): void; onEdit(): void; list?: boolean;
}) {
  const progress = active ? ((clock - active.startedAt) % active.duration) / active.duration : 0;
  const shortcut = clip.hotkey.split('+').at(-1);
  return <article className={`sound-card ${clip.color} ${active ? 'is-playing' : ''} ${list ? 'list-card' : ''}`} style={{ '--progress': `${progress * 100}%` } as CSSProperties}>
    <div className="card-top"><span className="sound-symbol"><Icon name={categoryIcons[clip.category]} size={22} /></span>
      <span className="card-top-actions"><button className={`icon-button favorite ${clip.favorite ? 'selected' : ''}`} aria-label={`${clip.favorite ? 'Unfavorite' : 'Favorite'} ${clip.name}`} aria-pressed={clip.favorite} onClick={onFavorite}><Icon name="Heart" size={16} /></button><button className="icon-button" aria-label={`Edit ${clip.name}`} onClick={onEdit}><Icon name="MoreHorizontal" size={20} /></button></span>
    </div>
    <button className="card-play-area" onClick={onPlay} aria-label={`${active ? 'Stop' : 'Play'} ${clip.name}`} aria-pressed={Boolean(active)}>
      <div className="card-name"><h3 title={clip.name}>{clip.name}</h3><span>{clip.category} <span className="middle-dot">·</span> {formatDuration(analysis?.duration ?? clip.duration)}</span></div>
      <Waveform peaks={analysis?.peaks} progress={progress} active={Boolean(active)} />
      <span className="card-bottom"><span className={`shortcut ${shortcut ? '' : 'no-shortcut'}`}>{shortcut ? <><span>CTRL</span><span>ALT</span><kbd>{shortcut}</kbd></> : clip.source === 'starter' ? 'ORIGINAL SAMPLE' : 'LOCAL AUDIO'}</span>
        <span className="play-circle"><Icon name={active ? 'Square' : 'Play'} size={14} /></span></span>
    </button>
    {clip.loop && <span className="loop-indicator" title="Loop enabled">LOOP</span>}
  </article>;
}
