import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioEngine, type ActiveClip, type ClipAnalysis } from '../audio/AudioEngine';
import { restoreRouting } from '../audio/restoreRouting';
import { syncMicrophone } from '../audio/syncMicrophone';
import type { Clip, LibraryState, Settings } from '../types';

export function useSoundboard() {
  const [library, setLibrary] = useState<LibraryState>();
  const [active, setActive] = useState<ActiveClip[]>([]);
  const [analysis, setAnalysis] = useState<Record<string, ClipAnalysis>>({});
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [micActive, setMicActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [routingBusy, setRoutingBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [clock, setClock] = useState(0);
  const [level, setLevel] = useState(0);
  const engine = useRef<AudioEngine | null>(null);
  const current = useRef(library);
  current.current = library;
  const report = useCallback((error: unknown) => setError(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : 'Something went wrong. Please try again.'), []);

  const refreshDevices = useCallback(async () => {
    const found = await navigator.mediaDevices.enumerateDevices();
    setDevices(found);
    return found;
  }, []);

  useEffect(() => {
    const audio = new AudioEngine();
    engine.current = audio;
    audio.onChange = setActive;
    audio.onMicrophoneEnded = () => setMicActive(false);
    audio.onDeviceError = (message, route) => {
      setError(message);
      const settings = current.current?.settings;
      if (!settings) return;
      const next = { ...settings, [route === 'cable' ? 'cableEnabled' : 'monitorEnabled']: false };
      setLibrary(previous => previous && ({ ...previous, settings: next }));
      window.clipify.saveSettings(next).catch(report);
    };
    let mounted = true;
    setRoutingBusy(true);
    window.clipify.load().then(async data => {
      if (!mounted) return;
      const restored = await restoreRouting(data.settings, settings => audio.configure(settings));
      const safe = { ...data, settings: restored.settings };
      if (mounted && restored.message) setError(restored.message);
      if (mounted) await window.clipify.saveSettings(safe.settings).catch(report);
      if (mounted) setLibrary(safe);
      if (mounted) {
        await syncMicrophone(safe.settings, audio);
        if (mounted) setMicActive(audio.microphoneActive);
      }
    }).catch(report).finally(() => { if (mounted) setRoutingBusy(false); });
    refreshDevices().catch(report);
    const unsubscribe = window.clipify.onHotkey(id => {
      if (id === '__stop__') { audio.stopAll(); return; }
      const clip = current.current?.clips.find(clip => clip.id === id);
      if (clip) audio.play(clip).catch(report);
    });
    const deviceChanged = async () => {
      try {
        const found = await refreshDevices();
        const settings = current.current?.settings;
        if (!settings) return;
        const has = (id: string, kind: MediaDeviceKind) => id === 'default' || found.some(d => d.deviceId === id && d.kind === kind);
        if (settings.cableEnabled && !has(settings.cableId, 'audiooutput')) {
          audio.stopMicrophone();
          const next = { ...settings, cableEnabled: false };
          await audio.configure(next);
          setLibrary(data => data && ({ ...data, settings: next }));
          setError('Virtual cable disconnected. Routing and microphone mixing have been stopped.');
        }
        if (!has(settings.speakerId, 'audiooutput')) { audio.stopAll(); setError('Your speaker disconnected. Select an available output.'); }
      } catch (error) { report(error); }
    };
    navigator.mediaDevices.addEventListener('devicechange', deviceChanged);
    const timer = window.setInterval(() => {
      if (!mounted) return;
      setClock(audio.currentTime); setLevel(audio.getLevel());
    }, 70);
    return () => {
      mounted = false; unsubscribe(); clearInterval(timer);
      navigator.mediaDevices.removeEventListener('devicechange', deviceChanged);
      audio.onChange = () => {}; audio.onMicrophoneEnded = () => {};
      audio.dispose().catch(() => {});
    };
  }, [refreshDevices, report]);

  // Decode in the background, one clip at a time, so imported waveforms are real.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      for (const clip of library?.clips ?? []) {
        if (cancelled || analysis[clip.id]) continue;
        try {
          const metadata = await engine.current!.analyse(clip.id);
          if (!cancelled) setAnalysis(previous => ({ ...previous, [clip.id]: metadata }));
        } catch { /* Playback reports an actionable error if this file cannot be decoded. */ }
      }
    };
    run();
    return () => { cancelled = true; };
    // Only membership changes should schedule background analysis.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [library?.clips.map(clip => clip.id).join(',')]);

  const play = useCallback((clip: Clip) => { engine.current?.play(clip).catch(report); }, [report]);
  const stopAll = useCallback(() => { engine.current?.stopAll(); }, []);

  async function importSounds() {
    setBusy(true);
    try {
      const result = await window.clipify.importSounds();
      const before = current.current?.clips.length ?? 0;
      setLibrary(previous => ({ ...result.library, unavailableShortcuts: previous?.unavailableShortcuts, settings: previous?.settings ?? result.library.settings }));
      if (result.errors.length) setError(result.errors.join('\n'));
      const count = result.library.clips.length - before;
      if (count > 0) setNotice(`${count} sound${count === 1 ? '' : 's'} added to your library.`);
    } catch (error) { report(error); } finally { setBusy(false); }
  }

  async function updateClip(clip: Clip) {
    const result = await window.clipify.updateClip(clip);
    setLibrary(previous => ({ ...result, settings: previous?.settings ?? result.settings }));
    engine.current?.updateClip(clip);
  }
  async function removeClip(id: string) {
    engine.current?.stop(id);
    const result = await window.clipify.removeClip(id);
    setLibrary(previous => ({ ...result, settings: previous?.settings ?? result.settings }));
    setNotice('Sound removed from the library. Your original file is unchanged.');
  }
  async function updateSettings(patch: Partial<Settings>) {
    if (!current.current || routingBusy) return;
    const next = { ...current.current.settings, ...patch };
    setRoutingBusy(true);
    try {
      await engine.current!.configure(next);
      await window.clipify.saveSettings(next);
      setLibrary(previous => previous && ({ ...previous, settings: next }));
      await syncMicrophone(next, engine.current!).catch(report);
      setMicActive(engine.current!.microphoneActive);
    } catch (error) {
      const safe = { ...current.current.settings, cableEnabled: false };
      await engine.current!.configure(safe).catch(() => {});
      setLibrary(previous => previous && ({ ...previous, settings: safe }));
      report(error);
    } finally { setRoutingBusy(false); }
  }
  async function enableDeviceAccess() {
    setRoutingBusy(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      stream.getTracks().forEach(track => track.stop());
      await refreshDevices();
      setNotice(engine.current?.microphoneActive ? 'Audio devices refreshed. Your microphone is still live.' : 'Audio devices refreshed. Microphone capture is off.');
    } catch (error) { report(error); } finally { setRoutingBusy(false); }
  }
  async function toggleMicrophone() {
    await updateSettings({ microphoneEnabled: !micActive });
  }
  return { library, active, analysis, devices, micActive, busy, routingBusy, error, notice, clock, level,
    setError, setNotice, report, play, stopAll, importSounds, updateClip, removeClip, updateSettings, enableDeviceAccess, toggleMicrophone };
}
export type Soundboard = ReturnType<typeof useSoundboard>;
