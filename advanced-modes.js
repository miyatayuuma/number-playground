(()=>{
  const style=document.createElement('style');
  style.textContent=`
.ez.blitz-rage .pips i{position:relative;overflow:hidden;background:#28354b!important;box-shadow:none!important}.ez.blitz-rage .pips i:after{content:"";position:absolute;inset:0;background:var(--r);transform:scaleX(var(--fill,0));transform-origin:left center;transition:transform .18s linear;box-shadow:0 0 9px #ff526080}.ez.blitz-rage.r4 .pips i:after{box-shadow:0 0 13px #ff5260cc}.ez.blitz-rage.r4 .rage{animation:blitzPulse .55s ease-in-out infinite alternate}@keyframes blitzPulse{to{box-shadow:0 0 18px #ff526055;border-color:#ff707988}}
`;
  document.head.appendChild(style);

  const recent={expert:[],blitz:[]},lastType={expert:'',blitz:''};
  function factorList(x){const a=[];let y=x;for(let p=2;p*p<=y;p++)while(y%p===0){a.push(p);y/=p}if(y>1)a.push(y);return a}
  function buildPools(lo,hi,which){
    const p={prime:[],semiprime:[],square:[],multi:[],small:[]},minComposite=which==='expert'?120:300;
    for(let x=lo;x<=hi;x++){
      if(prime(x)){if((which==='expert'&&x>=101)||(which==='blitz'&&x>=211))p.prime.push(x);continue}
      if(x<minComposite)continue;
      const f=factorList(x),smallest=f[0],rows=x/smallest,maxRows=which==='expert'?120:145;
      if(rows>maxRows)continue;
      if(f.length===2&&f[0]===f[1]){if(smallest>=11)p.square.push(x);continue}
      if(f.length===2){if(smallest>=(which==='expert'?11:13))p.semiprime.push(x);continue}
      p.multi.push(x);
      if(smallest<=7&&f[f.length-1]>=11)p.small.push(x)
    }
    return p
  }
  const pools={expert:buildPools(101,999,'expert'),blitz:buildPools(211,1999,'blitz')};
  const weights={expert:{prime:20,semiprime:35,square:12,multi:20,small:13},blitz:{prime:18,semiprime:42,square:10,multi:18,small:12}};
  function weightedType(which){
    const entries=Object.entries(weights[which]).filter(([t])=>pools[which][t].length&&t!==lastType[which]);
    const src=entries.length?entries:Object.entries(weights[which]).filter(([t])=>pools[which][t].length),sum=src.reduce((s,[,w])=>s+w,0);let r=Math.random()*sum;
    for(const[t,w]of src){r-=w;if(r<=0)return t}return src[0][0]
  }
  function pickProblem(which){
    const type=weightedType(which),blocked=new Set(recent[which]),pool=pools[which][type],available=pool.filter(x=>!blocked.has(x)),src=available.length?available:pool,x=src[Math.random()*src.length|0];
    recent[which].push(x);if(recent[which].length>10)recent[which].shift();lastType[which]=type;return x
  }
  const baseNewN=newN;
  newN=function(){if(mode==='expert')return pickProblem('expert');if(mode==='blitz')return pickProblem('blitz');return baseNewN()};

  function blitzProgress(){return Math.max(0,Math.min(1,1-blitzTime/60))}
  const baseRageFx=rageFx;
  rageFx=function(){
    if(mode!=='blitz')return baseRageFx();
    const p=blitzProgress(),level=p<=0?0:Math.min(4,Math.ceil(p*4));rage=Math.min(4,Math.floor(p*4+1e-7));E.style.setProperty('--s',String(1+.34*p));EZ.className='ez blitz-rage'+(level?` r${level}`:'');
    [...$('#pips').children].forEach((el,i)=>{el.classList.remove('on');el.style.setProperty('--fill',String(Math.max(0,Math.min(1,p*4-i))))})
  };
  function syncBlitzHud(){if(mode!=='blitz')return;$('#tm').textContent=Math.max(0,blitzTime).toFixed(1);timerStat.classList.toggle('danger',blitzTime<=10);rageFx()}
  function blitzOver(){if(done)return;blitzTime=0;rage=4;syncBlitzHud();msg('RAGE MAX!','r');gameOver('OVERRUN!',`SCORE ${score} · STAGE ${stage}`)}

  tickTimer=function(t){
    if(mode!=='blitz'){timerLast=t;return}
    if(!timerLast)timerLast=t;const dt=(t-timerLast)/1000;timerLast=t;
    if(!busy&&!done&&!document.querySelector('.layer.show')){blitzTime=Math.max(0,blitzTime-dt);syncBlitzHud();if(blitzTime<=0)blitzOver()}
  };

  const baseRageUp=rageUp;
  rageUp=async function(){
    if(mode!=='blitz')return baseRageUp();
    blitzTime=Math.max(0,blitzTime-15);syncBlitzHud();msg(blitzTime<=0?'RAGE MAX!':'RAGE SPIKE!','r');await sl(520);await counter();
    if(blitzTime<=0){blitzOver();return 0}return 1
  };

  const baseStart=start;
  start=function(x=null,same=0){if(mode==='blitz'){blitzTime=60;timerLast=0;rage=0}const r=baseStart(x,same);if(mode==='blitz')syncBlitzHud();return r};

  let perfAudio=null;
  function soundOn(){const b=document.querySelector('#cbSfx');return !b||!b.classList.contains('off')}
  function impactTone(strong=false){
    if(!soundOn())return;const C=window.AudioContext||window.webkitAudioContext;if(!C)return;if(!perfAudio)perfAudio=new C();if(perfAudio.state==='suspended')perfAudio.resume().catch(()=>{});const t=perfAudio.currentTime,o=perfAudio.createOscillator(),g=perfAudio.createGain();o.type=strong?'square':'sine';o.frequency.value=strong?110:900+Math.random()*300;g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(strong?.035:.007,t+.007);g.gain.exponentialRampToValueAtTime(.0001,t+(strong?.16:.03));o.connect(g).connect(perfAudio.destination);o.start(t);o.stop(t+(strong?.18:.045))
  }
  const baseFire=fire;
  fire=async function(f){
    if(n<=520)return baseFire(f);
    const rows=n/f,keep=f===2?0:Math.floor(f/2),ammo=[];
    for(let r=0;r<rows;r++){
      const base=r*f,k=base+keep,group=dots.slice(base,base+f),cx=group.reduce((s,d)=>s+d.x,0)/group.length,cy=group.reduce((s,d)=>s+d.y,0)/group.length,kd=dots[k];kd.el.classList.add('keep');pos(kd,cx,cy,1);for(let c=0;c<f;c++)if(c!==keep)ammo.push(dots[base+c])
    }
    shuf(ammo);const total=Math.min(1500,700+ammo.length*.8),tail=Math.min(5,ammo.length),soundStride=Math.max(1,Math.ceil(ammo.length/36)),er=E.getBoundingClientRect(),tx=er.left+er.width/2,ty=er.top+er.height*.5;
    msg('CHARGE','y');await sl(260);msg('FIRE!','y');await sl(70);const t0=performance.now(),tasks=ammo.map((d,i)=>(async()=>{
      const head=Math.max(1,ammo.length-tail),at=i<head?(i/head)*(total-tail*105):total-(ammo.length-i)*105,wait=at-(performance.now()-t0);if(wait>0)await sl(wait);const sr=d.el.getBoundingClientRect(),sx=sr.left+sr.width/2,sy=sr.top+sr.height/2,dx=tx-sx+(Math.random()-.5)*18,dy=ty-sy+(Math.random()-.5)*16;
      d.el.classList.add('launching');d.el.style.position='fixed';d.el.style.left=sr.left+'px';d.el.style.top=sr.top+'px';d.el.style.transform='none';d.el.style.zIndex='9300';document.body.appendChild(d.el);
      await d.el.animate([{transform:'translate(0,0) scale(.8)',opacity:1},{transform:`translate(${dx*.52+(Math.random()-.5)*28}px,${dy*.48-18}px) scale(1.05)`,opacity:1,offset:.5},{transform:`translate(${dx}px,${dy}px) scale(.15)`,opacity:0}],{duration:360+Math.random()*120,easing:'cubic-bezier(.2,.72,.24,1)',fill:'forwards'}).finished.catch(()=>{});d.el.style.opacity='0';
      if(i%soundStride===0||i===ammo.length-1)impactTone(i===ammo.length-1)
    })());
    await Promise.all(tasks);impactTone(true);react('hit');shake('impact');flash('g');parts(Math.min(24,10+(ammo.length/80|0)));breakSh();return rows
  };

  let moveFrame=0,moveLast=0;
  move=function(t){
    tickTimer(t);const frameDt=Math.min(34,t-(moveLast||t));moveLast=t;moveFrame++;
    if(!busy&&!done){
      const{w,h}=sz(),stride=n>1500?4:n>950?3:n>600?2:1,phase=moveFrame%stride,dt=frameDt*stride;
      for(let i=phase;i<dots.length;i+=stride){
        const d=dots[i];d.p+=dt*.0012;d.vx+=Math.cos(d.p)*.0007;d.vy+=Math.sin(d.p*1.19)*.0007;let q=Math.hypot(d.vx,d.vy)||1;if(q>.085)d.vx=d.vx/q*.085,d.vy=d.vy/q*.085;d.x+=d.vx*dt;d.y+=d.vy*dt;
        if(d.x<7)d.x=7,d.vx=Math.abs(d.vx);if(d.x>w-d.z-7)d.x=w-d.z-7,d.vx=-Math.abs(d.vx);if(d.y<7)d.y=7,d.vy=Math.abs(d.vy);if(d.y>h-d.z-7)d.y=h-d.z-7,d.vy=-Math.abs(d.vy);d.el.style.transform=`translate3d(${d.x}px,${d.y}px,0)`
      }
    }
    requestAnimationFrame(move)
  };

  if(mode==='blitz')syncBlitzHud();
})();