import React, { useEffect, useState } from 'react';
import { X, Clock, CheckCircle, AlertCircle, XCircle, FileText, Send, Server } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface TimelineEvent {
  type: string;
  reason?: string;
  detail: string;
  at: string;
  meta?: {
    expectedByIST?: string;
    bank?: string;
    [key: string]: any;
  };
}

interface TimelineDrawerProps {
  open: boolean;
  onClose: () => void;
  settlementId: string | null;
  settlementAmount?: number;
  settlementStatus?: string;
}

const eventIcons: Record<string, React.ReactNode> = {
  'INITIATED': <Clock className="w-4 h-4" />,
  'BATCHED': <FileText className="w-4 h-4" />,
  'FILE_DISPATCHED': <Send className="w-4 h-4" />,
  'BANK_FILE_AWAITED': <Clock className="w-4 h-4" />,
  'BANK_FILE_RECEIVED': <FileText className="w-4 h-4" />,
  'RECONCILED': <CheckCircle className="w-4 h-4" />,
  'NETTING_DONE': <Server className="w-4 h-4" />,
  'UTR_ASSIGNED': <FileText className="w-4 h-4" />,
  'SETTLED': <CheckCircle className="w-4 h-4" />,
  'FAILED': <XCircle className="w-4 h-4" />,
  'ON_HOLD': <AlertCircle className="w-4 h-4" />
};

const eventColors: Record<string, string> = {
  'INITIATED': 'text-blue-600',
  'BATCHED': 'text-blue-600',
  'FILE_DISPATCHED': 'text-blue-600',
  'BANK_FILE_AWAITED': 'text-yellow-600',
  'BANK_FILE_RECEIVED': 'text-blue-600',
  'RECONCILED': 'text-green-600',
  'NETTING_DONE': 'text-blue-600',
  'UTR_ASSIGNED': 'text-green-600',
  'SETTLED': 'text-green-600',
  'FAILED': 'text-red-600',
  'ON_HOLD': 'text-yellow-600'
};

const reasonExplanations: Record<string, string> = {
  'AFTER_CUTOFF': 'Transaction received after daily cutoff time',
  'BANK_DELAY': 'Bank processing is delayed',
  'AWAITING_BANK_FILE': 'Waiting for bank confirmation file',
  'RECON_MISMATCH': 'Reconciliation mismatch detected',
  'AMOUNT_MISMATCH': 'Amount mismatch between systems',
  'ON_HOLD_COMPLIANCE': 'On hold for compliance review',
  'ON_HOLD_RISK': 'On hold for risk assessment',
  'TECHNICAL_RETRY': 'Technical issue, will retry'
};

export function TimelineDrawer({ open, onClose, settlementId, settlementAmount, settlementStatus }: TimelineDrawerProps) {
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && settlementId) {
      setLoading(true);
      // Fetch timeline events
      fetch(`/v1/merchant/settlements/${settlementId}/timeline`)
        .then(res => res.json())
        .then(data => {
          setTimeline(data.events || []);
          setLoading(false);
        })
        .catch(error => {
          console.error('Failed to fetch timeline:', error);
          setLoading(false);
        });
    }
  }, [open, settlementId]);

  if (!open) return null;

  const currentEvent = timeline[timeline.length - 1];
  const isProcessing = settlementStatus === 'PROCESSING' && currentEvent?.reason === 'AWAITING_BANK_FILE';

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      
      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full md:w-[480px] bg-white shadow-xl z-50 flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Settlement Timeline</h2>
              <p className="text-sm text-gray-500 mt-1">
                ID: {settlementId?.slice(0, 20)}...
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Processing Status Alert */}
        {isProcessing && currentEvent?.meta?.expectedByIST && (
          <div className="mx-6 mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-start space-x-3">
              <Clock className="w-5 h-5 text-yellow-600 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-yellow-900">
                  Settlement In Progress
                </p>
                <p className="text-sm text-yellow-700 mt-1">
                  {reasonExplanations[currentEvent.reason || ''] || currentEvent.detail}
                </p>
                <div className="mt-2 text-sm">
                  <span className="text-yellow-900 font-medium">Expected by: </span>
                  <span className="text-yellow-700">
                    {new Date(currentEvent.meta.expectedByIST).toLocaleString('en-IN', {
                      timeZone: 'Asia/Kolkata',
                      dateStyle: 'medium',
                      timeStyle: 'short'
                    })} IST
                  </span>
                </div>
                {currentEvent.meta.bank && (
                  <div className="mt-1 text-sm">
                    <span className="text-yellow-900 font-medium">Bank: </span>
                    <span className="text-yellow-700">{currentEvent.meta.bank}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : (
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />
              
              {/* Timeline events */}
              <div className="space-y-6">
                {timeline.map((event, index) => {
                  const isLast = index === timeline.length - 1;
                  const color = eventColors[event.type] || 'text-gray-600';
                  
                  return (
                    <div key={index} className="relative flex items-start">
                      {/* Icon */}
                      <div className={`relative z-10 flex items-center justify-center w-8 h-8 bg-white border-2 rounded-full ${color} border-current`}>
                        {eventIcons[event.type] || <Clock className="w-4 h-4" />}
                      </div>
                      
                      {/* Content */}
                      <div className="ml-4 flex-1">
                        <div className={`font-medium ${color}`}>
                          {event.type.replace(/_/g, ' ')}
                        </div>
                        <p className="text-sm text-gray-600 mt-1">
                          {event.detail}
                        </p>
                        {event.reason && (
                          <div className="mt-2 p-2 bg-gray-50 rounded text-xs text-gray-600">
                            <span className="font-medium">Reason: </span>
                            {reasonExplanations[event.reason] || event.reason}
                          </div>
                        )}
                        <p className="text-xs text-gray-400 mt-2">
                          {new Date(event.at).toLocaleString('en-IN', {
                            dateStyle: 'medium',
                            timeStyle: 'short'
                          })}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Settlement Amount</p>
              <p className="text-lg font-semibold text-gray-900">
                {settlementAmount ? formatCurrency(settlementAmount) : '-'}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">Status</p>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                settlementStatus === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                settlementStatus === 'PROCESSING' ? 'bg-yellow-100 text-yellow-800' :
                settlementStatus === 'FAILED' ? 'bg-red-100 text-red-800' :
                'bg-gray-100 text-gray-800'
              }`}>
                {settlementStatus}
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}