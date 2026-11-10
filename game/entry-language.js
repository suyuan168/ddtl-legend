let locale = 'zh-cn';
export function chooseLocale(value) { if (Object.hasOwn(labels, value)) locale = value; }

const keys = ['play','settings','quit','master','music','sfx','mute','tips','language','leave','back','ended','returnHome','askExit','loading','scene','retry','close','menu'];
const labels = {
  'zh-cn':['开始游戏','设置','退出','总音量','音乐','音效','静音','玩法提示','语言','退出游戏','返回','已退出游戏','返回标题','退出游戏？','正在载入','进入场景','重新加载','关闭','主菜单'],
  'zh-tw':['開始遊戲','設定','離開','總音量','音樂','音效','靜音','遊戲提示','語言','離開遊戲','返回','已離開遊戲','返回標題','離開遊戲？','正在載入','進入場景','重新載入','關閉','主選單'],
  en:['Play','Settings','Quit','Master volume','Music','Sound effects','Mute','Game tips','Language','Quit game','Back','Game closed','Back to title','Quit the game?','Loading','Entering scene','Retry','Close','Main menu'],
  ja:['ゲーム開始','設定','終了','全体音量','音楽','効果音','消音','ゲームヒント','言語','ゲーム終了','戻る','ゲームを終了しました','タイトルに戻る','ゲームを終了しますか？','読み込み中','シーンに移動中','再読み込み','閉じる','メインメニュー'],
  ko:['게임 시작','설정','종료','전체 음량','음악','효과음','음소거','게임 도움말','언어','게임 종료','뒤로','게임을 종료했습니다','타이틀로','게임을 종료할까요?','불러오는 중','장면 입장 중','다시 시도','닫기','주 메뉴']
};
export const message = key => labels[locale][keys.indexOf(key)];
