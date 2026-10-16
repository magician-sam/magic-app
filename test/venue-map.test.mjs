import test from 'node:test';
import assert from 'node:assert/strict';
import {publicOrganization} from '../dist/marketplace.js';
import {venueMapPlaces,filterMapPlaces,placeInBounds} from '../dist/venue-map-data.js';

const profile={id:'venue-1',slug:'synthetic-garden',name:'Synthetic Garden',kind:'venue_operator',status:'approved',bookingMode:'direct',publicDescription:'Test only',categories:['venue'],revision:0,
 publicLocation:{country:'Lebanon',region:'Beirut',city:'Beirut',area:'Test area',address:'Synthetic address',aliases:[],coordinates:{latitude:33.9,longitude:35.5}},publicMedia:[]};
test('map consumes only approved public venue projections and never invents missing pins or prices',()=>{
  assert.equal(publicOrganization({...profile,status:'draft'}),undefined);
  const visible=publicOrganization(profile);assert.ok(visible);
  const unpinned=publicOrganization({...profile,id:'venue-2',slug:'without-pin',publicLocation:{...profile.publicLocation,coordinates:undefined}});
  const places=venueMapPlaces([visible,unpinned],true);
  assert.equal(places.length,3);
  assert.equal(places.find(p=>p.id==='playtown').minimumPriceUsd,15);
  assert.equal(places.find(p=>p.id==='partner:synthetic-garden').minimumPriceUsd,undefined);
  assert.equal(places.find(p=>p.id==='partner:without-pin').coordinates,undefined);
  const b={north:34,south:33.8,west:35.4,east:35.6};
  assert.equal(filterMapPlaces(places,'all',null,b).length,2);
  assert.deepEqual(filterMapPlaces(places,'all',25).map(p=>p.id),['playtown']);
  assert.equal(filterMapPlaces(places,'venue',null).length,2);
  assert.equal(filterMapPlaces(places,'playground',null).length,1);
  assert.equal(filterMapPlaces(places,'all',10).length,0);
});
test('map bounds include edge pins, handle wrapped longitudes and reject unavailable coordinates',()=>{
  const place=(latitude,longitude)=>({id:'test',name:'Test',address:'',kind:'venue',coordinates:{latitude,longitude}});
  assert.ok(placeInBounds(place(33.8,35.4),{north:34,south:33.8,west:35.4,east:35.6}));
  assert.equal(placeInBounds(place(34.1,35.5),{north:34,south:33.8,west:35.4,east:35.6}),false);
  assert.ok(placeInBounds(place(0,-179),{north:1,south:-1,west:170,east:190}));
  assert.ok(placeInBounds(place(0,179),{north:1,south:-1,west:170,east:-170}));
  assert.equal(placeInBounds({...place(0,0),coordinates:undefined},{north:90,south:-90,west:-180,east:180}),false);
  assert.equal(placeInBounds(place(NaN,35),{north:90,south:-90,west:-180,east:180}),false);
});
