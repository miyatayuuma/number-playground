(()=>{
  const cbStyle=document.createElement('style');
  cbStyle.textContent=`
.sfx-btn{width:39px;min-width:39px;height:39px;border:1px solid #293750;border-radius:12px;background:#0d1420;color:#dce7f6;font-size:17px;display:grid;place-items:center;padding:0}.sfx-btn.off{color:#68758a;filter:saturate(.25)}
.guide-dot{position:absolute;z-index:12;width:var(--gd,10px);height:var(--gd,10px);border-radius:50%;background:#d9f9ff;border:1px solid #fff;box-shadow:0 0 8px #70e6ff,0 0 20px #70e6ff66;pointer-events:none;transition:opacity .25s,transform .25s}.guide-dot.fill{opacity:0;transform:scale(1.9)}
.unfold-dot{position:fixed;z-index:10020;width:7px;height:7px;margin:-3.5px;border-radius:50%;background:#d9f9ff;box-shadow:0 0 8px #70e6ff,0 0 16px #70e6ffaa;pointer-events:none}
.battle.ez-floating{padding-top:156px}.ez.input-float{position:fixed;z-index:11000;height:88px!important;border:1px solid #42536f;border-radius:20px;box-shadow:0 15px 44px #000c,0 0 24px #70e6ff18;backdrop-filter:blur(12px);transition:height .18s,border-radius .18s,box-shadow .18s}.ez.input-float .enemy{position:absolute;left:42%;top:50%;font-size:48px;animation:none;transform:translate(-50%,-50%) scale(var(--s));transform-origin:center}.ez.input-float .aura{left:42%;top:50%;width:78px;height:78px;margin:-39px 0 0 -39px}.ez.input-float .aura:before{inset:9px}.ez.input-float .aura:after{inset:19px}.ez.input-float .sh i{left:42%;top:50%;width:72px;height:72px}.ez.input-float .sh i:nth-child(2){width:82px;height:82px}.ez.input-float .sh i:nth-child(3){width:91px;height:91px}.ez.input-float .rage{left:7px;top:7px;padding:4px 6px}.ez.input-float .rage small{display:none}.ez.input-float .pips i{width:11px;height:5px}.ez.input-float .core{left:69%;top:50%;bottom:auto;transform:translate(-50%,-50%);padding:5px 11px}.ez.input-float .core small{font-size:8px}.ez.input-float .core b{font-size:27px}
.dot.release{filter:brightness(1.25)}
@media(max-width:520px){.sfx-btn{width:36px;min-width:36px;height:36px}.battle.ez-floating{padding-top:150px}.ez.input-float{height:82px!important}.ez.input-float .enemy{left:39%;font-size:44px}.ez.input-float .aura{left:39%;width:72px;height:72px;margin:-36px 0 0 -36px}.ez.input-float .sh i{left:39%;width:66px;height:66px}.ez.input-float .sh i:nth-child(2){width:76px;height:76px}.ez.input-float .sh i:nth-child(3){width:84px;height:84px}.ez.input-float .core{left:68%;padding:5px 9px}.ez.input-float .core b{font-size:25px}}
`;
  document.head.appendChild(cbStyle);

  const cbStats=document.querySelector('.stats');
  cbStats.insertAdjacentHTML('afterbegin','<button id="cbSfx" class="sfx-btn" type="button" aria-label="Sound on">🔊</button>');

  let cbSoundOn=true,cbAudio=null,cbPendingOrigin=null,cbEnemyFloating=false;

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
      case'release':cbTone(280,.22,'sine',.018,0,620);cbTone(510,.14,'triangle',.014,.08,820);break;
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
    const manual=mode==='expert'||mode==='blitz';
    const g=grid(f),origin=cbPendingOrigin||(manual?cbCenter(document.querySelector('#factorFire')):cbCenter(A));
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

  function cbFloatPosition(){
    if(!cbEnemyFloating)return;
    const vv=window.visualViewport;
    const vw=vv?.width||window.innerWidth,vh=vv?.height||window.innerHeight,ox=vv?.offsetLeft||0,oy=vv?.offsetTop||0;
    const bw=B.getBoundingClientRect().width,width=Math.min(bw,430,Math.max(260,vw-20));
    const left=ox+(vw-width)/2;
    const top=oy+Math.max(52,Math.min(88,vh*.12));
    EZ.style.left=left+'px';EZ.style.top=top+'px';EZ.style.width=width+'px';
  }
  function cbFloatEnemy(show){
    const manual=mode==='expert'||mode==='blitz';
    show=!!show&&manual;
    cbEnemyFloating=show;
    B.classList.toggle('ez-floating',show);EZ.classList.toggle('input-float',show);
    if(show)cbFloatPosition();
    else{EZ.style.removeProperty('left');EZ.style.removeProperty('top');EZ.style.removeProperty('width')}
  }
  factorInput.addEventListener('focus',()=>cbFloatEnemy(true));
  factorInput.addEventListener('blur',()=>setTimeout(()=>cbFloatEnemy(document.activeElement===factorInput),60));
  expertBar.addEventListener('submit',()=>factorInput.blur(),true);
  document.querySelector('#primeFire').addEventListener('pointerdown',()=>factorInput.blur(),true);
  document.querySelector('#modes').addEventListener('pointerdown',()=>factorInput.blur(),true);
  window.visualViewport?.addEventListener('resize',cbFloatPosition);
  window.visualViewport?.addEventListener('scroll',cbFloatPosition);
  window.addEventListener('resize',cbFloatPosition);

  async function cbReleaseDots(f,rows){
    const old=dots.slice(),survivors=[];
    for(let i=0;i<old.length;i++){
      if(i%f===0)survivors.push(old[i]);
      else old[i].el.remove();
    }
    dots=survivors;
    n=rows;hud();
    const z=baseD(),targets=dots.map(()=>rand(z));
    cbSfx('release');
    A.animate([
      {filter:'brightness(1.14)'},
      {filter:'brightness(1)',offset:1}
    ],{duration:720,easing:'ease-out'});
    dots.forEach((d,i)=>{
      const [x,y]=targets[i],a=Math.random()*Math.PI*2,v=.04+Math.random()*.04;
      d.el.className='dot release';d.el.style.opacity='1';d.el.style.color=color(i,n);
      d.el.style.transition=`transform .72s cubic-bezier(.12,.72,.18,1) ${Math.random()*70|0}ms,width .62s ease,height .62s ease,color .55s ease,box-shadow .55s ease`;
      ds(d,z);d.x=x;d.y=y;d.el.style.transform=`translate3d(${x}px,${y}px,0)`;
      d.vx=Math.cos(a)*v;d.vy=Math.sin(a)*v;d.p=Math.random()*Math.PI*2;
    });
    await sl(820);
    dots.forEach(d=>{d.el.className='dot';d.el.style.transition='none'});
  }

  good=async function(f){
    const rows=await fire(f);
    msg('BREAK!','y');await sl(320);
    fac.push(f);score+=20;
    await cbReleaseDots(f,rows);
    A.classList.remove('ok');busy=0;renderControls();msg('READY')
  };

  cards();
})();
