import { SettlementCycle } from '@/types/settlementCycle';

function iso(d: Date): string { 
  return d.toISOString(); 
}

function addDays(d: Date, n: number): Date { 
  const t = new Date(d); 
  t.setUTCDate(t.getUTCDate() + n); 
  return t; 
}

export async function getSettlementCycle(): Promise<SettlementCycle> {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 300));
  
  // In prod, fetch from real service; here provide safe demo defaults
  const now = new Date(); // UTC
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  
  // 2pm IST is 08:30 UTC, round to 08:00 for demo
  const todayCutoff = new Date(today);
  todayCutoff.setUTCHours(8, 30, 0, 0);
  
  const prevCutoff = addDays(todayCutoff, -1);
  const nextCutoff = addDays(todayCutoff, 1);

  const dto: SettlementCycle = {
    merchantId: 'demo-merchant',
    acquirer: 'ALL',
    slaHours: 24,
    definition: 'T+1; 2:00 PM IST cutoff; bank credit next business day',
    windows: {
      previous: {
        label: 'previous',
        captureStart: iso(addDays(prevCutoff, -1)),
        captureEnd: iso(prevCutoff),
        cutoffLocal: '02:00 PM IST',
        tz: 'Asia/Kolkata',
        nettingRule: 'T+1',
        autoSettlementAt: iso(prevCutoff),
        payoutLagDays: 1,
        bankCreditETA: iso(addDays(prevCutoff, 1)),
      },
      current: {
        label: 'current',
        captureStart: iso(prevCutoff),
        captureEnd: iso(todayCutoff),
        cutoffLocal: '02:00 PM IST',
        tz: 'Asia/Kolkata',
        nettingRule: 'T+1',
        autoSettlementAt: iso(todayCutoff),
        payoutLagDays: 1,
        bankCreditETA: iso(addDays(todayCutoff, 1)),
      },
      next: {
        label: 'next',
        captureStart: iso(todayCutoff),
        captureEnd: iso(nextCutoff),
        cutoffLocal: '02:00 PM IST',
        tz: 'Asia/Kolkata',
        nettingRule: 'T+1',
        autoSettlementAt: iso(nextCutoff),
        payoutLagDays: 1,
        bankCreditETA: iso(addDays(nextCutoff, 1)),
      }
    }
  };

  return dto;
}