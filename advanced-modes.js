(()=>{
  const style=document.createElement('style');
  style.textContent=`
.ez.blitz-rage .pips i{position:relative;overflow:hidden;background:#28354b!important;box-shadow:none!important}.ez.blitz-rage .pips i:after{content:"";position:absolute;inset:0;background:var(--r);transform:scaleX(var(--fill,0));transform-origin:left center;transition:transform .18s linear;box-shadow:0 0 9px #ff526080}.ez.blitz-rage.r4 .pips i:after{box-shadow:0 0 13px #ff5260cc}.ez.blitz-rage.r4 .rage{animation:blitzPulse .55s ease-in-out infinite alternate}@keyframes blitzPulse{to{box-shadow:0 0 18px #ff526055;border-color:#ff707988}}
.dot{will-change:auto!important}.dot.release,.dot.launching{will-change:transform,opacity!important}.arena.perf-dense .dot{box-shadow:0 0 3px currentColor!important}.arena.perf-ultra .dot{box-shadow:0 0 1.3px currentColor!important}
.mass-attack-layer{position:fixed;inset:0;z-index:9290;pointer-events:none;overflow:hidden;contain:layout paint style}.mass-attack-layer .mass-attack-dot{position:absolute!important;margin:0!important;transition:none!important;box-shadow:none!important;filter:none!important;will-change:transform,opacity!important;animation:massShot var(--dur) cubic-bezier(.2,.72,.24,1) var(--delay) both}@keyframes massShot{0%{transform:translate3d(0,0,0) scale(.78);opacity:1}52%{transform:translate3d(var(--mx),var(--my),0) scale(1.04);opacity:1}100%{transform:translate3d(var(--dx),var(--dy),0) scale(.14);opacity:0}}
.perf-seed-flight{position:fixed!important;z-index:10030!important;animation:seedFlight 470ms cubic-bezier(.2,.8,.25,1) var(--delay,0ms) both;will-change:transform,opacity!important}@keyframes seedFlight{0%{transform:translate3d(0,0,0) scale(1);opacity:1}52%{transform:translate3d(var(--mx),var(--my),0) scale(1.14);opacity:1}100%{transform:translate3d(var(--dx),var(--dy),0) scale(1);opacity:1}}
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
      const isSmall=smallest<=7&&f[f.length-1]>=11;p[isSmall?'small':'multi'].push(x)
    }
    return p
  }
  const pools={expert:buildPools(101,999,'expert'),blitz:buildPools(211,1999,'blitz')};
  const weights={expert:{prime:20,semiprime:35,square:12,multi:20,small:13},blitz:{prime:18,semiprime:42,square:10,multi:18,small:12}};
  function weightedType(which){const entries=Object.entries(weights[which]).filter(([t])=>pools[which][t].length&&t!==lastType[which]),src=entries.length?entries:Object.entries(weights[which]).filter(([t])=>pools[which][t].length),sum=src.reduce((s,[,w])=>s+w,0);let r=Math.random()*sum;for(const[t,w]of src){r-=w;if(r<=0)return t}return src[0][0]}
  function pickProblem(which){const type=weightedType(which),blocked=new Set(recent[which]),pool=pools[which][type],available=pool.filter(x=>!blocked.has(x)),src=available.length?available:pool,x=src[Math.random()*src.length|0];recent[which].push(x);if(recent[which].length>10)recent[which].shift();lastType[which]=type;return x}
  const baseNewN=newN;newN=function(){if(mode==='expert')return pickProblem('expert');if(mode==='blitz')return pickProblem('blitz');return baseNewN()};

  let densityBucket=-1,moveSize={w:600,h:282};
  function syncDensity(force=0){const b=n>1100?2:n>600?1:0;if(!force&&b===densityBucket)return;densityBucket=b;A.classList.toggle('perf-dense',b>=1);A.classList.toggle('perf-ultra',b>=2)}
  function refreshMoveSize(){const r=A.getBoundingClientRect();moveSize={w:r.width||600,h:r.height||282}}
  refreshMoveSize();if(window.ResizeObserver)new ResizeObserver(refreshMoveSize).observe(A);else window.addEventListener('resize',refreshMoveSize,{passive:true});

  make=function(){
    A.replaceChildren();dots=[];slots=[];syncDensity(1);refreshMoveSize();
    const z=baseD(),{w,h}=moveSize,p=18,maxX=Math.max(1,w-p*2-z),maxY=Math.max(1,h-p*2-z),frag=document.createDocumentFragment(),arr=new Array(n),gl=Math.max(2.2,z*.72);
    for(let i=0;i<n;i++){
      const e=document.createElement('i'),x=p+Math.random()*maxX,y=p+Math.random()*maxY,a=Math.random()*6.2831853,v=.03+Math.random()*.045,d={el:e,x,y,z,vx:Math.cos(a)*v,vy:Math.sin(a)*v,p:Math.random()*6.2831853,turn:(Math.random()*4)|0};
      e.className='dot';e.style.color=color(i,n);e.style.setProperty('--d',z+'px');e.style.setProperty('--gl',gl+'px');e.style.transform=`translate3d(${x}px,${y}px,0)`;frag.appendChild(e);arr[i]=d
    }
    dots=arr;A.appendChild(frag)
  };

  function blitzProgress(){return Math.max(0,Math.min(1,1-blitzTime/60))}
  const baseRageFx=rageFx;
  rageFx=function(){if(mode!=='blitz')return baseRageFx();const p=blitzProgress(),level=p<=0?0:Math.min(4,Math.ceil(p*4));rage=Math.min(4,Math.floor(p*4+1e-7));E.style.setProperty('--s',String(1+.34*p));EZ.className='ez blitz-rage'+(level?` r${level}`:'');[...$('#pips').children].forEach((el,i)=>{el.classList.remove('on');el.style.setProperty('--fill',String(Math.max(0,Math.min(1,p*4-i))))})};
  let blitzHudAt=0;const winLayer=$('#win'),loseLayer=$('#lose');
  function syncBlitzHud(force=0,t=performance.now()){if(mode!=='blitz')return;if(!force&&t-blitzHudAt<95)return;blitzHudAt=t;$('#tm').textContent=Math.max(0,blitzTime).toFixed(1);timerStat.classList.toggle('danger',blitzTime<=10);rageFx()}
  function blitzOver(){if(done)return;blitzTime=0;rage=4;syncBlitzHud(1);msg('RAGE MAX!','r');gameOver('OVERRUN!',`SCORE ${score} · STAGE ${stage}`)}
  tickTimer=function(t){if(mode!=='blitz'){timerLast=t;return}if(!timerLast)timerLast=t;const dt=(t-timerLast)/1000;timerLast=t;if(!busy&&!done&&!winLayer.classList.contains('show')&&!loseLayer.classList.contains('show')){blitzTime=Math.max(0,blitzTime-dt);if(blitzTime<=0){blitzOver();return}syncBlitzHud(0,t)}};
  const baseRageUp=rageUp;rageUp=async function(){if(mode!=='blitz')return baseRageUp();blitzTime=Math.max(0,blitzTime-15);syncBlitzHud(1);msg(blitzTime<=0?'RAGE MAX!':'RAGE SPIKE!','r');await sl(520);await counter();if(blitzTime<=0){blitzOver();return 0}return 1};
  const baseStart=start;start=function(x=null,same=0){if(mode==='blitz'){blitzTime=60;timerLast=0;rage=0;blitzHudAt=0}const r=baseStart(x,same);syncDensity(1);requestAnimationFrame(refreshMoveSize);if(mode==='blitz')syncBlitzHud(1);return r};

  let perfAudio=null;
  function soundOn(){const b=document.querySelector('#cbSfx');return !b||!b.classList.contains('off')}
  function perfTone(freq=900,dur=.035,vol=.006,type='sine'){if(!soundOn())return;const C=window.AudioContext||window.webkitAudioContext;if(!C)return;if(!perfAudio)perfAudio=new C();if(perfAudio.state==='suspended')perfAudio.resume().catch(()=>{});const t=perfAudio.currentTime,o=perfAudio.createOscillator(),g=perfAudio.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(vol,t+.006);g.gain.exponentialRampToValueAtTime(.0001,t+dur);o.connect(g).connect(perfAudio.destination);o.start(t);o.stop(t+dur+.02)}
  function impactTone(strong=false){perfTone(strong?110:900+Math.random()*300,strong?.16:.03,strong?.035:.007,strong?'square':'sine')}

  const baseArrange=arrange;
  async function fastSeedToGuides(seed,g){
    const wait=Math.max(0,(seed.readyAt||0)-performance.now());if(wait)await sl(wait);
    const cr=seed.card.getBoundingClientRect(),ar=A.getBoundingClientRect(),f=seed.els.length,radius=Math.max(12,Math.min(cr.width,cr.height)/2-10),spacing=2*Math.PI*radius/Math.max(1,f),z0=Math.max(.55,Math.min(4,spacing*.58)),guides=new Array(f),frag=document.createDocumentFragment();
    for(let i=0;i<f;i++){
      const e=seed.els[i],a=-Math.PI/2+i*2*Math.PI/f,sx=cr.left+cr.width/2+Math.cos(a)*radius,sy=cr.top+cr.height/2+Math.sin(a)*radius,tx=ar.left+g.p[i][0]+g.z/2,ty=ar.top+g.p[i][1]+g.z/2,bend=(i-(f-1)/2)*Math.min(4,24/Math.max(1,f));
      e.getAnimations().forEach(a=>a.cancel());e.className='manual-seed-dot perf-seed-flight';e.removeAttribute('style');e.style.width=z0+'px';e.style.height=z0+'px';e.style.left=(sx-z0/2)+'px';e.style.top=(sy-z0/2)+'px';e.style.setProperty('--dx',(tx-sx)+'px');e.style.setProperty('--dy',(ty-sy)+'px');e.style.setProperty('--mx',((tx-sx)*.5+bend)+'px');e.style.setProperty('--my',((ty-sy)*.38-18)+'px');e.style.setProperty('--delay',Math.min(70,i*2)+'ms');frag.appendChild(e)
    }
    document.body.appendChild(frag);seed.card.animate([{opacity:1},{opacity:0}],{duration:170,fill:'forwards'});setTimeout(()=>seed.card.remove(),180);await sl(570);
    for(let i=0;i<f;i++){const e=seed.els[i],gd=Math.max(3,Math.min(10,g.z*.82));e.className='guide-dot';e.removeAttribute('style');e.style.setProperty('--gd',gd+'px');e.style.left=g.p[i][0]+(g.z-gd)/2+'px';e.style.top=g.p[i][1]+(g.z-gd)/2+'px';A.appendChild(e);guides[i]=e}
    return guides
  }
  arrange=async function(f){
    if(n<=700)return baseArrange(f);const seed=window.__coreBreakManualSeed;if(!seed||seed.f!==f)return baseArrange(f);delete window.__coreBreakManualSeed;
    slots.forEach(x=>x.remove());slots=[];dots.forEach(d=>d.el.className='dot');const g=grid(f),guides=await fastSeedToGuides(seed,g),k=n,total=Math.min(2050,1050+k*.55),steps=k>1500?28:k>1000?32:36,batch=Math.ceil(k/steps),pause=total/steps;msg(`${f}-LINE`);await sl(80);
    for(let s=0;s<steps;s++){
      const from=s*batch,to=Math.min(k,from+batch);if(from>=to)break;
      for(let i=from;i<to;i++){
        const d=dots[i];d.z=g.z;d.el.style.setProperty('--d',g.z+'px');d.el.style.setProperty('--gl',Math.max(.8,g.z*.55)+'px');d.el.classList.add('set');pos(d,g.p[i][0],g.p[i][1],1);
        if(i<f&&guides[i]){const q=guides[i];q.classList.add('fill');setTimeout(()=>q.remove(),230)}
        if((i-from)===0&&s%2===0)perfTone(470+Math.min(320,s*9),.025,.0045)
      }
      await sl(pause)
    }
    guides.forEach(q=>{if(q&&q.isConnected){q.classList.add('fill');setTimeout(()=>q.remove(),230)}});await sl(220);return g
  };

  const baseFire=fire;
  fire=async function(f){
    if(n<=520)return baseFire(f);const rows=n/f,keep=f===2?0:Math.floor(f/2),ammo=[];
    for(let r=0;r<rows;r++){
      const base=r*f,k=base+keep;let sx=0,sy=0;for(let c=0;c<f;c++){const d=dots[base+c];sx+=d.x;sy+=d.y;if(c!==keep)ammo.push(d)}const kd=dots[k];pos(kd,sx/f,sy/f,1);kd.el.classList.add('keep')
    }
    shuf(ammo);const ar=A.getBoundingClientRect(),er=E.getBoundingClientRect(),tx=er.left+er.width/2,ty=er.top+er.height*.5,total=Math.min(1250,620+ammo.length*.42),maxDur=430,layer=document.createElement('div'),frag=document.createDocumentFragment();layer.className='mass-attack-layer';
    msg('CHARGE','y');await sl(230);msg('FIRE!','y');await sl(60);
    for(let i=0;i<ammo.length;i++){
      const d=ammo[i],e=d.el,sx=ar.left+d.x,sy=ar.top+d.y,dx=tx-(sx+d.z/2)+(Math.random()-.5)*18,dy=ty-(sy+d.z/2)+(Math.random()-.5)*16,delay=(i/Math.max(1,ammo.length-1))*total,dur=340+Math.random()*90;
      e.className='dot mass-attack-dot';e.style.left=sx+'px';e.style.top=sy+'px';e.style.transform='none';e.style.opacity='1';e.style.setProperty('--dx',dx+'px');e.style.setProperty('--dy',dy+'px');e.style.setProperty('--mx',(dx*.52+(Math.random()-.5)*24)+'px');e.style.setProperty('--my',(dy*.48-17)+'px');e.style.setProperty('--delay',delay+'ms');e.style.setProperty('--dur',dur+'ms');frag.appendChild(e)
    }
    layer.appendChild(frag);document.body.appendChild(layer);const hits=Math.min(18,Math.max(6,Math.ceil(ammo.length/110)));for(let i=1;i<=hits;i++)setTimeout(()=>impactTone(i===hits),70+i*(total/hits),false);await sl(total+maxDur);layer.remove();impactTone(true);react('hit');shake('impact');flash('g');parts(Math.min(18,8+(ammo.length/120|0)));breakSh();return rows
  };

  let moveFrame=0,moveLast=0;
  move=function(t){
    tickTimer(t);const frameDt=Math.min(34,t-(moveLast||t));moveLast=t;moveFrame++;syncDensity();
    if(!busy&&!done){
      const{w,h}=moveSize,stride=n>1600?8:n>1200?6:n>900?5:n>600?3:1,phase=moveFrame%stride,dt=frameDt*stride;
      for(let i=phase;i<dots.length;i+=stride){
        const d=dots[i];d.turn=((d.turn||0)+1)&3;if(n<=600||d.turn===0){d.p+=dt*.0012;d.vx+=Math.cos(d.p)*.0007;d.vy+=Math.sin(d.p*1.19)*.0007;const q=Math.hypot(d.vx,d.vy)||1;if(q>.085){d.vx=d.vx/q*.085;d.vy=d.vy/q*.085}}
        d.x+=d.vx*dt;d.y+=d.vy*dt;if(d.x<7){d.x=7;d.vx=Math.abs(d.vx)}if(d.x>w-d.z-7){d.x=w-d.z-7;d.vx=-Math.abs(d.vx)}if(d.y<7){d.y=7;d.vy=Math.abs(d.vy)}if(d.y>h-d.z-7){d.y=h-d.z-7;d.vy=-Math.abs(d.vy)}d.el.style.transform=`translate3d(${d.x}px,${d.y}px,0)`
      }
    }
    requestAnimationFrame(move)
  };

  if(mode==='blitz')syncBlitzHud(1);
})();
