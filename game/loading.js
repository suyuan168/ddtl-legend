import {message} from './entry-language.js';

const dawn = document.querySelector('#dawn');
const loader = document.querySelector('#load');
const meter = document.querySelector('#load-meter');
const number = document.querySelector('#load-number');
const label = document.querySelector('#load-label');
const retry = document.querySelector('#load-retry');

export function setLoadingProgress(fraction) {
  const percent = Math.round(Math.max(0, Math.min(1, fraction)) * 100);
  meter.setAttribute('aria-valuenow', String(percent));
  meter.style.setProperty('--progress', percent + '%');
  number.textContent = percent + '%';
}

export function showLoading(mode) {
  dawn.hidden = false;
  loader.hidden = false;
  document.querySelector('#home').hidden = true;
  loader.dataset.mode = mode;
  retry.hidden = true;
  meter.hidden = false;
  label.textContent = message(mode === 'scene' ? 'scene' : 'loading');
  meter.setAttribute('aria-label', label.textContent);
  if (mode === 'scene') {
    number.textContent = '';
    meter.removeAttribute('aria-valuenow');
  } else {
    setLoadingProgress(0);
  }
}

export function hideLoading() {
  loader.hidden = true;
  dawn.hidden = true;
}

export function showLoadingFailure(error) {
  showLoading('error');
  label.textContent = error;
  meter.hidden = true;
  number.textContent = '';
  retry.hidden = false;
  retry.textContent = message('retry');
  retry.onclick = () => {
    const url = new URL(location.href);
    if (!['park','match','weapon','costume','catalog','yard'].includes(url.searchParams.get('view'))) url.searchParams.set('view','yard');
    location.replace(url.href);
  };
}
