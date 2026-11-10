import {existsSync} from 'node:fs';
import {chromium} from 'playwright-core';

export function launchBrowser(options = {}) {
  if (process.env.CHROME_PATH) {
    return chromium.launch({...options, executablePath: process.env.CHROME_PATH});
  }
  if (existsSync(chromium.executablePath())) {
    return chromium.launch({...options, executablePath: chromium.executablePath()});
  }
  return chromium.launch({...options, channel: 'chrome'});
}
