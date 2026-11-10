// RoomServiceBase.CreateEnterRoomArgument (0x9eaab0) stores UTC DateTime ticks modulo Int32.MaxValue.
export function roomSeedFromUtc(milliseconds=Date.now()){
  const ticksSinceYearOne=621355968000000000n+BigInt(milliseconds)*10000n;
  return Number(ticksSinceYearOne%2147483647n);
}
// Quantum RNGSession::.ctor (43c5f20) expands a signed seed with SplitMix64.
// NextUInt32 (43c5a50) is PCG-XSH-RR. Spray and escape read its high 16 bits.
export function quantumRandom(seed){
  const mask=0xffffffffffffffffn;
  let mixed=BigInt(seed|0);
  function split(){
    mixed=(mixed+0x9e3779b97f4a7c15n)&mask;
    let n=((mixed^(mixed>>30n))*0xbf58476d1ce4e5b9n)&mask;
    n=((n^(n>>27n))*0x94d049bb133111ebn)&mask;
    return n^(n>>31n);
  }
  let state=split();
  const increment=split()|1n;
  function nextUInt32(){
    const old=state;
    state=(old*0x5851f42d4c957f2dn+increment)&mask;
    const word=Number(((old>>45n)^(old>>27n))&0xffffffffn),rotation=Number(old>>59n);
    return ((word>>>rotation)|(word<<(-rotation&31)))>>>0;
  }
  // RNGSession.Next(Int32,Int32), RVA 0x43c5ba0, draws from [low, high).
  function nextInt(a,b){
    if(a===b)return a;
    const low=Math.min(a,b),bound=Math.abs(a-b);
    const threshold=((-bound)>>>0)%bound;
    let word;
    do{word=nextUInt32();}while(word<threshold);
    return low+word%bound;
  }
  // RNGSession.Next(FP,FP), RVA 0x43c5b30, uses the upper 16 bits even when the endpoints coincide.
  function nextFixedRaw(a,b){
    const low=BigInt(Math.min(a,b)),high=BigInt(Math.max(a,b));
    const numerator=BigInt(nextUInt32()>>>16);
    return Number(low+((high-low)*numerator>>16n));
  }
  return {nextUInt32,nextInt,nextFixedRaw,fraction:()=>(nextUInt32()>>>16)/65536};
}
