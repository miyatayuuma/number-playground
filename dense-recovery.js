(()=>{
  const DENSE_AT=850;
  const baseScatter=scatter,baseMove=move;
  let recoveryUntil=0,throttleLast=0;

  function denseMode(){return n>=DENSE_AT&&A.classList.contains('dense-canvas-mode')}
  function idleDotSize(){
    const r=A.getBoundingClientRect(),w=r.width||600,h=r.height||282,cell=Math.sqrt((w*h)/Math.max(1,n));
    return Math.max(1.05,Math.min(2.65,cell*.31))
  }

  const proto=window.CanvasRenderingContext2D?.prototype;
  if(proto&&!proto.__coreBreakDenseFastArc){
    const nativeArc=proto.arc,nativeRect=proto.rect,TAU=Math.PI*2;
    proto.arc=function(x,y,r,start,end,ccw){
      const c=this.canvas,fast=c?.classList?.contains('dense-core-canvas')&&!ccw&&r<=1.45&&Math.abs(start)<1e-5&&Math.abs(end-TAU)<1e-4;
      if(fast)return nativeRect.call(this,x-r,y-r,r*2,r*2);
      return nativeArc.call(this,x,y,r,start,end,ccw)
    };
    Object.defineProperty(proto,'__coreBreakDenseFastArc',{value:true,configurable:true})
  }

  scatter=function(){
    if(!denseMode())return baseScatter();
    const result=baseScatter(),z=idleDotSize();
    for(let i=0;i<dots.length;i++)dots[i].z=z;
    recoveryUntil=performance.now()+1050;throttleLast=0;
    return result
  };

  move=function(t){
    if(!denseMode())return baseMove(t);
    const recovering=t<recoveryUntil,minGap=recovering?(n>1500?100:86):(n>1500?72:n>1100?62:52);
    if(throttleLast&&t-throttleLast<minGap){
      tickTimer(t);requestAnimationFrame(move);return
    }
    throttleLast=t;return baseMove(t)
  };
})();
