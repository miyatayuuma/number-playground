(()=>{
  const style=document.createElement('style');
  style.textContent=`
.orb.prime-charge .spin{animation:none!important;transform-origin:50% 50%;will-change:transform,filter}
.prime-trail{position:absolute;inset:8px;border:3px solid #ffe481;border-radius:50%;box-shadow:0 0 14px #ffd75f,0 0 34px #ffd75f88;opacity:0;pointer-events:none;will-change:transform,opacity,filter}
.orb.prime-charge .oc{box-shadow:0 0 42px #ffd75f,0 0 18px #fff4bd}
`;
  document.head.appendChild(style);

  const baseTryP=tryP;
  let audioCtx=null,activeNodes=[];

  function soundOn(){
    const b=document.querySelector('#cbSfx');
    return !b||!b.classList.contains('off');
  }
  function audioReady(){
    if(!soundOn())return null;
    const C=window.AudioContext||window.webkitAudioContext;
    if(!C)return null;
    if(!audioCtx)audioCtx=new C();
    if(audioCtx.state==='suspended')audioCtx.resume().catch(()=>{});
    return audioCtx;
  }
  function stopChargeAudio(){
    for(const n of activeNodes){try{n.stop()}catch{}try{n.disconnect()}catch{}}
    activeNodes=[];
  }
  function startChargeAudio(ms){
    stopChargeAudio();
    const ac=audioReady();if(!ac)return;
    const t=ac.currentTime,d=ms/1000;
    const master=ac.createGain();
    master.gain.setValueAtTime(.0001,t);
    master.gain.exponentialRampToValueAtTime(.028,t+.13);
    master.gain.setValueAtTime(.028,t+d-.16);
    master.gain.exponentialRampToValueAtTime(.0001,t+d);
    master.connect(ac.destination);
    const a=ac.createOscillator(),b=ac.createOscillator();
    a.type='sine';b.type='triangle';
    a.frequency.setValueAtTime(220,t);a.frequency.exponentialRampToValueAtTime(1450,t+d);
    b.frequency.setValueAtTime(330,t);b.frequency.exponentialRampToValueAtTime(2180,t+d);
    const ga=ac.createGain(),gb=ac.createGain();ga.gain.value=.72;gb.gain.value=.22;
    a.connect(ga).connect(master);b.connect(gb).connect(master);
    a.start(t);b.start(t);a.stop(t+d+.03);b.stop(t+d+.03);
    activeNodes=[a,b];
    setTimeout(()=>{activeNodes=[];try{master.disconnect()}catch{}},ms+100);
  }
  document.querySelector('#cbSfx')?.addEventListener('click',()=>{if(!soundOn())stopChargeAudio()});

  function sequenceTimes(k,total){
    if(k<=1)return[0];
    const tail=Math.min(k<=5?1:k<=12?2:k<=30?3:5,k-1),head=k-tail,tailSpan=Math.min(total*.38,tail*165),headEnd=Math.max(0,total-tailSpan),out=[];
    for(let i=0;i<head;i++)out.push(head===1?0:(i/(head-1))*headEnd);
    for(let j=0;j<tail;j++)out.push(headEnd+(j+1)*(tailSpan/tail));
    return out;
  }
  function primeTone(i,k){
    if(!soundOn())return;
    const ac=audioReady();if(!ac)return;
    const t=ac.currentTime,o=ac.createOscillator(),g=ac.createGain(),f=620+Math.min(620,520*i/Math.max(1,k-1));
    o.type='triangle';o.frequency.setValueAtTime(f,t);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.014,t+.008);g.gain.exponentialRampToValueAtTime(.0001,t+.045);o.connect(g).connect(ac.destination);o.start(t);o.stop(t+.06);
  }
  function lockTone(){
    if(!soundOn())return;
    const ac=audioReady();if(!ac)return;
    for(const [f,delay] of [[880,0],[1320,.055]]){
      const t=ac.currentTime+delay,o=ac.createOscillator(),g=ac.createGain();o.type='sine';o.frequency.value=f;g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.025,t+.01);g.gain.exponentialRampToValueAtTime(.0001,t+.12);o.connect(g).connect(ac.destination);o.start(t);o.stop(t+.14)
    }
  }

  async function chargePrime(o){
    const spin=o.querySelector('.spin');
    o.classList.add('prime-charge');
    const trail=document.createElement('i');trail.className='prime-trail';o.insertBefore(trail,spin);
    const duration=1750;
    msg('SPIN UP','y');
    startChargeAudio(duration);
    const spinAnim=spin.animate([
      {transform:'rotate(0deg) scale(1)',filter:'brightness(1) drop-shadow(0 0 10px #ffd75f)',offset:0},
      {transform:'rotate(150deg) scale(1)',filter:'brightness(1.05) drop-shadow(0 0 12px #ffd75f)',offset:.26},
      {transform:'rotate(720deg) scale(.94)',filter:'brightness(1.2) drop-shadow(0 0 16px #ffd75f)',offset:.56},
      {transform:'rotate(1580deg) scale(.66)',filter:'brightness(1.55) drop-shadow(0 0 22px #ffd75f)',offset:.81},
      {transform:'rotate(2780deg) scale(.31)',filter:'brightness(2.25) drop-shadow(0 0 30px #fff1a6)',offset:1}
    ],{duration,easing:'cubic-bezier(.48,.02,.82,.42)',fill:'forwards'});
    const trailAnim=trail.animate([
      {opacity:0,transform:'scale(1)',filter:'blur(0px)',offset:0},
      {opacity:.08,transform:'scale(.98)',filter:'blur(0px)',offset:.34},
      {opacity:.42,transform:'scale(.82)',filter:'blur(.2px)',offset:.64},
      {opacity:.82,transform:'scale(.54)',filter:'blur(.7px)',offset:.84},
      {opacity:1,transform:'scale(.30)',filter:'blur(1.2px)',offset:1}
    ],{duration,easing:'ease-in',fill:'forwards'});
    await Promise.all([spinAnim.finished.catch(()=>{}),trailAnim.finished.catch(()=>{})]);
    stopChargeAudio();
    msg('READY!','y');
    await sl(120);
  }

  async function launchPrime(o){
    msg('FINAL BREAK!','y');
    await sl(95);
    const er=E.getBoundingClientRect(),or=o.getBoundingClientRect(),sx=or.left+or.width/2,sy=or.top+or.height/2,tx=er.left+er.width/2,ty=er.top+er.height*.5,dx=tx-sx,dy=ty-sy;
    await o.animate([
      {transform:'translate(-50%,-50%) scale(1)',filter:'brightness(1.8)',offset:0},
      {transform:`translate(calc(-50% + ${dx*.16}px),calc(-50% + ${dy*.16}px)) scale(1.12)`,filter:'brightness(2.7)',offset:.18},
      {transform:`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) scale(.72)`,filter:'brightness(5) drop-shadow(0 0 24px #ffd75f)',offset:1}
    ],{duration:520,easing:'cubic-bezier(.36,.04,.18,1)',fill:'forwards'}).finished.catch(()=>{});
    o.remove();
    shake('counter');flash('g');boom();E.classList.add('dead');document.querySelectorAll('.sh i').forEach(x=>x.classList.add('br'));
    await sl(900);
  }

  tryP=async function(){
    if(busy||done)return;
    if(!prime(n))return baseTryP();
    factorInput.blur();busy=1;D.innerHTML='';msg('PRIME!','y');
    const{w,h}=sz(),z=baseD(),cx=w/2-z/2,cy=h/2-z/2,rr=Math.min(w,h)*.34,k=n,total=Math.min(1800,350+55*k),tt=sequenceTimes(k,total);
    const t0=performance.now();
    for(let i=0;i<k;i++){
      const dt=tt[i]-(performance.now()-t0);if(dt>0)await sl(dt);
      const a=-Math.PI/2+i*6.283/k,d=dots[i];
      pos(d,cx+Math.cos(a)*rr,cy+Math.sin(a)*rr,1);
      d.el.animate([{filter:'brightness(1)'},{filter:'brightness(2.15)'},{filter:'brightness(1.12)'}],{duration:220});
      if(k<=12||i>=k-4||i%Math.max(2,Math.ceil(k/14))===0)primeTone(i,k);
    }
    await sl(170);msg('PRIME LOCK!','g');lockTone();await sl(280);
    const o=orb();dots.forEach(d=>d.el.style.opacity=.04);
    await chargePrime(o);
    done=1;score+=30;if(!rage)score+=50;hud();
    await launchPrime(o);
    if(mode==='blitz'){stage++;await sl(320);start();return}
    $('#code').textContent=`${startN} = ${[...fac,n].join(' × ')}`;$('#win').classList.add('show')
  };
})();
