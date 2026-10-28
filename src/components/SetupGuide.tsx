import { Modal } from './Modal';
import { Icon } from './Icon';

export function SetupGuide({ onClose, onError }: { onClose(): void; onError(error: unknown): void }) {
  return <Modal title="Your sound, through your mic." subtitle="Connect Clipify to Discord, games, calls, and more." onClose={onClose} wide>
    <div className="guide-flow"><span><Icon name="AudioLines" />Clipify + your voice</span><Icon name="ArrowRight" /><span><Icon name="Cable" />Virtual cable</span><Icon name="ArrowRight" /><span><Icon name="Mic" />Your chat app</span></div>
    <ol className="guide-steps">
      <li><span>01</span><div><h3>Install a virtual audio cable</h3><p>VB-CABLE creates a playback device and a recording device. Install it from its official website and restart Windows if requested.</p><button className="text-button accent-text" onClick={() => window.clipify.openCableGuide().catch(onError)}>Open VB-CABLE website <Icon name="ArrowRight" size={15} /></button></div></li>
      <li><span>02</span><div><h3>Choose your two outputs</h3><p>In Audio routing, select your actual headphones or speakers. For Virtual microphone, choose <strong>CABLE Input (VB-Audio Virtual Cable)</strong>, then enable its switch.</p></div></li>
      <li><span>03</span><div><h3>Connect your chat app</h3><p>In Discord, your game, or your call app, set the microphone input to <strong>CABLE Output (VB-Audio Virtual Cable)</strong>. Keep that app’s speakers set to your physical headphones.</p></div></li>
      <li><span>04</span><div><h3>Bring your voice along</h3><p>Select your physical microphone in Clipify and enable <strong>Mix in your voice</strong>. Pick a physical mic rather than CABLE Output to avoid a feedback loop.</p></div></li>
    </ol>
    <div className="guide-note"><Icon name="Headphones" size={19} /><p>Headphones give the cleanest result. In voice apps, aggressive noise suppression may filter sound effects; adjust it there if needed.</p></div>
    <div className="modal-actions"><button className="button primary" onClick={onClose}>Got it. Let’s make some noise.</button></div>
  </Modal>;
}
