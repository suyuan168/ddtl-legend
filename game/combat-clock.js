// SessionConfig.UpdateFPS; DeterministicSession.get_DeltaTimeDouble (0x43aebc0)
// schedules each frame at 1/FPS. get_DeltaTime (0x43aebf0) uses integer division.
export const COMBAT_HZ=60;
export const FRAME_SECONDS=1/COMBAT_HZ;
export const FRAME_RAW=Math.trunc(65536/COMBAT_HZ);
export const SIMULATION_DELTA=FRAME_RAW/65536;

export class CombatClock{
  constructor(){this.frame=0;this.pendingSeconds=0;}
  advance(seconds,step){
    if(!Number.isFinite(seconds)||seconds<=0)return;
    this.pendingSeconds+=seconds;
    // AccumulateTime (0x43aefe0) and StepFrameNumber (0x43b17e0) use doubles,
    // compare against a complete wall-time period and subtract it once per tick.
    while(this.pendingSeconds>=FRAME_SECONDS){
      this.pendingSeconds-=FRAME_SECONDS;
      step(SIMULATION_DELTA,++this.frame);
    }
  }
}
