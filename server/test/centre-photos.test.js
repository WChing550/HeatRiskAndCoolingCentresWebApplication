import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import {registerCentrePhotoRoutes,resolvePhotoOrder,savedPhotos,validateImage} from '../src/centrePhotos.js';
import {squareCrop,centrePhotos} from '../../client/src/lib/centrePhotos.js';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
const existing={id:'1',name:'Existing centre',verified:false,image_url:'/uploads/old.jpg',image_urls:['/uploads/old.jpg','/uploads/second.jpg']};
function fields(data=new FormData()){
  for(const [key,value] of Object.entries({name:'Test facility',address:'Kuala Lumpur',latitude:'3.14',longitude:'101.69',operatingHours:'09:00–18:00',capacity:'25',status:'open'}))data.set(key,value);
  return data;
}
async function harness(t,{fail=false}={}){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'heatsafe-photo-test-'));
  const calls=[];
  const pool={query:async(sql,values)=>{
    calls.push({sql,values});
    if(sql.startsWith('SELECT'))return{rowCount:1,rows:[existing]};
    if(fail)throw new Error('Simulated database outage');
    return{rowCount:1,rows:[{id:'1',name:values[0],image_url:values[10],image_urls:values[11],verified:false}]};
  }};
  const app=express();
  app.use((q,_s,next)=>{q.session={user:q.headers['x-test-role']?{role:q.headers['x-test-role']}:null};next();});
  registerCentrePhotoRoutes(app,{pool,uploadDir:dir,
    auth:(q,s,next)=>q.session.user?next():s.status(401).json({error:'Sign in'}),
    admin:(q,s,next)=>q.session.user.role==='admin'?next():s.status(403).json({error:'Admin only'}),
    ar:fn=>(q,s,next)=>Promise.resolve(fn(q,s,next)).catch(next),str:v=>typeof v==='string'?v.trim():'',n:v=>v==null||v===''?null:Number(v),
    kl:(a,b)=>a>=3&&a<=3.3&&b>=101.55&&b<=101.8,logActivity:async()=>{},centreOut:r=>r,diffFields:()=>({})});
  app.use((error,_q,s,_next)=>s.status(error.status||((error.code||'').startsWith('LIMIT_')?400:500)).json({error:error.message}));
  const server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));assert.equal(path.dirname(dir),os.tmpdir());assert.ok(path.basename(dir).startsWith('heatsafe-photo-test-'));await fs.rm(dir,{recursive:true,force:true});});
  return{dir,calls,send:(data,method='POST',role='admin')=>fetch(`http://127.0.0.1:${server.address().port}/api/admin/centres${method==='PUT'?'/1':''}`,{method,headers:role?{'x-test-role':role}:{},body:data})};
}

