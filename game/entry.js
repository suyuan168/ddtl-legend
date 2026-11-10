import {mountHorizon} from './dawn-art.js';
import {chooseLocale, message} from './entry-language.js';

export function mountEntry(preferences, start) {
  const get = selector => document.querySelector(selector);
  const home = get('#home');
  const dialog = get('#entry-dialog');
  const rest = get('#rest');
  let panelKey = 'settings';
  mountHorizon(get('.dawn-art'));
  function localize() {
    chooseLocale(preferences.language);
    document.documentElement.lang = preferences.language;
    for (const node of document.querySelectorAll('[data-label]')) node.textContent = message(node.dataset.label);
    get('#dialog-title').textContent = message(panelKey);
    get('.dawn-close').setAttribute('aria-label',message('close'));
    get('.dawn-actions').setAttribute('aria-label',message('menu'));
  }
  function openPanel(settings) {
    panelKey = settings ? 'settings' : 'askExit';
    get('#volume-panel').hidden = !settings;
    get('#exit-panel').hidden = settings;
    get('#dialog-title').textContent = message(panelKey);
    dialog.showModal();
    if (!settings) get('#stay').focus();
  }
  for (const key of ['master', 'music', 'sfx']) {
    const slider = get('#volume-' + key);
    const value = get('output[for="volume-' + key + '"]');
    value.value = slider.value = preferences.volume[key];
    slider.oninput = () => {
      value.value = slider.value;
      preferences.setVolume(key, Number(slider.value));
    };
  }
  get('#muted').checked = preferences.mute;
  get('#tips').checked = preferences.tips;
  get('#entry-language').value = preferences.language;
  get('#muted').onchange = e => preferences.setMute(e.target.checked);
  get('#tips').onchange = e => preferences.setTips(e.target.checked);
  get('#entry-language').onchange = e => { preferences.setLanguage(e.target.value); localize(); };
  get('#preferences').onclick = () => openPanel(true);
  get('#exit').onclick = () => openPanel(false);
  get('#stay').onclick = () => dialog.close();
  get('#leave').onclick = () => {
    dialog.close();
    if (window.opener) window.close();
    home.hidden = true;
    rest.hidden = false;
    get('#restart').focus();
  };
  get('#restart').onclick = () => {
    rest.hidden = true;
    home.hidden = false;
    get('#enter').focus();
  };
  get('#enter').onclick = start;
  localize();
  return {openSettings:() => openPanel(true)};
}
