// XY is an orthographic projection viewed from +z. The links are visual hints.
const elements=new Set(("H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og").split(" "));
const examples={
  whole:"12\nBenzene | illustrative XYZ, angstrom\nC 1.397 0 0\nC 0.699 1.210 0\nC -0.699 1.210 0\nC -1.397 0 0\nC -0.699 -1.210 0\nC 0.699 -1.210 0\nH 2.480 0 0\nH 1.240 2.148 0\nH -1.240 2.148 0\nH -2.480 0 0\nH -1.240 -2.148 0\nH 1.240 -2.148 0",
  chain:"3\nPolyether repeat unit: terminal carbons 1 and 3; H omitted\nC -1.16 0.00 0.00\nO 0.00 0.82 0.12\nC 1.16 0.00 0.00"
};
const numberToken=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eEdD][+-]?\d+)?$/;
function parseXYZ(text){
  const lines=text.replace(/^\uFEFF/,"").replace(/\r/g,"").split("\n").map((raw,i)=>({raw:raw.trim(),n:i+1}));
  while(lines.length&&!lines[0].raw)lines.shift();
  if(!lines.length)throw Error("원소와 x y z 좌표를 입력해줘.");
  let count=null;
  if(/^\d+$/.test(lines[0].raw)){
    count=Number(lines[0].raw);
    lines.splice(0,2); // XYZ line 2 is a comment, including an intentionally blank one.
  }
  const entries=lines.filter(line=>line.raw);
  if(entries.length>300||count>300)throw Error("한 분자에 원자 300개까지 그릴 수 있어.");
  if(!entries.length)throw Error("읽을 원자가 없어. 좌표 줄을 확인해줘.");
  if(count!==null&&count!==entries.length)throw Error("첫 줄은 "+count+"개인데 좌표는 "+entries.length+"줄이야. 한 프레임의 XYZ를 넣어줘.");
  return entries.map(({raw,n})=>{
    const pieces=raw.split(/\s+/);
    if(pieces.length!==4)throw Error(n+"번째 줄을 ‘원소 x y z’ 네 칸으로 입력해줘.");
    const symbol=pieces[0][0].toUpperCase()+pieces[0].slice(1).toLowerCase();
    if(!elements.has(symbol))throw Error(n+"번째 줄의 원소 기호를 확인해줘.");
    const values=pieces.slice(1).map(v=>numberToken.test(v)?Number(v.replace(/[dD]/,"e")):NaN);
    if(values.some(v=>!Number.isFinite(v)||Math.abs(v)>1e8))throw Error(n+"번째 줄에 읽을 수 없는 좌표가 있어.");
    return {s:symbol,x:values[0],y:values[1],z:values[2]};
  });
}
// These thresholds and palettes are artistic choices for a holiday ornament.
const linkSize={H:.32,B:.84,C:.76,N:.71,O:.66,F:.57,Si:1.11,P:1.07,S:1.05,Cl:1.02,Br:1.2,I:1.39,Fe:1.32,Cu:1.32,Zn:1.22,Au:1.36};
function sketchLinks(atoms){
  const links=[];
  for(let i=0;i<atoms.length;i++)for(let j=i+1;j<atoms.length;j++){
    const a=atoms[i],b=atoms[j],d=Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
    const limit=1.18*((linkSize[a.s]??.89)+(linkSize[b.s]??.89));
    if(d>.25&&d<=limit)links.push([i,j]);
  }
  return links;
}
const bulbPalette={
  H:["#fffef3","#f2e0a8","#a18851"],C:["#fff9ff","#e3ccff","#9573ad"],
  O:["#ffdda6","#cf5d48","#82332f"],N:["#e1f1fc","#6e94b5","#3d557e"],
  S:["#fff5c0","#ecc15e","#9c742b"],Fe:["#ffe3ac","#d78b54","#82462f"],
  Cl:["#e8f0ad","#94b05f","#567448"],F:["#edffd2","#9fc99d","#5c885e"],
  P:["#fce5cc","#ce9570","#8a5b49"],B:["#edd6e1","#b58eaa","#735975"],
  Au:["#fff6b3","#eab750","#a57736"]
};
function glowAtom(ctx,x,y,r,s){
  const colors=bulbPalette[s]||["#fae5ba","#b79a69","#796546"];
  const carbon=s==="C",halo=r*(carbon?1.72:1.49);
  const aura=ctx.createRadialGradient(x,y,r*.7,x,y,halo);
  const glow=carbon?"237,211,255":"255,225,142";
  aura.addColorStop(0,"rgba("+glow+","+(carbon ? .78 : .5)+")");aura.addColorStop(1,"rgba("+glow+",0)");
  ellipse(ctx,x,y,halo,halo,aura);
  const g=ctx.createRadialGradient(x-r*.36,y-r*.41,r*.05,x+r*.06,y+r*.05,r*1.07);
  g.addColorStop(0,colors[0]);g.addColorStop(.38,colors[1]);g.addColorStop(1,colors[2]);
  ellipse(ctx,x,y,r,r,g,carbon?"#f1dfff":colors[2],Math.max(.5,r*(carbon ? .085 : .055)));
  ellipse(ctx,x-r*.32,y-r*.37,r*.22,r*.13,"rgba(255,255,231,.96)");
}
function projection(atoms,w,h){
  const xs=atoms.map(a=>a.x),ys=atoms.map(a=>a.y);
  const left=Math.min(...xs),right=Math.max(...xs),low=Math.min(...ys),high=Math.max(...ys);
  const scale=Math.min(w/Math.max(right-left+1.1,1.9),h/Math.max(high-low+1.1,1.9));
  return atoms.map(a=>({s:a.s,z:a.z,x:w/2+(a.x-(left+right)/2)*scale,y:h/2-(a.y-(low+high)/2)*scale,
    r:Math.max(1.7,Math.min(Math.min(w,h)*.17,scale*(a.s==="H"?.27:.39)))}));
}
function drawCluster(ctx,points,links,dx,dy){
  ctx.save();ctx.translate(dx,dy);
  for(const [i,j] of links){
    const a=points[i],b=points[j],p="M"+a.x+" "+a.y+" L"+b.x+" "+b.y;
    const width=Math.max(1.3,Math.min(a.r,b.r)*.52);
    path(ctx,p,null,"#77663f",width);
    path(ctx,p,null,"#e0c482",width*.44);
  }
  [...points].sort((a,b)=>a.z-b.z).forEach(p=>glowAtom(ctx,p.x,p.y,p.r,p.s));
  ctx.restore();
}
// These slopes are those of the former quadratic light string, expressed with +y up.
function garlandAngle(position,count){
  return Math.atan2(136*(2*position-1),90*count-8);
}
function buildPolymer(unit,count){
  const head=unit[0],tail=unit[unit.length-1],unitLinks=sketchLinks(unit);
  const dx=tail.x-head.x,dy=tail.y-head.y;
  const axis=Math.hypot(dx,dy)>1e-10?Math.atan2(dy,dx):0;
  const spacing=(linkSize[tail.s]??.89)+(linkSize[head.s]??.89);
  const atoms=[],links=[];
  let origin={x:0,y:0,z:0};
  for(let k=0;k<count;k++){
    const start=atoms.length;
    const turn=garlandAngle((k+.5)/count,count)-axis;
    const c=Math.cos(turn),s=Math.sin(turn);
    for(const a of unit){
      const x=a.x-head.x,y=a.y-head.y;
      atoms.push({s:a.s,x:origin.x+c*x-s*y,y:origin.y+s*x+c*y,z:origin.z+(a.z-head.z)});
    }
    for(const [i,j] of unitLinks)links.push([start+i,start+j]);
    if(k>0){
      links.push([start-1,start]); // Last XYZ row of the preceding unit to row 1 of this unit.
    }
    const exit=atoms[atoms.length-1],between=garlandAngle((k+1)/count,count);
    origin={x:exit.x+spacing*Math.cos(between),y:exit.y+spacing*Math.sin(between),z:exit.z};
  }
  return {atoms,links};
}
function moleculeArt(unit,mode,repeats){
  const chain=mode==="chain";
  const {atoms,links}=chain?buildPolymer(unit,repeats):{atoms:unit,links:sketchLinks(unit)};
  const width=chain?90*repeats+20:225;
  let height=171;
  if(chain){
    const xs=atoms.map(a=>a.x),ys=atoms.map(a=>a.y);
    const ratio=(Math.max(...ys)-Math.min(...ys)+1.15)/(Math.max(...xs)-Math.min(...xs)+1.15);
    height=Math.round(Math.max(65,Math.min(width*ratio,240)));
  }
  const {ctx,canvas}=studio(width,height);
  drawCluster(ctx,projection(atoms,width-12,height-12),links,6,6);
  return canvas.toDataURL("image/webp",.92);
}
