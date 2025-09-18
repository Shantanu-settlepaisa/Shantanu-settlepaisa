import axios from 'axios';
import { ReconRule, SimulationResult } from './types';

const API_BASE = 'http://localhost:5105/api/recon-rules';

export const reconRulesApi = {
  // List rules with filters
  async listRules(params?: {
    scope?: string;
    status?: string;
    q?: string;
    page?: number;
    pageSize?: number;
  }) {
    const response = await axios.get<{
      rules: ReconRule[];
      total: number;
      page: number;
      pageSize: number;
    }>(`${API_BASE}/rules`, { params });
    return response.data;
  },

  // Get single rule
  async getRule(id: string) {
    const response = await axios.get<ReconRule>(`${API_BASE}/rules/${id}`);
    return response.data;
  },

  // Create new rule
  async createRule(rule: Omit<ReconRule, 'id' | 'version' | 'updatedAt'>) {
    const response = await axios.post<ReconRule>(`${API_BASE}/rules`, rule);
    return response.data;
  },

  // Update existing rule
  async updateRule(id: string, rule: Partial<ReconRule>) {
    const response = await axios.put<ReconRule>(`${API_BASE}/rules/${id}`, rule);
    return response.data;
  },

  // Duplicate rule
  async duplicateRule(id: string) {
    const response = await axios.post<ReconRule>(`${API_BASE}/rules/${id}/duplicate`);
    return response.data;
  },

  // Simulate rule
  async simulateRule(id: string) {
    const response = await axios.post<SimulationResult>(`${API_BASE}/rules/${id}/simulate`);
    return response.data;
  },

  // Publish rule (optional)
  async publishRule(id: string, status: ReconRule['status']) {
    const response = await axios.post<ReconRule>(`${API_BASE}/rules/${id}/publish`, { status });
    return response.data;
  }
};