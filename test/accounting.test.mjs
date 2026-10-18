import test from 'node:test';
import assert from 'node:assert/strict';
import {accountingBalances} from '../dist/accounting.js';
const event=(id,status='confirmed',amount=10000)=>({id,status,quotes:[{id:'q',amount}],acceptedQuoteId:'q'});
test('receivables separate refunds, credits, unconfirmed and cancelled cash',()=>{
  const events=[event('owed'),event('credit','completed'),event('cancel','cancelled'),event('pending','accepted'),{...event('noquote'),acceptedQuoteId:''}];
  const entries=[{bookingId:'owed',kind:'payment',amount:6000},{bookingId:'owed',kind:'refund',amount:1000},{bookingId:'credit',kind:'payment',amount:11000},{bookingId:'cancel',kind:'payment',amount:2000},{bookingId:'pending',kind:'expense',amount:500}];
  const result=accountingBalances(events,entries);
  assert.equal(result.customerBalance,5000);
  assert.equal(result.receivables.length,1);
  assert.equal(result.credits[0].balance,-1000);
  assert.deepEqual(result.review.map(row=>row.booking.id),['cancel','pending']);
  assert.equal(entries.length,5);
});
test('artist balances include partial payments and advances without netting different jobs',()=>{
  const events=[event('one'),event('two'),event('cancel','cancelled')];
  const plans=events.map(b=>({id:b.id,rows:[{performerId:'a',agreedPay:5000}]}));
  const entries=[{bookingId:'one',performerId:'a',kind:'expense',amount:2000},{bookingId:'two',performerId:'a',kind:'expense',amount:7000},{bookingId:'one',performerId:'a',kind:'payment',amount:9999}];
  const result=accountingBalances(events,entries,plans);
  assert.equal(result.artistBalance,3000);
  assert.deepEqual(result.artistPay.map(row=>row.balance),[3000,-2000]);
  assert.equal(result.artistPay.length,2);
});
