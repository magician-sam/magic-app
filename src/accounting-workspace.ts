import { accountingBalances } from './accounting.js';
import type { Dashboard } from './models.js';
import type { reportPeriod } from './reports.js';

let selected = 'desk';
let selectedUser = '';
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function mountAccounting(root: Element, state: Dashboard, report: ReturnType<typeof reportPeriod>, format: (value:number)=>string, open: (id:string)=>void) {
  if (selectedUser !== state.user.id) { selected = 'desk'; selectedUser = state.user.id; }
  const balances=accountingBalances(report.events,state.money,state.actPlans);
  const event=(id:string,name:string)=>`<button class="link" data-accounting-event="${escape(id)}">${escape(name)}</button>`;
  const table=(heads:string[],rows:string[])=>`<div class="table-wrap"><table><thead><tr>${heads.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>${rows.length?'':'<p class="muted">No records in this selection.</p>'}</div>`;
  const summary=document.createElement('section');summary.className='accounting-overview';summary.dataset.accounting='overview';
  summary.innerHTML=`<div class="accounting-heading"><span class="eyebrow">Your business, in balance</span><h2>Accounting overview</h2><p>Track cash, customer balances and artist commitments.</p></div><div class="accounting-cards">${[
    ['Customer balances',balances.customerBalance,'Confirmed/completed events · lifetime payments','customers'],
    ['Artist balances',balances.artistBalance,'Recorded agreed fees less recorded artist expenses','artists'],
    ['Net cash recorded',report.cashAfterExpenses,'Selected transaction dates · after refunds and expenses','transactions'],
    ['Customer credits',balances.credits.reduce((n,row)=>n-row.balance,0),'Overpayments to review · no automatic refund','customers'],
  ].map(([title,value,hint,target])=>`<button class="accounting-card" data-accounting-go="${target}"><span>${title}</span><strong>${format(Number(value))}</strong><small>${hint}</small><b aria-hidden="true">↗</b></button>`).join('')}</div><section class="panel"><h3>Financial review</h3><p>${balances.review.length} unconfirmed or cancelled events have recorded money. Review their agreements, costs and refunds before settling.</p>${balances.review.map(row=>`<div class="row"><div>${event(row.booking.id,row.booking.name)}<p>${escape(row.booking.status)} · Net payments ${format(row.collected)} · Costs ${format(row.expenses)}</p></div></div>`).join('')}<p class="muted">Balances use events within the selected event dates. Cash uses transaction dates. Payment due dates are not recorded yet; an event date does not mean a balance is overdue.</p></section>`;
  const customers=document.createElement('section');customers.className='panel';customers.dataset.accounting='customers';
  customers.innerHTML=`<h2>Customer balances</h2><p>Confirmed and completed events with an accepted quote. Lifetime payments and refunds are included.</p>${table(['Event / customer','Event date','Agreed','Net paid','Remaining'],balances.receivables.map(row=>`<tr><td>${event(row.booking.id,row.booking.name)}<small class="accounting-customer">${escape(state.customers.find(c=>c.id===row.booking.customerId)?.name??'Customer')}</small></td><td>${escape(row.booking.date)}</td><td>${format(row.agreed)}</td><td>${format(row.collected)}</td><td><strong>${format(row.balance)}</strong></td></tr>`))}<h3>Credits to review</h3>${table(['Event','Credit'],balances.credits.map(row=>`<tr><td>${event(row.booking.id,row.booking.name)}</td><td>${format(-row.balance)}</td></tr>`))}`;
  const costs=document.createElement('section');costs.className='panel';costs.dataset.accounting='costs';
  const categories=new Map<string,number>();for(const entry of report.transactions)if(entry.kind==='expense')categories.set(entry.category||'Uncategorised',(categories.get(entry.category||'Uncategorised')??0)+entry.amount);
  costs.innerHTML=`<h2>Costs by category</h2><p>Recorded expenses within the selected transaction dates.</p>${table(['Category','Total'],[...categories].sort((a,b)=>b[1]-a[1]).map(([category,total])=>`<tr><td>${escape(category)}</td><td>${format(total)}</td></tr>`))}<p class="muted">Record fuel, transport, supplies and other costs against the event through Record payment / cost.</p>`;
  const artistBalances=document.createElement('section');artistBalances.className='panel';artistBalances.dataset.accounting='artists';
  artistBalances.innerHTML=`<h2>Artist balances by event</h2><p>Confirmed/completed events only. Negative balances indicate an advance or overpayment to review. Cancelled/unconfirmed commitments require separate agreement review.</p>${table(['Artist / event','Agreed','Paid','Balance'],balances.artistPay.map(row=>`<tr><td>${escape(state.performers.find(p=>p.id===row.performerId)?.name??'Artist')}<br>${event(row.booking.id,row.booking.name)}</td><td>${format(row.agreed)}</td><td>${format(row.paid)}</td><td>${format(row.balance)}</td></tr>`))}`;
  root.append(summary,customers,costs,artistBalances);
  const tabs=document.createElement('nav');tabs.className='accounting-tabs';tabs.setAttribute('aria-label','Accounting sections');
  const reports=document.createElement('details');reports.className='accounting-legacy';reports.innerHTML='<summary>Event reports & history</summary><div class="accounting-legacy-options"></div>';
  const panels=[...root.querySelectorAll<HTMLElement>('[data-accounting]')];
  const choices=[['desk','Finance desk'],['overview','Event balances'],['customers','Customer balances'],['artists','Artist pay'],['transactions','Event cash history'],['costs','Cost categories'],['margins','Event margins'],['insights','Marketing insights']];
  const available=choices.filter(([key])=>panels.some(panel=>panel.dataset.accounting===key));
  const select=(key:string)=>{selected=key;reports.open=key!=='desk';const period=root.querySelector<HTMLElement>('[data-report-period]');if(period)period.hidden=key==='desk';panels.forEach(panel=>panel.hidden=panel.dataset.accounting!==key);tabs.querySelectorAll<HTMLButtonElement>('button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.section===key)));};
  for(const [key,label]of available){const button=document.createElement('button');button.type='button';button.dataset.section=key;button.textContent=label;button.addEventListener('click',()=>select(key));if(key==='desk')tabs.append(button);else reports.querySelector('div')!.append(button);}
  tabs.append(reports);
  root.querySelector('[data-report-period]')?.after(tabs);
  root.querySelectorAll<HTMLButtonElement>('[data-accounting-go]').forEach(button=>button.addEventListener('click',()=>select(button.dataset.accountingGo!)));
  root.querySelectorAll<HTMLButtonElement>('[data-accounting-event]').forEach(button=>button.addEventListener('click',()=>open(button.dataset.accountingEvent!)));
  select(available.some(([key])=>key===selected)?selected:'overview');
}
