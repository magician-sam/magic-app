import test from 'node:test';
import assert from 'node:assert/strict';
import {readBackstageRoute, backstageHash} from '../dist/backstage-route.js';

test('Backstage routes restore every workspace and accounting subdestination without accepting arbitrary hashes', () => {
  for (const view of ['today','notices','bookings','enquiries','calendar','customers','whatsapp','messaging','packages','supplier-desks','supplier-applications','registration-agreements','themes','occasions','guest-shows','guest-photos','offers','performers','reminders','reviews','settings']) {
    assert.deepEqual(readBackstageRoute(backstageHash({view})), {view});
  }
  for (const finance of ['home','prices','sales','purchases','cash','employees','tax','inventory','events','partners','reports','review','accounts','ledger']) {
    assert.deepEqual(readBackstageRoute(backstageHash({view:'money',report:'desk',finance})), {view:'money',report:'desk',finance});
  }
  for (const report of ['overview','customers','artists','transactions','costs','margins','insights']) {
    assert.deepEqual(readBackstageRoute(backstageHash({view:'money',report,finance:'tax'})), {view:'money',report,finance:'tax'});
  }
  assert.deepEqual(readBackstageRoute('#money/invalid/missing'), {view:'money',report:'desk',finance:'home'});
  for (const hash of ['', '#main', '#<script>', '#%2Fsettings', '#https://example.test']) assert.deepEqual(readBackstageRoute(hash), {view:'today'});
  assert.equal(backstageHash({view:'unknown'}), '#today');
});
