import { useState } from 'react';
import { CATEGORIES, COLORS, formatHotkey, type Clip } from '../types';
import { Modal } from './Modal';
import { Icon } from './Icon';

export function ClipEditor({ clip, onSave, onRemove, onClose }: {
  clip: Clip; onSave(clip: Clip): Promise<void>; onRemove(id: string): Promise<void>; onClose(): void;
}) {
  const [draft, setDraft] = useState(clip);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(remove = false) {
    setBusy(true); setError('');
    try { if (remove) await onRemove(clip.id); else await onSave(draft); onClose(); }
    catch (error) { setError(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : 'Unable to save the sound.'); }
    finally { setBusy(false); }
  }
  return <Modal title={confirmRemove ? 'Remove this sound?' : 'Make it yours.'} subtitle={confirmRemove ? 'The sound leaves your library. Your original audio file stays untouched.' : 'A little fine-tuning for the perfect cue.'} onClose={onClose}>
    {confirmRemove ? <><div className={`remove-preview ${clip.color}`}><Icon name="AudioLines" size={26} /><strong>{clip.name}</strong></div><div className="modal-actions"><button className="button secondary" onClick={() => setConfirmRemove(false)}>Keep sound</button><button className="button danger" disabled={busy} onClick={() => submit(true)}>Remove sound</button></div></> :
      <form onSubmit={event => { event.preventDefault(); submit(); }}>
        <label className="field">Sound name<input autoFocus required maxLength={80} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
        <div className="form-columns"><label className="field">Collection<select value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value as Clip['category'] })}>{CATEGORIES.map(category => <option key={category}>{category}</option>)}</select></label>
          <label className="field">Global shortcut<select value={draft.hotkey} onChange={e => setDraft({ ...draft, hotkey: e.target.value })}><option value="">No shortcut</option>{'123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(key => <option value={`CommandOrControl+Alt+${key}`} key={key}>{formatHotkey(`CommandOrControl+Alt+${key}`)}</option>)}</select></label></div>
        <fieldset className="color-field"><legend>Card color</legend><div className="color-options">{COLORS.map(color => <button type="button" key={color} className={`color-option ${color}`} aria-label={color} aria-pressed={draft.color === color} onClick={() => setDraft({ ...draft, color })}>{draft.color === color && <Icon name="Check" />}</button>)}</div></fieldset>
        <label className="field range-label">Clip volume <span>{Math.round(draft.volume * 100)}%</span><input aria-label="Clip volume" type="range" min="0" max="1" step="0.01" value={draft.volume} onChange={e => setDraft({ ...draft, volume: +e.target.value })} /></label>
        <label className="check-field"><input type="checkbox" checked={draft.loop} onChange={e => setDraft({ ...draft, loop: e.target.checked })} /><span><strong>Loop this sound</strong><small>Keep playing until you stop it.</small></span></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions"><button type="button" className="text-button remove-button" disabled={busy} onClick={() => setConfirmRemove(true)}><Icon name="Trash2" size={16} />Remove</button><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button></div>
      </form>}
    {confirmRemove && error && <p className="form-error" role="alert">{error}</p>}
  </Modal>;
}
