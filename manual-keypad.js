(()=>{
  const style=document.createElement('style');
  style.textContent=`
html.manual-game-lock,body.manual-game-lock{width:100%;height:100%;overflow:hidden!important;overscroll-behavior:none!important}
body.manual-game-lock{position:fixed;inset:0;margin:0;touch-action:manipulation}
body.manual-game-lock .app{height:100%;max-height:100%;display:flex;flex-direction:column;overflow:hidden}
body.manual-game-lock .hud,body.manual-game-lock .modes{flex:0 0 auto}
body.manual-game-lock .battle.manual-mode{flex:1 1 auto;min-height:0;display:grid;grid-template-rows:auto auto minmax(120px,1fr) auto;overflow:hidden!important;border-radius:23px}
body.manual-game-lock .battle.manual-mode .ez{position:relative!important;top:auto!important;z-index:4;height:156px!important;border-radius:0;box-shadow:none}
body.manual-game-lock .battle.manual-mode .status{min-height:44px}
body.manual-game-lock .battle.manual-mode .arena{height:auto!important;min-height:120px}
body.manual-game-lock .expert-bar.show{display:block!important;height:auto!important;min-height:0!important;overflow:visible!important;padding:8px 10px!important;background:#0d141f}
.manual-native-input,.manual-fire-hidden{position:absolute!important;width:1px!important;height:1px!important;opacity:0!important;pointer-events:none!important;clip-path:inset(50%)!important}
.manual-panel{display:flex!important;flex-direction:column!important;gap:6px!important;width:100%!important;min-width:0!important;position:relative!important;isolation:isolate}
.manual-card-strip{display:grid!important;grid-template-columns:repeat(5,minmax(0,1fr))!important;gap:5px!important;width:100%!important;min-width:0!important;align-items:stretch!important}
.manual-factor-card{grid-column:1!important}.manual-prime-card{grid-column:2!important}.manual-clear-slot{grid-column:5!important;display:flex!important;align-items:center!important;justify-content:flex-end!important;align-self:center!important;min-width:0!important}
.manual-choice-card{position:relative!important;inset:auto!important;width:100%!important;min-width:0!important;height:73px!important;min-height:73px!important;margin:0!important;padding:6px 2px!important;display:flex!important;align-items:center!important;justify-content:center!important;overflow:hidden!important;touch-action:none!important;user-select:none!important;cursor:grab!important;border-radius:14px!important}
.manual-factor-card.is-empty{color:#718097!important;font-size:11px!important;letter-spacing:.07em!important;cursor:default!important;animation:none!important}.manual-choice-card.drag{cursor:grabbing!important}.manual-prime-card{border-color:#776429!important;background:linear-gradient(#3c3218,#211c10)!important;color:#ffe481!important}.manual-prime-card .manual-value{font-size:14px!important;letter-spacing:.02em!important;color:#ffe481!important}
.manual-value{font-size:25px!important;font-weight:1000!important;line-height:1!important;letter-spacing:-.025em!important;white-space:nowrap!important}.manual-ghost-value{font-size:24px;font-weight:1000}.ghost.prime .manual-ghost-value{font-size:14px;letter-spacing:.03em;color:#ffe481}
.clear-select,.digit-pad button{min-width:0;border:1px solid #34435b;border-radius:11px;background:#151e2c;color:#fff;font:inherit;font-weight:1000;touch-action:manipulation}.clear-select{position:static!important;transform:none!important;width:44px!important;min-width:44px!important;max-width:44px!important;height:36px!important;margin:0!important;padding:0!important;font-size:11px!important;color:#dbe5f5!important}.digit-pad{display:grid!important;grid-template-columns:repeat(5,minmax(0,1fr))!important;gap:5px!important;width:100%!important;min-width:0!important}.digit-pad>button{position:static!important;transform:none!important;width:100%!important;height:40px!important;margin:0!important;font-size:18px!important}
.manual-drop-card{position:fixed;z-index:10028;transform:translate(-50%,-50%);border:1px solid #70e6ffbb;border-radius:14px;background:linear-gradient(#1e2a3ef7,#141c29f7);color:#fff;display:grid;place-items:center;font-size:20px;font-weight:1000;pointer-events:none;box-shadow:0 12px 34px #000a,0 0 0 2px #70e6ff18,0 0 28px #70e6ff35;overflow:hidden}.manual-drop-card .drop-value{position:relative;z-index:2}.manual-drop-card .manual-seed-dot{position:absolute!important;z-index:1!important}.manual-seed-dot{position:fixed;z-index:10030;border-radius:50%;background:#d9f9ff;box-shadow:0 0 5px #70e6ff;pointer-events:none;will-change:transform,opacity}
.manual-reject{position:fixed;z-index:10040;width:92px;min-height:58px;transform:translate(-50%,-50%);border:1px solid #ff7079;border-radius:15px;background:#32131aec;color:#fff;display:grid;place-items:center;text-align:center;pointer-events:none;box-shadow:0 0 0 2px #ff707922,0 12px 34px #000a,0 0 24px #ff70792b}.manual-reject b{font-size:20px}.manual-reject small{font-size:9px;color:#ff9ca2;font-weight:1000;letter-spacing:.05em}
@media(max-height:700px){body.manual-game-lock .battle.manual-mode .ez{height:138px!important}.manual-choice-card{height:64px!important;min-height:64px!important}.digit-pad>button{height:36px!important}.manual-panel{gap:5px!important}}
@media(max-height:620px){body.manual-game-lock .hud{padding-top:3px;padding-bottom:4px}body.manual-game-lock .brand{font-size:24px}body.manual-game-lock .modes{margin-bottom:4px}body.manual-game-lock .battle.manual-mode .ez{height:118px!important}body.manual-game-lock .status{min-height:40px}.manual-choice-card{height:56px!important;min-height:56px!important}.clear-select{height:32px!important}.digit-pad>button{height:32px!important}.expert-bar.show{padding:5px 10px!important}.manual-panel{gap:4px!important}}
`;
  document.head.appendChild(style);

  const fireBtn=document.querySelector('#factorFire'),primeBtn=document.querySelector('#primeFire');
  fireBtn.type='button';fireBtn.classList.add('manual-fire-hidden');fireBtn.setAttribute('aria-hidden','true');fireBtn.tabIndex=-1;
  primeBtn.classList.add('manual-fire-hidden');primeBtn.setAttribute('aria-hidden','true');primeBtn.tabIndex=-1;
  factorInput.classList.add('manual-native-input');factorInput.readOnly=true;factorInput.setAttribute('inputmode','none');factorInput.setAttribute('tabindex','-1');factorInput.setAttribute('aria-hidden','true');
  try{factorInput.focus=()=>{}}catch{}

  const panel=document.createElement('div');
  panel.className='manual-panel';
  panel.innerHTML=`
    <div class="manual-card-strip">
      <div id="factorReadout" class="card manual-choice-card manual-factor-card is-empty" data-v="" data-p="0" aria-label="Factor card">FACTOR</div>
      <div id="manualPrime" class="card manual-choice-card manual-prime-card" data-v="PRIME" data-p="1" aria-label="Prime card"><div class="manual-value">PRIME</div></div>
      <div class="manual-clear-slot"><button type="button" class="clear-select" id="factorClear">CLR</button></div>
    </div>
    <div class="digit-pad" id="digitPad"></div>`;
  expertBar.appendChild(panel);

  const digitPad=panel.querySelector('#digitPad');
  for(const d of ['1','2','3','4','5','6','7','8','9','0']){const b=document.createElement('button');b.type='button';b.textContent=d;b.dataset.digit=d;digitPad.appendChild(b)}
  const readout=panel.querySelector('#factorReadout'),primeCard=panel.querySelector('#manualPrime'),clearBtn=panel.querySelector('#factorClear');
  let manualAudio=null;

  function manualMode(){return mode==='expert'||mode==='blitz'}
  function soundOn(){const b=document.querySelector('#cbSfx');return !b||!b.classList.contains('off')}
  function tone(freq,dur=.04,vol=.01){if(!soundOn())return;const C=window.AudioContext||window.webkitAudioContext;if(!C)return;if(!manualAudio)manualAudio=new C();if(manualAudio.state==='suspended')manualAudio.resume().catch(()=>{});const t=manualAudio.currentTime,o=manualAudio.createOscillator(),g=manualAudio.createGain();o.type='sine';o.frequency.value=freq;g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(vol,t+.006);g.gain.exponentialRampToValueAtTime(.0001,t+dur);o.connect(g).connect(manualAudio.destination);o.start(t);o.stop(t+dur+.02)}
  function syncReadout(){const v=factorInput.value;readout.dataset.v=v;readout.classList.toggle('is-empty',!v);readout.innerHTML=v?`<div class="manual-value">${v}</div>`:'FACTOR'}
  function setValue(v){factorInput.value=v;syncReadout()}
  function appendDigit(d){if(!manualMode()||busy||done)return;let v=(factorInput.value+d).replace(/^0+(?=\d)/,'');if(v.length>4)v=v.slice(0,4);setValue(v)}
  function clearChoice(){factorInput.value='';syncReadout()}
  function applyManualLayout(){const on=manualMode();document.documentElement.classList.toggle('manual-game-lock',on);document.body.classList.toggle('manual-game-lock',on);if(on){window.scrollTo(0,0);factorInput.blur()}else clearChoice();syncReadout()}
  function discardSeed(){const s=window.__coreBreakManualSeed;if(s){s.els?.forEach(e=>e.remove());s.card?.remove();delete window.__coreBreakManualSeed}}
  function readyMessage(text){msg(text,'r');setTimeout(()=>{if(!busy&&!done)msg('READY')},620)}
  function beginDrag(e,c,p,v){if(!manualMode()||busy||done)return;e.preventDefault();discardSeed();const g=document.createElement('div');g.className='ghost'+(p?' prime':'');g.innerHTML=`<div class="manual-ghost-value">${v}</div>`;document.body.appendChild(g);c.classList.add('drag');drag={c,p,v,g};dragMove(e);window.onpointermove=dragMove;window.onpointerup=dragEnd}
  function startFactorDrag(e){const v=factorInput.value;if(!v){readyMessage('ENTER FACTOR');return}beginDrag(e,readout,false,v)}
  function startPrimeDrag(e){beginDrag(e,primeCard,true,'PRIME')}

  function rejectDrop(x,y,v,label){const e=document.createElement('div');e.className='manual-reject';e.style.left=x+'px';e.style.top=y+'px';e.innerHTML=`<b>${v}</b><small>${label}</small>`;document.body.appendChild(e);tone(180,.09,.018);e.animate([{transform:'translate(-50%,-50%) scale(.82)',opacity:.15},{transform:'translate(calc(-50% - 8px),-50%) scale(1.04)',opacity:1,offset:.35},{transform:'translate(calc(-50% + 7px),-50%)',offset:.52},{transform:'translate(calc(-50% - 4px),-50%)',offset:.67},{transform:'translate(-50%,-50%) scale(.96)',opacity:.92,offset:.78},{transform:'translate(-50%,-65%) scale(.72)',opacity:0}],{duration:650,easing:'ease-out'});setTimeout(()=>e.remove(),680);readyMessage(label)}

  function makeFactorSeed(x,y,f){
    const ar=A.getBoundingClientRect(),src=readout.getBoundingClientRect(),cw=Math.min(src.width,Math.max(54,ar.width-14)),ch=Math.min(src.height,Math.max(54,ar.height-14)),halfW=cw/2,halfH=ch/2,cx=Math.max(ar.left+halfW+6,Math.min(ar.right-halfW-6,x)),cy=Math.max(ar.top+halfH+6,Math.min(ar.bottom-halfH-6,y)),radius=Math.max(12,Math.min(cw,ch)/2-10),spacing=2*Math.PI*radius/Math.max(1,f),dot=Math.max(.55,Math.min(4,spacing*.58)),card=document.createElement('div'),els=[];
    card.className='manual-drop-card';card.style.left=cx+'px';card.style.top=cy+'px';card.style.width=cw+'px';card.style.height=ch+'px';card.innerHTML=`<div class="drop-value">${f}</div>`;document.body.appendChild(card);
    card.animate([{transform:'translate(-50%,-50%) scale(.82)',opacity:.25},{transform:'translate(-50%,-50%) scale(1)',opacity:1}],{duration:190,easing:'ease-out',fill:'forwards'});
    for(let i=0;i<f;i++){
      const a=-Math.PI/2+i*2*Math.PI/f,dx=Math.cos(a)*radius,dy=Math.sin(a)*radius,e=document.createElement('i');e.className='manual-seed-dot';e.style.width=dot+'px';e.style.height=dot+'px';e.style.left=`calc(50% + ${dx}px)`;e.style.top=`calc(50% + ${dy}px)`;e.style.margin=(-dot/2)+'px';card.appendChild(e);
      if(f<=160)e.animate([{transform:`translate(${-dx}px,${-dy}px) scale(.2)`,opacity:.1},{transform:'translate(0,0) scale(1)',opacity:1}],{duration:280+Math.min(100,i*2),easing:'cubic-bezier(.2,.8,.25,1)',fill:'forwards'});
      els.push(e)
    }
    tone(520,.07,.012);window.__coreBreakManualSeed={f,els,card,readyAt:performance.now()+(f<=160?460:300)}
  }

  function tailCount(k){return k<=5?1:k<=12?2:k<=30?3:5}
  function sequenceTimes(k,total){if(k<=1)return[0];const tail=Math.min(tailCount(k),k-1),head=k-tail,tailSpan=Math.min(total*.38,tail*165),headEnd=Math.max(0,total-tailSpan),out=[];for(let i=0;i<head;i++)out.push(head===1?0:(i/(head-1))*headEnd);for(let j=0;j<tail;j++)out.push(headEnd+(j+1)*(tailSpan/tail));return out}
  function placeSound(i,k,tail){if(k<=12)return true;if(i>=k-tail)return true;const stride=k<=40?2:Math.max(3,Math.ceil(k/16));return i%stride===0}
  async function seedToGuides(seed,g){
    const wait=Math.max(0,seed.readyAt-performance.now());if(wait)await sl(wait);
    const starts=seed.els.map(e=>{const r=e.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2,z:Math.max(.55,r.width)}});
    seed.els.forEach((e,i)=>{const s=starts[i];document.body.appendChild(e);e.className='manual-seed-dot';e.removeAttribute('style');e.style.width=s.z+'px';e.style.height=s.z+'px';e.style.left=s.x+'px';e.style.top=s.y+'px';e.style.margin=(-s.z/2)+'px'});
    seed.card.animate([{transform:'translate(-50%,-50%) scale(1)',opacity:1},{transform:'translate(-50%,-50%) scale(.9)',opacity:0}],{duration:180,easing:'ease-in'});setTimeout(()=>seed.card.remove(),190);tone(260,.06,.012);
    const ar=A.getBoundingClientRect(),guides=new Array(seed.els.length),tasks=seed.els.map((e,i)=>{const s=starts[i],tx=ar.left+g.p[i][0]+g.z/2,ty=ar.top+g.p[i][1]+g.z/2,bend=(i-(seed.els.length-1)/2)*Math.min(5,30/Math.max(1,seed.els.length));return e.animate([{transform:'translate(0,0) scale(1)',opacity:1},{transform:`translate(${(tx-s.x)*.5+bend}px,${(ty-s.y)*.38-20}px) scale(1.18)`,offset:.5},{transform:`translate(${tx-s.x}px,${ty-s.y}px) scale(1)`,opacity:1}],{duration:390+Math.min(150,i*5),delay:Math.min(90,i*4),easing:'cubic-bezier(.2,.8,.25,1)',fill:'forwards'}).finished.catch(()=>{}).then(()=>{e.getAnimations().forEach(a=>a.cancel());const gd=Math.max(3,Math.min(10,g.z*.82));e.className='guide-dot';e.removeAttribute('style');e.style.setProperty('--gd',gd+'px');e.style.left=g.p[i][0]+(g.z-gd)/2+'px';e.style.top=g.p[i][1]+(g.z-gd)/2+'px';A.appendChild(e);guides[i]=e})});await Promise.all(tasks);return guides
  }

  const baseArrange=arrange;
  arrange=async function(f){
    const seed=window.__coreBreakManualSeed;if(!manualMode()||!seed||seed.f!==f)return baseArrange(f);delete window.__coreBreakManualSeed;
    slots.forEach(x=>x.remove());slots=[];dots.forEach(d=>d.el.className='dot');const g=grid(f),guides=await seedToGuides(seed,g);dots.forEach(d=>ds(d,g.z));const k=n,total=Math.min(2150,420+70*k),tt=sequenceTimes(k,total),tail=tailCount(k);msg(`${f}-LINE`);await sl(90);const t0=performance.now();
    for(let i=0;i<k;i++){const dt=tt[i]-(performance.now()-t0);if(dt>0)await sl(dt);const d=dots[i];d.el.classList.add('set');pos(d,g.p[i][0],g.p[i][1],1);if(k<=160||i>=k-tail||i%Math.max(2,Math.ceil(k/80))===0)d.el.animate([{filter:'brightness(1)'},{filter:'brightness(1.7)'},{filter:'brightness(1)'}],{duration:210});if(i<f&&guides[i]){const q=guides[i];q.classList.add('fill');setTimeout(()=>q.remove(),260)}if(placeSound(i,k,tail))tone(460+Math.min(440,Math.round(20*i/Math.max(1,k-1))*22),.03,.007)}
    guides.forEach(q=>{if(q&&q.isConnected){q.classList.add('fill');setTimeout(()=>q.remove(),260)}});await sl(k<=6?180:300);return g
  };

  digitPad.addEventListener('click',e=>{const b=e.target.closest('button[data-digit]');if(b)appendDigit(b.dataset.digit)});clearBtn.addEventListener('click',clearChoice);factorInput.addEventListener('focus',()=>factorInput.blur());readout.onpointerdown=startFactorDrag;primeCard.onpointerdown=startPrimeDrag;

  const baseDragEnd=dragEnd;
  dragEnd=function(e){
    const d=drag,manualDrag=!!d&&(d.c===readout||d.c===primeCard);if(!manualDrag)return baseDragEnd(e);const r=A.getBoundingClientRect(),ok=e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom;
    if(ok&&!d.p){const f=Number(d.v),valid=Number.isInteger(f)&&f>=2&&f<n&&!!prime(f);if(!valid){window.onpointermove=window.onpointerup=null;d.c.classList.remove('drag');d.g.remove();A.classList.remove('ready');drag=null;discardSeed();const label=Number.isInteger(f)&&f>=2&&f<n&&!prime(f)?'NOT PRIME':'INVALID';rejectDrop(e.clientX,e.clientY,d.v,label);return}makeFactorSeed(e.clientX,e.clientY,f)}
    baseDragEnd(e);if(ok&&busy&&!d.p)clearChoice()
  };

  const prevRender=renderControls;renderControls=function(){prevRender();discardSeed();clearChoice();applyManualLayout()};
  document.addEventListener('keydown',e=>{if(!manualMode()||busy||done)return;if(/^\d$/.test(e.key)){e.preventDefault();appendDigit(e.key);return}if(e.key==='Backspace'){e.preventDefault();setValue(factorInput.value.slice(0,-1));return}if(e.key==='Delete'||e.key==='Escape'){e.preventDefault();clearChoice()}});
  applyManualLayout();
})();
