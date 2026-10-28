import { useEffect, useState } from 'react';
import type { Soundboard } from '../hooks/useSoundboard';
import { Icon } from './Icon';

export function Toggle({ checked, onChange, label, disabled = false }: { checked: boolean; onChange(): void; label: string; disabled?: boolean }) {
  return <button className={`toggle ${checked ? 'on' : ''}`} role="switch" aria-checked={checked} aria-label={label} onClick={onChange} disabled={disabled}><span /></button>;
}
export function RoutingPanel({ board, onGuide }: { board: Soundboard; onGuide(): void }) {
  const settings = board.library?.settings;
  if (!settings) return <aside className="routing-panel" />;
  const outputs = board.devices.filter(device => device.kind === 'audiooutput' && device.deviceId !== 'communications' && device.deviceId !== 'default');
  const inputs = board.devices.filter(device => device.kind === 'audioinput' && device.deviceId !== 'communications' && device.deviceId !== 'default');
  const hasLabels = board.devices.some(device => Boolean(device.label));
  const hasCable = outputs.some(device => /cable|voicemeeter|virtual/i.test(device.label));
  const disabled = board.routingBusy;
  return <aside className="routing-panel" aria-label="Audio routing">
    <div className="panel-heading"><h2>Audio routing</h2><button className="icon-button" aria-label="Audio routing help" onClick={onGuide}><Icon name="CircleHelp" size={17} /></button></div>
    <div className="signal-path"><span className="signal-source"><Icon name="AudioLines" size={22} /></span><span className="signal-dashes" /><span className="signal-target"><Icon name="Headphones" size={19} /><Icon name="Mic" size={19} /></span></div>
    <p className="routing-intro">One sound. Both places.</p>
    <section className="route-section">
      <div className="route-title"><span><Icon name="Headphones" />Your speakers</span><Toggle checked={settings.monitorEnabled} onChange={() => board.updateSettings({ monitorEnabled: !settings.monitorEnabled })} label="Speaker monitoring" disabled={disabled} /></div>
      <label className="device-label" htmlFor="speaker-device">OUTPUT DEVICE</label>
      <select id="speaker-device" value={settings.speakerId} disabled={disabled} onChange={e => board.updateSettings({ speakerId: e.target.value })}>
        <option value="default">System default</option>{outputs.map((device, i) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Output ${i + 1}`}</option>)}
        {settings.speakerId !== 'default' && !outputs.some(device => device.deviceId === settings.speakerId) && <option value={settings.speakerId}>Unavailable device</option>}
      </select>
      <Volume label="Speaker volume" value={settings.speakerVolume} disabled={disabled} onChange={speakerVolume => board.updateSettings({ speakerVolume })} />
      <div className={`route-state ${settings.monitorEnabled ? 'connected' : ''}`}><span />{settings.monitorEnabled ? 'Monitor enabled' : 'Monitor muted'}</div>
    </section>
    <section className="route-section">
      <div className="route-title"><span><Icon name="Cable" />Virtual microphone</span><Toggle checked={settings.cableEnabled} onChange={() => board.updateSettings({ cableEnabled: !settings.cableEnabled })} label="Virtual microphone routing" disabled={disabled || !settings.cableId} /></div>
      <label className="device-label" htmlFor="cable-device">VIRTUAL CABLE OUTPUT</label>
      <select id="cable-device" value={settings.cableId} disabled={disabled} onChange={e => board.updateSettings({ cableId: e.target.value, cableEnabled: false })}>
        <option value="">Select a virtual cable…</option>{outputs.map((device, i) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Output ${i + 1}`}</option>)}
        {settings.cableId && !outputs.some(device => device.deviceId === settings.cableId) && <option value={settings.cableId}>Unavailable cable</option>}
      </select>
      <Volume label="Virtual microphone volume" value={settings.cableVolume} disabled={disabled} onChange={cableVolume => board.updateSettings({ cableVolume })} />
      <div className={`route-state ${settings.cableEnabled ? 'connected' : 'pending'}`}><span />{settings.cableEnabled ? 'Sending to virtual cable' : hasCable ? 'Ready to configure' : 'Virtual cable setup needed'}</div>
    </section>
    <section className="route-section microphone-section">
      <div className="route-title"><span><Icon name={board.micActive ? 'Mic' : 'MicOff'} />Mix in your voice</span><Toggle checked={board.micActive} onChange={board.toggleMicrophone} label="Mix physical microphone into virtual cable" disabled={disabled || !settings.cableEnabled} /></div>
      <p>Add your voice to the same virtual mic. You won’t hear it in your speakers.</p>
      <label className="device-label" htmlFor="microphone-device">PHYSICAL MICROPHONE</label>
      <select id="microphone-device" value={settings.microphoneId} disabled={disabled} onChange={e => board.updateSettings({ microphoneId: e.target.value })}>
        <option value="default">System default microphone</option>{inputs.map((device, i) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Microphone ${i + 1}`}</option>)}
        {settings.microphoneId !== 'default' && !inputs.some(device => device.deviceId === settings.microphoneId) && <option value={settings.microphoneId}>Unavailable microphone</option>}
      </select>
      {board.micActive && <Volume label="Voice volume" value={settings.microphoneVolume} disabled={disabled} onChange={microphoneVolume => board.updateSettings({ microphoneVolume })} />}
      <div className={`route-state ${board.micActive ? 'connected' : ''}`}><span />{board.micActive ? 'Microphone live' : 'Microphone capture off'}</div>
    </section>
    <button className="device-refresh text-button" onClick={board.enableDeviceAccess} disabled={disabled}><Icon name="RefreshCw" size={14} className={disabled ? 'spin' : ''} />{hasLabels ? 'Refresh audio devices' : 'Enable audio device access'}</button>
    <button className="setup-card" onClick={onGuide}><span className="setup-icon"><Icon name="SlidersHorizontal" size={19} /></span><span><strong>Let’s get you connected</strong><small>A quick guide to virtual audio</small></span><Icon name="ChevronRight" size={15} /></button>
    <div className="local-note"><Icon name="ShieldCheck" size={13} /><span>Your audio stays on this device.</span></div>
  </aside>;
}

function Volume({ label, value, onChange, disabled }: { label: string; value: number; onChange(value: number): void; disabled?: boolean }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  function commit(next: number) { if (next !== value) onChange(next); }
  return <div className="volume-control"><Icon name="Volume2" size={15} /><input type="range" aria-label={label} min="0" max="1" step="0.01" value={draft} disabled={disabled} onChange={e => setDraft(+e.target.value)} onPointerUp={e => commit(+e.currentTarget.value)} onKeyUp={e => commit(+e.currentTarget.value)} onBlur={e => commit(+e.currentTarget.value)} /><output>{Math.round(draft * 100)}<span>%</span></output></div>;
}
