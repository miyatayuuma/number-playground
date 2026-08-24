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
body.manual-game-lock .expert-bar.show{display:block!important;height:auto!important;min-height:0!important;overflow:visible!important;padding:7px!important;background:#0d141f}
.manual-native-input,.manual-fire-hidden{position:absolute!important;width:1px!important;height:1px!important;opacity:0!important;pointer-events:none!important;clip-path:inset(50%)!important}
.manual-panel{display:flex!important;flex-direction:column!important;gap:8px!important;min-width:0!important;width:100%!important;position:relative!important;isolation:isolate}.manual-card-row{display:block!important;position:relative!important;z-index:2;width:100%!important;min-width:0!important;flex:0 0 auto!important}.manual-command-row{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:8px!important;position:relative!important;z-index:1;width:100%!important;min-width:0!important;margin:0!important;padding:0!important;flex:0 0 auto!important}
.manual-card{position:relative!important;inset:auto!important;width:100%!important;min-width:0!important;height:58px;min-height:58px!important;margin:0!important;display:flex;align-items:center;justify-content:center;padding:0!important;cursor:grab;overflow:hidden}.manual-card.empty{color:#718097;font-size:13px;letter-spacing:.12em;cursor:default}.manual-card.bad{animation:inputShake .28s ease;border-color:#ff7079;box-shadow:0 0 0 3px #ff707914}.manual-card.prime{border-color:#776429;background:linear-gradient(#3c3218,#211c10);color:#ffe481}.manual-card.drag{cursor:grabbing}
.manual-value{font-size:25px;font-weight:1000;line-height:1}.manual-value.prime-label{font-size:14px;letter-spacing:.04em;color:#ffe481}.manual-ghost-value{font-size:25px;font-weight:1000}.ghost.prime .manual-ghost-value{font-size:14px;letter-spacing:.04em;color:#ffe481}
.pad-control,.digit-pad button{min-width:0;border:1px solid #34435b;border-radius:11px;background:#151e2c;color:#fff;font:inherit;font-weight:1000;touch-action:manipulation}.manual-command-row>.pad-control{position:static!important;inset:auto!important;transform:none!important;display:flex!important;align-items:center!important;justify-content:center!important;width:100%!important;max-width:none!important;min-width:0!important;height:44px!important;margin:0!important;padding:0 8px!important;font-size:13px!important}.prime-select{border-color:#776429;background:#302817;color:#ffe481}.prime-select.on{box-shadow:0 0 0 2px #ffd75f55,0 0 18px #ffd75f22}.clear-select{background:#151e2c;color:#dbe5f5}
.digit-pad{display:grid!important;grid-template-columns:repeat(5,minmax(0,1fr))!important;gap:5px;min-width:0;width:100%;flex:0 0 auto}.digit-pad>button{position:static!important;transform:none!important;width:100%!important;min-width:0!important;height:40px!important;margin:0!important;font-size:18px}
.manual-drop-card{position:fixed;z-index:10028;width:70px;height:70px;margin:-35px;border:1px solid #70e6ff88;border-radius:17px;background:#132033ed;color:#fff;display:grid;place-items:center;font-size:20px;font-weight:1000;pointer-events:none;box-shadow:0 12px 34px #000a,0 0 24px #70e6ff2b}.manual-drop-card.prime{border-color:#ffd75f99;background:#302817ef;color:#ffe481;font-size:12px}.manual-seed-dot{position:fixed;z-index:10030;border-radius:50%;background:#d9f9ff;box-shadow:0 0 5px #70e6ff;pointer-events:none;will-change:transform,opacity}.manual-reject{position:fixed;z-index:10040;width:92px;min-height:58px;transform:translate(-50%,-50%);border:1px solid #ff7079;border-radius:15px;background:#32131aec;color:#fff;display:grid;place-items:center;text-align:center;pointer-events:none;box-shadow:0 0 0 2px #ff707922,0 12px 34px #000a,0 0 24px #ff70792b}.manual-reject b{font-size:20px}.manual-reject small{font-size:9px;color:#ff9ca2;font-weight:1000;letter-spacing:.05em}
@media(max-height:700px){body.manual-game-lock .battle.manual-mode .ez{height:138px!important}.manual-card{height:52px;min-height:52px!important}.manual-command-row>.pad-control{height:40px!important}.digit-pad>button{height:36px!important}.manual-panel{gap:6px!important}}
@media(max-height:620px){body.manual-game-lock .hud{padding-top:3px;padding-bottom:4px}body.manual-game-lock .brand{font-size:24px}body.manual-game-lock .modes{margin-bottom:4px}body.manual-game-lock .battle.manual-mode .ez{height:118px!important}body.manual-game-lock .status{min-height:40px}.manual-card{height:46px;min-height:46px!important}.manual-command-row>.pad-control{height:36px!important}.digit-pad>button{height:32px!important}.expert-bar.show{padding:5px!important}.manual-panel{gap:5px!important}}
`;
  document.head.appendChild(style);

  const fireBtn=document.querySelector('#factorFire'),primeBtn=document.querySelector('#primeFire');
  fireBtn.type='button';fireBtn.classList.add('manual-fire-hidden');fireBtn.setAttribute('aria-hidden','true');fireBtn.tabIndex=-1;
  primeBtn.classList.add('manual-fire-hidden');primeBtn.setAttribute('aria-hidden','true');primeBtn.tabIndex=-1;
  factorInput.classList.add('manual-native-input');factorInput.readOnly=true;factorInput.setAttribute('inputmode','none');factorInput.setAttribute('tabindex','-1');factorInput.setAttribute('aria-hidden','true');

  const panel=document.createElement('div');panel.className='manual-panel';panel.innerHTML=`
    <div class="manual-card-row"><div id="factorReadout" class="card manual-card empty" data-v="" data-p="0" aria-label="Factor card">FACTOR</div></div>
    <div class="manual-command-row"><button type="button" class="pad-control prime-select" id="manualPrime">PRIME</button><button type="button" class="pad-control clear-select" id="factorClear">CLR</button></div>
    <div class="digit-pad" id="digitPad"></div>`;expertBar.appendChild(panel);
  const digitPad=panel.querySelector('#digitPad');for(const d of ['1','2','3','4','5','6','7','8','9','0']){const b=document.createElement('button');b.type='button';b.textContent=d;b.dataset.digit=d;digitPad.appendChild(b)}
  const readout=panel.querySelector('#factorReadout'),primeSelect=panel.querySelector('#manualPrime'),clearBtn=panel.querySelector('#factorClear');
  let primeChoice=false,manualAudio=null;

  function manualMode(){return mode==='expert'||mode==='blitz'}
  function soundOn(){const b=document.querySelector('#cbSfx');return !b||!b.classList.contains('off')}
  function tone(freq,dur=.04,vol=.01){if(!soundOn())return;const C=window.AudioContext||window.webkitAudioContext;if(!C)return;if(!manualAudio)manualAudio=new C();if(manualAudio.state==='suspended')manualAudio.resume().catch(()=>{});const t=manualAudio.currentTime,o=manualAudio.createOscillator(),g=manualAudio.createGain();o.type='sine';o.frequency.value=freq;g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(vol,t+.006);g.gain.exponentialRampToValueAtTime(.0001,t+dur);o.connect(g).connect(manualAudio.destination);o.start(t);o.stop(t+dur+.02)}
  function syncReadout(){const v=factorInput.value;readout.classList.toggle('prime',primeChoice);primeSelect.classList.toggle('on',primeChoice);if(primeChoice){readout.classList.remove('empty');readout.dataset.v='PRIME';readout.dataset.p='1';readout.innerHTML='<div class="manual-value prime-label">PRIME</div>';return}readout.dataset.v=v;readout.dataset.p='0';readout.classList.toggle('empty',!v);readout.innerHTML=v?`<div class="manual-value">${v}</div>`:'FACTOR'}
  function setValue(v){primeChoice=false;factorInput.value=v;syncReadout()}
  function appendDigit(d){if(!manualMode()||busy||done)return;let v=((primeChoice?'':factorInput.value)+d).replace(/^0+(?=\d)/,'');if(v.length>4)v=v.slice(0,4);setValue(v)}
  function clearChoice(){primeChoice=false;factorInput.value='';syncReadout()}
  function selectPrime(){if(!manualMode()||busy||done)return;primeChoice=true;factorInput.value='';syncReadout()}
  function shakeReadout(){readout.classList.remove('bad');void readout.offsetWidth;readout.classList.add('bad');setTimeout(()=>readout.classList.remove('bad'),340)}
  function applyManualLayout(){const on=manualMode();document.documentElement.classList.toggle('manual-game-lock',on);document.body.classList.toggle('manual-game-lock',on);if(on){window.scrollTo(0,0);factorInput.blur()}else clearChoice();syncReadout()}
  function discardSeed(){const s=window.__coreBreakManualSeed;if(s){s.els?.forEach(e=>e.remove());s.card?.remove();delete window.__coreBreakManualSeed}}
  function startManualDrag(e){if(!manualMode()||busy||done)return;if(!primeChoice&&!factorInput.value){shakeReadout();return}e.preventDefault();discardSeed();const p=primeChoice,v=p?'PRIME':factorInput.value,g=document.createElement('div');g.className='ghost'+(p?' prime':'');g.innerHTML=`<div class="manual-ghost-value">${v}</div>`;document.body.appendChild(g);readout.classList.add('drag');drag={c:readout,p,v,g};dragMove(e);window.onpointermove=dragMove;window.onpointerup=dragEnd}

  function rejectDrop(x,y,v,label){const e=document.createElement('div');e.className='manual-reject';e.style.left=x+'px';e.style.top=y+'px';e.innerHTML=`<b>${v}</b><small>${label}</small>`;document.body.appendChild(e);tone(180,.09,.018);e.animate([{transform:'translate(-50%,-50%) scale(.82)',opacity:.15},{transform:'translate(calc(-50% - 8px),-50%) scale(1.04)',opacity:1,offset:.35},{transform:'translate(calc(-50% + 7px),-50%)',offset:.52},{transform:'translate(calc(-50% - 4px),-50%)',offset:.67},{transform:'translate(-50%,-50%) scale(.96)',opacity:.92,offset:.78},{transform:'translate(-50%,-65%) scale(.72)',opacity:0}],{duration:650,easing:'ease-out'});setTimeout(()=>e.remove(),680);msg(label,'r');setTimeout(()=>{if(!busy&&!done)msg('READY')},700)}

  function makeFactorSeed(x,y,f){
    const ar=A.getBoundingClientRect(),radius=Math.min(50,Math.max(28,24+Math.sqrt(Math.min(f,500))*1.25)),cx=Math.max(ar.left+radius+7,Math.min(ar.right-radius-7,x)),cy=Math.max(ar.top+radius+7,Math.min(ar.bottom-radius-7,y)),spacing=2*Math.PI*radius/Math.max(1,f),dot=Math.max(.65,Math.min(4.2,spacing*.58)),card=document.createElement('div'),els=[];
    card.className='manual-drop-card';card.style.left=cx+'px';card.style.top=cy+'px';card.textContent=String(f);document.body.appendChild(card);card.animate([{transform:'scale(.72)',opacity:.2},{transform:'scale(1.05)',opacity:1}],{duration:220,easing:'ease-out',fill:'forwards'});
    for(let i=0;i<f;i++){const a=-Math.PI/2+i*2*Math.PI/f,e=document.createElement('i'),px=cx+Math.cos(a)*radius,py=cy+Math.sin(a)*radius;e.className='manual-seed-dot';e.style.width=dot+'px';e.style.height=dot+'px';e.style.margin=(-dot/2)+'px';e.style.left=px+'px';e.style.top=py+'px';e.style.opacity='1';document.body.appendChild(e);if(f<=120)e.animate([{transform:`translate(${cx-px}px,${cy-py}px) scale(.25)`,opacity:.15},{transform:'translate(0,0) scale(1)',opacity:1}],{duration:250+Math.min(100,i*2),easing:'cubic-bezier(.2,.8,.25,1)',fill:'forwards'});els.push(e)}
    tone(520,.07,.012);window.__coreBreakManualSeed={f,els,card,readyAt:performance.now()+(f<=120?310:180),center:{x:cx,y:cy}}
  }

  function tailCount(k){return k<=5?1:k<=12?2:k<=30?3:5}
  function sequenceTimes(k,total){if(k<=1)return[0];const tail=Math.min(tailCount(k),k-1),head=k-tail,tailSpan=Math.min(total*.38,tail*165),headEnd=Math.max(0,total-tailSpan),out=[];for(let i=0;i<head;i++)out.push(head===1?0:(i/(head-1))*headEnd);for(let j=0;j<tail;j++)out.push(headEnd+(j+1)*(tailSpan/tail));return out}
  function placeSound(i,k,tail){if(k<=12)return true;if(i>=k-tail)return true;const stride=k<=40?2:Math.max(3,Math.ceil(k/16));return i%stride===0}
  async function seedToGuides(seed,g){
    const wait=Math.max(0,seed.readyAt-performance.now());if(wait)await sl(wait);seed.card.animate([{opacity:1,transform:'scale(1.05)'},{opacity:0,transform:'scale(.72)'}],{duration:180,easing:'ease-in'});setTimeout(()=>seed.card.remove(),190);tone(260,.06,.012);
    const ar=A.getBoundingClientRect(),guides=new Array(seed.els.length),tasks=seed.els.map((e,i)=>{const sr=e.getBoundingClientRect(),sx=sr.left+sr.width/2,sy=sr.top+sr.height/2,tx=ar.left+g.p[i][0]+g.z/2,ty=ar.top+g.p[i][1]+g.z/2,bend=(i-(seed.els.length-1)/2)*Math.min(5,30/Math.max(1,seed.els.length));return e.animate([{transform:'translate(0,0) scale(1)',opacity:1},{transform:`translate(${(tx-sx)*.5+bend}px,${(ty-sy)*.38-20}px) scale(1.2)`,offset:.5},{transform:`translate(${tx-sx}px,${ty-sy}px) scale(1)`,opacity:1}],{duration:390+Math.min(150,i*5),delay:Math.min(90,i*4),easing:'cubic-bezier(.2,.8,.25,1)',fill:'forwards'}).finished.catch(()=>{}).then(()=>{e.getAnimations().forEach(a=>a.cancel());const gd=Math.max(3,Math.min(10,g.z*.82));e.className='guide-dot';e.removeAttribute('style');e.style.setProperty('--gd',gd+'px');e.style.left=g.p[i][0]+(g.z-gd)/2+'px';e.style.top=g.p[i][1]+(g.z-gd)/2+'px';A.appendChild(e);guides[i]=e})});await Promise.all(tasks);return guides
  }

  const baseArrange=arrange;
  arrange=async function(f){
    const seed=window.__coreBreakManualSeed;if(!manualMode()||!seed||seed.f!==f)return baseArrange(f);delete window.__coreBreakManualSeed;
    slots.forEach(x=>x.remove());slots=[];dots.forEach(d=>d.el.className='dot');const g=grid(f),guides=await seedToGuides(seed,g);dots.forEach(d=>ds(d,g.z));const k=n,total=Math.min(2150,420+70*k),tt=sequenceTimes(k,total),tail=tailCount(k);msg(`${f}-LINE`);await sl(90);const t0=performance.now();
    for(let i=0;i<k;i++){const dt=tt[i]-(performance.now()-t0);if(dt>0)await sl(dt);const d=dots[i];d.el.classList.add('set');pos(d,g.p[i][0],g.p[i][1],1);if(k<=160||i>=k-tail||i%Math.max(2,Math.ceil(k/80))===0)d.el.animate([{filter:'brightness(1)'},{filter:'brightness(1.7)'},{filter:'brightness(1)'}],{duration:210});if(i<f&&guides[i]){const q=guides[i];q.classList.add('fill');setTimeout(()=>q.remove(),260)}if(placeSound(i,k,tail))tone(460+Math.min(440,Math.round(20*i/Math.max(1,k-1))*22),.03,.007)}
    guides.forEach(q=>{if(q&&q.isConnected){q.classList.add('fill');setTimeout(()=>q.remove(),260)}});await sl(k<=6?180:300);return g
  };

  digitPad.addEventListener('click',e=>{const b=e.target.closest('button[data-digit]');if(b)appendDigit(b.dataset.digit)});clearBtn.addEventListener('click',clearChoice);primeSelect.addEventListener('click',selectPrime);factorInput.addEventListener('focus',()=>factorInput.blur());readout.onpointerdown=startManualDrag;

  const baseDragEnd=dragEnd;
  dragEnd=function(e){
    const d=drag,manualDrag=!!d&&d.c===readout;if(!manualDrag)return baseDragEnd(e);const r=A.getBoundingClientRect(),ok=e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom;
    if(ok&&!d.p){const f=Number(d.v),valid=Number.isInteger(f)&&f>=2&&f<n&&!!prime(f);if(!valid){window.onpointermove=window.onpointerup=null;d.c.classList.remove('drag');d.g.remove();A.classList.remove('ready');drag=null;discardSeed();const label=Number.isInteger(f)&&f>=2&&f<n&&!prime(f)?'NOT PRIME':'INVALID';rejectDrop(e.clientX,e.clientY,d.v,label);invalidInput();return}makeFactorSeed(e.clientX,e.clientY,f)}
    baseDragEnd(e);if(ok&&busy)clearChoice()
  };

  const prevInvalid=invalidInput;invalidInput=function(){prevInvalid();if(manualMode())shakeReadout()};
  const prevRender=renderControls;renderControls=function(){prevRender();discardSeed();clearChoice();applyManualLayout()};
  document.addEventListener('keydown',e=>{if(!manualMode()||busy||done)return;if(/^\d$/.test(e.key)){e.preventDefault();appendDigit(e.key);return}if(e.key==='Backspace'){e.preventDefault();if(primeChoice)clearChoice();else setValue(factorInput.value.slice(0,-1));return}if(e.key==='Delete'||e.key==='Escape'){e.preventDefault();clearChoice();return}if(e.key==='p'||e.key==='P'){e.preventDefault();selectPrime()}});
  applyManualLayout();
})();