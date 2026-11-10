function loadFile(path, stylesheet = false) {
  return new Promise((resolve, reject) => {
    const tag = document.createElement(stylesheet ? 'link' : 'script');
    if (stylesheet) {
      tag.rel = 'stylesheet';
      tag.href = path;
    } else {
      tag.src = path;
    }
    tag.onload = resolve;
    tag.onerror = () => reject(new Error('加载失败：' + path));
    document.head.append(tag);
  });
}
export async function startPractice() {
  document.body.append(document.querySelector('#game-shell').content.cloneNode(true));
  await Promise.all([
    loadFile('game/style.css', true),
    loadFile('game/vendor/colyseus.js'),
    loadFile('game/vendor/phaser.min.js'),
  ]);
  await import('./main.js');
}
