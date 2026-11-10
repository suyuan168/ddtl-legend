import {hasMoveInput} from './board-controls.js';
const Q = 65536;

// PlayerView.RunAnimation reads AimPosition - entity position. Motion chooses
// Walk versus Idle independently, even while the player walks away from aim.
export function playerPose(previous, input, clips, now) {
  const {aim, distance = 1, moveX = 0, moveY = 0, boost, pending} = input;
  let x = Math.trunc(Math.cos(aim)*distance*Q);
  let y = Math.trunc(Math.sin(aim)*distance*Q);
  if (input.disableFollowAim) {
    const {skillX = 0, skillY = 0} = input;
    if (Math.round((skillX*skillX + skillY*skillY)*Q) < 0x290 && previous)
      return {...previous, enterBoard:false};
    x = Math.trunc(skillX*Q);
    y = Math.trunc(skillY*Q);
  }
  const direction = Math.atan2(y, x);
  const back = direction >= Math.PI/4 && direction <= Math.PI*3/4;
  const scaleX = x > 0 ? -1 : x < 0 ? 1 : previous?.scaleX ?? 1;
  const moving = hasMoveInput(moveX,moveY);
  const action = pending ? 'Boost_ON' : boost ? 'Boost' : moving ? 'Walk' : 'Idle';
  const pose = (back?'Back_':'Front_') + action;
  let start = now;
  if (previous?.pose === pose) start = previous.start;
  else if (action === 'Walk' && previous?.action === 'Walk') {
    const oldDuration = clips[previous.pose].duration*1000;
    const phase = ((now-previous.start) % oldDuration)/oldDuration;
    start = now - phase*clips[pose].duration*1000;
  }
  return {pose, action, start, back, scaleX, enterBoard:!!pending && previous?.action !== 'Boost_ON'};
}
