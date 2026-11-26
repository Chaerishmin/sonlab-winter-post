// Offline stand-ins for the Apps Script services. No credentials or network access are used.
const fs=require('node:fs'), path=require('node:path'), vm=require('node:vm'), crypto=require('node:crypto');
const SIGNED = b => Array.from(b, n => n>127?n-256:n);
function mockGoogle() {
  const files=new Map(), sheets=new Map(), props=new Map(), cached=new Map(), members=new Map(), mail=[], triggers=[];
  let locked=false,root,folder,book,failSave=false;
  const issuer=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
  const jwk={...issuer.publicKey.export({format:'jwk'}),kid:'local-test-key',alg:'RS256',use:'sig'};
  function iterator(list) {let i=0;return {hasNext:()=>i<list.length,next:()=>list[i++]};}
  function blob(bytes,mime,name) {
    const b=Buffer.from(bytes);
    return {name,getContentType:()=>mime,getBytes:()=>SIGNED(b),getDataAsString:()=>b.toString('utf8')};
  }
  function makeFile(data,parent){
    const id='f-'+crypto.randomUUID();
    const f={id,parent,trashed:false,created:Date.now(),getId:()=>id,getBlob:()=>data,
      getDateCreated(){return new Date(this.created);},getName:()=>data.name,
      getParents(){return iterator([this.parent]);},isTrashed(){return this.trashed;},setTrashed(v){this.trashed=v;},moveTo(p){this.parent=p;}};
    files.set(id,f);return f;
  }
  function makeFolder(){
    const id='folder-'+crypto.randomUUID();
    return {getId:()=>id,createFolder(){folder=makeFolder();return folder;},
      createFile(b){return makeFile(b,this);},getFiles(){return iterator([...files.values()].filter(f=>f.parent===this&&!f.trashed));}};
  }
  function makeSheet(name){
    const values=[];
    const sheet={values,setFrozenRows(){},getLastRow:()=>values.length,getRange(row,col,h,w){
      return {getValues:()=>values.slice(row-1,row-1+h).map(r=>r.slice(col-1,col-1+w)),
        setValues(rows){
          if(failSave){failSave=false;throw Error('Simulated interrupted write');}
          rows.forEach((r,i)=>{values[row+i-1]=Array.from(r);});
        }};
    }};
    sheets.set(name,sheet);return sheet;
  }
  const mkdir=()=>{root=makeFolder();return root;};
  const propertyStore={getProperty:k=>props.get(k)??null,setProperty:(k,v)=>props.set(k,String(v))};
  const cache={get(k){const v=cached.get(k);return v&&v.until>Date.now()?v.val:null;},put(k,val,sec){cached.set(k,{val,until:Date.now()+1000*sec});},remove:k=>cached.delete(k)};
  const api={
    Utilities:{getUuid:crypto.randomUUID,DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'UTF-8'},
      computeDigest:(alg,s)=>SIGNED(crypto.createHash(alg).update(s).digest()),base64Decode:s=>SIGNED(Buffer.from(s,'base64')),
      base64DecodeWebSafe:s=>SIGNED(Buffer.from(s,'base64url')),base64Encode:a=>Buffer.from(a).toString('base64'),newBlob:blob},
    GroupsApp:{Role:{MEMBER:'member',MANAGER:'manager',OWNER:'owner'},getGroupByEmail:()=>({hasUser:e=>members.has(e),getRole:e=>members.get(e)})},
    PropertiesService:{getScriptProperties:()=>propertyStore},CacheService:{getScriptCache:()=>cache},
    LockService:{getScriptLock:()=>({tryLock(){if(locked)return false;locked=true;return true;},releaseLock(){locked=false;}})},
    MailApp:{sendEmail:(to,subject,body)=>mail.push({to,subject,body})},
    UrlFetchApp:{fetch(url){if(url!=='https://www.googleapis.com/oauth2/v3/certs')throw Error('Unexpected URL');
      return {getResponseCode:()=>200,getAllHeaders:()=>({'Cache-Control':'public, max-age=3600'}),getContentText:()=>JSON.stringify({keys:[jwk]})};}},
    ContentService:{MimeType:{JSON:'application/json'},createTextOutput:text=>({setMimeType(){return this;},getContent:()=>text})},
    SpreadsheetApp:{create(){const binder=makeFile(blob([],'sheet','database'),root);
      book={getId:()=>binder.id,getSheetByName:n=>sheets.get(n),insertSheet:makeSheet};return book;},openById:()=>book,flush(){}},
    DriveApp:{createFolder:mkdir,getFolderById:id=>[root,folder].find(x=>x&&x.getId()===id),getFileById:id=>files.get(id)},
    ScriptApp:{getProjectTriggers:()=>triggers,newTrigger:name=>({timeBased(){return this;},everyDays(){return this;},create(){triggers.push({getHandlerFunction:()=>name});}})}
  };
  const ctx=vm.createContext(api);
  for(const name of ['Storage','Auth','Api'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../apps-script',name+'.gs'),'utf8'),ctx);
  props.set('GOOGLE_CLIENT_ID','test.apps.googleusercontent.com');props.set('GROUP_EMAIL','lab@example.test');
  ctx.setupTree();
  function token(sub,email,extra={}) {
    const now=Math.floor(Date.now()/1000);
    const parts=[{alg:'RS256',kid:jwk.kid},{iss:'https://accounts.google.com',aud:props.get('GOOGLE_CLIENT_ID'),sub,email,email_verified:true,iat:now,exp:now+3600,...extra}]
      .map(o=>Buffer.from(JSON.stringify(o)).toString('base64url')).join('.');
    return parts+'.'+crypto.sign('RSA-SHA256',Buffer.from(parts),issuer.privateKey).toString('base64url');
  }
  return {get:(op,args={})=>JSON.parse(ctx.doGet({parameter:{op,...args}}).getContent()),
    post:(body)=>JSON.parse(ctx.doPost({postData:{contents:JSON.stringify(body)}}).getContent()),ctx,props,files,sheets,members,mail,token,triggers,
    failNextWrite(){failSave=true;},get locked(){return locked;}};
}
module.exports={mockGoogle};
