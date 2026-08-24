(()=>{
  const cbStyle=document.createElement('style');
  cbStyle.textContent=`
.sfx-btn{width:39px;min-width:39px;height:39px;border:1px solid #293750;border-radius:12px;background:#0d1420;color:#dce7f6;font-size:17px;display:grid;place-items:center;padding:0}.sfx-btn.off{color:#68758a;filter:saturate(.25)}
.focus-hud{position:fixed;z-index:11000;top:max(8px,env(safe-area-inset-top));left:50%;transform:translate(-50%,-12px);display:flex;align-items:center;gap:10px;min-width:220px;padding:7px 11px;border:1px solid #42536f;border-radius:18px;background:#090e16e8;box-shadow:0 12px 38px #000a,0 0 20px #70e6ff18;backdrop-filter:blur(12px);opacity:0;pointer-events:none;transition:.16s}.focus-hud.show{opacity:1;transform:translate(-50%,0)}.fh-enemy{font-size:30px;line-height:1}.fh-core{display:flex;align-items:baseline;gap:5px}.fh-core small{font-size:8px;color:#98a6ba;font-weight:1000}.fh-core b{font-size:24px}.fh-rage{margin-left:auto;font-size:11px;letter-spacing:1px;color:#6f7d92}.fh-rage.hot{color:var(--r);text-shadow:0 0 8px #ff707977}
.guide-dot{position:absolute;z-index:12;width:var(--gd,10px);height:var(--gd,10px);border-radius:50%;background:#d9f9ff;border:1px solid #fff;box-shadow:0 0 8px #70e6ff,0 0 20px #70e6ff66;pointer-events:none;transition:opacity .25s,transform .25s}.guide-dot.fill{opacity:0;transform:scale(1.9)}
.unfold-dot{position:fixed;z-index:10020;width:7px;height:7px;margin:-3.5px;border-radius:50%;background:#d9f9ff;box-shadow:0 0 8px #70e6ff,0 0 16px #70e6ffaa;pointer-events:none}
@media(max-width:520px){.focus-hud{min-width:205px}.sfx-btn{width:36px;min-width:36px;height:36px}}
`;
  document.head.appendChild(cbStyle);

  const cbStats=document.querySelector('.stats');
  cbStats.insertAdjacentHTML('afterbegin','<button id="cbSfx" class="sfx-btn" type="button" aria-label="Sound on">🔊</button>');
  document.body.insertAdjacentHTML('beforeend','<div id="cbFocusHud" class="focus-hud"><span id="cbFhEnemy" class="fh-enemy">🐲</span><span class="fh-core"><small>CORE</small><b id="cbFhNum">60</b></span><span id="cbFhRage" class="fh-rage">○○○○</span></div>');

  let cbSoundOn=true,cbAudio=null,cbPendingOrigin=null;

  function cbAudioReady(){
    if(!cbSoundOn)return null;
    if(!cbAudio){
      const C=window.AudioContext||window.webkitAudioContext;
      if(!C)return null;
      cbAudio=new C();
    }
    if(cbAudio.state==='suspended')cbAudio.resume().catch(()=>{});
    return cbAudio;
  }
  function cbTone(freq,dur=.08,type='sine',vol=.035,delay=0,endFreq=0){
    const ac=cbAudioReady();if(!ac)return;
    const t=ac.currentTime+delay,o=ac.createOscillator(),g=ac.createGain();
    o.type=type;o.frequency.setValueAtTime(Math.max(25,freq),t);
    if(endFreq)o.frequency.exponentialRampToValueAtTime(Math.max(25,endFreq),t+dur);
    g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(vol,t+.012);g.gain.exponentialRampToValueAtTime(.0001,t+dur);
    o.connect(g).connect(ac.destination);o.start(t);o.stop(t+dur+.025);
  }
  function cbSfx(name,k=0){
    if(!cbSoundOn)return;
    switch(name){
      case'grab':cbTone(430,.045,'triangle',.025);break;
      case'deploy':cbTone(210,.18,'sine',.03,0,520);cbTone(720,.07,'triangle',.018,.13);break;
      case'tick':cbTone(520+k*65,.055,'sine',.024);break;
      case'sync':cbTone(620,.13,'sine',.035);cbTone(930,.16,'sine',.03,.07);break;
      case'lost':cbTone(340,.16,'sawtooth',.025,0,180);break;
      case'fire':cbTone(170,.14,'sawtooth',.035,0,560);break;
      case'hit':cbTone(95,.16,'square',.045);cbTone(58,.23,'sine',.035);break;
      case'rage':cbTone(105,.35,'sawtooth',.03,0,62);break;
      case'prime':cbTone(240,.8,'sine',.025,0,1200);cbTone(480,.7,'triangle',.018,.18,1800);break;
      case'final':cbTone(150,.2,'sawtooth',.04,0,900);cbTone(65,.42,'sine',.05,.16);break;
      case'over':cbTone(180,.45,'sawtooth',.025,0,55);break;
      case'ui':cbTone(650,.05,'sine',.02);break;
    }
  }
  document.addEventListener('pointerdown',()=>cbAudioReady(),{capture:true,once:true});
  document.addEventListener('keydown',()=>cbAudioReady(),{capture:true,once:true});
  document.querySelector('#cbSfx').onclick=()=>{
    cbSoundOn=!cbSoundOn;
    const b=document.querySelector('#cbSfx');b.textContent=cbSoundOn?'🔊':'🔇';b.classList.toggle('off',!cbSoundOn);b.setAttribute('aria-label',cbSoundOn?'Sound on':'Sound off');
    if(cbSoundOn){cbAudioReady();cbSfx('ui')}
  };

  const cbBaseMsg=msg;
  msg=function(x,c=''){
    cbBaseMsg(x,c);
    if(x==='SYNC!')cbSfx('sync');
    else if(x==='LOST!'||x==='LOCKED!')cbSfx('lost');
    else if(x==='FIRE!')cbSfx('fire');
    else if(x==='RAGE!'||x==='DANGER!'||x==='BERSERK!'||x==='RAGE MAX!')cbSfx('rage');
    else if(x==='SPIN UP!')cbSfx('prime');
    else if(x==='FINAL BREAK!')cbSfx('final');
    else if(x==='OVERRUN!'||x==='TIME UP!')cbSfx('over');
  };

  const cbBaseReact=react;
  react=function(c){if(c==='hit')cbSfx('hit');return cbBaseReact(c)};

  function cbCenter(el){
    const r=el.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}
  }
  async function cbUnfold(f,origin,g){
    cbSfx('deploy');
    const ar=A.getBoundingClientRect(),tasks=[],guides=[];
    for(let i=0;i<f;i++){
      const e=document.createElement('i');e.className='unfold-dot';e.style.left=origin.x+'px';e.style.top=origin.y+'px';document.body.appendChild(e);
      const tx=ar.left+g.p[i][0]+g.z/2,ty=ar.top+g.p[i][1]+g.z/2,bend=(i-(f-1)/2)*Math.min(7,42/Math.max(1,f));
      const an=e.animate([
        {transform:'translate(0,0) scale(.65)',opacity:.75},
        {transform:`translate(${(tx-origin.x)*.48+bend}px,${(ty-origin.y)*.35-28}px) scale(1.35)`,opacity:1,offset:.52},
        {transform:`translate(${tx-origin.x}px,${ty-origin.y}px) scale(1)`,opacity:1}
      ],{duration:360+Math.min(180,i*9),delay:Math.min(150,i*9),easing:'cubic-bezier(.2,.8,.25,1)',fill:'forwards'});
      tasks.push(an.finished.catch(()=>{}).then(()=>{
        e.remove();
        const q=document.createElement('i'),gd=Math.max(5,g.z*.82);
        q.className='guide-dot';q.style.setProperty('--gd',gd+'px');q.style.left=g.p[i][0]+(g.z-gd)/2+'px';q.style.top=g.p[i][1]+(g.z-gd)/2+'px';A.appendChild(q);guides.push(q)
      }));
    }
    await Promise.all(tasks);
    setTimeout(()=>guides.forEach((q,i)=>setTimeout(()=>{q.classList.add('fill');setTimeout(()=>q.remove(),260)},i*12)),620);
    await new Promise(r=>setTimeout(r,110));
  }

  const cbBaseArrange=arrange;
  arrange=async function(f){
    const g=grid(f),origin=cbPendingOrigin||(manualMode()?cbCenter(document.querySelector('#factorFire')):cbCenter(A));
    cbPendingOrigin=null;
    await cbUnfold(f,origin,g);
    const tail=Math.min(5,n);
    for(let i=0;i<tail;i++)setTimeout(()=>cbSfx('tick',i),1750+i*(tail>1?170:0));
    return cbBaseArrange(f);
  };

  const cbBaseDragStart=dragStart;
  dragStart=function(e){cbSfx('grab');return cbBaseDragStart(e)};
  dragEnd=function(e){
    if(!drag)return;
    window.onpointermove=window.onpointerup=null;
    const r=A.getBoundingClientRect(),ok=e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom,d=drag;
    d.c.classList.remove('drag');d.g.remove();A.classList.remove('ready');drag=null;
    if(ok){cbPendingOrigin={x:e.clientX,y:e.clientY};d.p?tryP():tryF(+d.v)}
  };

  function cbHudUpdate(){
    document.querySelector('#cbFhEnemy').textContent=enemy;
    document.querySelector('#cbFhNum').textContent=n;
    const r=document.querySelector('#cbFhRage');r.textContent='●'.repeat(rage)+'○'.repeat(4-rage);r.classList.toggle('hot',rage>=2);
  }
  function cbHudShow(show){
    document.querySelector('#cbFocusHud').classList.toggle('show',!!show&&(mode==='expert'||mode==='blitz'));
    if(show)cbHudUpdate();
  }
  const cbObserver=new MutationObserver(cbHudUpdate);
  cbObserver.observe(document.querySelector('#num'),{childList:true,subtree:true});
  cbObserver.observe(document.querySelector('#en'),{childList:true,subtree:true});
  cbObserver.observe(document.querySelector('#pips'),{attributes:true,subtree:true,attributeFilter:['class']});
  factorInput.addEventListener('focus',()=>cbHudShow(true));
  factorInput.addEventListener('blur',()=>setTimeout(()=>cbHudShow(document.activeElement===factorInput),80));
  window.visualViewport?.addEventListener('resize',()=>cbHudShow(document.activeElement===factorInput));
  window.visualViewport?.addEventListener('scroll',()=>cbHudShow(document.activeElement===factorInput));

  cards();
  cbHudUpdate();
})();