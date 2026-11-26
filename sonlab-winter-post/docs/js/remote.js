"use strict";
const PROFESSOR_NAME = "손창윤 교수님";
const TAG_PREFERENCE = "sonlab.winterpost.show-reply-tags";
const uid = () => crypto.randomUUID();
class TreeActionError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}
function preference(key, value) {
  try { if (value===undefined) return localStorage.getItem(key); localStorage.setItem(key,value); }
  catch (_) { /* Viewing and posting remain available when browser preferences are disabled. */ }
  return null;
}
class TreeClient {
  constructor(config) {
    this.url = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(config.apiUrl) ? config.apiUrl : "";
    this.clientId = config.googleClientId || "";
    this.me = null;
    this.token = "";
    this.media = new Map();
  }
  async call(op, values={}, {post=false, credential=""}={}) {
    if (!this.url) throw new TreeActionError("공동 트리 주소가 설정되면 참여할 수 있어.", "CONFIG");
    const url=new URL(this.url), options={method:post?"POST":"GET",mode:"cors",credentials:"omit",redirect:"follow",referrerPolicy:"no-referrer"};
    if (post) {
      options.headers={"Content-Type":"text/plain;charset=UTF-8"};
      options.body=JSON.stringify({...values,op,...(credential?{credential}:{})});
    } else {
      url.searchParams.set("op",op);
      for (const [key,value] of Object.entries(values)) url.searchParams.set(key,value);
      options.cache="no-store";
    }
    const controller=new AbortController(), timeout=setTimeout(()=>controller.abort(),45000);
    try {
      const response=await fetch(url,{...options,signal:controller.signal});
      if (!response.ok) throw Error("HTTP "+response.status);
      const result=await response.json();
      if (result.ok===false && result.error) throw new TreeActionError(result.error.message,result.error.code);
      if (result.ok!==true) throw Error("Missing response");
      return result.data;
    } catch (e) {
      if (e instanceof TreeActionError) throw e;
      throw new TreeActionError("서버 응답을 확인하지 못했어. 연결을 확인하고 같은 작업을 다시 시도해줘.","NETWORK");
    } finally {clearTimeout(timeout);}
  }
  active() {return this.me && Date.now()<this.me.expires*1000-10000;}
  clear() {this.token="";this.me=null;}
  owns(group,id) {return Boolean(this.active() && this.me[group]?.includes(id));}
  acceptSession(token,me) {
    this.me=me;this.token=token;
    return me;
  }
  async mutate(op,values,requestId,expectedAccount) {
    await ensureMember();
    if (expectedAccount && this.me.accountId!==expectedAccount) throw new TreeActionError("작성하던 계정과 달라. 원래 계정으로 다시 열어줘.","ACCOUNT");
    try {
      return await this.call(op,{...values,requestId},{post:true,credential:this.token});
    } catch(e) {
      if (["AUTH","MEMBER","MAIL_REQUIRED"].includes(e.code)) {this.clear();showName();}
      throw e;
    }
  }
  prepare(record) {
    if (record.kind==="card") return {...record,art:envelopeArt(record.tint)};
    return {...record,art:this.media.get(record.imageVersion)||""};
  }
  async loadPictures(records,draw) {
    const pending=records.filter(o=>o.imageVersion && !this.media.has(o.imageVersion));
    let cursor=0;
    const worker=async()=>{
      while(cursor<pending.length) {
        const batch=pending.slice(cursor,cursor+4);cursor+=batch.length;
        const found=await this.call("images",{ids:batch.map(r=>r.id).join(",")});
        for(const item of found) if (/^data:image\/(png|webp);base64,/.test(item.art)) this.media.set(item.version,item.art);
        draw();
      }
    };
    await Promise.all([worker(),worker()]);
  }
}
let gisLoading=null, credentialHandler=null;
function googleButtons() {
  if (gisLoading) return gisLoading;
  gisLoading=new Promise((resolve,reject)=>{
    const script=document.createElement("script");script.src="https://accounts.google.com/gsi/client";script.async=true;
    let finished=false;
    const fail=()=>{
      if(finished)return;finished=true;clearTimeout(timeout);script.remove();gisLoading=null;
      reject(new TreeActionError("Google 로그인 버튼을 불러오지 못했어. 다시 열어줘.","GIS"));
    };
    const timeout=setTimeout(fail,18000);
    script.onerror=fail;
    script.onload=()=>{
      if(finished)return;
      try {
        const api=window.google.accounts.id;
        api.initialize({client_id:store.clientId,auto_select:false,callback:result=>credentialHandler?.(result.credential)});
        finished=true;clearTimeout(timeout);resolve(api);
      } catch(_){fail();}
    };
    document.head.append(script);
  });
  return gisLoading;
}
let loginPending=null;
async function ensureMember() {
  if (store.active()) return store.me;
  if (!store.url || !store.clientId) throw new TreeActionError("운영자가 Google 연결을 마치면 글을 쓸 수 있어.","CONFIG");
  if (!loginPending) loginPending=loginDialog().finally(()=>{loginPending=null;});
  return loginPending;
}
function loginDialog() {
  const dialog=document.getElementById("signin-dialog"), buttons=document.getElementById("google-button"), status=document.getElementById("login-status");
  const mail=document.getElementById("mail-check"), code=document.getElementById("mail-code"), send=document.getElementById("send-code");
  buttons.replaceChildren();mail.hidden=true;code.value="";status.textContent="연구실 그룹 계정으로 로그인해줘.";
  dialog.showModal();
  return new Promise((resolve,reject)=>{
    let token="",busy=false,finished=false;
    function end(error,me){
      if(finished)return;finished=true;credentialHandler=null;token="";dialog.close();
      if(error)reject(error);else {showName();resolve(me);}
    }
    const cancel=()=>end(new TreeActionError("로그인을 취소했어.","CANCEL"));
    document.getElementById("cancel-signin").onclick=cancel;
    dialog.oncancel=e=>{e.preventDefault();cancel();};
    async function attempt(task) {
      if (busy || finished) return;
      busy=true;
      try{await task();}catch(e){if(!finished)status.textContent=e.message;}
      finally{busy=false;}
    }
    async function verify(op,extra={}) {
      const candidate=token;
      try {
        const me=await store.call(op,extra,{post:true,credential:candidate});
        if(finished || token!==candidate)return;
        store.acceptSession(candidate,me);end(null,me);
      } catch(e) {
        if (finished) return;
        mail.hidden=e.code!=="MAIL_REQUIRED" && e.code!=="MAIL_CODE" && mail.hidden;
        throw e;
      }
    }
    credentialHandler=jwt=>attempt(async()=>{
      token=jwt;mail.hidden=true;status.textContent="구성원 확인 중…";
      await verify("session");
    });
    send.onclick=()=>attempt(async()=>{
      await store.call("sendCode",{},{post:true,credential:token});status.textContent="메일로 보낸 확인 코드를 입력해줘.";code.focus();
    });
    mail.onsubmit=e=>{e.preventDefault();attempt(()=>verify("verifyCode",{code:code.value}));};
    googleButtons().then(api=>{
      if(!finished)api.renderButton(buttons,{type:"standard",theme:"outline",size:"large",text:"signin_with",locale:"ko"});
    }).catch(e=>{if(!finished)status.textContent=e.message;});
  });
}
