import { formatINR } from '../../shared/reconMap';

type Bucket = { count: number; amountPaise: string };
type Props = {
  summary?: {
    finalized: boolean;
    totals: Bucket;
    breakdown: {
      matched: Bucket;
      unmatchedPg: Bucket;
      unmatchedBank: Bucket;
      exceptions: Bucket;
    };
  };
  // optional preview fallback if summary empty
  preview?: { 
    totals: Bucket; 
    matched: number; 
    unmatchedPg: number; 
    unmatchedBank: number; 
    exceptions: number; 
  };
  onDrill: (key: 'all' | 'matched' | 'unmatched' | 'exceptions') => void;
};

export default function ManualUploadTiles({ summary, preview, onDrill }: Props) {
  // Prefer finalized/summary; otherwise derive from preview counters
  const s = summary;
  const showPreview = !s?.finalized && !s?.totals?.count;

  const matchedCount = s?.breakdown?.matched?.count ?? preview?.matched ?? 0;
  const unmatchedPg = s?.breakdown?.unmatchedPg?.count ?? preview?.unmatchedPg ?? 0;
  const unmatchedBank = s?.breakdown?.unmatchedBank?.count ?? preview?.unmatchedBank ?? 0;
  const exceptions = s?.breakdown?.exceptions?.count ?? preview?.exceptions ?? 0;
  const unmatchedCount = unmatchedPg + unmatchedBank;
  const totalCount = s?.totals?.count ?? (matchedCount + unmatchedCount + exceptions);

  const totalsAmount = s?.totals?.amountPaise ?? preview?.totals?.amountPaise ?? '0';
  const matchedAmount = s?.breakdown?.matched?.amountPaise ?? '0';
  const unmatchedAmt = ((BigInt(s?.breakdown?.unmatchedPg?.amountPaise ?? '0') +
    BigInt(s?.breakdown?.unmatchedBank?.amountPaise ?? '0'))).toString();
  const exceptionsAmt = s?.breakdown?.exceptions?.amountPaise ?? '0';

  return (
    <div className="space-y-2" data-testid="mu-tiles">
      {showPreview && (
        <div className="text-amber-800 bg-amber-50 rounded-md px-3 py-1 inline-flex items-center gap-2" data-testid="mu-preview-banner">
          <span>Preview Mode — Results not persisted</span>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-4 sm:grid-cols-2 grid-cols-1">
        {/* TOTAL */}
        <button 
          onClick={() => onDrill('all')} 
          className="rounded-2xl border p-4 text-left hover:bg-slate-50 transition-colors" 
          data-testid="tile-total"
        >
          <div className="text-xs text-gray-500 uppercase tracking-wider">TOTAL</div>
          <div className="mt-1 text-3xl font-semibold">{totalCount}</div>
          <div className="text-xs text-gray-500">{formatINR(totalsAmount)}</div>
        </button>

        {/* MATCHED */}
        <button 
          onClick={() => onDrill('matched')} 
          className="rounded-2xl border p-4 text-left hover:bg-emerald-50 transition-colors" 
          data-testid="tile-matched"
        >
          <div className="text-xs text-gray-500 uppercase tracking-wider">MATCHED</div>
          <div className="mt-1 text-3xl font-semibold text-emerald-700">{matchedCount}</div>
          <div className="text-xs text-gray-500">{formatINR(matchedAmount)}</div>
        </button>

        {/* UNMATCHED (PG + BANK) */}
        <button 
          onClick={() => onDrill('unmatched')} 
          className="rounded-2xl border p-4 text-left hover:bg-amber-50 transition-colors" 
          data-testid="tile-unmatched"
        >
          <div className="text-xs text-gray-500 uppercase tracking-wider">UNMATCHED</div>
          <div className="mt-1 text-3xl font-semibold text-amber-600">{unmatchedCount}</div>
          <div className="text-xs text-gray-500">{formatINR(unmatchedAmt)}</div>
          <div className="mt-2 flex gap-2 text-[10px]">
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">PG {unmatchedPg}</span>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">Bank {unmatchedBank}</span>
          </div>
        </button>

        {/* EXCEPTIONS */}
        <button 
          onClick={() => onDrill('exceptions')} 
          className="rounded-2xl border p-4 text-left hover:bg-rose-50 transition-colors" 
          data-testid="tile-exceptions"
        >
          <div className="text-xs text-gray-500 uppercase tracking-wider">EXCEPTIONS</div>
          <div className="mt-1 text-3xl font-semibold text-rose-600">{exceptions}</div>
          <div className="text-xs text-gray-500">{formatINR(exceptionsAmt)}</div>
        </button>
      </div>
    </div>
  );
}