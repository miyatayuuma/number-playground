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
body.manual-game-lock .expert-bar.show{display:block!important;padding:7px;background:#0d141f}
.manual-native-input,.manual-fire-hidden{position:absolute!important;width:1px!important;height:1px!important;opacity:0!important;pointer-events:none!important;clip-path:inset(50%)!important}
.manual-panel{display:grid;gap:6px}.manual-choice-row{display:grid;grid-template-columns:minmax(0,1fr) 58px 84px;gap:6px;align-items:stretch}
.manual-card{height:62px;min-height:62px!important;display:flex;align-items:center;justify-content:center;padding:0!important;cursor:grab;overflow:hidden}.manual-card.empty{color:#718097;font-size:13px;letter-spacing:.12em;cursor:default}.manual-card.bad{animation:inputShake .28s ease;border-color:#ff7079;box-shadow:0 0 0 3px #ff707914}.manual-card.prime{border-color:#776429;background:linear-gradient(#3c3218,#211c10)}.manual-card .factor-symbol{transform:scale(.82)}.manual-card.drag{cursor:grabbing}
.pad-control,.digit-pad button{border:1px solid #34435b;border-radius:11px;background:#151e2c;color:#fff;font:inherit;font-weight:1000;touch-action:manipulation}.pad-control{height:62px;font-size:13px}.prime-select{border-color:#776429;background:#302817;color:#ffe481}.prime-select.on{box-shadow:0 0 0 2px #ffd75f55,0 0 18px #ffd75f22}
.digit-pad{display:grid;grid-template-columns:repeat(5,1fr);gap:5px}.digit-pad button{height:42px;font-size:18px}
@media(max-height:700px){body.manual-game-lock .battle.manual-mode .ez{height:138px!important}.manual-card,.pad-control{height:54px;min-height:54px!important}.digit-pad button{height:38px}.manual-panel{gap:5px}}
@media(max-height:620px){body.manual-game-lock .hud{padding-top:3px;padding-bottom:4px}body.manual-game-lock .brand{font-size:24px}body.manual-game-lock .modes{margin-bottom:4px}body.manual-game-lock .battle.manual-mode .ez{height:118px!important}body.manual-game-lock .status{min-height:40px}.manual-card,.pad-control{height:48px;min-height:48px!important}.digit-pad button{height:34px}.expert-bar.show{padding:5px!important}}
`;
  document.head.appendChild(style);

  const fireBtn=document.querySelector('#factorFire');
  const primeBtn=document.querySelector('#primeFire');
  fireBtn.type='button';fireBtn.classList.add('manual-fire-hidden');fireBtn.setAttribute('aria-hidden','true');fireBtn.tabIndex=-1;
  factorInput.classList.add('manual-native-input');
  factorInput.readOnly=true;
  factorInput.setAttribute('inputmode','none');
  factorInput.setAttribute('tabindex','-1');
  factorInput.setAttribute('aria-hidden','true');

  const panel=document.createElement('div');
  panel.className='manual-panel';
  panel.innerHTML=`
    <div class="manual-choice-row">
      <div id="factorReadout" class="card manual-card empty" data-v="" data-p="0" aria-label="Factor card">FACTOR</div>
      <button type="button" class="pad-control" id="factorClear">CLR</button>
    </div>
    <div class="digit-pad" id="digitPad"></div>`;
  expertBar.appendChild(panel);
  panel.querySelector('.manual-choice-row').appendChild(primeBtn);
  primeBtn.type='button';primeBtn.classList.add('pad-control','prime-select');primeBtn.textContent='PRIME';

  const digitPad=panel.querySelector('#digitPad');
  for(const d of ['1','2','3','4','5','6','7','8','9','0']){
    const b=document.createElement('button');b.type='button';b.textContent=d;b.dataset.digit=d;digitPad.appendChild(b);
  }
  const readout=panel.querySelector('#factorReadout');
  let primeChoice=false;

  function manualMode(){return mode==='expert'||mode==='blitz'}
  function numberCardHTML(v){
    const x=Number(v);
    if(Number.isInteger(x)&&x>=2&&x<=53)return ringHTML(x,0);
    return `<div class="factor-symbol"><div class="val">${v}</div></div>`
  }
  function syncReadout(){
    const v=factorInput.value;
    readout.classList.toggle('prime',primeChoice);
    primeBtn.classList.toggle('on',primeChoice);
    if(primeChoice){readout.classList.remove('empty');readout.dataset.v='PRIME';readout.dataset.p='1';readout.innerHTML=ringHTML('PRIME',1);return}
    readout.dataset.v=v;readout.dataset.p='0';readout.classList.toggle('empty',!v);
    readout.innerHTML=v?numberCardHTML(v):'FACTOR';
  }
  function setValue(v){primeChoice=false;factorInput.value=v;syncReadout()}
  function appendDigit(d){
    if(!manualMode()||busy||done)return;
    let v=((primeChoice?'':factorInput.value)+d).replace(/^0+(?=\d)/,'');
    if(v.length>4)v=v.slice(0,4);
    setValue(v)
  }
  function clearChoice(){primeChoice=false;factorInput.value='';syncReadout()}
  function selectPrime(){if(!manualMode()||busy||done)return;primeChoice=true;factorInput.value='';syncReadout()}
  function shakeReadout(){readout.classList.remove('bad');void readout.offsetWidth;readout.classList.add('bad');setTimeout(()=>readout.classList.remove('bad'),340)}
  function applyManualLayout(){
    const on=manualMode();
    document.documentElement.classList.toggle('manual-game-lock',on);
    document.body.classList.toggle('manual-game-lock',on);
    if(on){window.scrollTo(0,0);factorInput.blur()}else clearChoice();
    syncReadout();
  }

  digitPad.addEventListener('click',e=>{const b=e.target.closest('button[data-digit]');if(b)appendDigit(b.dataset.digit)});
  panel.querySelector('#factorClear').addEventListener('click',clearChoice);
  primeBtn.onclick=selectPrime;
  factorInput.addEventListener('focus',()=>factorInput.blur());

  readout.onpointerdown=e=>{
    if(!manualMode()||busy||done)return;
    if(!primeChoice&&!factorInput.value){shakeReadout();return}
    dragStart(e)
  };

  const baseDragEnd=dragEnd;
  dragEnd=function(e){
    const manualDrag=!!drag&&drag.c===readout;
    let ok=false;
    if(manualDrag){const r=A.getBoundingClientRect();ok=e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom}
    baseDragEnd(e);
    if(manualDrag&&ok&&busy)clearChoice()
  };

  const prevInvalid=invalidInput;
  invalidInput=function(){prevInvalid();if(manualMode())shakeReadout()};

  const prevRender=renderControls;
  renderControls=function(){prevRender();clearChoice();applyManualLayout()};

  document.addEventListener('keydown',e=>{
    if(!manualMode()||busy||done)return;
    if(/^\d$/.test(e.key)){e.preventDefault();appendDigit(e.key);return}
    if(e.key==='Backspace'){e.preventDefault();if(primeChoice)clearChoice();else setValue(factorInput.value.slice(0,-1));return}
    if(e.key==='Delete'||e.key==='Escape'){e.preventDefault();clearChoice();return}
    if(e.key==='p'||e.key==='P'){e.preventDefault();selectPrime()}
  });

  applyManualLayout();
})();