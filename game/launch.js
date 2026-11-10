import {mountEntry} from './entry.js';
import {language, setLanguage} from './language.js';
import {showLoading, showLoadingFailure} from './loading.js';

const volume = {master:100, music:100, sfx:100};
try {
  const stored = JSON.parse(localStorage.getItem('chill-volume') || '{}');
  for (const key of Object.keys(volume)) {
    if (Number.isFinite(stored[key])) volume[key] = Math.max(0,Math.min(100,stored[key]));
  }
} catch {}
const prefs = {
  get language() { return language; },
  volume, mute:localStorage.getItem('chill-mute') === '1', tips:localStorage.getItem('chill-game-tips') !== 'off',
  setLanguage,
  setVolume(key,value) { volume[key] = value; localStorage.setItem('chill-volume', JSON.stringify(volume)); },
  setMute(value) { localStorage.setItem('chill-mute', value ? '1' : '0'); },
  setTips(value) { localStorage.setItem('chill-game-tips', value ? 'on' : 'off'); }
};
const query = new URLSearchParams(location.search);
const view = query.get('view');
const practiceViews = ['yard','park','match','weapon','costume','catalog'];
let started = false;
function enterPractice() {
  if (started) return;
  started = true;
  showLoading('boot');
  document.body.dataset.screen = 'loading';
  import('./practice-entry.js').then(module => module.startPractice()).catch(e => showLoadingFailure(e.message));
}
const home = mountEntry(prefs, enterPractice);
if (practiceViews.includes(view)) {
  enterPractice();
} else {
  document.body.dataset.screen = 'title';
  if (view === 'settings') home.openSettings();
}
