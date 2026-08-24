(()=>{
  const cbStyle=document.createElement('style');
  cbStyle.textContent=`
.sfx-btn{width:39px;min-width:39px;height:39px;border:1px solid #293750;border-radius:12px;background:#0d1420;color:#dce7f6;font-size:17px;display:grid;place-items:center;padding:0}.sfx-btn.off{color:#68758a;filter:saturate(.25)}
.guide-dot{position:absolute;z-index:12;width:var(--gd,10px);height:var(--gd,10px);border-radius:50%;background:#d9f9ff;border:1px solid #fff;box-shadow:0 0 8px #70e6ff,0 0 20px #70e6ff66;pointer-events:none;transition:opacity .25s,transform .25s}.guide-dot.fill{opacity:0;transform:scale(1.9)}
.unfold-dot{position:fixed;z-index:10020;width:7px;height:7px;margin:-3.5px;border-radius:50%;background:#d9f9ff;box-shadow:0 0 8px #70e6ff,0 0 16px #70e6ffaa;pointer-events:none}
.dot.release{filter:brightness(1.25)}.dot.launching{filter:brightness(2.2)}
.dot-impact{position:fixed;z-index:9550;width:8px;height:8px;margin:-4px;border:2px solid #dffcff;border-radius:50%;box-shadow:0 0 10px #70e6ff;pointer-events:none}
/* Keep the enemy and CORE as separate visual objects. */
.ez{height:184px!important}.ez .enemy{top:-20px}.ez .core{bottom:7px;background:#080d15c7;backdrop-filter:blur(7px);border-color:#7185a3}.ez .core b{position:relative;z-index:1}
/* Manual modes use the real enemy unit itself as a stable sticky header. */
.battle.manual-mode{overflow:visible}.battle.manual-mode .ez{position:sticky;top:calc(env(safe-area-inset-top,0px) + 8px);z-index:500;border-radius:22px 22px 0 0;box-shadow:0 12px 30px #0009}
@media(max-width:520px){.sfx-btn{width:36px;min-width:36px;height:36px}.ez{height:174px!important}.ez .enemy{top:-18px}.battle.manual-mode .ez{top:calc(env(safe-area-inset-top,0px) + 6px)}}
`;
  document.head.appendChild(cbStyle);

  const cbStats=document.querySelector('.stats');
  cbStats.insertAdjacentHTML('afterbegin','<button id="cbSfx" class="sfx-btn" type="button" aria-label="Sound on">🔊</button>');

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
    g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(vol,t+.009);g.gain.exponentialRampToValueAtTime(.0001,t+dur);
    o.connect(g).connect(ac.destination);o.start(t);o.stop(t+dur+.025);
  }
  function cbSfx(name,k=0){
    if(!cbSoundOn)return;
    switch(name){
      case'grab':cbTone(430,.045,'triangle',.025);break;
      case'deploy':cbTone(210,.18,'sine',.03,0,520);cbTone(720,.07,'triangle',.018,.13);break;
      case'place':cbTone(460+Math.min(440,k*22),.035,'sine',.014);break;
      case'primeDot':cbTone(640+Math.min(520,k*24),.04,'triangle',.016);break;
      case'primeLock':cbTone(880,.09,'sine',.03);cbTone(1320,.13,'sine',.025,.055);break;
      case'sync':cbTone(620,.13,'sine',.035);cbTone(930,.16,'sine',.03,.07);break;
      case'lost':cbTone(340,.16,'sawtooth',.025,0,180);break;
      case'fire':cbTone(170,.14,'sawtooth',.035,0,560);break;
      case'dotHit':cbTone(880+Math.random()*360,.026,'sine',.008);break;
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

  function cbCenter(el){
    const r=el.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}
  }
  function cbManual(){return mode==='expert'||mode==='blitz'}

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
    await sl(110);
  }

  function cbTailCount(k){return k<=5?1:k<=12?2:k<=30?3:5}
  function cbSequenceTimes(k,total){
    if(k<=1)return[0];
    const tail=Math.min(cbTailCount(k),k-1),head=k-tail,tailSpan=Math.min(total*.38,tail*165),headEnd=Math.max(0,total-tailSpan),out=[];
    for(let i=0;i<head;i++)out.push(head===1?0:(i/(head-1))*headEnd);
    for(let j=0;j<tail;j++)out.push(headEnd+(j+1)*(tailSpan/tail));
    return out;
  }
  function cbPlaceSound(i,k,tail){
    if(k<=12)return true;
    if(i>=k-tail)return true;
    const stride=k<=40?2:Math.max(3,Math.ceil(k/16));
    return i%stride===0;
  }

  arrange=async function(f){
    slots.forEach(x=>x.remove());slots=[];dots.forEach(d=>d.el.className='dot');
    const g=grid(f),origin=cbPendingOrigin||(cbManual()?cbCenter(document.querySelector('#factorFire')):cbCenter(A));
    cbPendingOrigin=null;
    await cbUnfold(f,origin,g);
    dots.forEach(d=>ds(d,g.z));
    const k=n,total=Math.min(2150,420+70*k),tt=cbSequenceTimes(k,total),tail=cbTailCount(k);
    msg(`${f}-LINE`);await sl(110);
    const t0=performance.now();
    for(let i=0;i<k;i++){
      const dt=tt[i]-(performance.now()-t0);if(dt>0)await sl(dt);
      const d=dots[i];d.el.classList.add('set');pos(d,g.p[i][0],g.p[i][1],1);
      d.el.animate([{filter:'brightness(1)'},{filter:'brightness(1.7)'},{filter:'brightness(1)'}],{duration:210});
      if(cbPlaceSound(i,k,tail))cbSfx('place',Math.round(20*i/Math.max(1,k-1)));
    }
    await sl(k<=6?180:300);return g
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

  /* Stable manual-mode layout: no floating clone and no visualViewport choreography. */
  const cbBaseRenderControls=renderControls;
  renderControls=function(){
    cbBaseRenderControls();
    B.classList.toggle('manual-mode',cbManual());
  };
  expertBar.addEventListener('submit',()=>factorInput.blur(),true);
  document.querySelector('#primeFire').addEventListener('pointerdown',()=>factorInput.blur(),true);
  document.querySelector('#modes').addEventListener('pointerdown',()=>factorInput.blur(),true);

  function cbKeepOffset(f){return f===2?0:Math.floor(f/2)}
  function cbAttackTimes(k){
    if(k<=1)return[0];
    const total=Math.min(1320,Math.max(620,500+k*22)),tail=Math.min(4,k),head=k-tail,headEnd=Math.max(0,total-tail*115),out=[];
    for(let i=0;i<head;i++)out.push((i/Math.max(1,head))*headEnd+Math.random()*35);
    for(let j=0;j<tail;j++)out.push(headEnd+(j+1)*(total-headEnd)/tail);
    return out;
  }
  function cbDotImpact(x,y,strong=false){
    cbSfx('dotHit');
    if(strong||Math.random()<.38){
      const e=document.createElement('i');e.className='dot-impact';e.style.left=(x+(Math.random()-.5)*22)+'px';e.style.top=(y+(Math.random()-.5)*18)+'px';document.body.appendChild(e);
      e.animate([{transform:'scale(.35)',opacity:1},{transform:'scale(2.5)',opacity:0}],{duration:180,easing:'ease-out'});setTimeout(()=>e.remove(),210)
    }
  }

  fire=async function(f){
    const rows=n/f,keep=cbKeepOffset(f),ammoEntries=[];
    for(let r=0;r<rows;r++){
      const base=r*f,k=base+keep,group=dots.slice(base,base+f),cx=group.reduce((s,d)=>s+d.x,0)/group.length,cy=group.reduce((s,d)=>s+d.y,0)/group.length;
      const kd=dots[k];kd.el.classList.add('keep');pos(kd,cx,cy,1);
      for(let c=0;c<f;c++)if(c!==keep)ammoEntries.push(dots[base+c]);
    }
    const order=shuf(ammoEntries.slice()),schedule=cbAttackTimes(order.length),tr=E.getBoundingClientRect(),tx=tr.left+tr.width/2,ty=tr.top+tr.height*.5;
    msg('CHARGE','y');await sl(300);msg('FIRE!','y');await sl(90);
    const t0=performance.now(),tasks=order.map((d,rank)=>(async()=>{
      const waitFor=schedule[rank]-(performance.now()-t0);if(waitFor>0)await sl(waitFor);
      d.el.classList.add('launching');
      d.el.animate([{filter:'brightness(1)'},{filter:'brightness(2.7)'},{filter:'brightness(1.3)'}],{duration:105});
      await sl(55);
      const sr=d.el.getBoundingClientRect(),sx=sr.left+sr.width/2,sy=sr.top+sr.height/2,e=document.createElement('i');
      e.className='shot';e.style.left=sx-4+'px';e.style.top=sy-4+'px';e.style.color=d.el.style.color;document.body.appendChild(e);d.el.style.opacity=.05;
      const dx=tx-sx+(Math.random()-.5)*18,dy=ty-sy+(Math.random()-.5)*16,dur=390+Math.random()*150,curve=(Math.random()-.5)*34;
      await e.animate([
        {transform:'translate(0,0) scale(.75)',opacity:.9},
        {transform:`translate(${dx*.52+curve}px,${dy*.48-18}px) scale(1.2)`,opacity:1,offset:.5},
        {transform:`translate(${dx}px,${dy}px) scale(.18)`,opacity:0}
      ],{duration:dur,easing:'cubic-bezier(.2,.72,.24,1)',fill:'forwards'}).finished.catch(()=>{});
      e.remove();cbDotImpact(tx,ty,rank===order.length-1)
    })());
    await Promise.all(tasks);
    cbSfx('hit');react('hit');shake('impact');flash('g');parts(Math.min(24,10+(order.length/5|0)));breakSh();
    return rows
  };

  async function cbReleaseDots(f,rows){
    const old=dots.slice(),survivors=[],keep=cbKeepOffset(f);
    for(let i=0;i<old.length;i++){
      if(i%f===keep)survivors.push(old[i]);
      else old[i].el.remove();
    }
    dots=survivors;n=rows;hud();
    const z=baseD(),targets=dots.map(()=>rand(z));cbSfx('release');
    A.animate([{filter:'brightness(1.14)'},{filter:'brightness(1)'}],{duration:720,easing:'ease-out'});
    dots.forEach((d,i)=>{
      const [x,y]=targets[i],a=Math.random()*Math.PI*2,v=.04+Math.random()*.04;
      d.el.className='dot release';d.el.style.opacity='1';d.el.style.color=color(i,n);
      d.el.style.transition=`transform .72s cubic-bezier(.12,.72,.18,1) ${Math.random()*70|0}ms,width .62s ease,height .62s ease,color .55s ease,box-shadow .55s ease`;
      ds(d,z);d.x=x;d.y=y;d.el.style.transform=`translate3d(${x}px,${y}px,0)`;d.vx=Math.cos(a)*v;d.vy=Math.sin(a)*v;d.p=Math.random()*Math.PI*2;
    });
    await sl(820);dots.forEach(d=>{d.el.className='dot';d.el.style.transition='none'});
  }

  good=async function(f){
    const rows=await fire(f);msg('BREAK!','y');await sl(260);fac.push(f);score+=20;
    await cbReleaseDots(f,rows);A.classList.remove('ok');busy=0;renderControls();msg('READY')
  };

  const cbBaseTryP=tryP;
  tryP=async function(){
    if(busy||done)return;
    if(!prime(n))return cbBaseTryP();
    factorInput.blur();busy=1;D.innerHTML='';msg('PRIME!','y');
    const{w,h}=sz(),z=baseD(),cx=w/2-z/2,cy=h/2-z/2,rr=Math.min(w,h)*.34,k=n,total=Math.min(1800,350+55*k),tt=cbSequenceTimes(k,total),tail=cbTailCount(k);
    const t0=performance.now();
    for(let i=0;i<k;i++){
      const dt=tt[i]-(performance.now()-t0);if(dt>0)await sl(dt);
      const a=-Math.PI/2+i*6.283/k,d=dots[i];
      pos(d,cx+Math.cos(a)*rr,cy+Math.sin(a)*rr,1);
      d.el.animate([{filter:'brightness(1)'},{filter:'brightness(2.15)'},{filter:'brightness(1.12)'}],{duration:220});
      if(cbPlaceSound(i,k,tail))cbSfx('primeDot',Math.round(20*i/Math.max(1,k-1)));
    }
    await sl(170);msg('PRIME LOCK!','g');cbSfx('primeLock');await sl(260);
    const o=orb();dots.forEach(d=>d.el.style.opacity=.04);msg('SPIN UP!','y');await sl(950);o.querySelector('.spin').classList.add('fast');msg('READY!','y');await wait(3000);
    done=1;score+=30;if(!rage)score+=50;hud();await primeHit(o);
    if(mode==='blitz'){stage++;await sl(320);start();return}
    $('#code').textContent=`${startN} = ${[...fac,n].join(' × ')}`;$('#win').classList.add('show')
  };

  renderControls();
})();
