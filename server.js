const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const PORT=process.env.PORT||3000,BASE=process.env.BASE_URL||`http://localhost:${PORT}`;
const DATA=path.join(__dirname,'data'),SITES=path.join(DATA,'sites'),DBF=path.join(DATA,'db.json');
fs.mkdirSync(SITES,{recursive:true});
let db=fs.existsSync(DBF)?JSON.parse(fs.readFileSync(DBF)):{users:{},tokens:{},sessions:{},sites:{}};
const save=()=>fs.writeFileSync(DBF,JSON.stringify(db));
const rid=n=>crypto.randomBytes(n).toString('hex');
let mailer=null;
if(process.env.SMTP_HOST){try{mailer=require('nodemailer').createTransport({host:process.env.SMTP_HOST,port:+process.env.SMTP_PORT||587,auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}})}catch(e){console.log('ติดตั้ง nodemailer ก่อน: npm i nodemailer')}}
const MIME={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.ico':'image/x-icon','.txt':'text/plain; charset=utf-8','.woff2':'font/woff2','.mp4':'video/mp4'};
const safe=p=>{const n=path.posix.normalize('/'+String(p||'').replace(/\\/g,'/')).slice(1);return n&&!n.endsWith('/')?n:null};
const walk=(d,b='')=>fs.existsSync(d)?fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name),b+e.name+'/'):[b+e.name]):[];
const json=(res,c,o,h={})=>{res.writeHead(c,{'Content-Type':'application/json',...h});res.end(JSON.stringify(o))};
const body=req=>new Promise(r=>{let b=[],n=0;req.on('data',c=>{n+=c.length;if(n<60e6)b.push(c)});req.on('end',()=>{try{r(JSON.parse(Buffer.concat(b)))}catch{r({})}})});
const getUser=req=>{const m=(req.headers.cookie||'').match(/sid=(\w+)/);const e=m&&db.sessions[m[1]];return e&&db.users[e]};
const put=(id,f,c,b64)=>{const fp=path.join(SITES,id,f);fs.mkdirSync(path.dirname(fp),{recursive:true});fs.writeFileSync(fp,b64?Buffer.from(c,'base64'):c)};
const view=s=>({id:s.id,name:s.name,version:s.version,updated:s.updated,link:`${BASE}/s/${s.id}/`});

