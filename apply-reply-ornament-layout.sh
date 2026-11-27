#!/usr/bin/env bash
# Run from the GitHub Codespace for the tree repository.
set -eu

repository=$(git rev-parse --show-toplevel) || exit 1
cd -- "$repository"

from_rotation() {
  git apply "$@" - <<'END_ROTATION_PATCH'
diff --git a/docs/js/app.js b/docs/js/app.js
index a337b39..37f258b 100644
--- a/docs/js/app.js
+++ b/docs/js/app.js
@@ -280,52 +280,58 @@ function compareCreationOrder(a, b) {
   return a.created - b.created || a.id.localeCompare(b.id);
 }
-function replyDecorationsByParent() {
-  const groups = new Map(board.ornaments.map(ornament => [ornament.id, []]));
-  let position = 0;
+function replySummariesByParent() {
+  const summaries = new Map(board.ornaments.map(ornament => [ornament.id, {count: 0, shape: null}]));
+  let decoratedParents = 0;
   for (const reply of board.replies) {
-    const group = groups.get(reply.parent);
-    if (!group) continue;
-    group.push(replyDecorations[position % replyDecorations.length]);
-    position++;
+    const summary = summaries.get(reply.parent);
+    if (!summary) continue;
+    if (summary.count === 0) {
+      summary.shape = replyDecorations[decoratedParents % replyDecorations.length];
+      decoratedParents++;
+    }
+    summary.count++;
   }
-  return groups;
+  return summaries;
 }
-function addReplyDecorations(face, shapes) {
+function addReplyDecoration(face, shape) {
   const layer = node("span","reply-decorations");
   layer.setAttribute("aria-hidden","true");
-  shapes.forEach((shape, index) => {
-    const base = "./assets/reply-ornaments/" + shape.file;
-    const marker = pic();
-    marker.className = "reply-decoration";
-    marker.width = shape.width;
-    marker.height = 20;
-    marker.srcset = base + ".png 1x, " + base + "@4x.png 4x";
-    marker.src = base + ".png";
-    marker.style.transform = "translate(-" + shape.x + "%, -" + shape.y + "%)";
-    if (index > 0) {
-      // Keep every reply on the right edge, even when several share a small ornament.
-      const share = 48 * index / (shapes.length - 1);
-      marker.style.setProperty("--reply-offset", "min(" + index * 20 + "px, " + share + "%)");
-    }
-    layer.append(marker);
-  });
+  const base = "./assets/reply-ornaments/" + shape.file;
+  const marker = pic();
+  marker.className = "reply-decoration";
+  marker.width = shape.width;
+  marker.height = 20;
+  marker.srcset = base + ".png 1x, " + base + "@4x.png 4x";
+  marker.src = base + ".png";
+  marker.style.transform = "translate(-" + shape.x + "%, -" + shape.y + "%)";
+  layer.append(marker);
   face.append(layer);
 }
-function decoratePin(b,o,shapes=[]){
+function positionPin(pin, point) {
+  pin.classList.toggle("reply-left", point.x < 0.5);
+  pin.style.left = (point.x * 100) + "%";
+  pin.style.top = (point.y * 100) + "%";
+}
+function decoratePin(b,o,shape){
   const face=node("span","pin-art");
   face.append(pic(o.art));
-  if(shapes.length)addReplyDecorations(face,shapes);
+  if(shape)addReplyDecoration(face,shape);
   b.replaceChildren(face);
   if(o.kind==="mol"){const label=node("span","nameplate",o.title);b.append(label)}
-  b.style.width="calc(var(--ornament-reference, 800px) * "+(ornamentWidth(o)*.8/100)+")";b.style.left=(o.x*100)+"%";b.style.top=(o.y*100)+"%";
+  b.style.width="calc(var(--ornament-reference, 800px) * "+(ornamentWidth(o)*.8/100)+")";
+  positionPin(b,o);
 }
 function renderTree(){
   const d=document.createDocumentFragment();
-  const shapesByParent=replyDecorationsByParent();
+  const summaries=replySummariesByParent();
   for(const o of board.ornaments){
-    if(draft?.moving&&draft.record.id===o.id)continue;
-    const shapes=shapesByParent.get(o.id),b=node("button","pin");b.type="button";
-    const desc=getTitle(o)+" · "+o.author+" · 답장 "+shapes.length+"개";
-    b.dataset.id=o.id;b.setAttribute("aria-label",desc);b.title=desc;decoratePin(b,o,shapes);
+    const {count,shape}=summaries.get(o.id);
+    if(draft?.moving&&draft.record.id===o.id){
+      decoratePin($("ghost"),{...o,...draft.point},shape);
+      continue;
+    }
+    const b=node("button","pin");b.type="button";
+    const desc=getTitle(o)+" · "+o.author+" · 답장 "+count+"개";
+    b.dataset.id=o.id;b.setAttribute("aria-label",desc);b.title=desc;decoratePin(b,o,shape);
     b.onclick=()=>openDetail(o.id);d.append(b);
   }
@@ -561,5 +567,5 @@ $("help-open").onclick=()=>{
     "‘걸 위치 고르기’를 누르고 가지를 클릭하거나, 장식을 원하는 가지로 끌어다 놓아. 휴대폰에서는 가지를 톡 누르면 돼.",
     "키보드는 방향키로 위치를 고르고 Enter로 걸어줘. Esc로 취소할 수 있어.",
-    "‘답장 태그 보기’로 답장마다 달린 리본과 오나먼트를 켜고 끌 수 있어. 장식을 누르면 답장을 모두 읽을 수 있어.",
+    "답장이 달린 오나먼트에는 바깥쪽에 작은 장식 하나가 붙어. ‘답장 태그 보기’로 켜고 끌 수 있고, 오나먼트를 누르면 답장을 모두 읽을 수 있어.",
     "작성할 때 썼던 Google 계정으로 장식이나 답장을 열면 삭제 버튼이 보여. 장식을 내리면 그곳의 답장은 장식 목록에 모아둬.",
     "꼭대기의 별을 누르면 교수님의 한마디가 열려."
@@ -596,6 +602,5 @@ function updateGhost(){
   const g=$("ghost");
   if(!g.firstElementChild)decoratePin(g,{...draft.record,...draft.point});
-  else {g.style.left=(draft.point.x*100)+"%";g.style.top=(draft.point.y*100)+"%"}
-
+  else positionPin(g,draft.point);
 }
 function beginPlacement(record,moving=false){
@@ -606,5 +611,5 @@ function beginPlacement(record,moving=false){
   $("ghost").hidden=$("placing-tag").hidden=$("place-actions").hidden=false;
   $("scene-hint").textContent="가지에 끌어 놓거나 원하는 곳을 눌러줘.";
-  updateGhost();renderTree();vp.focus({preventScroll:true});vp.scrollIntoView({block:"nearest",behavior:"auto"});
+  renderTree();updateGhost();vp.focus({preventScroll:true});vp.scrollIntoView({block:"nearest",behavior:"auto"});
 }
 function endPlacement(){
diff --git a/docs/style.css b/docs/style.css
index 891871f..15ef177 100644
--- a/docs/style.css
+++ b/docs/style.css
@@ -65,8 +65,9 @@ h2,h3,.choice strong {font-family:var(--serif);color:var(--pine);letter-spacing:
 .pin-art {position:relative;display:block;width:100%;line-height:0}
 .reply-decorations {position:absolute;inset:0;pointer-events:none}
+.pin.reply-left .reply-decorations {transform:scaleX(-1)}
 .pin img.reply-decoration {
   position:absolute;
   left:87%;
-  top:calc(38% + var(--reply-offset, 0px));
+  top:38%;
   width:auto;
   height:20px;
END_ROTATION_PATCH
}

from_baseline() {
  git apply "$@" - <<'END_BASELINE_PATCH'
diff --git a/docs/js/app.js b/docs/js/app.js
index 6490bff..37f258b 100644
--- a/docs/js/app.js
+++ b/docs/js/app.js
@@ -271,53 +271,67 @@ function ornamentWidth(o){
 const replyDecorations = [
   {file:"velvet-bow",   width:26, x:38.4176, y:33.3434},
-  {file:"ivory-bow",    width:29, x:38.1905, y:33.3908},
   {file:"brass-bell",   width:19, x:10.2707, y:3.5736},
   {file:"candy-cane",   width:16, x:43.4881, y:1.8680},
+  {file:"ivory-bow",    width:29, x:38.1905, y:33.3908},
   {file:"wrapped-gift", width:18, x:13.6827, y:13.5740},
   {file:"glass-drop",   width:16, x:35.5885, y:3.3793}
 ];
-function decorationForReply(id) {
-  // FNV-1a maps a saved reply ID to the same design on every visit and device.
-  let hash = 2166136261;
-  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
-  return replyDecorations[(hash >>> 0) % replyDecorations.length];
+function compareCreationOrder(a, b) {
+  return a.created - b.created || a.id.localeCompare(b.id);
+}
+function replySummariesByParent() {
+  const summaries = new Map(board.ornaments.map(ornament => [ornament.id, {count: 0, shape: null}]));
+  let decoratedParents = 0;
+  for (const reply of board.replies) {
+    const summary = summaries.get(reply.parent);
+    if (!summary) continue;
+    if (summary.count === 0) {
+      summary.shape = replyDecorations[decoratedParents % replyDecorations.length];
+      decoratedParents++;
+    }
+    summary.count++;
+  }
+  return summaries;
 }
-function addReplyDecorations(face, replies) {
+function addReplyDecoration(face, shape) {
   const layer = node("span","reply-decorations");
   layer.setAttribute("aria-hidden","true");
-  replies.forEach((reply, index) => {
-    const shape = decorationForReply(reply.id);
-    const base = "./assets/reply-ornaments/" + shape.file;
-    const marker = pic();
-    marker.className = "reply-decoration";
-    marker.width = shape.width;
-    marker.height = 20;
-    marker.srcset = base + ".png 1x, " + base + "@4x.png 4x";
-    marker.src = base + ".png";
-    marker.style.transform = "translate(-" + shape.x + "%, -" + shape.y + "%)";
-    if (index > 0) {
-      // Keep every reply on the right edge, even when several share a small ornament.
-      const share = 48 * index / (replies.length - 1);
-      marker.style.setProperty("--reply-offset", "min(" + index * 20 + "px, " + share + "%)");
-    }
-    layer.append(marker);
-  });
+  const base = "./assets/reply-ornaments/" + shape.file;
+  const marker = pic();
+  marker.className = "reply-decoration";
+  marker.width = shape.width;
+  marker.height = 20;
+  marker.srcset = base + ".png 1x, " + base + "@4x.png 4x";
+  marker.src = base + ".png";
+  marker.style.transform = "translate(-" + shape.x + "%, -" + shape.y + "%)";
+  layer.append(marker);
   face.append(layer);
 }
-function decoratePin(b,o,replies=[]){
+function positionPin(pin, point) {
+  pin.classList.toggle("reply-left", point.x < 0.5);
+  pin.style.left = (point.x * 100) + "%";
+  pin.style.top = (point.y * 100) + "%";
+}
+function decoratePin(b,o,shape){
   const face=node("span","pin-art");
   face.append(pic(o.art));
-  if(replies.length)addReplyDecorations(face,replies);
+  if(shape)addReplyDecoration(face,shape);
   b.replaceChildren(face);
   if(o.kind==="mol"){const label=node("span","nameplate",o.title);b.append(label)}
-  b.style.width="calc(var(--ornament-reference, 800px) * "+(ornamentWidth(o)*.8/100)+")";b.style.left=(o.x*100)+"%";b.style.top=(o.y*100)+"%";
+  b.style.width="calc(var(--ornament-reference, 800px) * "+(ornamentWidth(o)*.8/100)+")";
+  positionPin(b,o);
 }
 function renderTree(){
   const d=document.createDocumentFragment();
+  const summaries=replySummariesByParent();
   for(const o of board.ornaments){
-    if(draft?.moving&&draft.record.id===o.id)continue;
-    const replies=repliesFor(o.id),b=node("button","pin");b.type="button";
-    const desc=getTitle(o)+" · "+o.author+" · 답장 "+replies.length+"개";
-    b.dataset.id=o.id;b.setAttribute("aria-label",desc);b.title=desc;decoratePin(b,o,replies);
+    const {count,shape}=summaries.get(o.id);
+    if(draft?.moving&&draft.record.id===o.id){
+      decoratePin($("ghost"),{...o,...draft.point},shape);
+      continue;
+    }
+    const b=node("button","pin");b.type="button";
+    const desc=getTitle(o)+" · "+o.author+" · 답장 "+count+"개";
+    b.dataset.id=o.id;b.setAttribute("aria-label",desc);b.title=desc;decoratePin(b,o,shape);
     b.onclick=()=>openDetail(o.id);d.append(b);
   }
@@ -333,7 +347,6 @@ async function readBoard(){
   const remote=await store.call("tree");
   if(sequence!==loadSequence||epoch!==boardEpoch)return;
-  const order=(a,b)=>a.created-b.created||a.id.localeCompare(b.id);
-  board.ornaments=remote.ornaments.map(o=>store.prepare(o)).sort(order);
-  board.replies=remote.replies.sort(order);board.star=remote.star;
+  board.ornaments=remote.ornaments.map(o=>store.prepare(o)).sort(compareCreationOrder);
+  board.replies=remote.replies.sort(compareCreationOrder);board.star=remote.star;
   const versions=new Set(board.ornaments.map(o=>o.imageVersion).filter(Boolean));
   for(const key of store.media.keys())if(!versions.has(key))store.media.delete(key);
@@ -378,5 +391,10 @@ async function saveRecord(group,record,base=null,requestId=record.id){
   if(saved.imageVersion&&art)store.media.set(saved.imageVersion,art);
   const value=reply?saved:store.prepare(saved),list=board[group],where=list.findIndex(x=>x.id===saved.id);
-  if(where>=0)list[where]=value;else list.push(value);
+  if (where >= 0) {
+    list[where] = value;
+  } else {
+    list.push(value);
+    if (reply) list.sort(compareCreationOrder);
+  }
   if(!base && !store.me[group].includes(saved.id))store.me[group].push(saved.id);
   renderTree();return saved;
@@ -549,5 +567,5 @@ $("help-open").onclick=()=>{
     "‘걸 위치 고르기’를 누르고 가지를 클릭하거나, 장식을 원하는 가지로 끌어다 놓아. 휴대폰에서는 가지를 톡 누르면 돼.",
     "키보드는 방향키로 위치를 고르고 Enter로 걸어줘. Esc로 취소할 수 있어.",
-    "‘답장 태그 보기’로 답장마다 달린 리본과 오나먼트를 켜고 끌 수 있어. 장식을 누르면 답장을 모두 읽을 수 있어.",
+    "답장이 달린 오나먼트에는 바깥쪽에 작은 장식 하나가 붙어. ‘답장 태그 보기’로 켜고 끌 수 있고, 오나먼트를 누르면 답장을 모두 읽을 수 있어.",
     "작성할 때 썼던 Google 계정으로 장식이나 답장을 열면 삭제 버튼이 보여. 장식을 내리면 그곳의 답장은 장식 목록에 모아둬.",
     "꼭대기의 별을 누르면 교수님의 한마디가 열려."
@@ -584,6 +602,5 @@ function updateGhost(){
   const g=$("ghost");
   if(!g.firstElementChild)decoratePin(g,{...draft.record,...draft.point});
-  else {g.style.left=(draft.point.x*100)+"%";g.style.top=(draft.point.y*100)+"%"}
-
+  else positionPin(g,draft.point);
 }
 function beginPlacement(record,moving=false){
@@ -594,5 +611,5 @@ function beginPlacement(record,moving=false){
   $("ghost").hidden=$("placing-tag").hidden=$("place-actions").hidden=false;
   $("scene-hint").textContent="가지에 끌어 놓거나 원하는 곳을 눌러줘.";
-  updateGhost();renderTree();vp.focus({preventScroll:true});vp.scrollIntoView({block:"nearest",behavior:"auto"});
+  renderTree();updateGhost();vp.focus({preventScroll:true});vp.scrollIntoView({block:"nearest",behavior:"auto"});
 }
 function endPlacement(){
diff --git a/docs/style.css b/docs/style.css
index 891871f..15ef177 100644
--- a/docs/style.css
+++ b/docs/style.css
@@ -65,8 +65,9 @@ h2,h3,.choice strong {font-family:var(--serif);color:var(--pine);letter-spacing:
 .pin-art {position:relative;display:block;width:100%;line-height:0}
 .reply-decorations {position:absolute;inset:0;pointer-events:none}
+.pin.reply-left .reply-decorations {transform:scaleX(-1)}
 .pin img.reply-decoration {
   position:absolute;
   left:87%;
-  top:calc(38% + var(--reply-offset, 0px));
+  top:38%;
   width:auto;
   height:20px;
END_BASELINE_PATCH
}

if from_rotation --reverse --check 2>/dev/null; then
  printf '%s\n' '이미 적용되어 있어.'
  exit 0
fi

for patch in from_rotation from_baseline; do
  if "$patch" --check 2>/dev/null; then
    "$patch"
    printf '%s\n' '장식 배치 적용 완료'
    exit 0
  fi
done

printf '%s\n' '설치 중단. 현재 docs/js/app.js 또는 docs/style.css가 답장 장식 패치의 두 기준 버전과 달라. 아래 메시지를 확인해 줘.' >&2
from_rotation --check