test('landscape and portrait crops remain square and inside the original at every zoom/pan extreme',()=>{
  for(const [w,h] of [[1800,900],[900,1800],[900,900]])for(const zoom of [1,1.5,3])for(const x of [-1,0,1])for(const y of [-1,0,1]){
    const c=squareCrop(w,h,300,zoom,x,y);
    assert.ok(c.sx>=-1e-8&&c.sy>=-1e-8);assert.ok(c.sx+c.side<=w+1e-8);assert.ok(c.sy+c.side<=h+1e-8);
    assert.ok(Math.abs(c.side*c.scale-300)<1e-8);
  }
});
test('invalid crop dimensions are rejected',()=>assert.throws(()=>squareCrop(0,900,300)));
test('existing single-photo records still provide a gallery',()=>{
  assert.deepEqual(savedPhotos({image_url:'/uploads/old.jpg'}),['/uploads/old.jpg']);
  assert.deepEqual(centrePhotos({image_url:'/uploads/old.jpg'}),['/uploads/old.jpg']);
});
test('gallery order can interleave new photos with retained photos and remove unreferenced old photos',()=>{
  assert.deepEqual(resolvePhotoOrder('["new:1","existing:/uploads/old.jpg","new:0"]',['/uploads/a.jpg','/uploads/b.jpg'],savedPhotos(existing)),['/uploads/b.jpg','/uploads/old.jpg','/uploads/a.jpg']);
  assert.deepEqual(resolvePhotoOrder('[]',[],savedPhotos(existing)),[]);
});
for(const [name,order,uploaded] of [
  ['cross-centre photo injection','["existing:/uploads/someone-else.jpg"]',[]],
  ['duplicate photo','["existing:/uploads/old.jpg","existing:/uploads/old.jpg"]',[]],
  ['unreferenced upload','[]',['/uploads/new.jpg']],
  ['duplicate numeric upload reference','["new:0","new:00"]',['/uploads/new.jpg']],
  ['invalid JSON','not-json',[]],
  ['missing upload','["new:10"]',[]]
])test(`rejects ${name}`,()=>assert.throws(()=>resolvePhotoOrder(order,uploaded,savedPhotos(existing))));
test('legacy single upload replaces its old cover; no-upload edits retain their gallery',()=>{
  assert.deepEqual(resolvePhotoOrder(null,['/uploads/new.jpg'],savedPhotos(existing),true),['/uploads/new.jpg']);
  assert.deepEqual(resolvePhotoOrder(null,[],savedPhotos(existing)),savedPhotos(existing));
});
test('two uploads persist in the requested order and the first becomes the cover',async t=>{
  const h=await harness(t),data=fields();data.set('photoOrder','["new:1","new:0"]');
  data.append('images',new Blob([png],{type:'image/png'}),'first.png');data.append('images',new Blob([png],{type:'image/png'}),'second.png');
  const response=await h.send(data);assert.equal(response.status,201);const result=await response.json();
  assert.equal(result.image_urls.length,2);assert.equal(result.image_url,result.image_urls[0]);assert.notEqual(result.image_urls[0],result.image_urls[1]);
  assert.equal((await fs.readdir(h.dir)).length,2);assert.equal(h.calls[0].values[11].length,2);
});
test('editing preserves a selected existing photo and adds the new crop',async t=>{
  const h=await harness(t),data=fields();data.set('photoOrder','["existing:/uploads/second.jpg","new:0"]');data.append('images',new Blob([png],{type:'image/png'}),'crop.png');
  const response=await h.send(data,'PUT');assert.equal(response.status,200);const result=await response.json();assert.equal(result.image_url,'/uploads/second.jpg');assert.equal(result.image_urls.length,2);
});
test('forged existing photo references fail before any database write',async t=>{
  const h=await harness(t),data=fields();data.set('photoOrder','["existing:/uploads/other-centre.jpg"]');
  const r=await h.send(data,'PUT');assert.equal(r.status,400);assert.equal(h.calls.length,1);
});
test('invalid file signatures are rejected and newly uploaded files are removed',async t=>{
  const h=await harness(t),data=fields();data.set('photoOrder','["new:0"]');data.append('images',new Blob(['<html>not a photo</html>'],{type:'image/png'}),'fake.png');
  const r=await h.send(data);assert.equal(r.status,400);assert.equal(h.calls.length,0);assert.deepEqual(await fs.readdir(h.dir),[]);
});
test('database failures clean up only the new uploads',async t=>{
  const h=await harness(t,{fail:true}),data=fields();data.set('photoOrder','["new:0"]');data.append('images',new Blob([png],{type:'image/png'}),'photo.png');
  const r=await h.send(data);assert.equal(r.status,500);assert.deepEqual(await fs.readdir(h.dir),[]);
});
test('validation failures do not leave uploaded files behind',async t=>{
  const h=await harness(t),data=fields();data.set('capacity','-2');data.append('images',new Blob([png],{type:'image/png'}),'photo.png');
  assert.equal((await h.send(data)).status,400);assert.deepEqual(await fs.readdir(h.dir),[]);
});
test('the upload limit is enforced at ten files',async t=>{
  const h=await harness(t),data=fields();for(let i=0;i<11;i++)data.append('images',new Blob([png],{type:'image/png'}),i+'.png');
  assert.equal((await h.send(data)).status,400);assert.deepEqual(await fs.readdir(h.dir),[]);
});
test('non-admin and unauthenticated requests never reach the uploader or database',async t=>{
  const h=await harness(t);assert.equal((await h.send(fields(),'POST','user')).status,403);assert.equal((await h.send(fields(),'POST',null)).status,401);assert.equal(h.calls.length,0);assert.deepEqual(await fs.readdir(h.dir),[]);
});
