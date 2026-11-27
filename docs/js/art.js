// All ornament art is rendered locally. Coordinates below are in drawing units.
const assets = JSON.parse(document.getElementById("asset-manifest").textContent);
const inkSets = {
  berry:{name:"석류빛",main:"#a74639",light:"#d88062",dark:"#71352e"},
  pine:{name:"전나무빛",main:"#467362",light:"#81a48a",dark:"#304e43"},
  honey:{name:"꿀빛",main:"#b17c35",light:"#e1b56e",dark:"#795325"}
};
function surface(w,h) {
  const c=document.createElement("canvas"); c.width=w; c.height=h; return c;
}
function studio(w,h,scale=2) {
  const canvas=surface(w*scale,h*scale), ctx=canvas.getContext("2d");
  ctx.scale(scale,scale); ctx.lineCap="round"; ctx.lineJoin="round";
  return {canvas,ctx};
}
function path(ctx,d,fill,stroke,width=1) {
  const p=new Path2D(d);
  if(fill){ctx.fillStyle=fill;ctx.fill(p)}
  if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke(p)}
}
function ellipse(ctx,x,y,rx,ry,color,stroke,width=1) {
  ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);
  if(color){ctx.fillStyle=color;ctx.fill()}
  if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke()}
}
function roundBox(ctx,x,y,w,h,r,fill,stroke,width=1) {
  ctx.beginPath();ctx.roundRect(x,y,w,h,r);
  if(fill){ctx.fillStyle=fill;ctx.fill()}
  if(stroke){ctx.lineWidth=width;ctx.strokeStyle=stroke;ctx.stroke()}
}
function filigree(ctx,x,y,scale=1){
  ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);
  path(ctx,"M-11 6 Q0 -2 12 -12",null,"#746e38",1.7);
  for(let j=0;j<5;j++){
    let px=-7+j*3.5,py=2-j*2.5;
    path(ctx,"M"+px+" "+py+" q-7 -1 -7 -6 q6 -1 7 6","#4d7452");
    path(ctx,"M"+px+" "+py+" q3 -1 8 0 q-3 5 -8 0","#729065");
  }
  for(const [dx,dy] of [[-8,6],[-4,7],[-5,3]]) ellipse(ctx,dx,dy,2,2,"#ad4b38");
  ctx.restore();
}
function loop(ctx,x,y,h=22) {
  ctx.save();ctx.translate(x,y);
  path(ctx,"M0 "+h+" C-13 7 -3 -1 1 1 C9 5 5 14 0 "+h,null,"#86582b",2.4);
  path(ctx,"M-1 "+(h-2)+" Q-9 5 0 2",null,"#f1ce80",1);
  ctx.restore();
}
function sealLogo(){
  const {ctx,canvas}=studio(64,64,2);
  const p=new Path2D();
  for(let i=0;i<=180;i++){
    const a=2*Math.PI*i/180, r=28.6+1.2*Math.cos(18*a);
    const x=32+r*Math.cos(a),y=32+r*Math.sin(a);
    if(i===0)p.moveTo(x,y);else p.lineTo(x,y);
  }
  p.closePath();ctx.fillStyle="#9b4035";ctx.fill(p);
  ellipse(ctx,32,32,24.2,24.2,null,"#f3d9a6",.9);
  path(ctx,"M32 12 L32 49 M32 18 Q27 23 22 24 M32 20 Q36 24 40 24 M32 24 Q25 31 19 31 M32 25 Q38 30 44 31 M32 30 Q24 38 16 39 M32 31 Q39 37 47 39 M32 36 Q25 42 20 44 M32 37 Q38 42 44 44",null,"#fff1ce",2.15);
  return canvas.toDataURL();
}
const envelopeCache={};
function envelopeArt(tint="berry"){
  if(envelopeCache[tint])return envelopeCache[tint];
  const p=inkSets[tint],{ctx,canvas}=studio(160,133);
  loop(ctx,81,2,39);
  ctx.save();ctx.translate(80,82);ctx.rotate(-.055);
  roundBox(ctx,-65,-39,130,80,4,p.main,p.dark,2);
  for(let j=0;j<8;j++){
    path(ctx,"M"+(-60+j*16)+" 38 l9 0",null,p.light,1);
    path(ctx,"M"+(-60+j*16)+" -35 l9 0",null,p.light,1);
  }
  path(ctx,"M-64 38 L-13 -3 Q-1 -10 11 -3 L63 38",null,p.dark,1.7);
  path(ctx,"M-64 -37 Q-62 -40 -57 -38 L1 3 L61 -38 Q65 -38 63 -33 L7 10 Q1 15 -6 10 Z",p.light,p.dark,1.4);
  path(ctx,"M-54 -34 L-2 4 Q1 7 5 4 L54 -32",null,"#efc89d",1.1);
  ellipse(ctx,2,7,11,10,"#e6c273","#74562e",1.3);
  ellipse(ctx,2,7,7,6.4,null,"#bc8540",.9);
  path(ctx,"M2 2 L3.5 5.3 L7 6 L4.4 8.5 L5 12 L2 10 L-1 12 L-.5 8.5 L-3 6 L.5 5.3Z","#976837");
  filigree(ctx,-36,18,.7);ctx.restore();
  return envelopeCache[tint]=canvas.toDataURL();
}
function loadImage(src){
  return new Promise((resolve,reject)=>{
    const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error("이 이미지를 열 수 없어. JPG, PNG 또는 WebP로 다시 골라줘."));img.src=src;
  });
}
function fitRect(w,h,maxW,maxH){
  const k=Math.min(maxW/w,maxH/h);
  return {w:w*k,h:h*k};
}
function drawFit(ctx,img,cx,cy,maxW,maxH){
  const s=fitRect(img.width,img.height,maxW,maxH);
  ctx.drawImage(img,cx-s.w/2,cy-s.h/2,s.w,s.h);return s;
}
function boundedCanvas(img,maxSide=640){
  const k=Math.min(1,maxSide/Math.max(img.width,img.height));
  const c=surface(Math.max(1,Math.round(img.width*k)),Math.max(1,Math.round(img.height*k)));
  c.getContext("2d").drawImage(img,0,0,c.width,c.height);return c;
}
function alphaBounds(input) {
  const w=input.width,h=input.height,bytes=input.getContext("2d").getImageData(0,0,w,h).data;
  let l=w,t=h,r=-1,b=-1;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    if(bytes[(y*w+x)*4+3]<20)continue;
    l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);
  }
  if(r<0)throw Error("남은 부분이 없어. 배경 제거 강도를 낮추거나 윤곽을 직접 골라줘.");
  const c=surface(r-l+1,b-t+1);c.getContext("2d").drawImage(input,l,t,c.width,c.height,0,0,c.width,c.height);return c;
}
// photoArt supplies an unchanged source canvas while a photo is being composed.
const photoBallLensCache = new WeakMap();

