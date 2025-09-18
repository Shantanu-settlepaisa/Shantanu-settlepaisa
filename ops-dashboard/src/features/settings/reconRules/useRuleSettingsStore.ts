import { create } from 'zustand';
import { ReconRule, SimulationResult } from './types';

interface RuleSettingsStore {
  // State
  selectedRuleId: string | null;
  selectedRule: ReconRule | null;
  editBuffer: ReconRule | null;
  isEditing: boolean;
  simulationResult: SimulationResult | null;
  
  // Actions
  selectRule: (rule: ReconRule) => void;
  clearSelection: () => void;
  startEditing: () => void;
  updateEditBuffer: (updates: Partial<ReconRule>) => void;
  cancelEditing: () => void;
  saveEditing: (savedRule: ReconRule) => void;
  setSimulationResult: (result: SimulationResult | null) => void;
}

export const useRuleSettingsStore = create<RuleSettingsStore>((set) => ({
  // Initial state
  selectedRuleId: null,
  selectedRule: null,
  editBuffer: null,
  isEditing: false,
  simulationResult: null,

  // Actions
  selectRule: (rule) => set({
    selectedRuleId: rule.id,
    selectedRule: rule,
    editBuffer: null,
    isEditing: false,
    simulationResult: null
  }),

  clearSelection: () => set({
    selectedRuleId: null,
    selectedRule: null,
    editBuffer: null,
    isEditing: false,
    simulationResult: null
  }),

  startEditing: () => set((state) => ({
    isEditing: true,
    editBuffer: state.selectedRule ? { ...state.selectedRule } : null
  })),

  updateEditBuffer: (updates) => set((state) => ({
    editBuffer: state.editBuffer ? { ...state.editBuffer, ...updates } : null
  })),

  cancelEditing: () => set((state) => ({
    isEditing: false,
    editBuffer: null
  })),

  saveEditing: (savedRule) => set({
    selectedRule: savedRule,
    editBuffer: null,
    isEditing: false
  }),

  setSimulationResult: (result) => set({ simulationResult: result })
}));