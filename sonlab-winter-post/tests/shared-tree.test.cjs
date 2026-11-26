const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {mockGoogle}=require('./google-double.cjs');
const art='data:image/webp;base64,'+fs.readFileSync(path.join(__dirname,'../docs/assets/star.webp')).toString('base64');
function lab(){
  const server=mockGoogle();
  const actors={};
  const subs={alice:'112233445566778899001',bob:'112233445566778899002',prof:'112233445566778899003',admin:'112233445566778899004'};
  for(const [name,sub] of Object.entries(subs)){
    const email=name+'@unit.example';server.members.set(email,'member');actors[name]=server.token(sub,email,{hd:'unit.example'});
  }
  server.props.set('PROFESSOR_SUB',subs.prof);server.props.set('ADMIN_SUBS',subs.admin);
  const call=(who,op,fields={})=>server.post({op,requestId:randomUUID(),credential:actors[who],...fields});
  return {server,subs,actors,call};
}
const card={kind:'card',to:'겨울 우체국',body:'=SUM(3,4)',author:'같은 닉네임',tint:'berry',x:.48,y:.55};
function ok(r){assert.equal(r.ok,true,JSON.stringify(r));return r.data;}
function denied(r,code){assert.equal(r.ok,false);assert.equal(r.error.code,code);}
test('anonymous readers, fresh group check and signed identity',()=>{
  const {server,call,actors}=lab();
  assert.equal(ok(server.get('tree')).ornaments.length,0);denied(call('guest','createOrnament',card),'AUTH');
  for(const extra of [{exp:1},{aud:'other'},{iss:'wrong'},{email_verified:false}]){
    denied(server.post({op:'session',credential:server.token('17','alice@unit.example',extra)}),'AUTH');
  }
  const [head,payload,signature]=actors.alice.split('.');
  const altered=signature[0]==='A'?'B':'A';
  denied(server.post({op:'session',credential:[head,payload,altered+signature.slice(1)].join('.')}),'AUTH');
  ok(call('alice','session'));server.members.delete('alice@unit.example');
  denied(call('alice','createOrnament',card),'MEMBER');
  server.members.set('alice@unit.example','banned');denied(call('alice','session'),'MEMBER');
  assert(!server.locked);
});
test('ownership is by sub, guest privacy, retries, stale edits and archived replies',()=>{
  const {server,subs,call}=lab(),key=randomUUID();
  const o=ok(call('alice','createOrnament',{...card,requestId:key}));
  assert.notEqual(o.id,key);assert.equal(ok(call('alice','createOrnament',{...card,requestId:key})).id,o.id);
  assert.equal(ok(server.get('tree')).ornaments.length,1);
  assert.deepEqual(ok(call('bob','session')).ornaments,[]);
  assert.deepEqual(ok(call('alice','session')).ornaments,[o.id]);
  const pub=JSON.stringify(ok(server.get('tree')));assert(!pub.includes(subs.alice)&&!pub.includes('owner')&&!pub.includes('requestId'));
  assert(!server.sheets.get('Ornaments').values[1].some(c=>String(c).startsWith('=')));
  const r=ok(call('bob','createReply',{parent:o.id,author:card.author,body:'첫 답장'}));
  denied(call('bob','moveOrnament',{id:o.id,revision:o.revision,x:.5,y:.3}),'FORBIDDEN');
  denied(call('bob','deleteOrnament',{id:o.id,revision:o.revision}),'FORBIDDEN');
  const moved=ok(call('alice','moveOrnament',{id:o.id,revision:o.revision,x:.5,y:.39}));
  denied(call('alice','editOrnament',{...card,id:o.id,revision:o.revision}),'STALE');
  const edited=ok(call('alice','editOrnament',{...card,id:o.id,revision:moved.revision,body:'새 편지'}));
  assert.equal(edited.x,.5);assert.equal(edited.body,'새 편지');
  ok(call('admin','deleteOrnament',{id:o.id,revision:edited.revision}));
  denied(call('bob','createReply',{parent:o.id,author:'눈',body:'늦은 답장'}),'GONE');
  assert.equal(ok(server.get('tree')).replies.length,1);
  denied(call('alice','deleteReply',{id:r.id,revision:r.revision}),'FORBIDDEN');
  const editedReply=ok(call('bob','editReply',{id:r.id,body:'답장 수정',revision:r.revision}));
  ok(call('bob','deleteReply',{id:r.id,revision:editedReply.revision}));
  assert.equal(ok(server.get('tree')).replies.length,0);
});
test('photos and molecular strings use only active ornament IDs; Drive cleanup survives failure',()=>{
  const {server,call}=lab();
  const photo={kind:'photo',title:'리본',author:'별',x:.5,y:.5,sourceKey:null,photoStyle:'cut',art};
  denied(call('alice','createOrnament',{...photo,art:'data:image/png;base64,'+Buffer.from('<html>').toString('base64')}),'INPUT');
  const o=ok(call('alice','createOrnament',photo));
  const f=Array.from(server.files.values()).find(f=>f.getName().startsWith('ornament_'));
  assert(!JSON.stringify(ok(server.get('tree'))).includes(f.id));
  assert.equal(ok(server.get('images',{ids:o.id}))[0].art,art);
  const next=ok(call('alice','editOrnament',{...photo,id:o.id,revision:o.revision,title:'눈송이'}));
  assert(f.trashed);
  ok(call('alice','deleteOrnament',{id:o.id,revision:next.revision}));
  assert.deepEqual(ok(server.get('images',{ids:o.id})),[]);
  const chain={kind:'mol',title:'고분자',author:'연구원',x:.5,y:.3,mode:'chain',atomCount:3,repeats:5,art};
  const good=ok(call('alice','createOrnament',chain));
  assert.equal(good.repeats,5);
  server.failNextWrite();denied(call('alice','createOrnament',chain),'SERVER');
  for(const file of server.files.values())file.created-=7200000;
  server.ctx.cleanUnusedImages();assert.equal([...server.files.values()].filter(f=>f.getName().startsWith('ornament_')&&!f.trashed).length,1);
  assert.equal(ok(server.get('images',{ids:good.id})).length,1);
  server.ctx.setupTree();assert.equal(server.triggers.length,1);
});
test('professor role independent of administrator and display name',()=>{
  const {server,call}=lab();
  denied(call('admin','setStar',{revision:null,body:'편지'}),'FORBIDDEN');
  denied(call('alice','setStar',{revision:null,body:'편지',author:'손창윤 교수님'}),'FORBIDDEN');
  const n=ok(call('prof','setStar',{revision:null,body:'따뜻한 겨울 보내요.'}));
  assert.equal(ok(server.get('tree')).star.author,'손창윤 교수님');
  denied(call('prof','setStar',{revision:null,body:'오래된 편지'}),'STALE');
  ok(call('prof','setStar',{revision:n.revision,body:''}));
  assert.equal(ok(server.get('tree')).star.body,'');
});
test('third-party mailbox check keeps the direct group requirement',()=>{
  const {server}=lab(),email='member@outside.example',jwt=server.token('900000000000000000011',email);
  const send=(op,other={})=>server.post({op,credential:jwt,...other});
  server.members.set(email,'member');denied(send('session'),'MAIL_REQUIRED');
  ok(send('sendCode'));assert.equal(server.mail[0].to,email);
  denied(send('verifyCode',{code:'invalid'}),'MAIL_CODE');
  const code=server.mail[0].body.match(/[0-9A-F]{8}/)[0];ok(send('verifyCode',{code}));ok(send('session'));
  server.members.delete(email);denied(send('session'),'MEMBER');
});
test('preserves z-axis projection and open polymer terminal connections',()=>{
  const ctx=vm.createContext({}),src=fs.readFileSync(path.join(__dirname,'../docs/js/model.js'),'utf8');vm.runInContext(src,ctx);
  const unit=ctx.parseXYZ('C 0 0 0\nO .9 1 0\nC 2 0 .5'),poly=ctx.buildPolymer(unit,5);
  assert.equal(poly.atoms.length,15);
  const joins=poly.links.filter(([a,b])=>Math.floor(a/3)!==Math.floor(b/3));
  assert.deepEqual(JSON.parse(JSON.stringify(joins)),[[2,3],[5,6],[8,9],[11,12]]);
  assert(vm.runInContext('bulbPalette.C[1] !== bulbPalette.N[1]',ctx));
});
