import type { Booking, MoneyEntry } from './models.js';
import type { ActPlan } from './act-plans.js';

/** Event commitments use lifetime transactions, independently of cash-report dates.
 * Unconfirmed/cancelled work is a review item, never an automatic receivable. */
export function accountingBalances(bookings: Booking[], entries: MoneyEntry[], plans: ActPlan[] = []) {
  const rows = bookings.map(booking => {
    const quote = booking.quotes.find(q => q.id === booking.acceptedQuoteId);
    const transactions = entries.filter(m => m.bookingId === booking.id);
    const collected = transactions.reduce((n,m) => n + (m.kind === 'payment' ? m.amount : m.kind === 'refund' ? -m.amount : 0),0);
    const expenses = transactions.filter(m => m.kind === 'expense').reduce((n,m) => n + m.amount,0);
    const committed = ['confirmed','completed'].includes(booking.status) && !!quote;
    return { booking, agreed: quote?.amount ?? 0, collected, expenses, balance: (quote?.amount ?? 0)-collected, committed };
  });
  const receivables = rows.filter(row => row.committed && row.balance > 0);
  const credits = rows.filter(row => row.committed && row.balance < 0);
  const review = rows.filter(row => !row.committed && (row.collected !== 0 || row.expenses !== 0));
  const artistPay = rows.filter(row => row.committed).flatMap(({booking}) => {
    const plan = plans.find(p => p.id === booking.id);
    const ids = new Set([...(plan?.rows.map(row => row.performerId) ?? []),...entries.filter(m => m.bookingId === booking.id && m.kind === 'expense' && m.performerId).map(m => m.performerId!)]);
    return [...ids].filter(Boolean).map(performerId => {
      const agreed = plan?.rows.filter(row => row.performerId === performerId).reduce((n,row) => n+row.agreedPay,0) ?? 0;
      const paid = entries.filter(m => m.bookingId === booking.id && m.performerId === performerId && m.kind === 'expense').reduce((n,m) => n+m.amount,0);
      return {booking,performerId,agreed,paid,balance:agreed-paid};
    });
  });
  return {receivables,credits,review,artistPay,customerBalance:receivables.reduce((n,row)=>n+row.balance,0),artistBalance:artistPay.reduce((n,row)=>n+Math.max(0,row.balance),0)};
}
