(() => {
  'use strict';
  const TTL = 3 * 60 * 60 * 1000, BATCH_SIZE = 24;
  const palette = [
    {name:'벚꽃 분홍', fill:'#f4bccc', edge:'#ad647b'},
    {name:'살구', fill:'#f8c6a6', edge:'#ae7252'},
    {name:'버터 노랑', fill:'#f6e39e', edge:'#a38642'},
    {name:'민트', fill:'#aadcc9', edge:'#548a77'},
    {name:'라벤더', fill:'#cfbdeb', edge:'#87719e'}
  ];
  const id = name => document.getElementById(name);
  const bench = id('bench');
  if (!bench) return;
  const roots = {scene:id('viewport'),tree:id('world'),page:document.body,
    edge:document.querySelector('.postal-edge'),header:document.querySelector('.masthead'),bench,foot:id('scene-foot')};
  const controls = 'button,a[href],input,select,textarea,label,summary,[role="button"],[role="radio"],[role="checkbox"],[contenteditable]:not([contenteditable="false"])';
  const canvas = document.createElement('canvas');
  canvas.className = 'glitter-layer';
  canvas.setAttribute('aria-hidden','true');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  document.body.append(canvas);

  const tools = document.createElement('section');
  tools.className = 'glitter-tools';
  tools.setAttribute('aria-label','반짝이 뿌리기');
  tools.innerHTML = '<div class="glitter-row"><button type="button" class="outline-btn glitter-toggle" aria-pressed="false" aria-describedby="glitter-hint"><span class="glitter-glyph" aria-hidden="true">✦</span><span class="glitter-action">반짝이 뿌리기</span></button><div class="glitter-colors" role="radiogroup" aria-label="반짝이 색"></div></div><p class="glitter-hint" id="glitter-hint" role="status"></p>';
  bench.insertBefore(tools,bench.querySelector('.reply-note') || id('refresh-tree') || null);
  const toggle = tools.querySelector('button'), actionText = tools.querySelector('.glitter-action');
  const colors = tools.querySelector('.glitter-colors'), hint = tools.querySelector('.glitter-hint');
  let color = 0;
  palette.forEach((item,index) => {
    const label = document.createElement('label'), radio = document.createElement('input');
    label.className = 'glitter-color'; label.title = item.name;
    label.style.setProperty('--glitter-color',item.fill);
    radio.type = 'radio'; radio.name = 'sonlab-glitter-color'; radio.value = String(index);
    radio.checked = index === color; radio.setAttribute('aria-label',item.name);
    radio.addEventListener('change',() => { if (radio.checked) color = index; });
    label.append(radio,document.createElement('span')); colors.append(label);
  });
  let active = false, held = null, holdTimer = 0, skipToggleClick = false, warning = '';
  function showHint() {
    const text = warning || (active ? '꾹 누르거나 끌어봐. 버튼을 누르면 끝나.' : '색을 골라 뿌려봐. 반짝이는 3시간 동안 서서히 사라져.');
    if (hint.textContent !== text) hint.textContent = text;
  }
  showHint();

  // Pending points use this device's clock. Confirmed points use the server clock.
  const saved = new Map(), pendingKey = 'sonlab.glitter.pending.v1:' + location.pathname + ':' + store.url;
  let pending = [], current = null, writing = false, writeTimer = 0, writeDue = 0, retryAt = 0, failures = 0;
  let clock = null, cursor = 0, reading = false, readTimer = 0;
  const serverNow = () => clock ? clock.wall + Math.max(performance.now()-clock.tick,Date.now()-clock.local,0) : Date.now();
  function learnClock(now, started) {
    if (Number.isFinite(now)) {
      const tick = performance.now();
      const estimate = now + Math.min(2000,(tick-started)/2);
      clock = {wall:clock ? Math.max(estimate,serverNow()) : estimate,tick,local:Date.now()};
    }
  }
  function validPoint(p) {
    return Array.isArray(p) && (p.length === 5 || (p.length === 6 && p[5]>=0 && p[5]<BATCH_SIZE)) && Object.prototype.hasOwnProperty.call(roots,p[0]) &&
      p.slice(1).every(Number.isSafeInteger) && p[1]>=0 && p[1]<=10000 && p[2]>=0 && p[2]<=10000 &&
      p[3]>=0 && p[3]<palette.length && p[4]>0;
  }
  function validBatch(b) {
    return b && typeof b.id === 'string' && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/.test(b.id) &&
      Array.isArray(b.points) && b.points.length<=BATCH_SIZE && b.points.every(validPoint);
  }
  function rememberPending() {
    try {
      if (pending.length) sessionStorage.setItem(pendingKey,JSON.stringify(pending));
      else sessionStorage.removeItem(pendingKey);
    } catch (_) { /* A guest can still sprinkle with storage disabled. */ }
  }
  try {
    const restored = JSON.parse(sessionStorage.getItem(pendingKey) || '[]');
    if (Array.isArray(restored)) pending = restored.filter(validBatch).filter(b => b.points.some(p => Date.now()-p[4]<TTL));
  } catch (_) {}
  const sprites = new Map();
  function salt(key) {
    let hash = 2166136261;
    for (let i=0;i<key.length;i++) hash = Math.imul(hash^key.charCodeAt(i),16777619);
    return hash >>> 0;
  }
  function sprite(c,variation) {
    const key = c*8+variation;
    if (sprites.has(key)) return sprites.get(key);
    const tile=document.createElement('canvas'); tile.width=84; tile.height=84;
    const pen=tile.getContext('2d'), ink=palette[c];
    pen.scale(2,2); pen.translate(21,21);
    let seed = 43 + variation * 97;
    function noise() { seed = (Math.imul(1664525,seed) + 1013904223) >>> 0; return seed/4294967296; }
    for (let i=0;i<7;i++) {
      const angle=noise()*2*Math.PI, radius=i ? 4+noise()*13 : 0;
      const x=Math.cos(angle)*radius, y=Math.sin(angle)*radius, size=i ? .8+noise()*1.7 : 3+noise()*1.2;
      pen.save(); pen.translate(x,y); pen.rotate(noise()*.8-.4); pen.beginPath();
      if (i<4) {
        for (let k=0;k<8;k++) {
          const a=k*Math.PI/4, r=k%2 ? size*.29 : size;
          const px=Math.cos(a)*r, py=Math.sin(a)*r*1.18;
          if (k) pen.lineTo(px,py); else pen.moveTo(px,py);
        }
        pen.closePath();
      } else pen.arc(0,0,size*.64,0,2*Math.PI);
      pen.fillStyle=ink.fill; pen.fill(); pen.strokeStyle=ink.edge; pen.lineWidth=.55; pen.stroke();
      if (i<2) { pen.fillStyle='#fff9e9'; pen.fillRect(-.55,-1,.9,1.55); }
      pen.restore();
    }
    sprites.set(key,tile); return tile;
  }
  let frame=0, fadeTimer=0;
  const inside = (r,x,y) => r && r.width>0 && r.height>0 && x>=r.left && x<=r.right && y>=r.top && y<=r.bottom;
  function schedulePaint() {
    if (!document.hidden && !frame) frame=requestAnimationFrame(paint);
  }
  function paint() {
    frame=0; clearTimeout(fadeTimer);
    const w=canvas.clientWidth,h=canvas.clientHeight;
    if (!w || !h) return;
    const ratio=Math.min(window.devicePixelRatio||1,2,4096/Math.max(w,h));
    const pw=Math.max(1,Math.round(w*ratio)), ph=Math.max(1,Math.round(h*ratio));
    if (canvas.width!==pw || canvas.height!==ph) { canvas.width=pw; canvas.height=ph; }
    ctx.setTransform(pw/w,0,0,ph/h,0,0); ctx.clearRect(0,0,w,h);
    const groups = {}, rects = {};
    for (const name of Object.keys(roots)) {
      groups[name]=[];
      if (roots[name]) rects[name]=roots[name].getBoundingClientRect();
    }
    let next=Infinity;
    function collect(batch,now) {
      let live=false;
      const seed=salt(batch.id);
      batch.points.forEach(([zone,x,y,c,born,originalIndex],i) => {
        const remaining=TTL-Math.max(0,now-born);
        if (remaining<=0) return;
        live=true; next=Math.min(next,remaining);
        groups[zone].push([x/10000,y/10000,c,(seed+(originalIndex ?? i)*3)%8,remaining/TTL]);
      });
      return live;
    }
    const now=serverNow(), local=Date.now();
    for (const [key,b] of saved) if (!collect(b,now)) saved.delete(key);
    for (const b of pending) if (!saved.has(b.id)) collect(b,local);
    if (next===Infinity) return;
    function clip(r) { ctx.beginPath(); ctx.rect(r.left,r.top,r.width,r.height); ctx.clip(); }
    for (const name of Object.keys(roots)) {
      if (name==='page') {
        // Tree marks go behind opaque panels if a responsive layout moves a panel over them.
        for (const r of [rects.bench,rects.foot]) if (r) ctx.clearRect(r.left,r.top,r.width,r.height);
      }
      const r=rects[name];
      if (!r || !groups[name].length) continue;
      ctx.save(); clip(r); if (name==='tree' && rects.scene) clip(rects.scene);
      for (const [x,y,c,variant,alpha] of groups[name]) {
        const px=r.left+x*r.width, py=r.top+y*r.height;
        if (px < -22 || py < -22 || px > w+22 || py > h+22) continue;
        ctx.globalAlpha=alpha; ctx.drawImage(sprite(c,variant),px-21,py-21,42,42);
      }
      ctx.restore();
    }
    // Trim even the outer flecks off actual controls. The transparent canvas never receives input.
    document.querySelectorAll(controls+',.reply-decoration').forEach(el => {
      for (const r of el.getClientRects()) ctx.clearRect(r.left,r.top,r.width,r.height);
    });
    fadeTimer=setTimeout(schedulePaint,Math.max(1,Math.min(12000,Math.ceil(next))));
  }

  function note(text) { warning=text; showHint(); }
  function queueWrite(delay) {
    if (!pending.length || writing) return;
    const due=Math.max(Date.now()+delay,retryAt);
    if (writeTimer && writeDue<=due) return;
    clearTimeout(writeTimer); writeDue=due;
    writeTimer=setTimeout(() => { writeTimer=0; writeNext(); },Math.max(0,due-Date.now()));
  }
  async function writeNext() {
    if (writing) return;
    const now=Date.now();
    pending=pending.filter(b => b.points.some(p => now-p[4]<TTL));
    const batch=pending[0];
    if (!batch) {
      current=null; failures=0; retryAt=0; rememberPending(); note(''); schedulePaint();
      return;
    }
    if (batch===current) current=null;
    writing=true;
    const started=performance.now();
    try {
      const points=batch.points.map(([z,x,y,c,born])=>[z,x,y,c,Math.min(TTL,Math.max(0,now-born))]);
      const payload={requestId:batch.id,points};
      if (clock) payload.sentAt=Math.round(serverNow());
      const result=await store.call('sprinkle',payload,{post:true});
      learnClock(result.now,started);
      if (validBatch(result.batch)) saved.set(batch.id,result.batch);
      pending.shift(); failures=0; retryAt=0; note('');
    } catch (err) {
      failures++; retryAt=Date.now() + Math.min(300000,Math.max(err.code==='RATE'||err.code==='FULL'?60000:4000,4000*2**Math.min(6,failures-1)));
      note(err.code==='FULL' ? '공동 반짝이 자리가 차서 잠시 기다리는 중이야.' : '이 탭에 보관했어. 연결되면 다시 공유할게.');
    } finally {
      writing=false; rememberPending(); schedulePaint(); queueWrite(500);
    }
  }
  async function readShared() {
    if (reading || document.hidden) return;
    clearTimeout(readTimer); reading=true;
    const started=performance.now();
    try {
      const result=await store.call('glitter',{since:cursor});
      if (!Array.isArray(result.batches) || !Number.isSafeInteger(result.version)) throw Error('glitter');
      learnClock(result.now,started);
      for (const b of result.batches) if (validBatch(b)) saved.set(b.id,b);
      cursor=result.version;
      if (!failures) note('');
      schedulePaint();
    } catch (_) {
      if (!failures) note('공동 반짝이를 불러오지 못했어. 잠시 뒤 다시 연결할게.');
    } finally {
      reading=false;
      if (!document.hidden) readTimer=setTimeout(readShared,45000+Math.random()*5000);
    }
  }
  function newBatchId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const bytes=crypto.getRandomValues(new Uint8Array(16));
    bytes[6]=(bytes[6]&15)|64; bytes[8]=(bytes[8]&63)|128;
    const s=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
    return [s.slice(0,8),s.slice(8,12),s.slice(12,16),s.slice(16,20),s.slice(20)].join('-');
  }
  function stamp(x,y) {
    const target=document.elementFromPoint(x,y);
    if (!target || target.closest(controls)) return;
    let zone;
    if (roots.bench.contains(target)) zone='bench';
    else if (roots.foot?.contains(target)) zone='foot';
    else if (roots.header?.contains(target)) zone='header';
    else if (roots.edge?.contains(target)) zone='edge';
    else if (roots.scene?.contains(target)) zone=inside(roots.tree?.getBoundingClientRect(),x,y)?'tree':'scene';
    else zone='page';
    const r=roots[zone].getBoundingClientRect();
    if (!inside(r,x,y)) return;
    if (!current) {
      if (pending.length >= 64) {note('아직 공유 중인 반짝이가 많아. 잠시 뒤 다시 뿌려줘.');return;}
      current={id:newBatchId(),points:[]}; pending.push(current);
    }
    current.points.push([zone,Math.round((x-r.left)/r.width*10000),Math.round((y-r.top)/r.height*10000),color,Date.now()]);
    if (current.points.length===BATCH_SIZE) current=null;
    rememberPending(); schedulePaint(); queueWrite(3000);
  }

  function finishHold() {
    if (!held) return;
    const {target,id}=held;
    held=null; clearInterval(holdTimer);
    if (target.hasPointerCapture?.(id)) target.releasePointerCapture(id);
    queueWrite(450);
  }
  function setActive(value) {
    if (!value) finishHold();
    active=value; document.documentElement.classList.toggle('glitter-mode',value);
    toggle.setAttribute('aria-pressed',String(value));
    actionText.textContent=value?'뿌리기 끝내기':'반짝이 뿌리기';showHint();
  }
  toggle.addEventListener('click',() => {
    if (skipToggleClick) {skipToggleClick=false;return;}
    if (!active && roots.scene?.classList.contains('placing')) {note('지금 장식을 걸거나 취소한 뒤에 뿌릴 수 있어.');return;}
    if (!failures) note('');
    setActive(!active);
  });
  document.addEventListener('pointerdown',e => {
    skipToggleClick=false;
    if (!e.isPrimary) {finishHold();return;}
    if (e.button!==0) return;
    if (e.target.closest(controls)) {
      skipToggleClick=active && toggle.contains(e.target);
      if (active) setActive(false);
      return;
    }
    if (!active || held) return;
    e.preventDefault();
    held={id:e.pointerId,target:e.target,x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,at:performance.now()};
    stamp(e.clientX,e.clientY);
    try {e.target.setPointerCapture?.(e.pointerId);} catch (_) { /* The pointer may already be gone. */ }
    holdTimer=setInterval(() => {
      if (!held || performance.now()-held.at<180) return;
      stamp(held.x,held.y); held.lastX=held.x; held.lastY=held.y; held.at=performance.now();
    },210);
  },{capture:true,passive:false});
  function trail(e,ending) {
    if (!held || held.id!==e.pointerId) return;
    held.x=e.clientX; held.y=e.clientY;
    const dx=held.x-held.lastX, dy=held.y-held.lastY, distance=Math.hypot(dx,dy), now=performance.now();
    if (distance<12 || (!ending && now-held.at<72)) return;
    const steps=Math.min(3,Math.max(1,Math.floor(distance/17)));
    for (let i=1;i<=steps;i++) stamp(held.lastX+dx*i/steps,held.lastY+dy*i/steps);
    held.lastX=held.x;held.lastY=held.y;held.at=now;
  }
  window.addEventListener('pointermove',e=>{
    if (held?.id!==e.pointerId) return;
    if (!e.buttons) {finishHold();return;}
    trail(e,false);
  },true);
  window.addEventListener('pointerup',e=>{if (held?.id===e.pointerId) {trail(e,true);finishHold();}},true);
  for (const type of ['pointercancel','lostpointercapture']) {
    window.addEventListener(type,e=>{if (held?.id===e.pointerId) finishHold();},true);
  }
  document.addEventListener('click',e=>{
    if (active && e.target.closest(controls) && !toggle.contains(e.target)) setActive(false);
  },true);
  document.addEventListener('keydown',e=>{
    skipToggleClick=false;
    if (active && e.key==='Escape') {setActive(false);e.preventDefault();}
  },true);
  window.addEventListener('blur',()=>{if (active) setActive(false);});
  window.addEventListener('pagehide',()=>{setActive(false);rememberPending();});
  window.addEventListener('online',()=>{retryAt=0;clearTimeout(writeTimer);writeTimer=0;queueWrite(0);readShared();});
  document.addEventListener('visibilitychange',()=>{
    if (document.hidden) {setActive(false);clearTimeout(readTimer);clearTimeout(fadeTimer);}
    else {schedulePaint();readShared();queueWrite(0);}
  });
  window.addEventListener('pageshow',e=>{if (e.persisted) {schedulePaint();readShared();queueWrite(0);}});
  window.addEventListener('resize',schedulePaint);
  window.addEventListener('scroll',schedulePaint,{capture:true,passive:true});
  if ('ResizeObserver' in window) {
    const observer=new ResizeObserver(schedulePaint);
    for (const root of Object.values(roots)) if (root) observer.observe(root);
  }
  if ('MutationObserver' in window && id('ornaments')) {
    const observer=new MutationObserver(schedulePaint);
    observer.observe(id('ornaments'),{childList:true});
    observer.observe(roots.scene,{attributes:true,attributeFilter:['class']});
  }
  id('refresh-tree')?.addEventListener('click',readShared);
  schedulePaint();readShared();queueWrite(0);
})();
