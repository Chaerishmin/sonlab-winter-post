const TREE_TABLES = ['Ornaments','Replies','Settings'];
const TREE_COLUMNS = ['id','owner_key','create_request','last_request','status','image_file_id','record_json'];
const IMAGE_LIMIT = 2 * 1024 * 1024;
const FILE_PATTERN = /^ornament_[0-9a-f-]{36}_[0-9a-f-]{36}\.(webp|png)$/;
function withLock_(work) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(12000)) fail_('BUSY','다른 장식을 거는 중이야. 잠시 뒤 같은 작업을 다시 시도해줘.');
  try { return work(); } finally { lock.releaseLock(); }
}
function property_(name) {
  const v = PropertiesService.getScriptProperties().getProperty(name);
  if (!v) fail_('CONFIG','운영자가 공동 저장소 설정을 완료해야 해.');
  return v;
}
// Run once as the deployment owner. Re-running reuses every previously created resource.
function setupTree() {
  withLock_(() => {
    property_('GOOGLE_CLIENT_ID'); property_('GROUP_EMAIL');
    const p = PropertiesService.getScriptProperties();
    if (!p.getProperty('ROOT_FOLDER_ID')) p.setProperty('ROOT_FOLDER_ID',DriveApp.createFolder('Son Lab 겨울 우체국').getId());
    const root = DriveApp.getFolderById(p.getProperty('ROOT_FOLDER_ID'));
    if (!p.getProperty('IMAGE_FOLDER_ID')) p.setProperty('IMAGE_FOLDER_ID',root.createFolder('ornaments').getId());
    if (!p.getProperty('SPREADSHEET_ID')) {
      const newBook = SpreadsheetApp.create('Son Lab 겨울 우체국 데이터');
      p.setProperty('SPREADSHEET_ID',newBook.getId());
    }
    const book = SpreadsheetApp.openById(p.getProperty('SPREADSHEET_ID'));
    DriveApp.getFileById(book.getId()).moveTo(root);
    for (const name of TREE_TABLES) {
      let sheet = book.getSheetByName(name);
      if (!sheet) sheet = book.insertSheet(name);
      if (sheet.getLastRow() === 0) {
        sheet.getRange(1,1,1,TREE_COLUMNS.length).setValues([TREE_COLUMNS]);
        sheet.setFrozenRows(1);
      } else if (sheet.getRange(1,1,1,TREE_COLUMNS.length).getValues()[0].join('|') !== TREE_COLUMNS.join('|')) {
        throw Error(name+' 시트의 열 이름을 확인해줘. 기존 데이터는 보존했어.');
      }
    }
    SpreadsheetApp.flush();
    if (!ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'cleanUnusedImages')) {
      ScriptApp.newTrigger('cleanUnusedImages').timeBased().everyDays(1).create();
    }
  });
}
function storage_() {
  const book = SpreadsheetApp.openById(property_('SPREADSHEET_ID'));
  const memo = {};
  return {
    rows(name) {
      if (!memo[name]) {
        const sheet = book.getSheetByName(name);
        if (!sheet) fail_('CONFIG','운영자가 setupTree를 실행해야 해.');
        const count = sheet.getLastRow() - 1;
        memo[name] = (count > 0 ? sheet.getRange(2,1,count,TREE_COLUMNS.length).getValues() : [])
          .map(([id,owner,createKey,lastKey,status,fileId,json],i) =>
            ({index:i+2,id,owner,createKey,lastKey,status,fileId,data:JSON.parse(json)}));
      }
      return memo[name];
    },
    save(name,r) {
      const sheet = book.getSheetByName(name), index = r.index || sheet.getLastRow()+1;
      // The JSON cell starts with "{". User-entered strings never occupy formula cells.
      sheet.getRange(index,1,1,TREE_COLUMNS.length).setValues([[
        r.id,r.owner,r.createKey,r.lastKey,r.status,r.fileId || '',JSON.stringify(r.data)
      ]]);
      SpreadsheetApp.flush();
    }
  };
}
function limit_(key,max,windowMs) {
  const p = PropertiesService.getScriptProperties(), name = 'rate:'+digestHex_(key);
  const now = Date.now(), old = JSON.parse(p.getProperty(name) || 'null');
  const bucket = old && now - old.start < windowMs ? old : {start:now,count:0};
  if (bucket.count >= max) fail_('RATE','요청이 많아. 잠시 뒤 다시 시도해줘.');
  bucket.count++; p.setProperty(name,JSON.stringify(bucket));
}
function picture_(data) {
  const invalid = () => fail_('INPUT','장식 이미지는 2 MiB 이하의 PNG 또는 WebP여야 해.');
  if (typeof data !== 'string' || data.length > 4*Math.ceil(IMAGE_LIMIT/3)+30) invalid();
  const comma = data.indexOf(','), header = data.slice(0,comma), encoded=data.slice(comma+1);
  const type = header==='data:image/webp;base64'?'webp':header==='data:image/png;base64'?'png':'';
  if (!type || !encoded || encoded.length%4 || /[^a-zA-Z0-9+/=]/.test(encoded) || (encoded.includes('=') && !/^={1,2}$/.test(encoded.slice(encoded.indexOf('='))))) invalid();
  let bytes;
  try { bytes=Utilities.base64Decode(encoded); } catch (_) { invalid(); }
  if (bytes.length<32 || bytes.length>IMAGE_LIMIT) invalid();
  const b=i=>bytes[i]&255, str=(i,n)=>String.fromCharCode(...bytes.slice(i,i+n).map(v=>v&255));
  const be32=i=>b(i)*16777216+b(i+1)*65536+b(i+2)*256+b(i+3);
  const le24=i=>b(i)+256*b(i+1)+65536*b(i+2);
  const le32=i=>le24(i)+b(i+3)*16777216;
  let width,height;
  if (type==='png') {
    if (unsignedHex_(bytes.slice(0,8))!=='89504e470d0a1a0a' || be32(8)!==13 || str(12,4)!=='IHDR' ||
        unsignedHex_(bytes.slice(-12))!=='0000000049454e44ae426082') invalid();
    width=be32(16); height=be32(20);
  } else {
    if (str(0,4)!=='RIFF' || str(8,4)!=='WEBP' || le32(4)+8!==bytes.length) invalid();
    const chunk=str(12,4);
    if (chunk==='VP8X' && le32(16)===10 && !(b(20)&2)) {width=le24(24)+1;height=le24(27)+1;}
    else if (chunk==='VP8L' && b(20)===47) {width=1+b(21)+((b(22)&63)<<8);height=1+(b(22)>>6)+(b(23)<<2)+((b(24)&15)<<10);}
    else if (chunk==='VP8 ' && b(23)===157 && b(24)===1 && b(25)===42) {width=(b(26)+256*b(27))&16383;height=(b(28)+256*b(29))&16383;}
    else invalid();
  }
  if (!width || !height || width>4096 || height>4096 || width*height>4194304) invalid();
  return {bytes,type};
}
function storePicture_(picture,id,request) {
  const name='ornament_'+id+'_'+request+'.'+picture.type;
  const blob=Utilities.newBlob(picture.bytes,'image/'+picture.type,name);
  return DriveApp.getFolderById(property_('IMAGE_FOLDER_ID')).createFile(blob).getId();
}
function treeFile_(id,ornamentId) {
  const file=DriveApp.getFileById(id), parents=file.getParents(), folderId=property_('IMAGE_FOLDER_ID');
  if (!file.isTrashed() && FILE_PATTERN.test(file.getName()) && file.getName().startsWith('ornament_'+ornamentId+'_')) {
    while (parents.hasNext()) if (parents.next().getId()===folderId) return file;
  }
  fail_('IMAGE','장식 이미지를 읽을 수 없어.');
}
function retirePicture_(id,ornamentId) {
  if (!id) return;
  try { treeFile_(id,ornamentId).setTrashed(true); } catch (_) { /* The daily sweep retries any unreferenced file. */ }
}
function cleanUnusedImages() {
  withLock_(() => {
    const db=storage_(), live=new Set(db.rows('Ornaments').filter(r=>r.status==='active' && r.fileId).map(r=>r.fileId));
    const files=DriveApp.getFolderById(property_('IMAGE_FOLDER_ID')).getFiles();
    while(files.hasNext()) {
      const file=files.next();
      if (FILE_PATTERN.test(file.getName()) && !live.has(file.getId()) && Date.now()-file.getDateCreated().getTime()>3600000) file.setTrashed(true);
    }
  });
}
