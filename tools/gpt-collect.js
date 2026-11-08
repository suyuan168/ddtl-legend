// 收图（Edge 用）：在一个新开的 https://chatgpt.com/robots.txt 页面里执行，把出图页存进 IndexedDB 的图打包成一个 ddbundle_*.json 下载，然后清空。
// 每个新页面只能自动下载一次，所以每次收图都新开一个标签页、收完关掉。本地用 unbundle 脚本把包拆回一张张 PNG。
(async () => {
  const db = await new Promise((ok, no) => { const r = indexedDB.open('ddart', 1); r.onupgradeneeded = () => r.result.createObjectStore('p'); r.onsuccess = () => ok(r.result); r.onerror = no; });
  const all = await new Promise((ok) => { const out = {}; const c = db.transaction('p', 'readonly').objectStore('p').openCursor(); c.onsuccess = () => { const cur = c.result; if (cur) { out[cur.key] = cur.value; cur.continue(); } else ok(out); }; });
  const names = Object.keys(all); if (!names.length) return '没有新图';
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(all)], { type: 'application/json' })); a.download = 'ddbundle_' + Date.now() + '.json'; document.body.appendChild(a); a.click(); a.remove();
  await new Promise((ok) => { const tx = db.transaction('p', 'readwrite'); tx.objectStore('p').clear(); tx.oncomplete = ok; });
  return names.join(',');
})();
