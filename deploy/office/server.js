// Minimal standalone WOPI host + UI for Collabora CODE. Files on disk.
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const DIR='/data/files',SECRET=process.env.WOPI_SECRET,PUB=process.env.PUBLIC_URL,COOL='http://collabora:9980';
fs.mkdirSync(DIR,{recursive:true});
const safe=n=>{n=path.basename(String(n||''));if(!/^[\w .()\-]+\.(docx|odt|xlsx|ods|pptx|odp|txt)$/i.test(n))throw 0;return n};
const sign=n=>{const exp=Date.now()+12*3600e3;const p=Buffer.from(n).toString('base64url')+'.'+exp;return p+'.'+crypto.createHmac('sha256',SECRET).update(p).digest('base64url')};
const verify=(t,n)=>{try{const[a,e,s]=t.split('.');const ok=crypto.timingSafeEqual(Buffer.from(s),Buffer.from(crypto.createHmac('sha256',SECRET).update(a+'.'+e).digest('base64url')));return ok&&+e>Date.now()&&Buffer.from(a,'base64url').toString()===n}catch{return false}};
let urlsrc=null;
const ZF='/data/zotero.json';const zkey=()=>{try{return JSON.parse(fs.readFileSync(ZF)).key||''}catch{return ''}};
async function discovery(){if(urlsrc)return urlsrc;const x=await (await fetch(COOL+'/hosting/discovery')).text();const m=x.match(/<action[^>]*ext="docx"[^>]*name="edit"[^>]*urlsrc="([^"]+)"/);urlsrc=m[1];return urlsrc}
const body=req=>new Promise(r=>{const c=[];req.on('data',d=>c.push(d));req.on('end',()=>r(Buffer.concat(c)))});
const send=(res,code,data,type='application/json')=>{res.writeHead(code,{'Content-Type':type});res.end(typeof data==='string'||Buffer.isBuffer(data)?data:JSON.stringify(data))};
http.createServer(async(req,res)=>{console.log(new Date().toISOString(),req.method,req.url.replace(/access_token=[^&]*/,'access_token=***'),req.headers['x-wopi-override']||'');try{
 const u=new URL(req.url,'http://x');const p=u.pathname;
 let m=p.match(/^\/wopi\/files\/([^/]+)(\/contents)?$/);
 if(m){const n=safe(decodeURIComponent(m[1]));if(!verify(u.searchParams.get('access_token')||'',n))return send(res,401,{});const f=path.join(DIR,n);
  if(!m[2]){const st=fs.statSync(f);return send(res,200,{BaseFileName:n,Size:st.size,Version:String(st.mtimeMs),OwnerId:'yusuf',UserId:'yusuf',UserFriendlyName:'Yusuf',UserCanWrite:true,UserPrivateInfo:{ZoteroAPIKey:zkey()},SupportsUpdate:true,SupportsLocks:true,PostMessageOrigin:PUB,LastModifiedTime:st.mtime.toISOString()})}
  if(req.method==='GET')return send(res,200,fs.readFileSync(f),'application/octet-stream');
  const b=await body(req);fs.writeFileSync(f,b);return send(res,200,{LastModifiedTime:new Date().toISOString()})}
 if(req.method==='POST'&&p.match(/^\/wopi\/files\/[^/]+$/))return send(res,200,{});
 if(p==='/office/api/zotero-key'&&req.method==='POST'){const k=String(JSON.parse(await body(req)).key||'');if(!/^[A-Za-z0-9]{0,64}$/.test(k))throw 0;fs.writeFileSync(ZF,JSON.stringify({key:k}),{mode:0o600});return send(res,200,{ok:true})}
 if(p==='/office/api/files')return send(res,200,fs.readdirSync(DIR).filter(n=>!n.startsWith('.')).map(n=>({name:n,size:fs.statSync(path.join(DIR,n)).size,mtime:fs.statSync(path.join(DIR,n)).mtime})).sort((a,b)=>b.mtime-a.mtime));
 if(p==='/office/api/new'&&req.method==='POST'){let n=safe((u.searchParams.get('name')||'Untitled')+'.docx');const f=path.join(DIR,n);if(fs.existsSync(f))return send(res,409,{error:'exists'});fs.copyFileSync('/app/blank.docx',f);return send(res,200,{name:n})}
 if(p==='/office/api/upload'&&req.method==='POST'){const n=safe(u.searchParams.get('name'));fs.writeFileSync(path.join(DIR,n),await body(req));return send(res,200,{name:n})}
 if(p==='/office/api/open'){const n=safe(u.searchParams.get('name'));const src=await discovery();const wopi='http://wopi:8080/wopi/files/'+encodeURIComponent(n);return send(res,200,{url:src+'WOPISrc='+encodeURIComponent(wopi),token:sign(n)})}
 if(p==='/office/'||p==='/office')return send(res,200,fs.readFileSync('/app/index.html'),'text/html; charset=utf-8');
 send(res,404,{error:'not found'})}catch(e){send(res,400,{error:'bad request'})}}).listen(8080,()=>console.log('wopi on 8080'));
