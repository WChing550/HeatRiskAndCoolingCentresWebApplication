import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import crypto from 'node:crypto';
import {createAddressVerifier,registerCentreLocationRoutes} from '../src/centreLocation.js';
import {centreLocationChanged} from '../src/centrePhotos.js';
import {isPublishedCentre} from '../../client/src/lib/centreVisibility.js';
import {walkingDirections} from '../../client/src/lib/directions.js';

const match={address:'Example cooling centre, Kuala Lumpur',latitude:3.15,longitude:101.71};
const makeBody=v=>({...match,locationToken:v.issueToken(match,'admin-1')});

test('a confirmed nearby entrance gets a new token accepted by the save validator',()=>{
  const v=createAddressVerifier({secret:'pin-test'});
  const pin=v.confirmPin({...makeBody(v),latitude:3.151,longitude:101.711},'admin-1');
  assert.equal(pin.latitude,3.151);
  assert.equal(pin.address,match.address);
  assert.doesNotThrow(()=>v.verifyForSave({...pin,addressConfirmed:'true'},null,'admin-1'));
  assert.equal(new URL(walkingDirections(pin)).searchParams.get('destination'),'3.151,101.711');
});
for(const [label,mutate] of [
  ['missing token',b=>delete b.locationToken],
  ['tampered token',b=>b.locationToken+='x'],
  ['changed address',b=>b.address+=' different street'],
  ['outside Kuala Lumpur',b=>b.latitude=2.9],
  ['invalid coordinate',b=>b.longitude='not-a-number'],
  ['too far from the matched address',b=>b.latitude=3.18],
])test(`pin correction rejects ${label}`,()=>{
  const v=createAddressVerifier({secret:'pin-test'}),body=makeBody(v);mutate(body);
  assert.throws(()=>v.confirmPin(body,'admin-1'),{status:400});
});
test('pin confirmation is bound to the administrator who verified the address',()=>{
  const v=createAddressVerifier({secret:'pin-test'});
  assert.throws(()=>v.confirmPin(makeBody(v),'admin-2'),{status:400});
});
test('expired address matches cannot authorize a corrected entrance',()=>{
  let now=1000;const v=createAddressVerifier({secret:'pin-test',now:()=>now}),body=makeBody(v);
  now+=31*60000;assert.throws(()=>v.confirmPin(body,'admin-1'),{status:400});
});
test('repeated adjustments stay anchored to the original address match',()=>{
  const v=createAddressVerifier({secret:'pin-test'});
  const first=v.confirmPin({...makeBody(v),latitude:3.154},'admin-1');
  const second=v.confirmPin({...first,latitude:3.158},'admin-1');
  assert.throws(()=>v.confirmPin({...second,latitude:3.162,anchorLat:3.16},'admin-1'),{status:400});
});
test('a manually modified coordinate still requires a newly signed entrance token',()=>{
  const v=createAddressVerifier({secret:'pin-test'}),body={...makeBody(v),latitude:3.151,addressConfirmed:'true'};
  assert.throws(()=>v.verifyForSave(body,null,'admin-1'),{status:400});
  const confirmed=v.confirmPin(body,'admin-1');
  assert.throws(()=>v.verifyForSave({...confirmed,addressConfirmed:'false'},null,'admin-1'),{status:400});
});
test('legacy address tokens can be renewed by confirming an entrance',()=>{
  const v=createAddressVerifier({secret:'pin-test'});
  const payload=Buffer.from(JSON.stringify({uid:'admin-1',address:match.address,lat:match.latitude,lon:match.longitude,exp:Date.now()+60000})).toString('base64url');
  const signature=crypto.createHmac('sha256','pin-test').update(payload).digest('base64url');
  const pin=v.confirmPin({...match,latitude:3.151,locationToken:payload+'.'+signature},'admin-1');
  assert.doesNotThrow(()=>v.verifyForSave({...pin,addressConfirmed:'true'},null,'admin-1'));
});

for(const status of ['pending','rejected','expired']) {
  test(`${status} records stay out of the gallery even if an old verified flag is true`,()=>{
    assert.equal(isPublishedCentre({verified:true,effective_status:status}),false);
    assert.equal(isPublishedCentre({verified:true,verification_status:status}),false);
    assert.equal(isPublishedCentre({verified:true,effective_status:'verified',verification_status:status}),false);
  });
}
test('only current verification can publish a centre',()=>{
  assert.equal(isPublishedCentre({verified:true,effective_status:'verified',verification_status:'verified'}),true);
  assert.equal(isPublishedCentre({verified:false,effective_status:'verified'}),false);
  assert.equal(isPublishedCentre({verified:'true',effective_status:'verified'}),false);
  assert.equal(isPublishedCentre({verified:true,expired:true}),false);
  assert.equal(isPublishedCentre(null),false);
});
test('the legacy boolean format remains supported for currently verified records',()=>{
  assert.equal(isPublishedCentre({verified:true}),true);
  assert.equal(isPublishedCentre({verified:false}),false);
});
test('changed addresses or entrance coordinates invalidate the previous location approval',()=>{
  assert.equal(centreLocationChanged(match,{...match,latitude:3.151}),true);
  assert.equal(centreLocationChanged(match,{...match,longitude:101.711}),true);
  assert.equal(centreLocationChanged(match,{...match,address:'Another address'}),true);
});
test('photo, name and contact edits preserve an unchanged location approval',()=>{
  assert.equal(centreLocationChanged(match,{...match,name:'Another display name',contact:'123'}),false);
  assert.equal(centreLocationChanged(match,{...match,latitude:'3.150000',longitude:'101.710000'}),false);
  assert.equal(centreLocationChanged(null,match),false);
});
test('confirm-pin endpoint enforces login, administrator access and token validation',async()=>{
  const v=createAddressVerifier({secret:'route-test'}),app=express();app.use(express.json());
  app.use((q,_s,next)=>{q.session={user:q.get('x-test-role')?{id:'admin-1',role:q.get('x-test-role')}:null};next();});
  registerCentreLocationRoutes(app,{verifier:v,
    auth:(q,s,next)=>q.session.user?next():s.status(401).json({error:'Sign in'}),
    admin:(q,s,next)=>q.session.user.role==='admin'?next():s.status(403).json({error:'Admin only'}),
    ar:fn=>(q,s,next)=>Promise.resolve(fn(q,s,next)).catch(next),
  });
  app.use((e,_q,s,_next)=>s.status(e.status||500).json({error:e.message}));
  const server=await new Promise(resolve=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener));});
  const url=`http://127.0.0.1:${server.address().port}/api/admin/centre-locations/confirm-pin`;
  const send=(role,body)=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...(role?{'x-test-role':role}:{})},body:JSON.stringify(body)});
  try {
    assert.equal((await send(null,makeBody(v))).status,401);
    assert.equal((await send('user',makeBody(v))).status,403);
    assert.equal((await send('admin',{...match,locationToken:'invalid'})).status,400);
    const result=await send('admin',{...makeBody(v),latitude:3.151});
    assert.equal(result.status,200);const pin=await result.json();
    assert.doesNotThrow(()=>v.verifyForSave({...pin,addressConfirmed:'true'},null,'admin-1'));
  } finally {await new Promise(resolve=>server.close(resolve));}
});
