export interface ActPlan {
  id: string;
  rows: { packageId: string; performerId: string; agreedPay: number }[];
  notes: string;
}
