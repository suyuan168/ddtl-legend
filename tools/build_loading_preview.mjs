import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';

const root=new URL('../',import.meta.url);
const chrome=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
  const page=await chrome.newPage({viewport:{width:1920,height:1080},reducedMotion:'reduce'});
  const contentTypes={html:'text/html',js:'text/javascript',css:'text/css',webp:'image/webp',ttf:'font/ttf',png:'image/png'};
  await page.route('http://title.invalid/**',async route=>{
    const path=new URL(route.request().url()).pathname.slice(1)||'index.html';
    await route.fulfill({contentType:contentTypes[path.split('.').pop()],body:await readFile(new URL(path,root))});
  });
  await page.goto('http://title.invalid/');
  const logo=await page.evaluate(async()=>{
    const {drawWordmark}=await import('/tools/brand/wordmark.js');
    return (await drawWordmark()).toDataURL('image/png').split(',')[1];
  });
  await writeFile(new URL('assets/brand/dawn-logo.png',root),Buffer.from(logo,'base64'));
  await page.reload();
  await page.locator('body[data-screen=title] .dawn-logo').evaluate(img=>img.decode());
  const png=await page.screenshot();
  const frame=await page.evaluate(async data=>{
    const image=new Image();image.src='data:image/png;base64,'+data;await image.decode();
    const canvas=document.createElement('canvas');
    canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
    canvas.getContext('2d').drawImage(image,0,0);
    return canvas.toDataURL('image/webp',.86).split(',')[1];
  },png.toString('base64'));
  await writeFile(new URL('assets/brand/title-first-frame.webp',root),Buffer.from(frame,'base64'));
}finally{await chrome.close();}
