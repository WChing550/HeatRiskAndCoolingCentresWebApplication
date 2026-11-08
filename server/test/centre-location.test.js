import test from 'node:test';
import assert from 'node:assert/strict';
import {createAddressVerifier,photonMatches,walkingDirections,insideKL} from '../src/centreLocation.js';
import {walkingDirections as clientDirections,directionsAddress} from '../../client/src/lib/directions.js';

const feature={geometry:{type:'Point',coordinates:[101.71238,3.157375]},properties:{osm_id:4600000,osm_type:'W',osm_key:'shop',osm_value:'mall',name:'Test Mall',street:'Persiaran Test',city:'Kuala Lumpur',postcode:'50088',country:'Malaysia'}};
const match={address:'Test Mall, Persiaran Test, Kuala Lumpur, 50088, Malaysia',latitude:3.157375,longitude:101.71238};
const makeBody=verifier=>({address:match.address,latitude:String(match.latitude),longitude:String(match.longitude),addressConfirmed:'true',locationToken:verifier.issueToken(match,'admin-1')});
test('only specific, in-bounds address matches are returned; duplicate features and city centroids are removed',()=>{
 const outside={...feature,geometry:{coordinates:[100.3,5.4]}};
 const city={...feature,properties:{...feature.properties,osm_id:99,osm_key:'place',osm_value:'city'}};
 const result=photonMatches({features:[feature,feature,outside,city]});assert.equal(result.length,1);assert.equal(result[0].address,match.address);assert.equal(result[0].latitude,match.latitude);
});
test('walking links from the client and API point to identical saved coordinates',()=>{
 const row={latitude:'3.157375',longitude:'101.71238'};assert.equal(clientDirections(row),walkingDirections(row));
 const url=new URL(walkingDirections(row));assert.equal(url.origin,'https://www.google.com');assert.equal(url.searchParams.get('api'),'1');assert.equal(url.searchParams.get('travelmode'),'walking');assert.equal(url.searchParams.get('destination'),'3.157375,101.71238');assert.equal(url.searchParams.has('origin'),false);
});
test('display addresses remain separate from routing; invalid centre coordinates cannot generate a destination pin',()=>{
 const address='A & B Centre, Jalan Test #3';assert.equal(directionsAddress(address),address);assert.equal(walkingDirections({latitude:99,longitude:101}),null);assert.equal(clientDirections({latitude:'',longitude:''}),'');assert.equal(insideKL(null,null),false);
});
test('a server-issued address match and administrator confirmation allow saving',()=>{
 const v=createAddressVerifier({secret:'test-secret'});assert.doesNotThrow(()=>v.verifyForSave(makeBody(v),null,'admin-1'));
});
for(const [label,edit] of [
 ['address changed',body=>body.address+=' invented street'],
 ['latitude changed',body=>body.latitude='3.20'],
 ['longitude changed',body=>body.longitude='101.60'],
 ['confirmation omitted',body=>delete body.addressConfirmed],
 ['token omitted',body=>delete body.locationToken],
 ['signature tampered',body=>body.locationToken+='x']
])test(`save is rejected when ${label}`,()=>{
 const v=createAddressVerifier({secret:'test-secret'}),body=makeBody(v);edit(body);assert.throws(()=>v.verifyForSave(body,null,'admin-1'),{status:400});
});
test('tokens are bound to the administrator who searched',()=>{
 const v=createAddressVerifier({secret:'test-secret'});assert.throws(()=>v.verifyForSave(makeBody(v),null,'admin-2'),{status:400});
});
test('expired location matches must be verified again',()=>{
 let time=1000000;const v=createAddressVerifier({secret:'test-secret',now:()=>time}),body=makeBody(v);time+=31*60*1000;assert.throws(()=>v.verifyForSave(body,null,'admin-1'),{status:400});
});
test('unchanged legacy locations may retain their existing data; changed locations need a fresh match',()=>{
 const v=createAddressVerifier({secret:'test-secret'}),old={address:'Existing address',latitude:'3.14',longitude:'101.69'};
 assert.doesNotThrow(()=>v.verifyForSave({...old},old,'admin-1'));assert.throws(()=>v.verifyForSave({...old,address:'Changed address'},old,'admin-1'),{status:400});
});
test('address requests are bounded, cached and restricted to the Kuala Lumpur bounding box',async()=>{
 let calls=0;const v=createAddressVerifier({secret:'test',minInterval:0,fetchImpl:async url=>{
  calls++;assert.equal(url.searchParams.get('bbox'),'101.55,3.00,101.80,3.30');assert.equal(url.searchParams.get('limit'),'6');return{ok:true,json:async()=>({features:[feature]})};
 }});
 const first=await v.search('Test Mall Kuala Lumpur'),second=await v.search('test mall kuala lumpur');assert.deepEqual(first,second);assert.equal(calls,1);await assert.rejects(v.search('x'),{status:400});
});
test('provider outages fail closed instead of treating an address as verified',async()=>{
 const v=createAddressVerifier({fetchImpl:async()=>{throw new Error('offline');},minInterval:0});await assert.rejects(v.search('Test Mall Kuala Lumpur'),{status:503});
});
test('no matching map location means no verified candidate',async()=>{
 const v=createAddressVerifier({fetchImpl:async()=>({ok:true,json:async()=>({features:[]})}),minInterval:0});assert.deepEqual(await v.search('Imaginary cooling centre 12345'),[]);
});

test('nearby Selangor locations inside the bounding rectangle are not presented as Kuala Lumpur matches',()=>{
 const nearby={...feature,properties:{...feature.properties,city:'Petaling Jaya',state:'Selangor'}};
 assert.deepEqual(photonMatches({features:[nearby]}),[]);
});
