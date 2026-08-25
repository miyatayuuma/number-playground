(()=>{
  const DENSE_AT=850,RECOVERY_SECONDS=15;
  const baseGood=good;
  const palette=Array.from({length:6},(_,i)=>color(i,6));

  function denseMode(){return n>=DENSE_AT&&A.classList.contains('dense-canvas-mode')}
  function updateBlitzReward(){
    if(mode!=='blitz')return;
    blitzTime=Math.min(60,blitzTime+RECOVERY_SECONDS);
    rageFx();
    const timer=document.querySelector('#tm');if(timer)timer.textContent=blitzTime.toFixed(1);
    timerStat?.classList.toggle('danger',blitzTime<=10)
  }
  async function releaseCanvasSurvivors(survivors){
    const c=A.querySelector('.dense-core-canvas');if(!c||!survivors.length)return;
    const x=c.getContext('2d',{alpha:true,desynchronized:true});if(!x)return;
    const r=A.getBoundingClientRect(),w=r.width||600,h=r.height||282,
          starts=survivors.map(d=>[d.x,d.y]),pad=12,
          z=Math.max(1.15,Math.min(2.65,Math.sqrt((w*h)/Math.max(1,survivors.length))*.30)),
          targets=survivors.map(()=>[pad+Math.random()*Math.max(1,w-pad*2-z),pad+Math.random()*Math.max(1,h-pad*2-z)]),
          duration=survivors.length>600?240:320,t0=performance.now();
    await new Promise(resolve=>{
      const frame=t=>{
        const p=Math.min(1,(t-t0)/duration),e=1-Math.pow(1-p,3);x.clearRect(0,0,w,h);
        for(let b=0;b<6;b++){
          x.fillStyle=palette[b];
          for(let i=0;i<survivors.length;i++){
            const d=survivors[i];if((d.bucket??0)!==b)continue;const s=starts[i],q=targets[i],px=s[0]+(q[0]-s[0])*e,py=s[1]+(q[1]-s[1])*e;
            x.fillRect(px,py,z,z)
          }
        }
        if(p<1)requestAnimationFrame(frame);else resolve()
      };
      requestAnimationFrame(frame)
    })
  }

  good=async function(f){
    if(!denseMode())return baseGood(f);
    const oldN=n,rows=await fire(f);msg('BREAK!','y');await sl(180);
    const keep=f===2?0:Math.floor(f/2),survivors=[];
    for(let i=0;i<oldN;i++)if(i%f===keep)survivors.push(dots[i]);
    fac.push(f);score+=20;n=rows;updateBlitzReward();hud();
    await releaseCanvasSurvivors(survivors);
    dots=[];slots=[];make();A.classList.remove('ok');busy=0;renderControls();msg('READY')
  };
})();
