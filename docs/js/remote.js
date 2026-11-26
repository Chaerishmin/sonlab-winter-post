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
// This reads the account selection for the UI. The server verifies the signed token and authorizes every write.
function selectedGoogleEmail(token) {
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(payload), c => c.charCodeAt(0));
    const {email} = JSON.parse(new TextDecoder().decode(bytes));
    if (typeof email === "string") return email.toLowerCase();
  } catch (_) { /* Report malformed credentials like missing email claims. */ }
  throw new TreeActionError("Google 계정을 확인하지 못했어. 다시 로그인해줘.", "AUTH");
}

function loginDialog() {
  const dialog = document.getElementById("signin-dialog");
  const buttons = document.getElementById("google-button");
  const status = document.getElementById("login-status");
  const mail = document.getElementById("mail-check");
  const code = document.getElementById("mail-code");
  const send = document.getElementById("send-code");
  buttons.innerHTML = `
    <form class="form-grid" autocomplete="off">
      <label class="field">
        <span>Google 로그인 이메일</span>
        <input type="email" required autocomplete="off" autocapitalize="none" spellcheck="false"
          style="width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:6px;background:var(--surface);color:var(--ink);font:inherit">
      </label>
      <button type="submit" class="primary-btn">다음</button>
    </form>
    <div class="form-grid" hidden>
      <div class="provider-button"></div>
      <button type="button" class="quiet-btn">이메일 다시 입력</button>
    </div>`;
  const entry = buttons.querySelector("form");
  const email = entry.querySelector("input");
  const provider = entry.nextElementSibling;
  const providerButton = provider.querySelector(".provider-button");
  const edit = provider.querySelector("button");
  mail.hidden = true;
  code.value = "";
  status.textContent = "";
  status.hidden = true;
  dialog.showModal();
  return new Promise((resolve, reject) => {
    let token = "";
    let expectedEmail = "";
    let busy = false;
    let finished = false;

    function message(text) {
      status.textContent = text;
      status.hidden = !text;
    }
    function end(error, me) {
      if (finished) return;
      finished = true;
      credentialHandler = null;
      expectedEmail = token = email.value = code.value = "";
      buttons.replaceChildren();
      dialog.close();
      if (error) reject(error);
      else {
        showName();
        resolve(me);
      }
    }
    const cancel = () => end(new TreeActionError("로그인을 취소했어.", "CANCEL"));
    document.getElementById("cancel-signin").onclick = cancel;
    dialog.oncancel = event => { event.preventDefault(); cancel(); };

    async function attempt(task) {
      if (busy || finished) return;
      busy = true;
      edit.disabled = true;
      try {
        await task();
      } catch (error) {
        if (!finished) message(error.message);
      } finally {
        busy = false;
        edit.disabled = false;
      }
    }

    async function verify(op, extra = {}) {
      const candidate = token;
      try {
        const me = await store.call(op, extra, {post:true, credential:candidate});
        if (finished || token !== candidate) return;
        store.acceptSession(candidate, me);
        end(null, me);
      } catch (error) {
        if (finished) return;
        if (error.code === "MAIL_REQUIRED" || error.code === "MAIL_CODE") mail.hidden = false;
        throw error;
      }
    }

    entry.onsubmit = async event => {
      event.preventDefault();
      if (entry.hidden || !entry.reportValidity()) return;
      expectedEmail = email.value.trim().toLowerCase();
      email.value = "";
      entry.hidden = true;
      provider.hidden = false;
      message("입력한 이메일과 같은 Google 계정으로 로그인해줘.");
      const mount = document.createElement("div");
      providerButton.replaceChildren(mount);
      try {
        const api = await googleButtons();
        if (finished || !mount.isConnected) return;
        api.renderButton(mount, {type:"standard", theme:"outline", size:"medium", text:"signin_with", locale:"ko"});
      } catch (error) {
        if (!finished && mount.isConnected) message(error.message);
      }
    };

    edit.onclick = () => {
      providerButton.replaceChildren();
      expectedEmail = token = code.value = "";
      mail.hidden = provider.hidden = true;
      entry.hidden = false;
      message("");
      email.focus();
    };

    credentialHandler = jwt => attempt(async () => {
      if (!expectedEmail || provider.hidden) return;
      token = code.value = "";
      mail.hidden = true;
      if (selectedGoogleEmail(jwt) !== expectedEmail) {
        message("입력한 이메일과 선택한 Google 계정이 달라. 같은 계정을 선택하거나 이메일을 다시 입력해줘.");
        return;
      }
      token = jwt;
      message("작성 권한 확인 중…");
      await verify("session");
    });
    send.onclick = () => attempt(async () => {
      await store.call("sendCode", {}, {post:true, credential:token});
      if (finished) return;
      message("메일로 보낸 확인 코드를 입력해줘.");
      code.focus();
    });
    mail.onsubmit = event => {
      event.preventDefault();
      attempt(() => verify("verifyCode", {code:code.value}));
    };
  });
}
