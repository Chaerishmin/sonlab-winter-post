// Coordinates are still in the original postcard. The surrounding scenery can span a much wider screen.
function sceneGeometry(width,height,panelLeft,panelTop,compact){
  const inset=compact?6:14;
  const right=compact?width:panelLeft-12;
  const bottom=compact?panelTop-6:height;
  const maxWidth=Math.max(1,Math.min(1.5*bottom,(right-2*inset)/.62));
  const starSize=Math.max(44,Math.min(72,.055*maxWidth));
  const artHeight=Math.max(1,Math.min(maxWidth/1.5,(bottom-10-.78*starSize)/(.94-.043)));
  const artWidth=1.5*artHeight;
  const center=compact?width/2:Math.min(width*.495,right-.307*artWidth);
  const top=Math.max(0,10+.78*starSize-.043*artHeight,Math.min(compact?52:64,(bottom-artHeight)*.44));
  return {width:artWidth,height:artHeight,left:center-artWidth/2,top,starSize};
}
// Keep the 80% print scale independent of the newly enlarged landscape.
function ornamentReference(width){
  if(width<=520)return (width-36)*1.5/1.17;
  if(width<=790)return Math.min(635,width-32)-18;
  const narrow=width<=1050;
  const wrap=narrow?width-48:Math.min(1220,width-96);
  const gap=narrow?18:Math.min(36,Math.max(20,width*.026));
  const workbench=narrow?Math.max(270,(wrap-gap)/2.9):Math.max(295,(wrap-gap)*.92/3.07);
  return wrap-gap-workbench-18;
}
// Leave the entire fir and its pot at a single scale. Crop outside edges when room is tight,
// and extend the surrounding sky, snow and hills when the screen is wider or taller.
function landscapeSlices(sourceSize,destSize,offset,span,low,high){
  const left=offset+span*low,right=offset+span*high;
  const srcLow=low*sourceSize,srcHigh=high*sourceSize;
  const slices=[];
  if(left>0){
    const srcWidth=Math.min(srcLow,left*sourceSize/span);
    slices.push([srcLow-srcWidth,srcWidth,0,left]);
  }
  slices.push([srcLow,srcHigh-srcLow,left,right-left]);
  if(right<destSize){
    const srcWidth=Math.min(sourceSize-srcHigh,(destSize-right)*sourceSize/span);
    slices.push([srcHigh,srcWidth,right,destSize-right]);
  }
  return slices;
}
// Small swatches of the original illustrated sky and snow extend tall portrait screens.
function paperTile(img,box){
  const x=Math.round(box[0]*img.naturalWidth),y=Math.round(box[1]*img.naturalHeight);
  const w=Math.round(box[2]*img.naturalWidth),h=Math.round(box[3]*img.naturalHeight);
  const tile=surface(2*w,2*h),ctx=tile.getContext("2d");
  for(const horizontal of [0,1])for(const vertical of [0,1]){
    ctx.save();ctx.translate(horizontal*2*w,vertical*2*h);
    ctx.scale(horizontal?-1:1,vertical?-1:1);
    ctx.drawImage(img,x,y,w,h,0,0,w,h);ctx.restore();
  }
  return tile;
}
function paintPaper(ctx,tile,width,y,height,pixelScale){
  if(height<=0)return;
  ctx.save();ctx.beginPath();ctx.rect(0,y,width,height);ctx.clip();
  ctx.scale(pixelScale,pixelScale);ctx.fillStyle=ctx.createPattern(tile,"repeat");
  ctx.fillRect(0,y/pixelScale,width/pixelScale,height/pixelScale);ctx.restore();
}
function mountLandscape(){
  const stage=document.getElementById("winter-scene"),vp=document.getElementById("viewport");
  const bench=document.getElementById("bench"),world=document.getElementById("world");
  const canvas=document.getElementById("landscape"),img=document.getElementById("scenery");
  let pending=0,lastSignature="",paper=null;
  function draw(){
    pending=0;
    const w=vp.clientWidth,h=vp.clientHeight;
    if(!w||!h||!img.complete||!img.naturalWidth)return;
    const compact=getComputedStyle(stage).getPropertyValue("--compact-bench").trim()==="1";
    const sceneRect=vp.getBoundingClientRect(),panel=bench.getBoundingClientRect();
    const dpr=Math.min(2,window.devicePixelRatio||1,4096/Math.max(w,h));
    const p=sceneGeometry(w,h,panel.left-sceneRect.left,panel.top-sceneRect.top,compact);
    const signature=[w,h,dpr,p.left,p.top,p.width,document.documentElement.clientWidth].join("/");
    if(signature===lastSignature)return;
    Object.assign(world.style,{left:p.left+"px",top:p.top+"px",width:p.width+"px",height:p.height+"px"});
    world.style.setProperty("--ornament-reference",ornamentReference(document.documentElement.clientWidth)+"px");
    world.style.setProperty("--topper-size",p.starSize+"px");
    canvas.width=Math.round(dpr*w);canvas.height=Math.round(dpr*h);
    const ctx=canvas.getContext("2d");
    if(!ctx)return;
    ctx.imageSmoothingQuality="high";
    const xs=landscapeSlices(img.naturalWidth,w,p.left,p.width,.19,.80);
    const top=Math.round(p.top*dpr),artHeight=Math.round(p.height*dpr);
    const lower=canvas.height-top-artHeight;
    const extend=top>0||lower>0;
    const art=extend?surface(canvas.width,artHeight):canvas;
    const brush=extend?art.getContext("2d"):ctx;
    brush.imageSmoothingQuality="high";
    for(const [sx,sw,x,width] of xs){
      const left=Math.round(x*dpr);
      brush.drawImage(img,sx,0,sw,img.naturalHeight,left,0,Math.round((x+width)*dpr)-left,artHeight);
    }
    if(extend){
      if(!paper)paper={sky:paperTile(img,[.035,.035,.255,.18]),snow:paperTile(img,[.382,.952,.2,.045])};
      const fadeSky=Math.max(1,artHeight*.022),fadeSnow=Math.max(1,artHeight*.047);
      const scale=dpr*Math.max(.62,Math.min(1.3,p.width/img.naturalWidth));
      if(top)paintPaper(ctx,paper.sky,canvas.width,0,top+fadeSky,scale);
      if(lower>0){
        const y=top+artHeight-fadeSnow;
        paintPaper(ctx,paper.snow,canvas.width,y,lower+fadeSnow,scale*1.22);
        ctx.fillStyle="rgba(251,232,209,.56)";ctx.fillRect(0,y,canvas.width,lower+fadeSnow);
      }
      const alpha=brush.createLinearGradient(0,0,0,artHeight);
      alpha.addColorStop(0,top?"transparent":"#000");alpha.addColorStop(.022,"#000");
      alpha.addColorStop(.953,"#000");alpha.addColorStop(1,lower>0?"transparent":"#000");
      brush.globalCompositeOperation="destination-in";brush.fillStyle=alpha;brush.fillRect(0,0,art.width,art.height);
      ctx.drawImage(art,0,top);
    }
    lastSignature=signature;
    vp.classList.add("painted");
  }
  function schedule(){if(!pending)pending=requestAnimationFrame(draw)}
  img.addEventListener("load",()=>{
    lastSignature="";paper=null;
    if(img.decode)img.decode().then(schedule,schedule);else schedule();
  });
  if("ResizeObserver" in window){
    const resize=new ResizeObserver(schedule);resize.observe(vp);resize.observe(bench);resize.observe(document.getElementById("scene-foot"));
  }
  window.addEventListener("resize",schedule);schedule();
}