http.createServer(async(req,res)=>{
 try{
 const u=new URL(req.url,BASE),p=decodeURIComponent(u.pathname),me=getUser(req);
 // ---- เว็บของผู้ใช้ (ลิงก์สาธารณะ)
 if(p.startsWith('/s/')){
  const [, ,id,...rest]=p.split('/');const s=db.sites[id];
  if(!s){res.writeHead(404);return res.end('ไม่พบเว็บนี้')}
  if(!rest.length){res.writeHead(302,{Location:`/s/${id}/`+u.search});return res.end()}
  let f=rest.join('/');if(!f||f.endsWith('/'))f+='index.html';f=safe(f);
  const fp=f&&path.join(SITES,id,f);
  if(!fp||!fs.existsSync(fp)||fs.statSync(fp).isDirectory()){res.writeHead(404);return res.end('404')}
  res.writeHead(200,{'Content-Type':MIME[path.extname(fp).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store'});
  return fs.createReadStream(fp).pipe(res);
 }
 // ---- ล็อกอินด้วยอีเมล
 if(p==='/api/login'&&req.method==='POST'){
  const {email}=await body(req);
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email||''))return json(res,400,{error:'อีเมลไม่ถูกต้อง'});
  const t=rid(20);db.tokens[t]={email:email.toLowerCase(),exp:Date.now()+15*60e3};save();
  const link=`${BASE}/auth?token=${t}`;
  if(mailer){await mailer.sendMail({from:process.env.MAIL_FROM||process.env.SMTP_USER,to:email,subject:'ลิงก์เข้าสู่ระบบ SiteHub',text:`กดลิงก์เพื่อเข้าสู่ระบบ (หมดอายุใน 15 นาที):\n${link}`});return json(res,200,{sent:true})}
  console.log('LOGIN LINK:',link);return json(res,200,{sent:false,dev:link});
 }
 if(p==='/auth'){
  const t=db.tokens[u.searchParams.get('token')];delete db.tokens[u.searchParams.get('token')];
  if(!t||t.exp<Date.now()){res.writeHead(400);return res.end('ลิงก์หมดอายุหรือถูกใช้แล้ว');}
  db.users[t.email]=db.users[t.email]||{email:t.email,created:Date.now()};
  const sid=rid(24);db.sessions[sid]=t.email;save();
  res.writeHead(302,{Location:'/','Set-Cookie':`sid=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`});return res.end();
 }
 if(p==='/api/logout'){const m=(req.headers.cookie||'').match(/sid=(\w+)/);if(m)delete db.sessions[m[1]];save();return json(res,200,{ok:1},{'Set-Cookie':'sid=; Path=/; Max-Age=0'})}
 if(p==='/api/me')return json(res,200,{me:me&&{email:me.email}});
 // ---- API เว็บไซต์
 if(p.startsWith('/api/')){
  if(!me)return json(res,401,{error:'ต้องล็อกอิน'});
  if(p==='/api/sites'&&req.method==='GET')return json(res,200,Object.values(db.sites).filter(s=>s.owner===me.email).sort((a,b)=>b.updated-a.updated).map(view));
  if(p==='/api/sites'&&req.method==='POST'){
   const b=await body(req),id=rid(5);
   const s=db.sites[id]={id,owner:me.email,name:String(b.name||'เว็บใหม่').slice(0,60),version:1,updated:Date.now()};
   let n=0;for(const f of b.files||[]){const sp=safe(f.path);if(sp&&n++<2000)put(id,sp,f.content||'',f.b64)}
   if(!n)put(id,'index.html','<!doctype html>\n<html><head><meta charset="utf-8"><title>เว็บของฉัน</title></head>\n<body>\n<h1>สวัสดี!</h1>\n</body></html>');
   save();return json(res,200,view(s));
  }
  const m=p.match(/^\/api\/sites\/(\w+)(\/file)?$/),s=m&&db.sites[m[1]];
  if(!s||s.owner!==me.email)return json(res,404,{error:'ไม่พบเว็บ'});
  if(!m[2]){
   if(req.method==='DELETE'){fs.rmSync(path.join(SITES,s.id),{recursive:true,force:true});delete db.sites[s.id];save();return json(res,200,{ok:1})}
   if(req.method==='PATCH'){const b=await body(req);if(b.name)s.name=String(b.name).slice(0,60);save();return json(res,200,view(s))}
   return json(res,200,{site:view(s),files:walk(path.join(SITES,s.id)).sort()});
  }
  const f=safe(req.method==='GET'||req.method==='DELETE'?u.searchParams.get('path'):null);
  if(req.method==='GET'){
   const fp=f&&path.join(SITES,s.id,f);if(!fp||!fs.existsSync(fp))return json(res,404,{error:'ไม่พบไฟล์'});
   return json(res,200,/^(text|application\/(json|javascript))|svg/.test(MIME[path.extname(fp).toLowerCase()]||'text')?{content:fs.readFileSync(fp,'utf8')}:{binary:true});
  }
  if(req.method==='PUT'){
   const b=await body(req),pf=safe(b.path);if(!pf)return json(res,400,{error:'ชื่อไฟล์ไม่ถูกต้อง'});
   put(s.id,pf,b.content||'');s.version++;s.updated=Date.now();save();
   return json(res,200,{...view(s),link:`${BASE}/s/${s.id}/?v=${s.version}`});
  }
  if(req.method==='DELETE'){if(f)fs.rmSync(path.join(SITES,s.id,f),{force:true});s.version++;s.updated=Date.now();save();return json(res,200,view(s))}
 }
 // ---- หน้าเว็บของเรา
 res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});fs.createReadStream(path.join(__dirname,'public','index.html')).pipe(res);
 }catch(e){console.error(e);if(!res.headersSent)json(res,500,{error:'server error'})}
}).listen(PORT,()=>console.log('SiteHub: '+BASE));
