const $=id=>document.getElementById(id);
const store=new TreeClient(window.TREE_CONFIG || {});
const board={ornaments:[],replies:[],star:null};
let nickname="",draft=null,placing=false,dialogVersion=0,toastTimer=0;
let lastFocus=null,refreshView=null;
const kindNames={card:"메시지 카드",photo:"사진 오나먼트",mol:"분자 전구"};
function node(tag,cls,text){
  const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;
}
function pic(src,alt=""){const i=new Image();if(src)i.src=src;i.alt=alt;i.draggable=false;return i}
function notice(msg){
  clearTimeout(toastTimer);$("toast").textContent=msg;$("toast").hidden=false;
  toastTimer=setTimeout(()=>{$("toast").hidden=true},3400);
}
function message(el,msg){el.textContent=msg;el.hidden=!msg}
function saveProblem(e){
  if(e instanceof TreeActionError)return e.message;
  return "공동 트리에 저장하지 못했어. 연결을 확인하고 다시 시도해줘.";
}
function popup(title){
  const d=$("dialog");dialogVersion++;refreshView=null;
  if(!d.open)lastFocus=document.activeElement;
  $("dialog-title").textContent=title;$("dialog-body").replaceChildren();
  if(!d.open)d.showModal();d.scrollTop=0;
  return $("dialog-body");
}
function closePopup(){
  const d=$("dialog");refreshView=null;if(d.open){dialogVersion++;d.close()}
  if(lastFocus?.isConnected)lastFocus.focus({preventScroll:true});
}
$("close-dialog").onclick=closePopup;
$("dialog").addEventListener("cancel",e=>{e.preventDefault();closePopup()});
$("dialog").addEventListener("click",e=>{
  if(e.target!==$("dialog"))return;
  const r=$("dialog").getBoundingClientRect();
  if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closePopup();
});
function formBase(title){
  const form=node("form","form-grid");popup(title).append(form);return form;
}
function addError(form){
  const err=node("p","field-message");err.hidden=true;err.setAttribute("role","alert");form.append(err);return err;
}
function addActions(form,label){
  const bar=node("div","actions"),submit=node("button","primary-btn",label);submit.type="submit";
  bar.append(submit);form.append(bar);return submit;
}
function addInput(form,label,options={}){
  const wrap=node("label","field");wrap.append(node("span","",label));
  const el=node(options.long?"textarea":"input");
  if(!options.long)el.type="text";
  if(options.rows)el.rows=options.rows;
  if(options.max)el.maxLength=options.max;
  if(options.placeholder)el.placeholder=options.placeholder;
  el.required=Boolean(options.required);if(options.value)el.value=options.value;
  wrap.append(el);form.append(wrap);return el;
}
function chipSet(parent,title,choices,initial,onSelect){
  const group=node("fieldset"),legend=node("legend","",title),row=node("div","chip-row");
  group.append(legend,row);parent.append(group);
  const buttons=new Map();
  function select(value){
    buttons.forEach((b,k)=>b.setAttribute("aria-pressed",String(k===value)));
  }
  for(const c of choices){
    const b=node("button","chip");b.type="button";
    if(c.color){const dot=node("i","ink-dot");dot.style.background=c.color;b.append(dot)}
    b.append(document.createTextNode(c.label));
    b.onclick=()=>{select(c.value);onSelect(c.value)};
    buttons.set(c.value,b);row.append(b);
  }
  select(initial);return select;
}
function chooser(parent,label,accept,onFile){
  const wrap=node("label","file-label",label),inp=node("input");inp.type="file";inp.accept=accept;
  inp.setAttribute("aria-label",label);inp.onchange=()=>{
    const f=inp.files[0];inp.value="";if(f)onFile(f);
  };
  wrap.append(inp);parent.append(wrap);return inp;
}
function showName(){
  nickname=store.active()?(store.me.nickname||preference("sonlab.winterpost.nick."+store.me.accountId)||""):"";
}
async function askName(next){
  try {await ensureMember();}catch(e){if(e.code!=="CANCEL")notice(saveProblem(e));return}
  showName();
  if(nickname){next();return}
  const form=formBase("이름 또는 닉네임");
  form.append(node("p","help-text","트리에 표시할 이름을 적어줘. 장식과 답장은 로그인한 계정에 연결돼."));
  const inp=addInput(form,"이름 또는 닉네임",{max:20,required:true,placeholder:"예: 채민",value:nickname});
  inp.autocomplete="nickname";const err=addError(form);addActions(form,"이 이름으로 계속");inp.focus();
  form.onsubmit=e=>{
    e.preventDefault();const value=inp.value.trim().normalize("NFC");
    if(!value){message(err,"이름을 한 글자 이상 입력해줘.");return}
    if(!store.active()){notice("로그인이 만료됐어. 다시 열어줘.");return}
    store.me.nickname=value;preference("sonlab.winterpost.nick."+store.me.accountId,value);
    showName();nickname=value;next();
  };
}
function newRecord(data){return {id:uid(),created:Date.now(),author:nickname,account:store.me.accountId,...data}}
function beginKind(kind){
  if(draft){notice("먼저 지금 장식을 걸거나 취소해줘.");$("viewport").focus();return}
  askName(()=>({card:composeCard,photo:composePhoto,mol:composeMolecule})[kind]());
}
document.querySelectorAll(".choice").forEach(b=>b.onclick=()=>beginKind(b.dataset.kind));
function composeCard(existing=null){
  const editKey=uid(),form=formBase(existing?"메시지 카드 수정":"메시지 카드 만들기"),preview=node("div","art-preview"),art=pic(envelopeArt(existing?.tint||"berry"));
  preview.append(art);form.append(preview);
  const to=addInput(form,"받는 사람 · 선택",{max:28,placeholder:"예: 밤샘 계산 동지들에게",value:existing?.to});
  const body=addInput(form,"카드에 쓸 말",{long:true,rows:3,max:600,required:true,placeholder:"올해 고마웠던 일, 웃겼던 순간…",value:existing?.body});
  let color=existing?.tint||"berry";
  chipSet(form,"봉투 색",Object.entries(inkSets).map(([k,v])=>({value:k,label:v.name,color:v.main})),color,v=>{color=v;art.src=envelopeArt(v)});
  const err=addError(form),go=addActions(form,existing?"카드 수정":"걸 위치 고르기");
  form.onsubmit=e=>{
    e.preventDefault();if(!body.value.trim()){message(err,"카드에 남길 말을 적어줘.");body.focus();return}
    finishDesign({kind:"card",to:to.value.trim(),body:body.value.trim(),tint:color,art:envelopeArt(color)},existing,go,err,editKey);
  };
}
const presets=[["mitten","빨간 장갑"],["logo","연구실 이니셜"],["pinecone","솔방울 리본"]];
function composePhoto(existing=null){
  const editKey=uid(),form=formBase(existing?"사진 오나먼트 수정":"사진 오나먼트 만들기"),version=dialogVersion;
  let original=null,mode="ball",method="auto",points=[],tol=34,art="",loadVersion=0,loading=false,frame=0,photoLabel="",sourceKey=null;
  if(existing)form.append(node("p","help-text","다시 쓸 사진을 골라줘. 같은 가지에 새 모양으로 걸려."));
  const files=node("div","row");form.append(files);
  chooser(files,"내 사진 올리기","image/png,image/jpeg,image/webp",async file=>{
    if(file.size>10*1024*1024){message(err,"10 MB 이하의 사진을 골라줘.");return}
    const url=URL.createObjectURL(file);
    try{await chooseSource(url,"내 사진")}finally{URL.revokeObjectURL(url)}
  });
  const sourceName=node("span","meta");files.append(sourceName);
  const samples=node("fieldset"),legend=node("legend","","기본 사진"),sampleRow=node("div","preset-row");
  samples.append(legend,sampleRow);form.append(samples);
  const sampleBtns=new Map();
  presets.forEach(([key,title])=>{
    const b=node("button","preset");b.type="button";b.classList.toggle("logo-preset",key==="logo");b.append(pic(assets[key]),node("span","",title));b.onclick=()=>chooseSource(assets[key],title,key);
    sampleBtns.set(key,b);sampleRow.append(b);
  });
  const selectMode=chipSet(form,"걸 모양",[{value:"ball",label:"유리 볼"},{value:"cut",label:"누끼 키링"}],mode,v=>{mode=v;refresh()});
  const extra=node("div","form-grid");form.append(extra);
  const selectMethod=chipSet(extra,"누끼 방식",[{value:"auto",label:"배경 자동 제거"},{value:"trace",label:"윤곽 직접 찍기"},{value:"alpha",label:"원래 투명도"}],method,v=>{method=v;refresh()});
  const range=node("label","field range-field"),amount=node("span","","배경 제거 강도"),slider=node("input");
  slider.type="range";slider.min=8;slider.max=75;slider.value=tol;slider.setAttribute("aria-label","배경 제거 강도");
  range.append(amount,slider,node("small","","단색 배경에서 잘 돼. 복잡한 배경은 윤곽을 직접 찍어줘."));extra.append(range);
  slider.oninput=()=>{tol=Number(slider.value);cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{if(version===dialogVersion)refresh()})};
  const outer=node("div","cut-preview"),cv=surface(220,132);
  cv.setAttribute("aria-label","사진 속 남길 영역의 윤곽을 찍는 화면");
  const artBox=node("div","art-preview"),out=pic(assets.mitten,"완성 모양 미리보기");artBox.append(out);
  const traceHelp=node("div","form-grid"),pointText=node("span","help-text"),traceButtons=node("div","row"),undo=node("button","secondary-btn small","한 점 취소"),clear=node("button","quiet-btn","처음부터");
  undo.type=clear.type="button";undo.onclick=()=>{points.pop();refresh()};clear.onclick=()=>{points=[];refresh()};
  traceButtons.append(undo,clear);traceHelp.append(pointText,traceButtons);outer.append(cv);form.append(traceHelp,outer,artBox);
  const title=addInput(form,"사진 이름 · 선택",{max:32,placeholder:"예: 올해의 실험실",value:existing?.title});
  const err=addError(form),go=addActions(form,existing?"이 장식에 적용":"걸 위치 고르기");
  cv.addEventListener("click",e=>{
    if(!original||method!=="trace")return;
    const rect=cv.getBoundingClientRect();
    points.push([Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width)),Math.max(0,Math.min(1,(e.clientY-rect.top)/rect.height))]);refresh();
  });
  function traceView(){
    cv.width=original.width;cv.height=original.height;
    const c=cv.getContext("2d");c.drawImage(original,0,0);c.lineJoin="round";
    if(points.length){
      c.beginPath();points.forEach(([x,y],i)=>{if(i===0)c.moveTo(x*cv.width,y*cv.height);else c.lineTo(x*cv.width,y*cv.height)});
      c.closePath();c.fillStyle="#edf2c74a";c.fill();c.strokeStyle="#273f32";c.lineWidth=Math.max(3,cv.width/110);c.stroke();
      c.lineWidth=Math.max(1,cv.width/240);c.strokeStyle="#ffe394";c.stroke();
      points.forEach(([x,y])=>ellipse(c,x*cv.width,y*cv.height,cv.width/125,cv.width/125,"#ffe394","#343e28",1));
    }
    pointText.textContent="남길 부분의 가장자리를 순서대로 눌러줘. 3점 이상이면 안쪽이 남아. 현재 "+points.length+"점.";
  }
  function refresh(){
    if(version!==dialogVersion)return;
    const cutting=mode==="cut",tracing=cutting&&method==="trace";
    extra.hidden=!cutting;range.hidden=!cutting||method!=="auto";traceHelp.hidden=outer.hidden=!tracing;
    cv.classList.toggle("tracing",tracing);undo.disabled=clear.disabled=!points.length;
    artBox.hidden=!original||(tracing&&points.length<3);message(err,"");art="";
    if(!original||loading){go.disabled=true;return}
    if(tracing)traceView();
    if(tracing&&points.length<3){go.disabled=true;return}
    try{
      let src=original;
      if(cutting&&method==="auto")src=edgeCutout(original,tol);
      if(tracing)src=tracedCutout(original,points);
      art=photoArt(src,cutting,sourceKey!=="logo");out.src=art;go.disabled=false;
    }catch(x){go.disabled=true;artBox.hidden=true;message(err,x.message)}
  }
  async function chooseSource(src,label,key){
    const ticket=++loadVersion;loading=true;go.disabled=true;sourceName.textContent="사진 여는 중…";message(err,"");
    try{
      const image=await loadImage(src);
      if(version!==dialogVersion||ticket!==loadVersion)return;
      original=boundedCanvas(image);points=[];photoLabel=label;sourceKey=key||null;
      artBox.classList.toggle("logo-mat",key==="logo");
      if(key==="logo"){
        mode="cut";method="alpha";selectMode(mode);selectMethod(method);
      }
      sampleBtns.forEach((b,k)=>b.setAttribute("aria-pressed",String(k===key)));
      sourceName.textContent=label;loading=false;refresh();
    }catch(x){
      if(version===dialogVersion&&ticket===loadVersion){loading=false;sourceName.textContent=photoLabel;refresh();message(err,x.message)}
    }
  }
  form.onsubmit=e=>{
    e.preventDefault();refresh();if(!art||loading)return;
    finishDesign({kind:"photo",title:title.value.trim()||photoLabel,sourceKey,photoStyle:mode,art},existing,go,err,editKey);
  };
  refresh();if(!existing)chooseSource(assets.mitten,"빨간 장갑","mitten");
}
function composeMolecule(existing=null){
  const editKey=uid(),form=formBase(existing?"분자 전구 수정":"분자 전구 만들기"),version=dialogVersion;
  let mode=existing?.mode||"whole",repeats=mode==="chain"?existing.repeats:5,art="",atoms=[],timer=0,fileTicket=0;
  if(existing)form.append(node("p","help-text","이전 분자의 원본 좌표를 다시 넣어줘. 같은 가지에 새 모양으로 걸려."));
  chipSet(form,"장식 모양",[{value:"whole",label:"분자 전체"},{value:"chain",label:"고분자 전구 줄"}],mode,v=>{
    const wasSample=coords.value===examples[mode];mode=v;
    if(wasSample)coords.value=examples[mode];
    chainSettings.hidden=mode!=="chain";refresh();
  });
  const chainSettings=node("div","form-grid");chainSettings.hidden=mode!=="chain";form.append(chainSettings);
  chipSet(chainSettings,"모노머 반복",[{value:"3",label:"3개"},{value:"5",label:"5개"},{value:"7",label:"7개"}],String(repeats),v=>{repeats=Number(v);refresh()});
  chainSettings.append(node("p","help-text","모노머가 처진 곡선을 따라 회전하며 이어져. 연결할 원자를 좌표의 첫 줄과 마지막 줄에 놓아줘."));
  const coords=addInput(form,"원자 좌표 (Å)",{long:true,rows:4,max:80000,required:true,value:existing?"":examples.whole});coords.className="coords";coords.spellcheck=false;
  form.append(node("p","help-text","XYZ 한 프레임 또는 한 줄에 원소 x y z. +z에서 내려다보며, 화면 오른쪽이 +x, 위가 +y야."));
  const row=node("div","row"),ex=node("button","quiet-btn","예시 좌표 넣기");
  ex.type="button";ex.onclick=()=>{fileTicket++;coords.value=examples[mode];refresh()};
  chooser(row,"XYZ 파일 열기",".xyz,.txt,text/plain",async file=>{
    const ticket=++fileTicket;
    if(file.size>180000){message(err,"180 kB 이하의 XYZ 파일을 골라줘.");return}
    try{
      const data=await file.text();
      if(version!==dialogVersion||ticket!==fileTicket)return;
      coords.value=data;refresh();
    }catch{if(version===dialogVersion&&ticket===fileTicket)message(err,"XYZ 파일을 읽을 수 없어. 좌표를 붙여 넣어줘.")}
  });
  row.append(ex);form.append(row);
  const view=node("div","art-preview glow-preview"),img=pic("","분자 전구의 XY 투영");
  view.append(img);form.append(view);
  const stats=node("p","meta");form.append(stats);
  const title=addInput(form,"분자 이름표",{max:32,placeholder:"예: 올해의 벤젠",value:existing?.title});
  const err=addError(form),go=addActions(form,existing?"이 장식에 적용":"걸 위치 고르기");
  coords.oninput=()=>{fileTicket++;clearTimeout(timer);timer=setTimeout(refresh,150)};
  function refresh(){
    if(version!==dialogVersion)return;clearTimeout(timer);
    try{
      atoms=parseXYZ(coords.value);art=moleculeArt(atoms,mode,repeats);
      img.src=art;view.hidden=false;go.disabled=false;message(err,"");
      stats.textContent=mode==="chain"
        ?"모노머 "+atoms.length+"원자 × "+repeats+"개 · 단위 간 연결 "+(repeats-1)+"개 ("+atoms.length+"번 "+atoms.at(-1).s+" → 다음 1번 "+atoms[0].s+")"
        :"원자 "+atoms.length+"개 · 가까운 원자를 이은 장식용 연결선";
    }catch(x){art="";go.disabled=true;view.hidden=true;stats.textContent="";message(err,x.message)}
  }
  form.onsubmit=e=>{
    e.preventDefault();refresh();if(!art)return;
    finishDesign({kind:"mol",title:title.value.trim()||(mode==="chain"?"고분자 전구 줄":"분자 전구"),mode,repeats:mode==="chain"?repeats:1,atomCount:atoms.length,art},existing,go,err,editKey);
  };refresh();
}
async function finishDesign(data,existing,button,err,requestId){
  const design=data;
  if(!existing){beginPlacement(newRecord(design));return}
  button.disabled=true;
  try{
    await saveRecord("ornaments",{id:existing.id,...design},existing,requestId);
    openDetail(existing.id);notice("같은 가지에 새 모양을 적용했어.");
  }catch(x){message(err,saveProblem(x));button.disabled=false}
}
function getTitle(o){return o.kind==="card"?(o.to?"To. "+o.to:"메시지 카드"):o.title||kindNames[o.kind]}
function repliesFor(id){return board.replies.filter(r=>r.parent===id)}
function ornamentWidth(o){
  if(o.kind==="mol"&&o.mode==="chain")return 15+o.repeats*3.25;
  return o.kind==="mol"?13:o.kind==="card"?10:9.3;
}

