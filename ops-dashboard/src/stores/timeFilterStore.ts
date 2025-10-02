import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface TimeFilter {
  from: string;
  to: string;
  label: string;
}

interface TimeFilterStore {
  filter: TimeFilter;
  setFilter: (filter: TimeFilter) => void;
  resetToDefault: () => void;
}

// Helper to get date strings
const getDateString = (daysAgo: number) => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().split('T')[0];
};

const defaultFilter: TimeFilter = {
  from: getDateString(7),
  to: getDateString(0),
  label: 'Last 7 Days'
};

export const useTimeFilterStore = create<TimeFilterStore>()(
  persist(
    (set, get) => ({
      filter: defaultFilter,
      setFilter: (filter) => set({ filter }),
      resetToDefault: () => set({ filter: defaultFilter }),
    }),
    {
      name: 'time-filter-storage',
      // Custom merge to recalculate dates on hydration
      merge: (persistedState, currentState) => {
        const persisted = persistedState as TimeFilterStore;
        // If persisted filter exists, recalculate dates based on label
        if (persisted?.filter?.label) {
          const preset = TIME_RANGES.find(r => r.label === persisted.filter.label);
          if (preset) {
            return {
              ...currentState,
              filter: preset, // Use recalculated dates
            };
          }
        }
        return { ...currentState, ...persistedState };
      },
    }
  )
);

// Preset time ranges
export const TIME_RANGES = [
  { label: 'Today', from: getDateString(0), to: getDateString(0) },
  { label: 'Last 2 Days', from: getDateString(1), to: getDateString(0) },
  { label: 'Last 7 Days', from: getDateString(7), to: getDateString(0) },
  { label: 'Last 14 Days', from: getDateString(14), to: getDateString(0) },
  { label: 'Last 30 Days', from: getDateString(30), to: getDateString(0) },
  { label: 'Last 45 Days', from: getDateString(45), to: getDateString(0) },
];