function drawPhotoBallLens(ctx, input, left, top, side, cx, cy, radius, strength = 0.25) {
  const transform = ctx.getTransform();
  const resolution = Math.max(2, Math.min(512, Math.round(2 * radius * Math.hypot(transform.a, transform.b))));
  const bend = Math.min(0.6, Math.max(0, strength));
  const key = [left, top, side, resolution, bend].join('/');
  let entry = photoBallLensCache.get(input);

  if (!entry || entry.key !== key) {
    const texture = surface(resolution, resolution);
    const brush = texture.getContext('2d');
    brush.drawImage(input, left, top, side, side, 0, 0, resolution, resolution);
    const source = brush.getImageData(0, 0, resolution, resolution).data;
    const image = brush.createImageData(resolution, resolution);
    const result = image.data;
    const middle = (resolution - 1) / 2;
    const inverseRadius = 2 / resolution;

    for (let y = 0; y < resolution; y++) {
      const dy = y - middle;
      for (let x = 0; x < resolution; x++) {
        const dx = x - middle;
        const r2 = (dx * dx + dy * dy) * inverseRadius * inverseRadius;
        // Inverse mapping magnifies the centre and leaves the circle's rim fixed.
        const scale = 1 - bend * Math.max(0, 1 - r2);
        const sx = middle + dx * scale, sy = middle + dy * scale;
        const x0 = Math.floor(sx), y0 = Math.floor(sy);
        const x1 = Math.min(x0 + 1, resolution - 1), y1 = Math.min(y0 + 1, resolution - 1);
        const nw = 4 * (y0 * resolution + x0), ne = 4 * (y0 * resolution + x1);
        const sw = 4 * (y1 * resolution + x0), se = 4 * (y1 * resolution + x1);
        const fx = sx - x0, fy = sy - y0;
        // Interpolate premultiplied colours so translucent PNG edges stay clean.
        const a = (1 - fx) * (1 - fy) * source[nw + 3], b = fx * (1 - fy) * source[ne + 3];
        const c = (1 - fx) * fy * source[sw + 3], d = fx * fy * source[se + 3];
        const alpha = a + b + c + d;
        if (alpha === 0) continue;
        const target = 4 * (y * resolution + x);
        result[target + 3] = alpha;
        for (let channel = 0; channel < 3; channel++) {
          result[target + channel] = (a * source[nw + channel] + b * source[ne + channel]
            + c * source[sw + channel] + d * source[se + channel]) / alpha;
        }
      }
    }
    brush.putImageData(image, 0, 0);

    // Both glazes keep the photo's alpha, including transparent patches.
    brush.save();
    brush.scale(resolution, resolution);
    brush.globalCompositeOperation = 'source-atop';
    const rim = brush.createRadialGradient(0.40, 0.35, 0.04, 0.50, 0.50, 0.50);
    rim.addColorStop(0, 'rgba(255,249,232,0.025)');
    rim.addColorStop(0.60, 'rgba(62,52,52,0)');
    rim.addColorStop(1, 'rgba(46,40,43,0.30)');
    brush.fillStyle = rim;
    brush.fillRect(0, 0, 1, 1);
    brush.translate(0.29, 0.24);
    brush.rotate(-0.67);
    brush.scale(0.155, 0.045);
    const reflection = brush.createRadialGradient(0, 0, 0, 0, 0, 1);
    reflection.addColorStop(0, 'rgba(255,253,243,0.62)');
    reflection.addColorStop(0.50, 'rgba(255,253,243,0.39)');
    reflection.addColorStop(1, 'rgba(255,253,243,0)');
    brush.fillStyle = reflection;
    brush.fillRect(-1, -1, 2, 2);
    brush.restore();

    entry = {key, texture};
    photoBallLensCache.set(input, entry);
  }
  ctx.drawImage(entry.texture, cx - radius, cy - radius, 2 * radius, 2 * radius);
}

