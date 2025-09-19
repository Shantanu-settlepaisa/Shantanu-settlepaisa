// apps/web/src/lib/merchant/__tests__/settlementSchedule.spec.ts
import { describe, it, expect } from 'vitest';
import { minutesToLabelIST, nextBusinessDay, computeWindows } from '../settlementSchedule';

describe('settlementSchedule', () => {
  describe('minutesToLabelIST', () => {
    it('converts minutes to IST time label', () => {
      expect(minutesToLabelIST(14 * 60)).toBe('02:00 PM IST');
      expect(minutesToLabelIST(9 * 60)).toBe('09:00 AM IST');
      expect(minutesToLabelIST(0)).toBe('12:00 AM IST');
      expect(minutesToLabelIST(23 * 60 + 30)).toBe('11:30 PM IST');
    });
  });

  describe('nextBusinessDay', () => {
    it('skips weekends', () => {
      // Friday -> Monday
      expect(nextBusinessDay('2024-03-01')).toBe('2024-03-04'); // Fri -> Mon
      // Saturday -> Monday
      expect(nextBusinessDay('2024-03-02')).toBe('2024-03-04'); // Sat -> Mon
      // Sunday -> Monday  
      expect(nextBusinessDay('2024-03-03')).toBe('2024-03-04'); // Sun -> Mon
      // Monday -> Tuesday
      expect(nextBusinessDay('2024-03-04')).toBe('2024-03-05'); // Mon -> Tue
    });
  });

  describe('computeWindows', () => {
    const schedule = { tPlusDays: 1 as const, cutoffMinutesIST: 14 * 60 };
    
    it('produces ordered previous/current/next windows', () => {
      const nowISO = '2024-03-04T10:00:00Z'; // Monday morning
      const windows = computeWindows(nowISO, schedule);
      
      expect(windows).toHaveLength(3);
      expect(windows[0].label).toBe('previous');
      expect(windows[1].label).toBe('current');
      expect(windows[2].label).toBe('next');
      
      // All should have same cutoff time label
      windows.forEach(w => {
        expect(w.cutoffTimeLabel).toBe('02:00 PM IST');
      });
    });

    it('shifts ETA with tPlusDays', () => {
      const nowISO = '2024-03-04T10:00:00Z';
      
      // T+0
      const t0Windows = computeWindows(nowISO, { tPlusDays: 0, cutoffMinutesIST: 14 * 60 });
      // T+1 
      const t1Windows = computeWindows(nowISO, { tPlusDays: 1, cutoffMinutesIST: 14 * 60 });
      // T+2
      const t2Windows = computeWindows(nowISO, { tPlusDays: 2, cutoffMinutesIST: 14 * 60 });
      
      // Bank credit ETA should be progressively later
      const t0Eta = new Date(t0Windows[1].bankCreditEtaISO);
      const t1Eta = new Date(t1Windows[1].bankCreditEtaISO);
      const t2Eta = new Date(t2Windows[1].bankCreditEtaISO);
      
      expect(t0Eta < t1Eta).toBe(true);
      expect(t1Eta < t2Eta).toBe(true);
    });
  });
});