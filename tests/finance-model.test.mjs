import assert from 'node:assert/strict';
import {allocatePurchase,snapshotFunding,allocateResult,capitalLedger,vatMonth,validateFinanceSettings,DEFAULT_FINANCE_SETTINGS} from '../src/finance-model.mjs';

const split=allocatePurchase({purchaseCash:400000,ownerAvailable:160000,investorAvailable:240000});
assert.equal(split.ownerAmount,160000);
assert.equal(split.investorAmount,240000);
const funding=snapshotFunding({...split,purchaseCash:400000});
assert.deepEqual(allocateResult({profit:50000,funding}),{investor:10500,helper:7500,owner:32000,total:50000});
assert.deepEqual(allocateResult({profit:-20000,funding}),{investor:-12000,helper:0,owner:-8000,total:-20000});
assert.deepEqual(allocateResult({profit:0,funding}),{investor:0,helper:0,owner:0,total:0});
const changed=snapshotFunding({...split,purchaseCash:400000,investorProfitPercent:27});
assert.equal(allocateResult({profit:50000,funding:changed}).investor,8100);
assert.equal(allocateResult({profit:50000,funding}).investor,10500,'old snapshot must remain unchanged');
assert.throws(()=>allocatePurchase({purchaseCash:400000,ownerAvailable:100000,investorAvailable:200000}));
assert.throws(()=>allocatePurchase({purchaseCash:400000,ownerAvailable:200000,investorAvailable:300000,ownerAmount:250000}));
assert.throws(()=>snapshotFunding({purchaseCash:400000,ownerAmount:100000,investorAmount:200000}));
assert.equal(validateFinanceSettings(DEFAULT_FINANCE_SETTINGS).investorProfitPercent,35);
assert.throws(()=>validateFinanceSettings({...DEFAULT_FINANCE_SETTINGS,investorProfitPercent:110}));
const ledger=capitalLedger({openingOwner:1500000,openingInvestor:2300000,events:[
  {party:'investor',type:'profit-credit',amount:10500},
  {party:'owner',type:'withdrawal',amount:60000}
]});
assert.deepEqual(ledger,{owner:1440000,investor:2310500,total:3750500});
assert.deepEqual(vatMonth({purchases:[21000],sales:[42000],costs:[2100],settlements:[10000]}),{
 input:23100,output:42000,netDue:18900,settled:10000,outstanding:8900
});
console.log('AutoDama finance-model tests passed');
