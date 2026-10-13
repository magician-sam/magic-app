import test from 'node:test';
import assert from 'node:assert/strict';
import { organizationSchema, publicOrganization } from '../dist/marketplace.js';
import { venueLocationSchema, venueMediaSchema, validPublicMediaUrl } from '../dist/venue-details.js';
import { readProfileDetails } from '../dist/partner-profile-details.js';
import { locationView, mediaView } from '../dist/venue-profile-view.js';

test('optional venue fields preserve old organizations and reject incomplete or unsafe public data',()=>{
 const old={id:'old',slug:'old',name:'Old profile',kind:'venue_operator',status:'approved',bookingMode:'direct',publicDescription:'Existing profile',categories:[],revision:0};
 assert.deepEqual(organizationSchema.parse(old),old);
 assert.equal(publicOrganization(old).location,undefined);
 for(const value of [{city:'Beirut'}, {city:'',address:'Test'}, {city:'Beirut',address:'Test',coordinates:{latitude:34}}, {city:'Beirut',address:'Test',coordinates:{latitude:91,longitude:35}}]) assert.equal(venueLocationSchema.safeParse(value).success,false);
 for(const url of ['javascript:alert(1)','//evil.test/a.jpg','https://user:secret@example.test/photo.jpg','https://127.0.0.1/a.jpg','https://0x7f000001/a.jpg','https://example.test/page.html','https://example.test/video.mp4']) assert.equal(validPublicMediaUrl(url,'photo'),false,url);
 assert.equal(validPublicMediaUrl('/portfolio/venue.jpg','photo'),true);
 assert.equal(validPublicMediaUrl('https://example.test/video.mp4','video'),true);
 assert.equal(venueMediaSchema.safeParse({kind:'photo',url:'/venue.jpg',caption:'Venue',permissionReference:''}).success,false);
});
test('profile editor retains zero coordinates, clears removed media and catches partial pins',()=>{
 const data=new FormData();data.set('location-city','Beirut');data.set('location-address','Test street');data.set('location-aliases','Beyrouth, بيروت');data.set('location-latitude','0');data.set('location-longitude','0');
 const value=readProfileDetails(data);assert.deepEqual(value.publicLocation.coordinates,{latitude:0,longitude:0});assert.deepEqual(value.publicLocation.aliases,['Beyrouth','بيروت']);assert.deepEqual(value.publicMedia,[]);
 data.delete('location-longitude');assert.throws(()=>readProfileDetails(data),/both map/);
 assert.deepEqual(readProfileDetails(new FormData()),{publicLocation:null,publicMedia:[]});
});
test('location and gallery escape user content and do not autoplay media',()=>{
 const place=venueLocationSchema.parse({city:'Beirut',address:'<script>bad</script>',coordinates:{latitude:33.9,longitude:35.5}});
 const html=locationView(place);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);assert.match(html,/query=33.9%2C35.5/);
 const gallery=mediaView([{kind:'photo',url:'/photo.jpg',caption:'<img onerror="bad">'},{kind:'video',url:'/clip.mp4',caption:'Venue video'}]);
 assert.match(gallery,/data-zoom-photo/);assert.match(gallery,/playsinline preload="none"/);assert.doesNotMatch(gallery,/autoplay|<img onerror=/);
});
