import test from 'node:test';
import assert from 'node:assert/strict';
import { auctionEnhancementScenarioFinalists } from '../../../lib/wow/auctionGearEnhancementStage.ts';

test('scenario shortlist retains independent value, significant maximum, and noisy measured leader within three',()=>{
  const recommendation=(key,gain,cost,significant=true)=>({label:key,configuration:{key,totalCopper:cost},comparison:{deltaDps:gain,uncertainty:{significant}}});
  const rows=[recommendation('cheap',10,1),recommendation('maximum',100,100),recommendation('noisy',200,100,false),recommendation('middle',20,20)];
  assert.deepEqual(auctionEnhancementScenarioFinalists(rows,'dps').map(row=>row.label),['noisy','cheap','maximum']);
  assert.deepEqual(auctionEnhancementScenarioFinalists(rows,'value').map(row=>row.label),['cheap','maximum']);
});
