// apps/web/src/lib/merchant/settlementSchedule.ts
import { addDays, format } from 'date-fns';
// Simplified timezone handling for demo - in production use proper timezone library

export const IST = 'Asia/Kolkata';
export const HOLIDAYS: string[] = []; // YYYY-MM-DD strings; keep empty in demo

export type WindowInfo = {
  label: 'previous'|'current'|'next';
  captureStartISO: string;
  captureEndISO: string;   // cutoff instant
  cutoffTimeLabel: string; // e.g., "02:00 PM IST"
  autoSettlementISO: string;
  bankCreditEtaISO: string;
};

export function isHoliday(isoDateYMD: string) {
  return HOLIDAYS.includes(isoDateYMD);
}

export function nextBusinessDay(dateYMD: string): string {
  // dateYMD is YYYY-MM-DD in IST
  let d = new Date(`${dateYMD}T00:00:00`);
  d = addDays(d, 1);
  
  while (true) {
    const ymd = format(d, 'yyyy-MM-dd');
    const dow = d.getDay(); // 0 Sun ... 6 Sat
    if (dow !== 0 && dow !== 6 && !isHoliday(ymd)) return ymd;
    d = addDays(d, 1);
  }
}

export function minutesToLabelIST(mins: number) {
  const h = Math.floor(mins/60);
  const m = mins % 60;
  const dt = new Date(2000, 0, 1, h, m);
  return format(dt, 'hh:mm a') + ' IST';
}

/** Compute previous/current/next windows given "now", schedule */
export function computeWindows(nowISO: string, schedule: { tPlusDays: 0|1|2, cutoffMinutesIST: number }): WindowInfo[] {
  // Simplified demo - treat dates as IST for now
  const now = new Date(nowISO);
  const todayYMD = format(now, 'yyyy-MM-dd');

  function cutoffInstant(ymd: string) {
    const [y,mm,dd] = ymd.split('-').map(Number);
    const local = new Date(y, mm-1, dd);
    local.setHours(Math.floor(schedule.cutoffMinutesIST/60), schedule.cutoffMinutesIST%60, 0, 0);
    return local.toISOString();
  }

  // Find the most recent cutoff ≤ now
  const todayCutoffISO = cutoffInstant(todayYMD);
  const nowUTC = new Date(nowISO).toISOString();
  const prevCutoffISO = (nowUTC >= todayCutoffISO) ? todayCutoffISO : cutoffInstant(format(addDays(now, -1), 'yyyy-MM-dd'));
  const nextCutoffISO = (nowUTC >= todayCutoffISO) ? cutoffInstant(format(addDays(now, 1), 'yyyy-MM-dd')) : todayCutoffISO;

  // capture windows
  const prevStartISO = cutoffInstant(format(addDays(new Date(prevCutoffISO), -1), 'yyyy-MM-dd'));
  const currStartISO = prevCutoffISO;
  const currEndISO = nextCutoffISO;

  function bankEta(ymd: string) {
    // next business day (+ tPlusDays)
    let d = ymd;
    for (let i=0; i<1 + schedule.tPlusDays; i++) d = nextBusinessDay(d);
    // 2:00 PM IST demo
    const [y,mm,dd] = d.split('-').map(Number);
    const local = new Date(y,mm-1,dd,14,0,0);
    return local.toISOString();
  }

  const prevWindow: WindowInfo = {
    label: 'previous',
    captureStartISO: prevStartISO,
    captureEndISO: prevCutoffISO,
    cutoffTimeLabel: minutesToLabelIST(schedule.cutoffMinutesIST),
    autoSettlementISO: prevCutoffISO,
    bankCreditEtaISO: bankEta(format(new Date(prevCutoffISO), 'yyyy-MM-dd')),
  };

  const currWindow: WindowInfo = {
    label: 'current',
    captureStartISO: currStartISO,
    captureEndISO: currEndISO,
    cutoffTimeLabel: minutesToLabelIST(schedule.cutoffMinutesIST),
    autoSettlementISO: currEndISO,
    bankCreditEtaISO: bankEta(format(new Date(currEndISO), 'yyyy-MM-dd')),
  };

  const nextWindow: WindowInfo = {
    label: 'next',
    captureStartISO: currEndISO,
    captureEndISO: cutoffInstant(format(addDays(new Date(currEndISO), 1), 'yyyy-MM-dd')),
    cutoffTimeLabel: minutesToLabelIST(schedule.cutoffMinutesIST),
    autoSettlementISO: cutoffInstant(format(addDays(new Date(currEndISO), 1), 'yyyy-MM-dd')),
    bankCreditEtaISO: bankEta(format(new Date(currEndISO), 'yyyy-MM-dd')),
  };

  return [prevWindow, currWindow, nextWindow];
}