function photoArt(input,cutout=false,outline=true){
  const {ctx,canvas}=studio(176,203,2);
  loop(ctx,88,2,30);
  if(cutout){
    const trimmed=alphaBounds(input);
    const s=fitRect(trimmed.width,trimmed.height,147,154);
    const left=(176-s.w)/2,top=32;
    path(ctx,"M88 23 v23",null,"#b08949",3);
    if(outline){
      const mask=surface(trimmed.width,trimmed.height),m=mask.getContext("2d");
      m.drawImage(trimmed,0,0);m.globalCompositeOperation="source-in";m.fillStyle="#fff7db";m.fillRect(0,0,mask.width,mask.height);
      for(let i=0;i<16;i++){
        const a=i*Math.PI/8;
        ctx.drawImage(mask,left+3*Math.cos(a),top+3*Math.sin(a),s.w,s.h);
      }
    }
    ctx.drawImage(trimmed,left,top,s.w,s.h);
  }else{
    const cx=88,cy=112,rad=73;
    const side=Math.min(input.width,input.height);
    const left=(input.width-side)/2,top=(input.height-side)/2;
    ctx.save();ctx.beginPath();ctx.arc(cx,cy,rad,0,2*Math.PI);ctx.clip();
    drawPhotoBallLens(ctx, input, left, top, side, cx, cy, rad);
    ctx.restore();
    roundBox(ctx,75,28,26,12,2,"#c39c53","#82653e",1.5);
    for(let x=79;x<100;x+=5)path(ctx,"M"+x+" 30 v7",null,"#ebcb82",1.25);
  }
  return canvas.toDataURL("image/webp",.89);
}
// A transparent cutout of edge-connected colors. Interior islands are preserved.
function edgeCutout(input,tolerance){
  const w=input.width,h=input.height,c=surface(w,h),ctx=c.getContext("2d");
  const data=input.getContext("2d").getImageData(0,0,w,h),px=data.data;
  const bins=new Map(), sample=[];
  function edge(i){
    if(px[i*4+3]<16)return;
    const o=i*4,key=(px[o]>>5)*64+(px[o+1]>>5)*8+(px[o+2]>>5);
    let b=bins.get(key);if(!b){b=[0,0,0,0];bins.set(key,b)}
    b[0]++;b[1]+=px[o];b[2]+=px[o+1];b[3]+=px[o+2];sample.push(i);
  }
  const step=Math.max(1,Math.round(Math.max(w,h)/100));
  for(let x=0;x<w;x+=step){edge(x);edge((h-1)*w+x)}
  for(let y=0;y<h;y+=step){edge(y*w);edge(y*w+w-1)}
  const ref=[...bins.values()].sort((a,b)=>b[0]-a[0]).filter(b=>b[0]>=sample.length*.035).slice(0,6).map(b=>b.slice(1).map(v=>v/b[0]));
  const n=w*h, queue=new Int32Array(n),seen=new Uint8Array(n);let head=0,tail=0;
  function visit(i){
    if(seen[i])return;seen[i]=1;
    const o=i*4,r=px[o],g=px[o+1],b=px[o+2];
    if(px[o+3]>12&&!ref.some(q=>(r-q[0])**2+(g-q[1])**2+(b-q[2])**2<=tolerance*tolerance*3))return;
    px[o+3]=0;queue[tail++]=i;
  }
  for(let x=0;x<w;x++){visit(x);visit((h-1)*w+x)}
  for(let y=0;y<h;y++){visit(y*w);visit(y*w+w-1)}
  while(head<tail){
    const i=queue[head++],x=i%w;
    if(x>0)visit(i-1);if(x<w-1)visit(i+1);if(i>=w)visit(i-w);if(i<n-w)visit(i+w);
  }
  ctx.putImageData(data,0,0);return c;
}
function tracedCutout(input,points){
  const c=surface(input.width,input.height),ctx=c.getContext("2d");
  ctx.beginPath();points.forEach(([x,y],i)=>{if(i===0)ctx.moveTo(x*c.width,y*c.height);else ctx.lineTo(x*c.width,y*c.height)});
  ctx.closePath();ctx.clip();ctx.drawImage(input,0,0);return c;
}