// The PNGs are already rotated. The percentages locate each painted attachment point.
const replyDecorations = [
  {file:"velvet-bow",   width:26, x:38.4176, y:33.3434},
  {file:"brass-bell",   width:19, x:10.2707, y:3.5736},
  {file:"candy-cane",   width:16, x:43.4881, y:1.8680},
  {file:"ivory-bow",    width:29, x:38.1905, y:33.3908},
  {file:"wrapped-gift", width:18, x:13.6827, y:13.5740},
  {file:"glass-drop",   width:16, x:35.5885, y:3.3793}
];
function compareCreationOrder(a, b) {
  return a.created - b.created || a.id.localeCompare(b.id);
}
function replySummariesByParent() {
  const summaries = new Map(board.ornaments.map(ornament => [ornament.id, {count: 0, shape: null}]));
  let decoratedParents = 0;
  for (const reply of board.replies) {
    const summary = summaries.get(reply.parent);
    if (!summary) continue;
    if (summary.count === 0) {
      summary.shape = replyDecorations[decoratedParents % replyDecorations.length];
      decoratedParents++;
    }
    summary.count++;
  }
  return summaries;
}
function addReplyDecoration(face, shape) {
  const layer = node("span","reply-decorations");
  layer.setAttribute("aria-hidden","true");
  const base = "./assets/reply-ornaments/" + shape.file;
  const marker = pic();
  marker.className = "reply-decoration";
  marker.width = shape.width;
  marker.height = 20;
  marker.srcset = base + ".png 1x, " + base + "@4x.png 4x";
  marker.src = base + ".png";
  marker.style.transform = "translate(-" + shape.x + "%, -" + shape.y + "%)";
  layer.append(marker);
  face.append(layer);
}
function positionPin(pin, point) {
  pin.classList.toggle("reply-left", point.x < 0.5);
  pin.style.left = (point.x * 100) + "%";
  pin.style.top = (point.y * 100) + "%";
}
function decoratePin(b,o,shape){
  const face=node("span","pin-art");
  face.append(pic(o.art));
  if(shape)addReplyDecoration(face,shape);
  b.replaceChildren(face);
  if(o.kind==="mol"){const label=node("span","nameplate",o.title);b.append(label)}
  b.style.width="calc(var(--ornament-reference, 800px) * "+(ornamentWidth(o)*.8/100)+")";
  positionPin(b,o);
}
function renderTree(){
  const d=document.createDocumentFragment();
  const summaries=replySummariesByParent();
  for(const o of board.ornaments){
    const {count,shape}=summaries.get(o.id);
    if(draft?.moving&&draft.record.id===o.id){
      decoratePin($("ghost"),{...o,...draft.point},shape);
      continue;
    }
    const b=node("button","pin");b.type="button";
    const desc=getTitle(o)+" · "+o.author+" · 답장 "+count+"개";
    b.dataset.id=o.id;b.setAttribute("aria-label",desc);b.title=desc;decoratePin(b,o,shape);
    b.onclick=()=>openDetail(o.id);d.append(b);
  }
  $("ornaments").replaceChildren(d);$("orn-count").textContent=board.ornaments.length;$("reply-count").textContent=board.replies.length;
}
let loadSequence=0,boardEpoch=0;
function setTags(show){
  $("reply-tags").checked=show;
  $("viewport").classList.toggle("tags-hidden",!show);
}
async function readBoard(){
  const sequence=++loadSequence,epoch=boardEpoch;
  const remote=await store.call("tree");
  if(sequence!==loadSequence||epoch!==boardEpoch)return;
  board.ornaments=remote.ornaments.map(o=>store.prepare(o)).sort(compareCreationOrder);
  board.replies=remote.replies.sort(compareCreationOrder);board.star=remote.star;
  const versions=new Set(board.ornaments.map(o=>o.imageVersion).filter(Boolean));
  for(const key of store.media.keys())if(!versions.has(key))store.media.delete(key);
  renderTree();if(refreshView)refreshView();
  $("persistence").textContent="연구실 공동 트리";
  try{
    await store.loadPictures(board.ornaments,()=>{
      if(sequence!==loadSequence)return;
      for(const o of board.ornaments)if(o.imageVersion)o.art=store.media.get(o.imageVersion)||"";
      renderTree();
    });
    if(sequence===loadSequence&&refreshView)refreshView();
  }catch(e){if(sequence===loadSequence)$("persistence").textContent="일부 이미지 연결 실패 · 새로고침";}
}
async function refreshTree(){
  const refresh=$("refresh-tree");if(refresh.disabled)return;
  refresh.disabled=true;
  const token=store.active()?store.token:"";
  async function refreshAccount(){
    if(!token)return;
    try{
      const current=await store.call("session",{},{post:true,credential:token});
      if(store.token===token){store.me={...current,nickname:store.me?.nickname};showName();}
    }catch(e){
      if(store.token===token&&["AUTH","MEMBER","MAIL_REQUIRED","CONFIG"].includes(e.code)){store.clear();showName();}
    }
  }
  try{await Promise.all([readBoard(),refreshAccount()]);if(refreshView)refreshView();}
  catch(e){$("persistence").textContent=store.url?"연결 실패 · 새로고침":"공동 트리 연결 전";if(store.url)notice(saveProblem(e));}
  finally{refresh.disabled=false;}
}
$("refresh-tree").onclick=refreshTree;
$("reply-tags").onchange=e=>{setTags(e.target.checked);preference(TAG_PREFERENCE,String(e.target.checked));};
async function saveRecord(group,record,base=null,requestId=record.id){
  const reply=group==="replies";
  const op=base?(reply?"editReply":record.kind?"editOrnament":"moveOrnament"):(reply?"createReply":"createOrnament");
  const {art,account,created,id,...fields}=record;
  if(base)fields.id=id;
  if(record.kind==="photo"||record.kind==="mol")fields.art=art;
  const saved=await store.mutate(op,{...fields,revision:base?.revision??null},requestId,account||store.me?.accountId);
  boardEpoch++;
  if(saved.imageVersion&&art)store.media.set(saved.imageVersion,art);
  const value=reply?saved:store.prepare(saved),list=board[group],where=list.findIndex(x=>x.id===saved.id);
  if (where >= 0) {
    list[where] = value;
  } else {
    list.push(value);
    if (reply) list.sort(compareCreationOrder);
  }
  if(!base && !store.me[group].includes(saved.id))store.me[group].push(saved.id);
  renderTree();return saved;
}
function action(text,style,fn){
  const button=node("button",style,text);button.type="button";button.onclick=fn;return button;
}
function confirmRemoval(title,description,onCancel,remove){
  const form=formBase(title);
  form.append(node("p","",description));
  const err=addError(form),bar=node("div","actions");
  const cancel=action("취소","secondary-btn",onCancel),go=node("button","primary-btn danger","삭제");
  go.type="submit";bar.append(cancel,go);form.append(bar);cancel.focus();
  form.onsubmit=async e=>{
    e.preventDefault();if(go.disabled)return;go.disabled=true;
    try{await remove()}catch(error){message(err,saveProblem(error));go.disabled=false}
  };
}
function openStar(){
  const note=board.star,body=note?.body||"",content=popup("교수님의 한마디"),eraseKey=uid();
  refreshView=openStar;
  const paper=node("div","star-letter");
  paper.append(pic(assets.star),node("p",body?"message-body":"empty",body||(note?"아직 별에 도착한 편지가 없어.":"공동 트리를 연결하면 별 편지를 읽을 수 있어.")));
  if(body)paper.append(node("span","star-signature",PROFESSOR_NAME));
  content.append(paper);
  const bar=node("div","actions");
  if(store.active() && store.me.isProfessor){
    if(body){
      bar.append(action("글 삭제","quiet-btn danger-link",()=>confirmRemoval("별 편지를 삭제할까?","편지 내용이 지워져. 별에는 새 편지를 쓸 수 있어.",openStar,async()=>{
        board.star=await store.mutate("setStar",{body:"",revision:note.revision},eraseKey,store.me?.accountId);
        boardEpoch++;openStar();notice("별 편지를 삭제했어.");
      })));
    }
    bar.append(action(body?"한마디 수정":"한마디 쓰기","primary-btn",editStar));
  }else if(!store.active()){
    bar.append(action("교수님 계정으로 쓰기","quiet-btn",async()=>{try{await ensureMember();if(store.me.isProfessor)editStar();else{openStar();notice("지정된 교수님 계정으로 쓸 수 있어.");}}catch(e){if(e.code!=="CANCEL")notice(saveProblem(e));}}));
  }
  content.append(bar);
}
function editStar(){
  if(!store.active() || !store.me.isProfessor){openStar();return}
  const requestId=uid(),actor=store.me.accountId,note=board.star,form=formBase(note?.body?"별 편지 수정":"별에 한마디 쓰기");
  const body=addInput(form,"연구실 식구들에게",{long:true,rows:5,max:1200,required:true,value:note?.body,placeholder:"전나무 꼭대기에 걸어둘 한마디"});
  form.append(node("p","meta","보낸 사람 · "+PROFESSOR_NAME));
  const err=addError(form),go=addActions(form,"별에 편지 걸기");body.focus();
  form.onsubmit=async e=>{
    e.preventDefault();if(go.disabled)return;const value=body.value.trim();
    if(!value){message(err,"별에 남길 말을 적어줘.");body.focus();return}
    go.disabled=true;
    try{
      board.star=await store.mutate("setStar",{body:value,revision:note?.revision??null},requestId,actor);
      boardEpoch++;openStar();notice("별에 편지를 걸었어.");
    }catch(error){message(err,saveProblem(error));go.disabled=false}
  };
}
$("tree-star").onclick=openStar;
function removeContribution(group,record){
  const requestId=uid(),actor=store.me.accountId,ornament=group==="ornaments",parent=ornament?record.id:record.parent;
  const description=ornament?"이 장식을 트리에서 내릴까? 달려 있던 답장은 장식 목록에서 계속 읽을 수 있어.":"이 답장을 지울까?";
  confirmRemoval(ornament?"장식 삭제":"답장 삭제",description,()=>openDetail(parent),async()=>{
    await store.mutate(ornament?"deleteOrnament":"deleteReply",{id:record.id,revision:record.revision},requestId,actor);
    boardEpoch++;
    board[group]=board[group].filter(item=>item.id!==record.id);
    renderTree();
    if(ornament)openCatalog();else openDetail(parent);
    notice(ornament?"장식을 트리에서 내렸어.":"답장을 삭제했어.");
  });
}
function showReplies(content,id,canReply){
  const replies=repliesFor(id),head=node("div","section-line");
  head.append(node("h3","","답장 "+replies.length+"개"));
  if(canReply)head.append(action("답장 달기","primary-btn small",()=>askName(()=>composeReply(id))));
  content.append(head);
  if(!replies.length){content.append(node("p","empty","첫 답장 카드를 달아봐."));return}
  const ul=node("ul","reply-list");
  for(const r of replies){
    const li=node("li"),line=node("div","reply-byline");
    line.append(node("strong","",r.author));
    if(store.owns("replies",r.id))line.append(action("수정","quiet-btn",()=>composeReply(id,r)));
    if(store.owns("replies",r.id)||store.active()&&store.me.isAdmin)
      line.append(action(store.owns("replies",r.id)?"내 답장 삭제":"관리자 삭제","quiet-btn danger-link",()=>removeContribution("replies",r)));
    li.append(line,node("p","reply-text",r.body));ul.append(li);
  }
  content.append(ul);
}
function openDetail(id){
  const o=board.ornaments.find(item=>item.id===id);
  if(!o&&!repliesFor(id).length){openCatalog();return}
  const box=popup(o?getTitle(o):"내려간 장식의 답장"),content=node("div","form-grid");
  refreshView=()=>openDetail(id);box.append(content);
  if(!o){
    showReplies(content,id,false);
    const bar=node("div","actions");
    if(!store.active())bar.append(action("내 글 관리","quiet-btn",()=>manageDetail(id)));
    bar.append(action("장식 목록","secondary-btn",openCatalog));content.append(bar);return;
  }
  if(o.kind==="card"){
    const paper=node("div","note-paper");paper.style.borderLeftColor=inkSets[o.tint]?.main||"#a74639";
    paper.append(node("span","meta",o.to?"받는 사람 · "+o.to:"우리 연구실 모두에게"),node("p","message-body",o.body),node("span","meta","보낸 사람 · "+o.author));content.append(paper);
  }else{
    const preview=node("div","art-preview detail-art");preview.classList.toggle("logo-mat",o.sourceKey==="logo");preview.append(pic(o.art,getTitle(o)));content.append(preview);
    const line=o.kind==="mol"?(o.mode==="chain"?"모노머 "+o.atomCount+"원자 × "+o.repeats+"개":"원자 "+o.atomCount+"개")+" · +z 시점":(o.photoStyle==="cut"?"누끼 키링":"유리 볼");
    content.append(node("p","meta",o.author+" · "+line));
  }
  showReplies(content,id,true);
  const bar=node("div","actions"),mine=store.owns("ornaments",id);
  if(mine){
    const edit={card:composeCard,photo:composePhoto,mol:composeMolecule}[o.kind];
    bar.append(action("장식 수정","secondary-btn",()=>edit(o)),action("위치 옮기기","quiet-btn",()=>beginPlacement(o,true)));
  }
  if(mine||store.active()&&store.me.isAdmin)bar.append(action(mine?"내 장식 삭제":"관리자 삭제","quiet-btn danger-link",()=>removeContribution("ornaments",o)));
  else if(!store.active())bar.append(action("내 글 관리","quiet-btn",()=>manageDetail(id)));
  content.append(bar);
}
async function manageDetail(id){
  try{await ensureMember();openDetail(id);}catch(e){if(e.code!=="CANCEL")notice(saveProblem(e));}
}
function composeReply(parent,existing=null){
  const o=board.ornaments.find(v=>v.id===parent);
  if(!o&&!existing){openDetail(parent);notice("이미 내려간 장식이야.");return}
  const form=formBase(existing?"답장 수정":"답장 카드 달기"),actor=store.me.accountId;
  form.append(node("p","help-text",o?o.author+"의 ‘"+getTitle(o)+"’에 달린 답장 카드야.":"내려간 장식의 답장이야."));
  const body=addInput(form,"답장",{long:true,rows:3,max:400,required:true,placeholder:"장식 주인에게 한마디",value:existing?.body});
  form.append(node("p","meta","보낸 사람 · "+(existing?.author||nickname)));
  const err=addError(form),go=addActions(form,existing?"답장 수정":"답장 걸기");body.focus();
  const replyId=uid();
  form.onsubmit=async e=>{
    e.preventDefault();if(go.disabled)return;
    const text=body.value.trim();if(!text){message(err,"답장을 적어줘.");return}
    go.disabled=true;
    try{await saveRecord("replies",{id:existing?.id||replyId,account:actor,author:nickname,parent,body:text},existing,replyId);openDetail(parent);notice(existing?"답장을 수정했어.":"장식 옆에 답장을 달았어.")}
    catch(x){message(err,saveProblem(x));go.disabled=false}
  };
}
function openCatalog(){
  const content=popup("트리에 걸린 장식");
  refreshView=openCatalog;
  if(!board.ornaments.length)content.append(node("p","empty","지금은 가지가 비어 있어. 작업대에서 장식을 골라줘."));
  const ul=node("ul","catalog");
  for(const o of [...board.ornaments].reverse()){
    const li=node("li"),btn=node("button"),text=node("span","catalog-text");
    text.append(node("strong","",getTitle(o)),node("span","meta",o.author+" · 답장 "+repliesFor(o.id).length+"개"));
    const thumb=pic(o.art);if(o.sourceKey==="logo")thumb.classList.add("logo-thumb");
    btn.append(thumb,text);btn.onclick=()=>openDetail(o.id);li.append(btn);ul.append(li);
  }
  if(ul.childElementCount)content.append(ul);
  const onTree=new Set(board.ornaments.map(o=>o.id));
  const archived=new Map();
  for(const reply of board.replies){
    if(onTree.has(reply.parent))continue;
    if(!archived.has(reply.parent))archived.set(reply.parent,[]);
    archived.get(reply.parent).push(reply);
  }
  if(archived.size){
    const list=node("ul","catalog archives");content.append(node("h3","archive-heading","내려간 장식의 답장"),list);
    for(const [parent,replies] of archived){
      const item=node("li"),button=action("","",()=>openDetail(parent)),text=node("span","catalog-text");
      const first=replies[0];
      text.append(node("strong","",first.body.slice(0,44)),node("span","meta",first.author+" · 답장 "+replies.length+"개"));
      button.append(node("i","mail-symbol"),text);item.append(button);list.append(item);
    }
  }
}
$("browse").onclick=()=>{if(draft){notice("지금 장식을 먼저 걸거나 취소해줘.");return}openCatalog()};
$("help-open").onclick=()=>{
  const content=popup("트리 사용 방법"),ol=node("ol","instructions");
  [
    "트리나 장식 목록에서 장식을 열어 메시지와 답장을 읽어봐.",
    "작업대에서 장식을 고르면 우체국 작성 명단에 등록한 Google 계정으로 로그인하고 표시할 이름을 적어. 메시지를 쓰거나 사진 또는 원자 좌표를 넣을 수 있어.",
    "‘걸 위치 고르기’를 누르고 가지를 클릭하거나, 장식을 원하는 가지로 끌어다 놓아. 휴대폰에서는 가지를 톡 누르면 돼.",
    "키보드는 방향키로 위치를 고르고 Enter로 걸어줘. Esc로 취소할 수 있어.",
    "답장이 달린 오나먼트에는 바깥쪽에 작은 장식 하나가 붙어. ‘답장 태그 보기’로 켜고 끌 수 있고, 오나먼트를 누르면 답장을 모두 읽을 수 있어.",
    "작성할 때 썼던 Google 계정으로 장식이나 답장을 열면 삭제 버튼이 보여. 장식을 내리면 그곳의 답장은 장식 목록에 모아둬.",
    "꼭대기의 별을 누르면 교수님의 한마디가 열려."
  ].forEach(t=>ol.append(node("li","",t)));content.append(ol,node("p","help-text","트리에 게시한 글과 완성된 이미지는 링크를 가진 누구나 볼 수 있어. 사진 원본과 분자 좌표는 기기에 남아."));
  if(store.active()) content.append(action("로그아웃","quiet-btn",()=>{
    store.clear();
    window.google?.accounts?.id?.disableAutoSelect?.();
    showName();
    closePopup();
    if(draft) cancelPlacement();
    notice("로그아웃했어.");
  }));
};
// Positions are fractions of the complete postcard; mobile crops only its outer scenery.
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const profile=[[.07,.014],[.14,.047],[.24,.088],[.34,.128],[.46,.176],[.60,.22],[.72,.255],[.78,.273]];
function branchHalf(y){
  for(let i=1;i<profile.length;i++)if(y<=profile[i][0]){
    const [ay,ax]=profile[i-1],[by,bx]=profile[i];
    return ax+(bx-ax)*clamp((y-ay)/(by-ay),0,1);
  }
  return profile[profile.length-1][1];
}
function constrain(x,y){
  y=clamp(y,profile[0][0],profile[profile.length-1][0]);const width=branchHalf(y);
  return {x:clamp(x,.5-width,.5+width),y};
}
function coordsAt(e){
  const r=$("world").getBoundingClientRect();return {x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height};
}
function onBranch(p){return p.y>=.065&&p.y<=.785&&Math.abs(p.x-.5)<=branchHalf(p.y)+.009}
function updateGhost(){
  if(!draft)return;
  const g=$("ghost");
  if(!g.firstElementChild)decoratePin(g,{...draft.record,...draft.point});
  else positionPin(g,draft.point);
}
function beginPlacement(record,moving=false){
  closePopup();const vp=$("viewport");
  draft={record,moving,requestId:moving?uid():record.id,account:store.me.accountId,point:{x:record.x??.5,y:record.y??.48},pointer:null};
  $("tree-star").disabled=true;
  vp.classList.add("placing");vp.tabIndex=0;vp.setAttribute("role","group");vp.setAttribute("aria-label","걸 위치 선택. 방향키로 이동하고 Enter로 걸기. Esc로 취소.");
  $("ghost").hidden=$("placing-tag").hidden=$("place-actions").hidden=false;
  $("scene-hint").textContent="가지에 끌어 놓거나 원하는 곳을 눌러줘.";
  renderTree();updateGhost();vp.focus({preventScroll:true});vp.scrollIntoView({block:"nearest",behavior:"auto"});
}
function endPlacement(){
  draft=null;const vp=$("viewport");
  $("tree-star").disabled=false;
  vp.classList.remove("placing");vp.removeAttribute("tabindex");vp.removeAttribute("role");vp.removeAttribute("aria-label");
  $("ghost").hidden=$("placing-tag").hidden=$("place-actions").hidden=true;
  $("ghost").replaceChildren();$("scene-hint").textContent=restHint;renderTree();
}
function cancelPlacement(){
  if(!draft||placing)return;
  const kind=draft.record.kind;endPlacement();document.querySelector('[data-kind="'+kind+'"]').focus({preventScroll:true});notice("위치 선택을 취소했어.");
}
async function commitPlacement(){
  if(!draft||placing)return;
  placing=true;$("confirm-place").disabled=true;
  const moving=draft.moving;
  const record=moving?{id:draft.record.id,...draft.point}:{...draft.record,...draft.point};
  try{
    const saved=await saveRecord("ornaments",{...record,account:draft.account},moving?draft.record:null,draft.requestId);endPlacement();
    const pin=[...$("ornaments").children].find(b=>b.dataset.id===saved.id);if(pin)pin.focus({preventScroll:true});
    notice("원하는 가지에 걸었어.");
  }catch(x){notice(saveProblem(x))}
  finally{placing=false;$("confirm-place").disabled=false}
}
const restHint=$("scene-hint").textContent;
const vp=$("viewport");
vp.addEventListener("pointerdown",e=>{
  if(!draft||placing||draft.pointer!==null||e.button!==0)return;
  e.preventDefault();vp.focus({preventScroll:true});draft.pointer=e.pointerId;vp.setPointerCapture(e.pointerId);
  const p=coordsAt(e);if(onBranch(p)){draft.point=constrain(p.x,p.y);updateGhost()}
});
vp.addEventListener("pointermove",e=>{
  if(!draft||draft.pointer!==e.pointerId)return;
  const p=coordsAt(e);draft.point=constrain(p.x,p.y);updateGhost();
});
vp.addEventListener("pointerup",e=>{
  if(!draft||draft.pointer!==e.pointerId)return;
  draft.pointer=null;if(vp.hasPointerCapture(e.pointerId))vp.releasePointerCapture(e.pointerId);
  const p=coordsAt(e);
  if(!onBranch(p)){notice("초록 가지 위에 놓아줘.");return}
  draft.point=constrain(p.x,p.y);updateGhost();commitPlacement();
});
vp.addEventListener("pointercancel",()=>{if(draft)draft.pointer=null});
vp.addEventListener("keydown",e=>{
  if(!draft||placing)return;
  if(e.key==="Escape"){e.preventDefault();cancelPlacement();return}
  if(e.key==="Enter"||e.key===" "){e.preventDefault();commitPlacement();return}
  const deltas={ArrowLeft:[-.012,0],ArrowRight:[.012,0],ArrowUp:[0,-.014],ArrowDown:[0,.014]},delta=deltas[e.key];
  if(delta){e.preventDefault();draft.point=constrain(draft.point.x+delta[0],draft.point.y+delta[1]);updateGhost()}
});
$("cancel-place").onclick=cancelPlacement;$("confirm-place").onclick=commitPlacement;
async function initialize(){
  mountLandscape();$("scenery").src=assets.fir;$("star-art").src=assets.star;$("brand-mark").src=sealLogo();$("sample-card").src=envelopeArt("berry");
  const festive=parseXYZ("C 0 0 0\nO 1.10 .63 0\nH -.9 .55 0\nH 0 -1.02 .25\nH 1.85 .16 .08");
  $("sample-mol").src=moleculeArt(festive,"whole",1);
  loadImage(assets.logo).then(i=>{$("sample-photo").src=photoArt(boundedCanvas(i),true,false)}).catch(()=>{$("sample-photo").src=assets.logo});
  setTags(preference(TAG_PREFERENCE)!=="false");$("reply-tags").disabled=false;$("tree-star").disabled=false;
  await refreshTree();
}
initialize();
