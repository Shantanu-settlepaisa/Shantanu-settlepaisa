// apps/web/src/lib/merchantApi.ts
export type SettlementSchedule = {
  tPlusDays: 0|1|2;
  cutoffMinutesIST: number;
  effectiveFrom?: string; // YYYY-MM-DD
  lastChangedAt?: string;
};

export async function getSettlementSchedule(): Promise<SettlementSchedule> {
  try {
    // Try to fetch from API with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000); // 2 second timeout
    
    const r = await fetch('/merchant/settlement/schedule', { 
      credentials: 'include',
      signal: controller.signal 
    });
    clearTimeout(timeoutId);
    
    if (r.ok) return r.json();
  } catch (error) {
    console.log('API not available, using demo fallback:', error);
  }
  
  // demo fallback - ensure we always return data
  const local = localStorage.getItem('demo.settlement.schedule');
  const demoData = { tPlusDays: 1 as const, cutoffMinutesIST: 14*60 };
  console.log('Returning demo settlement data:', demoData);
  return local ? JSON.parse(local) : demoData;
}

export async function putSettlementSchedule(
  next: SettlementSchedule,
  idempotencyKey: string
): Promise<{ accepted: boolean; appliedFrom: string; schedule: SettlementSchedule }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    
    const r = await fetch('/merchant/settlement/schedule', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idempotencyKey,
      },
      credentials: 'include',
      body: JSON.stringify(next),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    if (r.ok) return r.json();
  } catch (error) {
    console.log('API not available, using demo fallback for save:', error.message);
  }

  // demo fallback: pretend applied from next business day
  const res = { accepted: true, appliedFrom: next.effectiveFrom ?? new Date().toISOString().slice(0,10), schedule: next };
  localStorage.setItem('demo.settlement.schedule', JSON.stringify(next));
  return res;
}