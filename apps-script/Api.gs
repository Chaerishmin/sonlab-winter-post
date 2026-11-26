const PROFESSOR_LABEL = '손창윤 교수님';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const OPERATIONS = ['createOrnament','editOrnament','moveOrnament','deleteOrnament','createReply','editReply','deleteReply','setStar'];
class ApiFault extends Error {
  constructor(code,message) { super(message); this.code=code; }
}
function fail_(code,message) { throw new ApiFault(code,message); }
function jsonResponse_(work) {
  let envelope;
  try { envelope={ok:true,data:work()}; }
  catch(e) {
    envelope={ok:false,error:e instanceof ApiFault?{code:e.code,message:e.message}:{code:'SERVER',message:'공동 저장소에서 작업을 마치지 못했어. 잠시 뒤 다시 시도해줘.'}};
  }
  return ContentService.createTextOutput(JSON.stringify(envelope)).setMimeType(ContentService.MimeType.JSON);
}
function uuid_(value) {
  if (typeof value!=='string' || !UUID_RE.test(value)) fail_('INPUT','장식 또는 요청 번호가 올바르지 않아.');
  return value;
}
function textField_(value,max,optional=false) {
  if (optional && (value===null || value===undefined)) return '';
  if (typeof value!=='string') fail_('INPUT','글 내용을 확인해줘.');
  value=value.trim().normalize('NFC');
  if (value.length>max || (!optional && !value) || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)) fail_('INPUT','글 길이 또는 내용을 확인해줘.');
  return value;
}
function oneOf_(value,choices) {
  if (!choices.includes(value)) fail_('INPUT','장식 옵션을 확인해줘.');
  return value;
}
function point_(p) {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x<0 || p.x>1 || p.y<0 || p.y>1) fail_('INPUT','위치를 다시 선택해줘.');
  return {x:p.x,y:p.y};
}
function design_(p) {
  const kind=oneOf_(p.kind,['card','photo','mol']);
  if (kind==='card') return {kind,to:textField_(p.to,28,true),body:textField_(p.body,600),tint:oneOf_(p.tint,['berry','pine','honey'])};
  const title=textField_(p.title,32);
  if (kind==='photo') return {kind,title,photoStyle:oneOf_(p.photoStyle,['ball','cut']),sourceKey:oneOf_(p.sourceKey || null,[null,'mitten','logo','pinecone'])};
  const mode=oneOf_(p.mode,['whole','chain']), repeats=oneOf_(p.repeats,mode==='whole'?[1]:[3,5,7]);
  if (!Number.isInteger(p.atomCount) || p.atomCount<1 || p.atomCount>300) fail_('INPUT','원자 수를 확인해줘.');
  return {kind,title,mode,repeats,atomCount:p.atomCount};
}
function active_(rows) { return rows.filter(r=>r.status==='active'); }
function board_(db) {
  const note=db.rows('Settings').find(r=>r.id==='star');
  return {ornaments:active_(db.rows('Ornaments')).map(r=>r.data), replies:active_(db.rows('Replies')).map(r=>r.data),
    star:note?note.data:{body:'',revision:null,author:PROFESSOR_LABEL}};
}
function images_(db,ids) {
  if (typeof ids!=='string' || ids.length>150) fail_('INPUT','이미지 요청을 확인해줘.');
  const wanted=ids.split(',').map(uuid_);
  if (wanted.length>4) fail_('INPUT','이미지는 네 개씩 읽을 수 있어.');
  const result=[];
  for (const r of active_(db.rows('Ornaments'))) {
    if (!r.fileId || !wanted.includes(r.id)) continue;
    const blob=treeFile_(r.fileId,r.id).getBlob(), type=blob.getContentType();
    if (!['image/webp','image/png'].includes(type)) fail_('IMAGE','저장된 이미지 형식을 읽을 수 없어.');
    result.push({id:r.id,version:r.data.imageVersion,art:'data:'+type+';base64,'+Utilities.base64Encode(blob.getBytes())});
  }
  return result;
}
function viewer_(db,actor) {
  const owned=name=>active_(db.rows(name)).filter(r=>r.owner===actor.key).map(r=>r.id);
  // Only returned after sign-in to the holder of this token. The public tree contains no identity claims.
  return {accountId:actor.sub,expires:actor.exp,isAdmin:actor.isAdmin,isProfessor:actor.isProfessor,
    ornaments:owned('Ornaments'),replies:owned('Replies')};
}
function doGet(e) {
  return jsonResponse_(()=>{
    const p=e && e.parameter || {};
    if (!p.op || p.op==='tree') return board_(storage_());
    if (p.op==='images') return images_(storage_(),p.ids);
    if (p.op==='ping') return {service:'sonlab-winter-post',version:1};
    fail_('INPUT','지원하지 않는 조회야.');
  });
}
function doPost(e) {
  return jsonResponse_(()=>{
    const raw=e && e.postData && e.postData.contents;
    if (!raw || raw.length>2850000) fail_('INPUT','요청 크기를 확인해줘.');
    let p;
    try { p=JSON.parse(raw); } catch (_) { fail_('INPUT','요청을 읽을 수 없어.'); }
    if (!p || typeof p!=='object' || Array.isArray(p)) fail_('INPUT','요청 형식을 확인해줘.');
    if (p.op==='ping') return {service:'sonlab-winter-post',version:1};
    if (![...OPERATIONS,'session','sendCode','verifyCode'].includes(p.op)) fail_('INPUT','지원하지 않는 작업이야.');
    const actor=groupActor_(p.credential);
    mailbox_(actor,p.op,p.code);
    if (p.op==='sendCode') return {sent:true};
    if (p.op==='session' || p.op==='verifyCode') return viewer_(storage_(),actor);
    uuid_(p.requestId);
    return withLock_(()=>mutate_(storage_(),actor,p));
  });
}
function requireRevision_(expected,r) {
  if (expected!==(r?r.data.revision:null)) fail_('STALE','다른 창에서 내용이 바뀌었어. 새로고침하고 다시 열어줘.');
}
function stamped_(data) {
  return Object.assign(data,{revision:Utilities.getUuid(),updated:Date.now()});
}
function createEntry_(db,actor,p,table,rows) {
  const existing=rows.find(r=>r.createKey===p.requestId && r.owner===actor.key);
  if (existing) {
    if (existing.status!=='active') fail_('GONE','이미 삭제된 기록이야.');
    return existing.data;
  }
  const isReply=table==='Replies', max=isReply?1500:250;
  if (active_(rows).length>=max) fail_('LIMIT','트리에 걸 수 있는 수에 도달했어.');
  const author=textField_(p.author,20);
  if (/[\r\n]/.test(author)) fail_('INPUT','닉네임은 한 줄로 적어줘.');
  let detail,picture;
  if (isReply) {
    const parent=uuid_(p.parent);
    if (!db.rows('Ornaments').some(r=>r.id===parent && r.status==='active')) fail_('GONE','이미 내려간 장식에는 답장을 달 수 없어.');
    detail={parent,body:textField_(p.body,400)};
  } else {
    detail=Object.assign(design_(p),point_(p));
    if (detail.kind!=='card') picture=picture_(p.art);
  }
  limit_(actor.key,20,60000);
  const id=Utilities.getUuid(), data=stamped_(Object.assign(detail,{id,author,created:Date.now()}));
  const entry={id,owner:actor.key,createKey:p.requestId,lastKey:p.requestId,status:'active',fileId:'',data};
  if (picture) { entry.fileId=storePicture_(picture,id,p.requestId); data.imageVersion=data.revision; }
  // If a Drive write succeeds but the sheet write is interrupted, cleanUnusedImages reconciles it.
  db.save(table,entry);
  return data;
}
function mutate_(db,actor,p) {
  if (p.op==='setStar') {
    if (!actor.isProfessor) fail_('FORBIDDEN','별 편지는 지정된 교수님 계정으로 쓸 수 있어.');
    const old=db.rows('Settings').find(r=>r.id==='star');
    if (old && old.lastKey===p.requestId && old.owner===actor.key) return old.data;
    requireRevision_(p.revision,old);
    const body=textField_(p.body,1200,true);
    limit_(actor.key,20,60000);
    const record=old || {id:'star',createKey:p.requestId,status:'active',fileId:''};
    record.owner=actor.key; record.lastKey=p.requestId;
    record.data=stamped_({author:PROFESSOR_LABEL,body});
    db.save('Settings',record);return record.data;
  }
  const table=p.op.endsWith('Reply')?'Replies':'Ornaments', rows=db.rows(table);
  if (p.op.startsWith('create')) return createEntry_(db,actor,p,table,rows);
  const id=uuid_(p.id), row=rows.find(r=>r.id===id), deleting=p.op.startsWith('delete');
  if (!row) fail_('GONE','찾으려는 기록이 없어.');
  if (row.owner!==actor.key && !(deleting && actor.isAdmin)) fail_('FORBIDDEN','이 계정으로 해당 기록을 변경할 수 없어.');
  if (row.lastKey===p.requestId) return row.status==='deleted'?{id,deleted:true}:row.data;
  if (row.status!=='active') fail_('GONE','이미 삭제된 기록이야.');
  requireRevision_(p.revision,row);
  let oldFile='';
  limit_(actor.key,20,60000);
  if (deleting) {
    oldFile=row.fileId;row.fileId='';row.status='deleted';
    // Drop message, nickname and image reference. Replies keep their independent owner and parent ID.
    row.data={id,deleted:true};
  } else if (p.op==='moveOrnament') {
    Object.assign(row.data,point_(p));
  } else if (p.op==='editReply') {
    row.data.body=textField_(p.body,400);
  } else {
    const design=design_(p);
    if (design.kind!==row.data.kind) fail_('INPUT','기존 장식과 같은 종류를 선택해줘.');
    if (design.kind!=='card') {
      const picture=picture_(p.art);
      oldFile=row.fileId;row.fileId=storePicture_(picture,id,p.requestId);row.data.imageVersion=Utilities.getUuid();
    }
    Object.assign(row.data,design);
  }
  stamped_(row.data); row.lastKey=p.requestId;
  db.save(table,row);retirePicture_(oldFile,id);
  return deleting?{id,deleted:true}:row.data;
}
