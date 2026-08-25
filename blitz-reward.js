(()=>{
  const RECOVERY_SECONDS=15;
  const baseGood=good;

  good=async function(f){
    if(mode==='blitz'){
      blitzTime=Math.min(60,blitzTime+RECOVERY_SECONDS);
      rageFx();
      const timer=document.querySelector('#tm');
      if(timer)timer.textContent=blitzTime.toFixed(1);
      timerStat?.classList.toggle('danger',blitzTime<=10);
    }
    return baseGood(f)
  };
})();
