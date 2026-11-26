// Two independent browser clients talk to the actual .gs handlers via an in-memory HTTP transport.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const {mockGoogle}=require('./google-double.cjs');
const remote=fs.readFileSync(path.join(__dirname,'../docs/js/remote.js'),'utf8');
function browser(server){
  const ctx=vm.createContext({URL,AbortController,setTimeout,clearTimeout,crypto:crypto.webcrypto,
    envelopeArt:t=>'envelope:'+t,fetch:async(url,opts)=>{
      assert.equal(opts.credentials,'omit');assert.equal(opts.redirect,'follow');assert(!url.search.includes('credential'));
      let result;
      if(opts.method==='POST'){
        assert.deepEqual(Object.keys(opts.headers),['Content-Type']);assert(opts.headers['Content-Type'].startsWith('text/plain'));
        result=server.post(JSON.parse(opts.body));
      }else result=server.get(url.searchParams.get('op'),Object.fromEntries(url.searchParams));
      return {ok:true,json:async()=>result};
    }});
  vm.runInContext(remote,ctx);
  return vm.runInContext('const store=new TreeClient({apiUrl:"https://script.google.com/macros/s/test/exec",googleClientId:"test.apps.googleusercontent.com"});store',ctx);
}
test('independent readers see confirmed records and private images, editing requires a session',async()=>{
  const server=mockGoogle(), a=browser(server), b=browser(server);
  const email='writer@gmail.com', sub='100000000000000000009';
  const token=server.token(sub,email);server.members.set(email,'member');
  a.acceptSession(token,await a.call('session',{},{post:true,credential:token}));
  const art='data:image/webp;base64,'+fs.readFileSync(path.join(__dirname,'../docs/assets/mitten.webp')).toString('base64');
  const rec=await a.mutate('createOrnament',{kind:'photo',title:'장갑',author:'소나무',photoStyle:'ball',sourceKey:'mitten',art,x:.48,y:.5},crypto.randomUUID(),sub);
  const records=await b.call('tree');assert.equal(records.ornaments.length,1);assert.equal(records.ornaments[0].id,rec.id);assert(!('art' in records.ornaments[0]));
  assert.equal(b.prepare(records.ornaments[0]).art,'');
  await b.loadPictures(records.ornaments,()=>{});assert.equal(b.prepare(records.ornaments[0]).art,art);
  assert.deepEqual(b.me,null);
  const moved=await a.mutate('moveOrnament',{id:rec.id,x:.52,y:.55,revision:rec.revision},crypto.randomUUID(),sub);
  assert.equal(b.prepare((await b.call('tree')).ornaments[0]).art,art);
  await a.mutate('deleteOrnament',{id:rec.id,revision:moved.revision},crypto.randomUUID(),sub);
  assert.equal((await b.call('tree')).ornaments.length,0);
  assert.equal((await b.call('images',{ids:rec.id})).length,0);
});
test('Pages configuration only contains public fields and resolves its artwork under a project subpath',()=>{
  const docs=path.join(__dirname,'../docs'),page=fs.readFileSync(path.join(docs,'index.html'),'utf8');
  const config=vm.createContext({window:{}});vm.runInContext(fs.readFileSync(path.join(docs,'config.js'),'utf8'),config);
  assert.deepEqual(Object.keys(config.window.TREE_CONFIG).sort(),['apiUrl','googleClientId']);
  const {apiUrl,googleClientId}=config.window.TREE_CONFIG;
  assert(!apiUrl||/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(apiUrl));
  assert(!googleClientId||googleClientId.endsWith('.apps.googleusercontent.com'));
  for(const [,src] of page.matchAll(/(?:src|href)="(\.\/[^"]+)"/g))assert(fs.existsSync(path.join(docs,src)),src);
  const assets=JSON.parse(page.match(/id="asset-manifest" type="application\/json">([^<]+)/)[1]);
  for(const src of Object.values(assets))assert(fs.existsSync(path.join(docs,src)));
});
test('landscape waits for the external fir to load before caching a rendered size',async()=>{
  const queued=[],events={},styles={};
  const img={naturalWidth:1380,naturalHeight:920,complete:false,decode:()=>Promise.resolve(),addEventListener:(key,fn)=>{events[key]=fn;}};
  let painted=0, drawn=0;
  const ctx2d=new Proxy({}, {get:(_,key)=>{
    if(key==='createLinearGradient')return ()=>({addColorStop(){}});
    if(key==='drawImage')return ()=>{drawn++;};
    return ()=>{};
  }});
  const canvas=()=>({getContext:()=>ctx2d});
  const stage={clientWidth:1000,clientHeight:680,getBoundingClientRect:()=>({left:0,top:0}),classList:{add(){painted++;}}};
  const els={scenery:img,landscape:canvas(),viewport:stage,'winter-scene':stage,bench:{getBoundingClientRect:()=>({left:730,top:25})},
    world:{style:{...styles,setProperty(){}}}};
  const ctx=vm.createContext({window:{devicePixelRatio:1,addEventListener(){}},
    document:{getElementById:id=>els[id],documentElement:{clientWidth:1000}},getComputedStyle:()=>({getPropertyValue:()=>''}),
    requestAnimationFrame:fn=>queued.push(fn),surface:canvas});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../docs/js/scene.js'),'utf8'),ctx);
  ctx.mountLandscape();queued.shift()();assert.equal(painted,0);
  img.complete=true;events.load();await Promise.resolve();queued.shift()();
  assert.equal(painted,1);assert(drawn>0);
});
test('carbon receives a violet rim and wider light halo in the shared atom renderer',()=>{
  const gradients=[],shapes=[];
  const canvas={createRadialGradient(...args){const stops=[];gradients.push({args,stops});return {addColorStop:(at,c)=>stops.push([at,c])};}};
  const ctx=vm.createContext({ellipse:(...a)=>shapes.push(a)});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../docs/js/model.js'),'utf8'),ctx);
  ctx.glowAtom(canvas,0,0,10,'C');
  const carbonRadius=gradients[0].args[5],carbonColors=gradients[1].stops;
  ctx.glowAtom(canvas,0,0,10,'N');
  assert(carbonRadius>gradients[2].args[5]);
  const medium=carbonColors[1][1];
  const [r,g,b]=[1,3,5].map(i=>parseInt(medium.slice(i,i+2),16));assert(b>r&&r>g&&g>185);
  assert.equal(shapes[1][6],'#f1dfff');
});
