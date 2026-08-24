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
.manual-native-input{position:absolute!important;width:1px!important;height:1px!important;opacity:0!important;pointer-events:none!important;clip-path:inset(50%)!important}
.manual-panel{display:grid;gap:6px}.factor-readout-row{display:grid;grid-template-columns:minmax(0,1fr) 46px 46px;gap:6px}.factor-readout{height:42px;border:1px solid #34435b;border-radius:12px;background:#101927;display:flex;align-items:center;justify-content:center;color:#f7f9ff;font-size:23px;font-weight:1000;letter-spacing:.08em}.factor-readout.empty{color:#718097;font-size:14px;letter-spacing:.12em}.factor-readout.bad{animation:inputShake .28s ease;border-color:#ff7079;box-shadow:0 0 0 3px #ff707914}.pad-edit,.digit-pad button,.manual-actions button{border:1px solid #34435b;border-radius:11px;background:#151e2c;color:#fff;font:inherit;font-weight:1000;touch-action:manipulation}.pad-edit{height:42px;font-size:15px}.digit-pad{display:grid;grid-template-columns:repeat(5,1fr);gap:5px}.digit-pad button{height:42px;font-size:18px}.manual-actions{display:grid;grid-template-columns:1fr 1fr;gap:6px}.manual-actions button{height:46px;font-size:14px}.manual-actions .prime-fire{border-color:#776429;background:#302817;color:#ffe481}
@media(max-height:700px){body.manual-game-lock .battle.manual-mode .ez{height:138px!important}.factor-readout-row{grid-template-columns:minmax(0,1fr) 42px 42px}.factor-readout,.pad-edit{height:38px}.digit-pad button{height:38px}.manual-actions button{height:42px}.manual-panel{gap:5px}}
@media(max-height:620px){body.manual-game-lock .hud{padding-top:3px;padding-bottom:4px}body.manual-game-lock .brand{font-size:24px}body.manual-game-lock .modes{margin-bottom:4px}body.manual-game-lock .battle.manual-mode .ez{height:118px!important}body.manual-game-lock .status{min-height:40px}.factor-readout,.pad-edit{height:35px}.digit-pad button{height:35px}.manual-actions button{height:39px}.expert-bar.show{padding:5px!important}}
`;
  document.head.appendChild(style);

  const fireBtn=document.querySelector('#factorFire');
  const primeBtn=document.querySelector('#primeFire');
  factorInput.classList.add('manual-native-input');
  factorInput.readOnly=true;
  factorInput.setAttribute('inputmode','none');
  factorInput.setAttribute('tabindex','-1');
  factorInput.setAttribute('aria-hidden','true');
  try{factorInput.focus=()=>{}}catch{}

  const panel=document.createElement('div');
  panel.className='manual-panel';
  panel.innerHTML=`
    <div class="factor-readout-row">
      <div id="factorReadout" class="factor-readout empty" aria-live="polite">FACTOR</div>
      <button type="button" class="pad-edit" id="factorBack" aria-label="Backspace">⌫</button>
      <button type="button" class="pad-edit" id="factorClear">CLR</button>
    </div>
    <div class="digit-pad" id="digitPad"></div>
    <div class="manual-actions" id="manualActions"></div>`;
  expertBar.appendChild(panel);
  const digitPad=panel.querySelector('#digitPad');
  const actions=panel.querySelector('#manualActions');
  actions.append(fireBtn,primeBtn);
  for(const d of ['1','2','3','4','5','6','7','8','9','0']){
    const b=document.createElement('button');b.type='button';b.textContent=d;b.dataset.digit=d;digitPad.appendChild(b);
  }
  const readout=panel.querySelector('#factorReadout');

  function manualMode(){return mode==='expert'||mode==='blitz'}
  function syncReadout(){
    const v=factorInput.value;
    readout.textContent=v||'FACTOR';
    readout.classList.toggle('empty',!v);
  }
  function setValue(v){factorInput.value=v;syncReadout()}
  function appendDigit(d){
    if(!manualMode()||busy||done)return;
    let v=(factorInput.value+d).replace(/^0+(?=\d)/,'');
    if(v.length>4)v=v.slice(0,4);
    setValue(v)
  }
  function backspace(){if(!manualMode()||busy||done)return;setValue(factorInput.value.slice(0,-1))}
  function clearValue(){setValue('')}
  function applyManualLayout(){
    const on=manualMode();
    document.documentElement.classList.toggle('manual-game-lock',on);
    document.body.classList.toggle('manual-game-lock',on);
    if(on){window.scrollTo(0,0);factorInput.blur()}else clearValue();
    syncReadout();
  }

  digitPad.addEventListener('click',e=>{
    const b=e.target.closest('button[data-digit]');if(b)appendDigit(b.dataset.digit)
  });
  panel.querySelector('#factorBack').addEventListener('click',backspace);
  panel.querySelector('#factorClear').addEventListener('click',clearValue);
  fireBtn.addEventListener('click',()=>setTimeout(syncReadout,0));
  primeBtn.addEventListener('click',clearValue,true);
  factorInput.addEventListener('focus',()=>factorInput.blur());
  expertBar.addEventListener('submit',()=>setTimeout(syncReadout,0));

  const prevInvalid=invalidInput;
  invalidInput=function(){
    prevInvalid();
    if(manualMode()){
      readout.classList.remove('bad');void readout.offsetWidth;readout.classList.add('bad');setTimeout(()=>readout.classList.remove('bad'),340)
    }
  };

  const prevRender=renderControls;
  renderControls=function(){
    prevRender();
    applyManualLayout();
  };

  document.addEventListener('keydown',e=>{
    if(!manualMode()||busy||done)return;
    if(/^\d$/.test(e.key)){e.preventDefault();appendDigit(e.key);return}
    if(e.key==='Backspace'){e.preventDefault();backspace();return}
    if(e.key==='Delete'||e.key==='Escape'){e.preventDefault();clearValue();return}
    if(e.key==='Enter'){e.preventDefault();fireBtn.click();return}
    if(e.key==='p'||e.key==='P'){e.preventDefault();primeBtn.click()}
  });

  applyManualLayout();
})();
