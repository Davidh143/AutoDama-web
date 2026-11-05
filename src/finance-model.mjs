/* AutoDama financing calculations. Pure functions: no storage, no mutations.
 * Values in CZK; money rounded to halere. These are management calculations,
 * not VAT returns or a substitute for tax accounting.
 */
export const roundMoney = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const finite = (n, name) => {
  if (typeof n !== 'number' || !Number.isFinite(n)) throw new Error(name + ': neplatná částka');
  return n;
};
const nonnegative = (n, name) => {
  finite(n, name);
  if (n < 0) throw new Error(name + ': záporná hodnota');
  return n;
};
export const DEFAULT_FINANCE_SETTINGS = Object.freeze({
  investorProfitPercent: 35,
  helperProfitPercent: 15,
  plannedOwnerDrawMonthly: 60000,
  helperMode: 'percentage',
  helperMonthlyFixed: 0,
  helperVariablePercent: 0
});
export function validateFinanceSettings(s) {
  for (const k of ['investorProfitPercent', 'helperProfitPercent', 'helperVariablePercent']) {
    nonnegative(s[k], k);
    if (s[k] > 100) throw new Error(k + ': maximálně 100 %');
  }
  for (const k of ['plannedOwnerDrawMonthly', 'helperMonthlyFixed']) nonnegative(s[k], k);
  if (!['percentage', 'fixed-plus-variable'].includes(s.helperMode)) throw new Error('Neplatný způsob odměny pomocníka');
  return { ...s };
}
export function allocatePurchase({ purchaseCash, ownerAvailable, investorAvailable, ownerAmount }) {
  nonnegative(purchaseCash, 'Cena nákupu');
  nonnegative(ownerAvailable, 'Volné vlastní peníze');
  nonnegative(investorAvailable, 'Volné investorovy peníze');
  if (roundMoney(ownerAvailable + investorAvailable) < roundMoney(purchaseCash)) throw new Error('Nedostatek volných prostředků');
  let owner = ownerAmount === undefined
    ? roundMoney(purchaseCash * ownerAvailable / (ownerAvailable + investorAvailable || 1))
    : roundMoney(nonnegative(ownerAmount, 'Vlastní vklad'));
  let investor = roundMoney(purchaseCash - owner);
  if (owner > ownerAvailable + 0.001 || investor > investorAvailable + 0.001 || investor < 0)
    throw new Error('Rozdělení přesahuje dostupný kapitál');
  return { ownerAmount: owner, investorAmount: investor, investorFraction: purchaseCash ? investor / purchaseCash : 0 };
}
export function snapshotFunding({ purchaseCash, ownerAmount, investorAmount, investorProfitPercent = 35, helperProfitPercent = 15, effectiveDate }) {
  for (const [k,v] of Object.entries({purchaseCash,ownerAmount,investorAmount})) nonnegative(v,k);
  if (Math.abs(roundMoney(ownerAmount + investorAmount - purchaseCash)) > 0.001) throw new Error('Vklady musí odpovídat ceně nákupu');
  for (const [k,v] of Object.entries({investorProfitPercent,helperProfitPercent})) {
    nonnegative(v,k); if (v > 100) throw new Error(k + ': maximálně 100 %');
  }
  return Object.freeze({
    purchaseCash: roundMoney(purchaseCash),
    ownerAmount: roundMoney(ownerAmount),
    investorAmount: roundMoney(investorAmount),
    investorFraction: purchaseCash ? investorAmount / purchaseCash : 0,
    investorProfitPercent, helperProfitPercent,
    effectiveDate: effectiveDate || null
  });
}
export function allocateResult({ profit, funding }) {
  finite(profit, 'Výsledek obchodu');
  if (!funding || !Number.isFinite(funding.investorFraction)) throw new Error('Chybí potvrzené financování vozidla');
  const investorFraction = funding.investorFraction;
  if (investorFraction < 0 || investorFraction > 1) throw new Error('Neplatný podíl financování');
  if (profit < 0) {
    const investor = roundMoney(profit * investorFraction);
    return { investor, helper: 0, owner: roundMoney(profit - investor), total: roundMoney(profit) };
  }
  const investor = roundMoney(profit * investorFraction * funding.investorProfitPercent / 100);
  const helper = roundMoney(profit * funding.helperProfitPercent / 100);
  return { investor, helper, owner: roundMoney(profit - investor - helper), total: roundMoney(profit) };
}
/* Ledger movements are explicit, never inferred from VAT refunds or bank balances.
 * Investor profit credits increase investor claim, NOT physical bank cash.
 */
export function capitalLedger({ openingOwner = 0, openingInvestor = 0, events = [] }) {
  let owner = finite(openingOwner,'Počáteční vlastní kapitál');
  let investor = finite(openingInvestor,'Počáteční investorův kapitál');
  for (const e of events) {
    if (!['contribution','profit-credit','loss-debit','withdrawal'].includes(e.type)) throw new Error('Neznámý typ kapitálové události');
    nonnegative(e.amount, 'Částka události');
    if (!['owner','investor'].includes(e.party)) throw new Error('Neznámý vlastník kapitálu');
    const sign = ['contribution','profit-credit'].includes(e.type) ? 1 : -1;
    if (e.party === 'owner') owner = roundMoney(owner + sign * e.amount);
    else investor = roundMoney(investor + sign * e.amount);
  }
  return { owner, investor, total: roundMoney(owner + investor) };
}
export function vatMonth({ purchases = [], sales = [], costs = [], settlements = [] }) {
  // Inputs must be validated *eligible VAT amounts*, not invoice gross amounts.
  const add = (items,label) => items.reduce((sum,n) => roundMoney(sum + nonnegative(n,label)),0);
  const input = roundMoney(add(purchases,'DPH z nákupů') + add(costs,'DPH z nákladů'));
  const output = add(sales,'DPH z prodejů');
  const netDue = roundMoney(output - input);
  const settled = settlements.reduce((sum,n)=>roundMoney(sum + finite(n,'Úhrada DPH')),0);
  return { input, output, netDue, settled, outstanding: roundMoney(netDue - settled) };
}
