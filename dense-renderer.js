(()=>{
  const DENSE_AT=850;
  const style=document.createElement('style');
  style.textContent=`
.arena.dense-canvas-mode{contain:layout paint style}.dense-core-canvas{position:absolute;inset:0;width:100%;height:100%;z-index:2;pointer-events:none}.dense-attack-canvas{position:fixed;inset:0;width:100vw;height:100vh;z-index:9290;pointer-events:none}.dense-prime-orb .spin{animation:none!important}.dense-prime-orb .prime-dense-ring{filter:drop-shadow(0 0 8px #ffd75f)}
`;
  document.head.appendChild(style);

  const baseMake=make,baseMove=move,baseArrange=arrange,baseFire=fire,baseTryF=tryF,baseTryP=tryP,baseScatter=scatter,baseResize=window.onresize;
  const palette=Array.from({length:6},(_,i)=>color(i,6));
  let dense=false,canvas=null,ctx=null,cw=600,ch=282,dpr=1,lastFrame=0,tick=0,gridState=null,marks=null,guides=null,guideAlpha=0,resizeObserver=null,audio=null;

  function isDense(){return dense&&n>=DENSE_AT}
  function tone(freq=560,dur=.05,vol=.008,type='sine'){
    const s=document.querySelector('#cbSfx');if(s&&s.classList.contains('off'))return;const C=window.AudioContext||window.webkitAudioContext;if(!C)return;if(!audio)audio=new C();if(audio.state==='suspended')audio.resume().catch(()=>{});const t=audio.currentTime,o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(vol,t+.006);g.gain.exponentialRampToValueAtTime(.0001,t+dur);o.connect(g).connect(audio.destination);o.start(t);o.stop(t+dur+.02)
  }
  function cleanupDense(){
    dense=false;gridState=marks=guides=null;guideAlpha=0;A.classList.remove('dense-canvas-mode');if(canvas){canvas.remove();canvas=null;ctx=null}
  }
  function fitCanvas(){
    if(!canvas)return;const r=A.getBoundingClientRect();cw=r.width||600;ch=r.height||282;dpr=Math.min(window.devicePixelRatio||1,1.25);canvas.width=Math.max(1,Math.round(cw*dpr));canvas.height=Math.max(1,Math.round(ch*dpr));canvas.style.width=cw+'px';canvas.style.height=ch+'px';ctx=canvas.getContext('2d',{alpha:true,desynchronized:true});ctx.setTransform(dpr,0,0,dpr,0,0)
  }
  function dotSize(k=n){const cell=Math.sqrt((cw*ch)/Math.max(1,k));return Math.max(1.05,Math.min(2.65,cell*.31))}
  function drawDense(){
    if(!ctx||!dense)return;ctx.clearRect(0,0,cw,ch);let active=-1,opened=false;
    for(let i=0;i<dots.length;i++){
      const d=dots[i];if(d.hidden)continue;if(d.bucket!==active){if(opened)ctx.fill();active=d.bucket;ctx.fillStyle=palette[active];ctx.beginPath();opened=true}const z=d.z||1.5,r=z*.5;ctx.moveTo(d.x+r,d.y+r);ctx.arc(d.x+r,d.y+r,r,0,Math.PI*2)
    }
    if(opened)ctx.fill();
    if(guides&&guideAlpha>0){ctx.save();ctx.globalAlpha=guideAlpha;ctx.fillStyle='#e8fbff';ctx.beginPath();for(const p of guides){const r=Math.max(1.8,p[2]*.65);ctx.moveTo(p[0]+p[2]/2+r,p[1]+p[2]/2);ctx.arc(p[0]+p[2]/2,p[1]+p[2]/2,r,0,Math.PI*2)}ctx.fill();ctx.restore()}
    if(marks?.outStart!=null){ctx.save();ctx.strokeStyle='#ff7079';ctx.lineWidth=1.25;ctx.beginPath();for(let i=marks.outStart;i<dots.length;i++){const d=dots[i],r=Math.max(2,d.z*.85);ctx.moveTo(d.x+d.z/2+r,d.y+d.z/2);ctx.arc(d.x+d.z/2,d.y+d.z/2,r,0,Math.PI*2)}ctx.stroke();ctx.restore()}
    if(marks?.missing?.length){ctx.save();ctx.strokeStyle='#ff7079';ctx.lineWidth=1.1;ctx.setLineDash([2,2]);ctx.beginPath();for(const p of marks.missing){const r=Math.max(2,p[2]*.7);ctx.moveTo(p[0]+p[2]/2+r,p[1]+p[2]/2);ctx.arc(p[0]+p[2]/2,p[1]+p[2]/2,r,0,Math.PI*2)}ctx.stroke();ctx.restore()}
  }
  function makeDense(){
    A.replaceChildren();A.classList.add('dense-canvas-mode');slots=[];marks=null;guides=null;guideAlpha=0;gridState=null;canvas=document.createElement('canvas');canvas.className='dense-core-canvas';A.appendChild(canvas);dense=true;fitCanvas();const z=dotSize(),pad=12,maxX=Math.max(1,cw-pad*2-z),maxY=Math.max(1,ch-pad*2-z),arr=new Array(n);
    for(let i=0;i<n;i++){const a=Math.random()*Math.PI*2,v=.018+Math.random()*.032;arr[i]={x:pad+Math.random()*maxX,y:pad+Math.random()*maxY,z,vx:Math.cos(a)*v,vy:Math.sin(a)*v,p:Math.random()*Math.PI*2,bucket:Math.min(5,Math.floor(i*6/Math.max(1,n))),hidden:false}}
    dots=arr;lastFrame=0;drawDense()
  }
  make=function(){if(n<DENSE_AT){cleanupDense();return baseMake()}cleanupDense();makeDense()};

  if(window.ResizeObserver){resizeObserver=new ResizeObserver(()=>{if(!dense)return;fitCanvas();drawDense()});resizeObserver.observe(A)}
  window.onresize=()=>{if(!dense)return baseResize?.();fitCanvas();for(const d of dots){d.x=Math.min(d.x,cw-d.z-5);d.y=Math.min(d.y,ch-d.z-5)}drawDense()};

  move=function(t){
    if(!dense)return baseMove(t);tickTimer(t);const interval=n>1500?58:n>1100?48:40;if(!busy&&!done&&(!lastFrame||t-lastFrame>=interval)){const dt=Math.min(90,t-(lastFrame||t));lastFrame=t;tick++;for(let i=0;i<dots.length;i++){const d=dots[i];if(((i+tick)%11)===0){d.vx+=(Math.random()-.5)*.006;d.vy+=(Math.random()-.5)*.006;const q2=d.vx*d.vx+d.vy*d.vy,max=.0036;if(q2>max){const s=Math.sqrt(max/q2);d.vx*=s;d.vy*=s}}d.x+=d.vx*dt;d.y+=d.vy*dt;if(d.x<5){d.x=5;d.vx=Math.abs(d.vx)}else if(d.x>cw-d.z-5){d.x=cw-d.z-5;d.vx=-Math.abs(d.vx)}if(d.y<5){d.y=5;d.vy=Math.abs(d.vy)}else if(d.y>ch-d.z-5){d.y=ch-d.z-5;d.vy=-Math.abs(d.vy)}}drawDense()}requestAnimationFrame(move)
  };

  function denseGrid(f){
    const rows=Math.ceil(n/f),pad=14,pitch=Math.min(24,(cw-pad*2)/Math.max(1,f-1),(ch-pad*2)/Math.max(1,rows-1)),z=Math.max(.7,Math.min(5.5,pitch*.7)),ox=(cw-pitch*(f-1))/2-z/2,oy=(ch-pitch*(rows-1))/2-z/2,p=new Array(n);for(let i=0;i<n;i++)p[i]=[ox+(i%f)*pitch,oy+Math.floor(i/f)*pitch];return{p,pitch,z,ox,oy,rows}
  }
  function clearSeed(seed){if(!seed)return;seed.els?.forEach(e=>e.remove());seed.card?.remove();if(window.__coreBreakManualSeed===seed)delete window.__coreBreakManualSeed}
  async function seedToDenseGuides(seed,g){
    if(!seed||seed.f!==g.f)return;const waitMs=Math.max(0,(seed.readyAt||0)-performance.now());if(waitMs)await sl(waitMs);const ar=A.getBoundingClientRect(),tasks=[];
    for(let i=0;i<seed.els.length;i++){const e=seed.els[i],r=e.getBoundingClientRect(),sx=r.left+r.width/2,sy=r.top+r.height/2,tx=ar.left+g.p[i][0]+g.z/2,ty=ar.top+g.p[i][1]+g.z/2;e.getAnimations().forEach(a=>a.cancel());document.body.appendChild(e);e.style.position='fixed';e.style.left=(sx-r.width/2)+'px';e.style.top=(sy-r.height/2)+'px';e.style.margin='0';e.style.zIndex='10030';tasks.push(e.animate([{transform:'translate3d(0,0,0) scale(1)',opacity:1},{transform:`translate3d(${(tx-sx)*.52}px,${(ty-sy)*.38-18}px,0) scale(1.15)`,opacity:1,offset:.52},{transform:`translate3d(${tx-sx}px,${ty-sy}px,0) scale(.9)`,opacity:.25}],{duration:440,delay:Math.min(70,i*2),easing:'cubic-bezier(.2,.8,.25,1)',fill:'forwards'}).finished.catch(()=>{}))}
    seed.card?.animate([{opacity:1},{opacity:0}],{duration:170,fill:'forwards'});await Promise.all(tasks);clearSeed(seed)
  }
  function tweenTo(targets,z,duration=980,stagger=.28){
    const starts=dots.map(d=>[d.x,d.y]),k=dots.length;for(const d of dots)d.z=z;return new Promise(resolve=>{const t0=performance.now();const frame=t=>{const g=Math.min(1,(t-t0)/duration);for(let i=0;i<k;i++){const delay=(i/Math.max(1,k-1))*stagger,p=Math.max(0,Math.min(1,(g-delay)/Math.max(.001,1-delay))),e=1-Math.pow(1-p,3),s=starts[i],q=targets[i];dots[i].x=s[0]+(q[0]-s[0])*e;dots[i].y=s[1]+(q[1]-s[1])*e}guideAlpha=Math.max(0,1-g*2.2);drawDense();if(g<1)requestAnimationFrame(frame);else{guideAlpha=0;drawDense();resolve()}};requestAnimationFrame(frame)})
  }
  arrange=async function(f){
    if(!isDense())return baseArrange(f);marks=null;const g=denseGrid(f);g.f=f;gridState=g;const seed=window.__coreBreakManualSeed;if(seed&&seed.f===f){guides=g.p.slice(0,f).map(p=>[p[0],p[1],g.z]);guideAlpha=1;await seedToDenseGuides(seed,g)}else{clearSeed(seed);guides=g.p.slice(0,Math.min(f,64)).map(p=>[p[0],p[1],g.z]);guideAlpha=.75}msg(`${f}-LINE`);tone(480,.05,.006);await tweenTo(g.p,g.z,n>1500?1050:950,.3);await sl(180);return g
  };

  scatter=function(){if(!isDense())return baseScatter();marks=null;guides=null;guideAlpha=0;gridState=null;const cx=cw/2,cy=ch/2;for(const d of dots){d.hidden=false;const x=d.x-cx,y=d.y-cy,l=Math.hypot(x,y)||1,b=.035+Math.random()*.03;d.vx=x/l*b+(Math.random()-.5)*.018;d.vy=y/l*b+(Math.random()-.5)*.018}A.classList.remove('fail','ok');busy=0;renderControls();msg('READY');drawDense()};

  function missingPoints(f,r,g){const a=[],row=g.rows-1;for(let c=r;c<f;c++)a.push([g.ox+c*g.pitch,g.oy+row*g.pitch,g.z]);return a}
  tryF=async function(f){
    if(!isDense())return baseTryF(f);if(busy||done)return;if(!Number.isInteger(f)||f<2||f>=n||!prime(f)){invalidInput();return}busy=1;D.innerHTML='';await arrange(f);const r=n%f;if(!r){A.classList.add('ok');msg('SYNC!','g');flash('g');await wait(2500);return good(f)}const m=f-r;score=Math.max(0,score-10);miss++;hud();A.classList.add('fail');flash('r');marks=r<=m?{outStart:n-r}:{missing:missingPoints(f,r,gridState)};drawDense();msg('LOST!','r');await wait(3100);if(await rageUp())scatter()
  };

  function attackCanvas(){const c=document.createElement('canvas');c.className='dense-attack-canvas';const d=Math.min(window.devicePixelRatio||1,1.25),w=innerWidth,h=innerHeight;c.width=Math.round(w*d);c.height=Math.round(h*d);document.body.appendChild(c);const x=c.getContext('2d',{alpha:true,desynchronized:true});x.setTransform(d,0,0,d,0,0);return{c,x,w,h}}
  fire=async function(f){
    if(!isDense())return baseFire(f);const rows=n/f,keep=f===2?0:Math.floor(f/2),ammo=[],survivors=[];for(let r=0;r<rows;r++){const base=r*f;let sx=0,sy=0;for(let c=0;c<f;c++){const d=dots[base+c];sx+=d.x;sy+=d.y;if(c!==keep)ammo.push({d,index:base+c})}const kd=dots[base+keep];kd.x=sx/f;kd.y=sy/f;survivors.push(kd)}
    const ar=A.getBoundingClientRect(),er=E.getBoundingClientRect(),tx=er.left+er.width/2,ty=er.top+er.height*.52,total=760,dur=420,groups=Array.from({length:6},()=>[]);for(let i=0;i<ammo.length;i++){const q=ammo[i],d=q.d,sx=ar.left+d.x+d.z/2,sy=ar.top+d.y+d.z/2,rank=((i*37)%Math.max(1,ammo.length))/Math.max(1,ammo.length-1),delay=rank*total,jx=(Math.random()-.5)*20,jy=(Math.random()-.5)*16;q.sx=sx;q.sy=sy;q.tx=tx+jx;q.ty=ty+jy;q.mx=sx+(q.tx-sx)*.52+(Math.random()-.5)*24;q.my=sy+(q.ty-sy)*.45-22;q.delay=delay;q.dur=dur+Math.random()*80;groups[d.bucket].push(q);d.hidden=true}
    drawDense();const layer=attackCanvas();msg('CHARGE','y');await sl(190);msg('FIRE!','y');tone(350,.06,.008);const start=performance.now(),end=total+dur+90;for(let i=1;i<=10;i++)setTimeout(()=>tone(760+i*24,.025,.0045),i*(total/10));await new Promise(resolve=>{const frame=t=>{const elapsed=t-start;layer.x.clearRect(0,0,layer.w,layer.h);for(let b=0;b<6;b++){layer.x.fillStyle=palette[b];for(const q of groups[b]){const u=Math.max(0,Math.min(1,(elapsed-q.delay)/q.dur));if(u<=0||u>=1)continue;const v=1-u,x=(v*v*q.sx)+(2*v*u*q.mx)+(u*u*q.tx),y=(v*v*q.sy)+(2*v*u*q.my)+(u*u*q.ty),s=Math.max(1.2,q.d.z*.9)*(1-u*.45);layer.x.globalAlpha=Math.min(1,u*5, (1-u)*6);layer.x.fillRect(x-s/2,y-s/2,s,s)}}layer.x.globalAlpha=1;if(elapsed<end)requestAnimationFrame(frame);else resolve()};requestAnimationFrame(frame)});layer.c.remove();tone(110,.14,.028,'square');react('hit');shake('impact');flash('g');parts(Math.min(16,8+(ammo.length/160|0)));breakSh();return rows
  };

  function primeLayout(k){const maxR=Math.max(28,Math.min(cw,ch)*.4),cx=cw/2,cy=ch/2,spacing=2*Math.PI*maxR/Math.max(1,k),p=new Array(k);if(spacing>=2.8){const z=Math.max(1.1,Math.min(2.8,spacing*.55)),r=maxR-z*.5;for(let i=0;i<k;i++){const a=-Math.PI/2+i*2*Math.PI/k;p[i]=[cx+Math.cos(a)*r-z/2,cy+Math.sin(a)*r-z/2]}return{p,z}}const inner=Math.min(8,maxR*.1),turns=Math.max(5,Math.sqrt(k)/2),theta=turns*2*Math.PI,z=Math.max(.85,Math.min(2.2,Math.sqrt(Math.PI*maxR*maxR/k)*.62));for(let i=0;i<k;i++){const t=i/Math.max(1,k-1),r=inner+(maxR-inner)*Math.sqrt(t),a=-Math.PI/2+theta*t;p[i]=[cx+Math.cos(a)*r-z/2,cy+Math.sin(a)*r-z/2]}return{p,z}}
  function denseOrb(){const ar=A.getBoundingClientRect(),o=document.createElement('div'),s=document.createElement('div'),ring=document.createElement('i'),c=document.createElement('i'),trail=document.createElement('i');o.className='orb prime-charge dense-prime-orb';o.style.left=ar.left+ar.width/2+'px';o.style.top=ar.top+ar.height/2+'px';s.className='spin';ring.className='prime-dense-ring';c.className='oc';trail.className='prime-trail';s.append(ring,c);o.append(trail,s);document.body.appendChild(o);return o}
  async function chargeOrb(o){const spin=o.querySelector('.spin'),trail=o.querySelector('.prime-trail'),duration=1500;msg('SPIN UP','y');tone(220,.12,.009);const a=spin.animate([{transform:'rotate(0deg) scale(1)',filter:'brightness(1)'},{transform:'rotate(650deg) scale(.9)',filter:'brightness(1.25)',offset:.55},{transform:'rotate(2450deg) scale(.31)',filter:'brightness(2.3) drop-shadow(0 0 28px #fff1a6)'}],{duration,easing:'cubic-bezier(.48,.02,.82,.42)',fill:'forwards'}),b=trail.animate([{opacity:0,transform:'scale(1)'},{opacity:.35,transform:'scale(.8)',offset:.6},{opacity:1,transform:'scale(.3)'}],{duration,easing:'ease-in',fill:'forwards'});await Promise.all([a.finished.catch(()=>{}),b.finished.catch(()=>{})]);msg('READY!','y');await sl(120)}
  async function launchOrb(o){msg('FINAL BREAK!','y');await sl(80);const er=E.getBoundingClientRect(),or=o.getBoundingClientRect(),sx=or.left+or.width/2,sy=or.top+or.height/2,tx=er.left+er.width/2,ty=er.top+er.height*.5,dx=tx-sx,dy=ty-sy;await o.animate([{transform:'translate(-50%,-50%) scale(1)',filter:'brightness(1.8)'},{transform:`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) scale(.68)`,filter:'brightness(5) drop-shadow(0 0 24px #ffd75f)'}],{duration:500,easing:'cubic-bezier(.36,.04,.18,1)',fill:'forwards'}).finished.catch(()=>{});o.remove();shake('counter');flash('g');boom();E.classList.add('dead');document.querySelectorAll('.sh i').forEach(x=>x.classList.add('br'));await sl(850)}
  tryP=async function(){
    if(!isDense())return baseTryP();if(busy||done)return;if(!prime(n)){score=Math.max(0,score-15);miss++;hud();A.classList.add('fail');msg('LOCKED!','r');busy=1;D.innerHTML='';await wait(2900);if(await rageUp())scatter();return}busy=1;D.innerHTML='';msg('PRIME!','y');marks=null;guides=null;const layout=primeLayout(n);await tweenTo(layout.p,layout.z,n>1500?1150:1000,.22);await sl(150);msg('PRIME LOCK!','g');tone(920,.08,.012);await sl(260);const o=denseOrb();canvas?.animate([{opacity:1},{opacity:.06}],{duration:260,fill:'forwards'});await chargeOrb(o);done=1;score+=30;if(!rage)score+=50;hud();await launchOrb(o);if(mode==='blitz'){stage++;await sl(300);start();return}$('#code').textContent=`${startN} = ${[...fac,n].join(' × ')}`;$('#win').classList.add('show')
  };
})();
