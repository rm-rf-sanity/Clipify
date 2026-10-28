import { useEffect, useRef, useState } from 'react';
import { useSoundboard } from './hooks/useSoundboard';
import { CATEGORIES, type Category, type Clip } from './types';
import { ClipEditor } from './components/ClipEditor';
import { Icon, type IconName } from './components/Icon';
import { RoutingPanel, Toggle } from './components/RoutingPanel';
import { SetupGuide } from './components/SetupGuide';
import { SoundCard } from './components/SoundCard';
import { Transport } from './components/Transport';

type View = 'all' | 'favorites' | 'settings';
const collectionIcons: Record<Category, IconName> = { Essentials: 'Radio', Reactions: 'Sparkles', Music: 'Music2', Effects: 'Zap' };

export function App() {
  const board = useSoundboard();
  const [view, setView] = useState<View>('all');
  const [category, setCategory] = useState<Category | 'All sounds'>('All sounds');
  const [search, setSearch] = useState('');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [sort, setSort] = useState('custom');
  const [editing, setEditing] = useState<Clip>();
  const [guide, setGuide] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const { setError, setNotice } = board;
  useEffect(() => {
    if (!board.notice) return;
    const timer = setTimeout(() => setNotice(''), 4500);
    return () => clearTimeout(timer);
  }, [board.notice, setNotice]);
  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !document.querySelector('dialog[open]')) { event.preventDefault(); searchRef.current?.focus(); }
      if (event.key === 'Escape' && !document.querySelector('dialog[open]')) board.stopAll();
    }
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [board.stopAll]);
  const clips = board.library?.clips ?? [];
  const visible = clips.filter(clip => (view !== 'favorites' || clip.favorite) && (category === 'All sounds' || clip.category === category) && clip.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  if (sort === 'name') visible.sort((a, b) => a.name.localeCompare(b.name));
  if (sort === 'newest') visible.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  const title = view === 'favorites' ? 'The crowd favorites.' : category !== 'All sounds' ? `${category}. On cue.` : 'Your sound. On cue.';
  const titleParts = title.split('On cue.');
  const cableEnabled = board.library?.settings.cableEnabled;
  const shortcutIssues = board.library?.unavailableShortcuts ?? [];

  function navigate(next: View) { setView(next); setCategory('All sounds'); setSearch(''); }
  return <div className="app">
    <header className="titlebar"><div className="titlebar-brand"><span className="mini-mark"><Icon name="AudioLines" size={14} /></span><span>Clipify</span></div><span className="titlebar-center">A little sound goes a long way.</span><div className="window-controls"><button onClick={() => window.clipify.windowControl('minimize')} aria-label="Minimize"><Icon name="Minus" size={14} /></button><button onClick={() => window.clipify.windowControl('maximize')} aria-label="Maximize or restore"><Icon name="Maximize2" size={12} /></button><button className="close-window" onClick={() => window.clipify.windowControl('close')} aria-label="Close Clipify"><Icon name="X" size={15} /></button></div></header>
    <div className="shell">
      <aside className="sidebar">
        <a href="#main" className="skip-link">Skip to soundboard</a>
        <div className="brand"><span className="brand-mark"><Icon name="AudioLines" size={28} /></span><span>clipify<span className="brand-period">.</span></span></div>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <nav aria-label="Main navigation"><button className={`nav-item ${view === 'all' ? 'active' : ''}`} onClick={() => navigate('all')} aria-current={view === 'all' ? 'page' : undefined}><Icon name="LayoutGrid" />Soundboard<span className="nav-count">{clips.length}</span></button><button className={`nav-item ${view === 'favorites' ? 'active' : ''}`} onClick={() => navigate('favorites')} aria-current={view === 'favorites' ? 'page' : undefined}><Icon name="Heart" />Favorites<span className="nav-count">{clips.filter(clip => clip.favorite).length}</span></button></nav>
        <div className="collection-heading">COLLECTIONS<span>{CATEGORIES.length}</span></div>
        <nav className="collection-nav" aria-label="Collections">{CATEGORIES.map(item => <button key={item} className={`nav-item collection ${category === item && view === 'all' ? 'current' : ''}`} onClick={() => { setView('all'); setCategory(item); setSearch(''); }}><Icon name={collectionIcons[item]} size={17} /><span>{item}</span><span className="collection-count">{clips.filter(clip => clip.category === item).length}</span></button>)}</nav>
        <div className="sidebar-bottom"><div className="sidebar-tip"><span className="tip-icon"><Icon name="Command" size={19} /></span><strong>Always within reach.</strong><p>Trigger sounds anywhere with global shortcuts.</p><span className="tip-keys"><kbd>Ctrl</kbd><span>+</span><kbd>Alt</kbd><span>+</span><kbd>1–9</kbd></span></div><button className={`nav-item ${view === 'settings' ? 'active' : ''}`} onClick={() => navigate('settings')}><Icon name="Settings2" />Preferences</button><button className="nav-item" onClick={() => setGuide(true)}><Icon name="CircleHelp" />Quick setup<Icon name="ArrowRight" size={14} /></button><div className="sidebar-footer"><span className="online-dot" />LOCAL & PERSONAL<span>v0.2.0</span></div></div>
      </aside>
      <main id="main" className="main-content" tabIndex={-1}>
        <div className="workspace-topline"><span>WORKSPACE <Icon name="ChevronRight" size={12} /> {view === 'settings' ? 'PREFERENCES' : 'MY SOUNDBOARD'}</span><span className="offline-badge"><span />All yours. All offline.</span></div>
        <div className="page-heading"><div><h1>{view === 'settings' ? 'Fine-tune your flow.' : <>{titleParts[0]}{titleParts.length > 1 && <span>On cue.</span>}</>}</h1><p>{view === 'settings' ? 'Small details. A soundboard that feels like you.' : 'For the reactions, the punchlines, and everything in between.'}</p></div>{view !== 'settings' && <button className="button primary import-button" onClick={board.importSounds} disabled={board.busy || !board.library}><Icon name={board.busy ? 'LoaderCircle' : 'Plus'} size={17} className={board.busy ? 'spin' : ''} />{board.busy ? 'Adding…' : 'Add sounds'}</button>}</div>
        {board.error && <div className="error-banner" role="alert"><Icon name="CircleHelp" size={18} /><span>{board.error}</span><button className="icon-button" aria-label="Dismiss error" onClick={() => setError('')}><Icon name="X" size={15} /></button></div>}
        {view === 'settings' ? <div className="preferences">
          <section className="preference-card"><span className="eyebrow">PLAYBACK</span><h2>Room for more than one.</h2><div className="preference-row"><div><strong>Allow overlapping sounds</strong><p>Layer multiple clips. Turn this off to play one sound at a time.</p></div><Toggle checked={Boolean(board.library?.settings.overlap)} onChange={() => board.updateSettings({ overlap: !board.library?.settings.overlap })} label="Allow overlapping sounds" disabled={board.routingBusy || !board.library} /></div></section>
          <section className="preference-card"><span className="eyebrow">KEYBOARD SHORTCUTS</span><h2>Don’t miss your moment.</h2><p>Shortcuts work even when Clipify is in the background.</p><div className="shortcut-row"><span>Play or stop an assigned sound</span><kbd>Ctrl + Alt + 1–9 / A–Z</kbd></div><div className="shortcut-row"><span>Stop every playing sound</span><kbd>Ctrl + Alt + Space</kbd></div><div className="shortcut-row"><span>Search this library</span><kbd>Ctrl + K</kbd></div><div className="shortcut-row"><span>Stop sounds while Clipify is focused</span><kbd>Esc</kbd></div><p className="preference-note">Use a sound’s edit menu to assign a shortcut.</p>{shortcutIssues.length > 0 && <p className="form-error">Unavailable shortcuts: {shortcutIssues.join(', ')}. Another app may be using them.</p>}</section>
          <section className="preference-card"><span className="eyebrow">LOCAL BY DESIGN</span><h2>Your library lives with you.</h2><p>Audio files are copied into Clipify’s private library. No accounts, uploads, tracking, or cloud services. Removing a sound never deletes the original file.</p><p className="preference-note">Windows data folder: %APPDATA%\Clipify. Output devices, volumes, routing, and voice mixing are remembered. Voice mixing starts automatically when enabled and a virtual cable is connected.</p></section>
        </div> : <>
          <div className="session-banner"><span className="session-icon"><Icon name="Waves" size={28} /></span><div><span className="eyebrow">YOUR PERSONAL SOUND SPACE</span><strong>Good timing. Great sound.</strong><p>{cableEnabled ? 'Your sounds are connected to your speakers and virtual mic.' : 'Your speakers are ready. Connect a virtual mic to share the moment.'}</p></div><button className={`connection-pill ${cableEnabled ? 'connected' : ''}`} onClick={() => setGuide(true)}><span />{cableEnabled ? 'Dual output on' : 'Set up virtual mic'}<Icon name="ArrowRight" size={13} /></button></div>
          <div className="library-toolbar"><div className="filter-tabs" aria-label="Sound filters"><button className={category === 'All sounds' ? 'selected' : ''} onClick={() => setCategory('All sounds')}>All sounds <span>{view === 'favorites' ? clips.filter(clip => clip.favorite).length : clips.length}</span></button>{CATEGORIES.map(item => <button className={category === item ? 'selected' : ''} key={item} onClick={() => setCategory(item)}>{item}</button>)}</div><div className="view-switch" aria-label="Library view"><button className={layout === 'grid' ? 'selected' : ''} aria-label="Grid view" aria-pressed={layout === 'grid'} onClick={() => setLayout('grid')}><Icon name="LayoutGrid" size={16} /></button><button className={layout === 'list' ? 'selected' : ''} aria-label="List view" aria-pressed={layout === 'list'} onClick={() => setLayout('list')}><Icon name="List" size={17} /></button></div></div>
          <div className="search-row"><label className="search-field"><Icon name="Search" size={17} /><input ref={searchRef} aria-label="Search sounds" placeholder="Find your next cue…" value={search} onChange={e => setSearch(e.target.value)} /><kbd>Ctrl K</kbd></label><label className="sort-field"><Icon name="SlidersHorizontal" size={15} /><select aria-label="Sort sounds" value={sort} onChange={e => setSort(e.target.value)}><option value="custom">Library order</option><option value="name">Name A–Z</option><option value="newest">Newest first</option></select></label></div>
          {!board.library ? <div className="empty-state"><Icon name={board.error ? 'CircleHelp' : 'LoaderCircle'} size={30} className={board.error ? '' : 'spin'} /><h2>{board.error ? 'We couldn’t open your library.' : 'Getting your sounds ready…'}</h2></div> : visible.length === 0 ? <div className="empty-state"><span className="empty-icon"><Icon name={search ? 'Search' : view === 'favorites' ? 'Heart' : 'AudioLines'} size={32} /></span><h2>{search ? 'No sounds by that name.' : view === 'favorites' ? 'Your favorites start here.' : 'Make room for your sound.'}</h2><p>{search ? 'Try another search or choose a different collection.' : view === 'favorites' ? 'Tap the heart on any sound to keep it close.' : 'Add your first audio file and give the moment a soundtrack.'}</p><button className="button secondary" onClick={() => { if (search) setSearch(''); else if (view === 'favorites') navigate('all'); else board.importSounds(); }}>{search ? 'Clear search' : view === 'favorites' ? 'Explore sounds' : 'Add sounds'}</button></div> : <div className={`sound-grid ${layout === 'list' ? 'list-layout' : ''}`}>{visible.map(clip => <SoundCard key={clip.id} clip={clip} analysis={board.analysis[clip.id]} active={board.active.find(active => active.id === clip.id)} clock={board.clock} onPlay={() => board.play(clip)} onEdit={() => setEditing(clip)} onFavorite={() => board.updateClip({ ...clip, favorite: !clip.favorite }).catch(board.report)} list={layout === 'list'} />)}<button className={`add-card ${layout === 'list' ? 'list-add' : ''}`} onClick={board.importSounds} disabled={board.busy}><span><Icon name="Plus" size={22} /></span><strong>A new sound, a new possibility.</strong><small>Add an audio file <Icon name="ArrowRight" size={13} /></small></button></div>}
          <div className="library-footnote"><span><Icon name="Folder" size={13} />{visible.length} sound{visible.length === 1 ? '' : 's'} in this view</span><span>MP3, WAV, OGG, FLAC & more <span className="middle-dot">·</span> Up to 30 MB / 5 min</span></div>
          <p className="starter-note"><Icon name="Sparkles" size={13} />A few original starter sounds, made for your first click. Add your own to make it Clipify.</p>
        </>}
      </main>
      <RoutingPanel board={board} onGuide={() => setGuide(true)} />
      <Transport board={board} />
    </div>
    {board.notice && <div className="toast" role="status"><span><Icon name="Check" size={15} /></span>{board.notice}<button className="icon-button" aria-label="Dismiss notification" onClick={() => setNotice('')}><Icon name="X" size={14} /></button></div>}
    {editing && <ClipEditor clip={editing} onSave={board.updateClip} onRemove={board.removeClip} onClose={() => setEditing(undefined)} />}
    {guide && <SetupGuide onClose={() => setGuide(false)} onError={board.report} />}
  </div>;
}
