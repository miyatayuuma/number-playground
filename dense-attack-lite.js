(()=>{
  const DENSE_AT=850,HUGE_AMMO=700;
  const baseFire=fire;
  const palette=Array.from({length:6},(_,i)=>color(i,6));
  let audio=null;

  function denseMode(){return n>=DENSE_AT&&A.classList.contains('dense-canvas-mode')}
  function tone(freq=560,dur=.04,vol=.006,type='sine'){
    const s=document.querySelector('#cbSfx');if(s&&s.classList.contains('off'))return;
    const C=window.AudioContext||window.webkitAudioContext;if(!C)return;
    if(!audio)audio=new C();if(audio.state==='suspended')audio.resume().catch(()=>{});
    const t=audio.currentTime,o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.value=freq;
    g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(vol,t+.006);g.gain.exponentialRampToValueAtTime(.0001,t+dur);
    o.connect(g).connect(audio.destination);o.start(t);o.stop(t+dur+.02)
  }
  function drawSurvivors(core,ar,survivors){
    if(!core)return;const x=core.getContext('2d',{alpha:true,desynchronized:true});if(!x)return;
    x.clearRect(0,0,ar.width,ar.height);
    for(let b=0;b<6;b++){
      x.fillStyle=palette[b];
      for(const d of survivors){if(d.bucket!==b)continue;const z=Math.max(.9,d.z||1.4);x.fillRect(d.x,d.y,z,z)}
    }
  }
  function makeAttackCanvas(){
    const c=document.createElement('canvas'),w=Math.max(1,innerWidth|0),h=Math.max(1,innerHeight|0);
    c.className='dense-attack-canvas';c.width=w;c.height=h;c.style.width='100vw';c.style.height='100vh';document.body.appendChild(c);
    return{c,x:c.getContext('2d',{alpha:true,desynchronized:true}),w,h}
  }

  fire=async function(f){
    if(!denseMode())return baseFire(f);
    const rows=n/f,ammoCount=n-rows;if(ammoCount<HUGE_AMMO)return baseFire(f);
    const keep=f===2?0:Math.floor(f/2),ammo=[],survivors=[];
    for(let r=0;r<rows;r++){
      const base=r*f;let sx=0,sy=0;
      for(let c=0;c<f;c++){const d=dots[base+c];sx+=d.x;sy+=d.y;if(c!==keep)ammo.push(d)}
      const kd=dots[base+keep];kd.x=sx/f;kd.y=sy/f;survivors.push(kd)
    }

    const ar=A.getBoundingClientRect(),er=E.getBoundingClientRect(),tx=er.left+er.width/2,ty=er.top+er.height*.52;
    for(const d of ammo)d.hidden=true;
    drawSurvivors(A.querySelector('.dense-core-canvas'),ar,survivors);

    msg('CHARGE','y');await sl(170);msg('FIRE!','y');tone(340,.055,.007);
    const layer=makeAttackCanvas(),waveCount=ammoCount>1500?44:ammoCount>1000?40:34,total=780,step=total/waveCount,life=118,
          waves=Array.from({length:waveCount},()=>Array.from({length:6},()=>[]));
    for(let i=0;i<ammo.length;i++){
      const d=ammo[i],wave=(i*37)%waveCount,sx=ar.left+d.x+(d.z||1.4)/2,sy=ar.top+d.y+(d.z||1.4)/2,
            h=((i*1103515245+12345)>>>0),jx=((h&255)/255-.5)*18,jy=(((h>>>8)&255)/255-.5)*14,
            q={sx,sy,tx:tx+jx,ty:ty+jy,mx:sx+(tx-sx)*.52+(((h>>>16)&255)/255-.5)*22,my:sy+(ty-sy)*.45-20,z:Math.max(1.05,(d.z||1.4)*.9)};
      waves[wave][d.bucket??0].push(q)
    }

    const start=performance.now(),end=total+life+35;let lastPaint=0,finished=false;
    for(let i=1;i<=8;i++)setTimeout(()=>tone(720+i*28,.022,.0038),i*(total/8));
    await new Promise(resolve=>{
      const finish=()=>{if(finished)return;finished=true;resolve()};
      const watchdog=setTimeout(finish,end+500);
      const frame=t=>{
        if(finished)return;const elapsed=t-start;
        if(elapsed-lastPaint<28){requestAnimationFrame(frame);return}
        lastPaint=elapsed;layer.x.clearRect(0,0,layer.w,layer.h);
        const first=Math.max(0,Math.floor((elapsed-life)/step)),last=Math.min(waveCount-1,Math.floor(elapsed/step));
        for(let w=first;w<=last;w++){
          const u=Math.max(0,Math.min(1,(elapsed-w*step)/life));if(u<=0||u>=1)continue;const v=1-u,alpha=Math.min(1,u*6,(1-u)*7);
          layer.x.globalAlpha=alpha;
          for(let b=0;b<6;b++){
            const list=waves[w][b];if(!list.length)continue;layer.x.fillStyle=palette[b];
            for(const q of list){const x=v*v*q.sx+2*v*u*q.mx+u*u*q.tx,y=v*v*q.sy+2*v*u*q.my+u*u*q.ty,s=q.z*(1-u*.42);layer.x.fillRect(x-s/2,y-s/2,s,s)}
          }
        }
        layer.x.globalAlpha=1;
        if(elapsed<end)requestAnimationFrame(frame);else{clearTimeout(watchdog);finish()}
      };
      requestAnimationFrame(frame)
    });
    layer.c.remove();tone(110,.13,.026,'square');react('hit');shake('impact');flash('g');parts(Math.min(14,7+(ammoCount/180|0)));breakSh();
    return rows
  };
})();
