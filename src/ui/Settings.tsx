import { useStore } from '../store';
import { QUALITIES, type Quality } from '../prefs';
import { WEATHER_LABEL, WEATHER_MODES, type WeatherMode } from '../weather';
import { SEASON_LABEL, SEASON_MODES, type SeasonMode } from '../season';
import { sfx } from '../audio';
import { takePhoto } from '../photo';
import { pipSupported, togglePip } from '../pip';
import { CONTEXT_WINDOWS, type ContextWindowPref } from '../context';
import { useProgress } from '../progress';
import { Dialog } from './Dialog';
import { Icon } from './Icon';
import { ConnectPhone, onPhone } from './ConnectPhone';

const QUALITY_TEXT: Record<Quality, string> = {
  low: 'Plain and light: no glow, dust, rain or snow. Best for old laptops.',
  medium: 'Soft shadows, lamp glow, dust in the sunbeams, rain and snow.',
  high: 'Medium plus a sharper picture (up to 2× resolution) and denser rain and snow.',
};

const WEATHER_TEXT = (m: WeatherMode) => (m === 'auto' ? 'Auto' : WEATHER_LABEL[m]);
const SEASON_TEXT = (m: SeasonMode) => (m === 'auto' ? 'Auto' : m === 'off' ? 'Off' : SEASON_LABEL[m]);

function Segmented<T extends string>({ value, options, label, onChange }: { value: T; options: readonly T[]; label: (v: T) => string; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="radiogroup">
      {options.map((o) => (
        <button key={o} type="button" role="radio" aria-checked={o === value} className={o === value ? 'on' : ''} onClick={() => onChange(o)}>
          {label(o)}
        </button>
      ))}
    </div>
  );
}

/** "on" or "off", always as wide as the wider of the two: a button that grows when it is switched could wrap the row and make the dialog jump. */
function OnOff({ on }: { on: boolean }) {
  return (
    <span className="onoff">
      <span className={on ? '' : 'onoff-hide'}>on</span>
      <span className={on ? 'onoff-hide' : ''}>off</span>
    </span>
  );
}

export function SettingsDialog() {
  const show = useStore((s) => s.showSettings);
  const setShow = useStore((s) => s.setShowSettings);
  const quality = useStore((s) => s.quality);
  const setQuality = useStore((s) => s.setQuality);
  const weatherMode = useStore((s) => s.weatherMode);
  const weather = useStore((s) => s.weather);
  const setWeatherMode = useStore((s) => s.setWeatherMode);
  const seasonMode = useStore((s) => s.seasonMode);
  const season = useStore((s) => s.season);
  const setSeasonMode = useStore((s) => s.setSeasonMode);
  const muted = useStore((s) => s.muted);
  const setMuted = useStore((s) => s.setMuted);
  const musicOn = useStore((s) => s.musicOn);
  const setMusicOn = useStore((s) => s.setMusicOn);
  const setCinema = useStore((s) => s.setCinema);
  const contextWindow = useStore((s) => s.contextWindow);
  const setContextWindow = useStore((s) => s.setContextWindow);
  const setShowNames = useStore((s) => s.setShowNames);
  const resetView = useStore((s) => s.resetView);
  if (!show) return null;
  const close = () => setShow(false);
  return (
    <Dialog backdrop="modal" card="modal-card modal-settings" label="Settings" onClose={close}>
      <button className="panel-close" onClick={close} aria-label="Close" title="Close (Esc)"><Icon name="x" size={16} /></button>
      <h2><Icon name="settings" size={22} /> Settings</h2>

      <h3>Graphics</h3>
      <Segmented value={quality} options={QUALITIES} label={(q) => q[0].toUpperCase() + q.slice(1)} onChange={setQuality} />
      <p className="muted">{QUALITY_TEXT[quality]}</p>

      <h3>Weather outside</h3>
      <Segmented value={weatherMode} options={WEATHER_MODES} label={WEATHER_TEXT} onChange={setWeatherMode} />
      <p className="muted">{weatherMode === 'auto' ? `Auto picks the weather from the date and the hour – right now: ${WEATHER_LABEL[weather].toLowerCase()}.` : 'The weather stays as you set it.'} (W cycles it)</p>

      <h3>Decorations</h3>
      <Segmented value={seasonMode} options={SEASON_MODES} label={SEASON_TEXT} onChange={setSeasonMode} />
      <p className="muted">{seasonMode === 'auto' ? (season === 'none' ? 'Auto decorates the rooms for Halloween, Christmas and Tết when they are near – nothing is on right now.' : `Auto: it is ${SEASON_LABEL[season]} time.`) : 'Decorations stay as you set them.'}</p>

      <h3>Sound</h3>
      <div className="set-row">
        <button type="button" className={`btn${muted ? '' : ' btn-on'}`} aria-pressed={!muted} onClick={() => { setMuted(!muted); if (muted) window.setTimeout(() => sfx('ding'), 60); }}>
          <Icon name={muted ? 'volume-x' : 'volume'} size={16} /> Sound effects <OnOff on={!muted} />
        </button>
        <button type="button" className={`btn${musicOn ? ' btn-on' : ''}`} aria-pressed={musicOn} onClick={() => setMusicOn(!musicOn)}>
          <Icon name="music" size={16} /> Lo-fi music <OnOff on={musicOn} />
        </button>
      </div>
      <p className="muted">The music is made up on the fly and follows the time of day and the weather. It plays for as long as the page is open (K toggles it).</p>

      <h3>Context window</h3>
      <Segmented value={contextWindow} options={CONTEXT_WINDOWS} label={(w: ContextWindowPref) => (w === 'auto' ? 'Auto' : w.toUpperCase())} onChange={setContextWindow} />
      <p className="muted">The session buttons show how much of the context window is used. The window size comes from the model list (Claude models, Codex's model cache) or from the agent itself (Codex, OpenCode limits). Only for a model nobody lists it is a guess – 200k, or 1M once a session has outgrown that. Pick the size here when that guess is off.</p>

      <h3>People</h3>
      <div className="set-row">
        <button type="button" className="btn" onClick={() => { close(); setShowNames(true); }}>
          <Icon name="users" size={16} /> Names for the director and the staff
        </button>
        <button type="button" className="btn" onClick={() => { close(); useProgress.getState().setOpen(true); }}>
          <Icon name="trophy" size={16} /> Levels and achievements (L)
        </button>
      </div>

      <h3>Show it off</h3>
      {pipSupported() ? null : <p className="muted">The floating window needs Chrome or Edge 116 or newer, on https or localhost.</p>}
      <div className="set-row">
        <button type="button" className="btn" onClick={() => { close(); window.setTimeout(takePhoto, 250); }}>
          <Icon name="camera" size={16} /> Take a photo (P)
        </button>
        <button type="button" className="btn" onClick={() => setCinema(true)}>
          <Icon name="maximize" size={16} /> Screensaver mode (C)
        </button>
        {pipSupported() ? (
          <button type="button" className="btn" onClick={() => { close(); togglePip(); }}>
            <Icon name="pip" size={16} /> Floating window (I)
          </button>
        ) : null}
        <button type="button" className="btn" onClick={() => { close(); resetView(); }}>
          <Icon name="crosshair" size={16} /> Reset camera (R)
        </button>
      </div>

      {onPhone ? null : (
        <>
          <h3>Connect a phone</h3>
          <ConnectPhone />
        </>
      )}
    </Dialog>
  );
}
