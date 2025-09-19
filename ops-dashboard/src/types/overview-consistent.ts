// Consistent Overview Data Types

export interface OverviewWindow {
  from: string;
  to: string;
  tz: string;
  label: string;
}

export interface ReconRateTile {
  matched: number;
  total: number;
  pct: number;
  deltaPct?: number;
}

export interface UnmatchedValueTile {
  amount: number;
  txnCount: number;
  deltaPct?: number;
}

export interface OpenExceptionsTile {
  count: number;
  high: number;
  critical: number;
  deltaPct?: number;
}

export interface CreditedToMerchantTile {
  amount: number;
  txnCount: number;
  deltaPct?: number;
}

export interface OverviewTiles {
  reconRate: ReconRateTile;
  unmatchedValue: UnmatchedValueTile;
  openExceptions: OpenExceptionsTile;
  creditedToMerchant: CreditedToMerchantTile;
}

export interface PipelineRaw {
  inSettlement: number;
  sentToBank: number;
  creditedUtr: number;
}

export interface PipelineExclusive {
  inSettlementOnly: number;
  sentToBankOnly: number;
  credited: number;
  unsettled: number;
}

export interface PipelineWarning {
  code: string;
  message: string;
}

export interface OverviewPipeline {
  totalCaptured: number;
  raw: PipelineRaw;
  exclusive: PipelineExclusive;
  warnings: PipelineWarning[];
}

export interface SourceMetrics {
  matched: number;
  total: number;
  pct: number;
}

export interface OverviewBySource {
  manual: SourceMetrics;
  connector: SourceMetrics;
}

export interface TopReasonRow {
  reason: string;
  count: number;
  pct: number;
}

export interface OverviewTopReasons {
  mode: 'impacted' | 'occurrences';
  rows: TopReasonRow[];
  total: number;
  remainder?: number;
}

export interface OverviewConsistentData {
  window: OverviewWindow;
  tiles: OverviewTiles;
  pipeline: OverviewPipeline;
  bySource: OverviewBySource;
  topReasons: OverviewTopReasons;
  definitions: Record<string, string>;
}