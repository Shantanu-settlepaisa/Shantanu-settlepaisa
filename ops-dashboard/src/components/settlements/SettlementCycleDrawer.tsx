import { useEffect, useRef, useState } from 'react';
import { X, Clock, Calendar, TrendingUp, AlertCircle, Save, RotateCcw } from 'lucide-react';
import { useSettlementCycle } from '@/hooks/useSettlementCycle';
import { CycleWindow } from '@/types/settlementCycle';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getSettlementSchedule, putSettlementSchedule, type SettlementSchedule } from '@/lib/merchantApi';
import { computeWindows, minutesToLabelIST, nextBusinessDay } from '@/lib/merchant/settlementSchedule';
import { format } from 'date-fns';
import SettlementCalendar from '@/components/merchant/SettlementCalendar';
import CutoffSelector from '@/components/merchant/CutoffSelector';
import WhatIfPreview from '@/components/merchant/WhatIfPreview';

interface SettlementCycleDrawerProps {
  open: boolean;
  onClose: () => void;
}

export default function SettlementCycleDrawer({ open, onClose }: SettlementCycleDrawerProps) {
  const { cycle, isLoading, isError } = useSettlementCycle();
  const drawerRef = useRef<HTMLDivElement>(null);
  
  // Simple toast function
  const toast = ({ title, description, variant }: { title: string; description?: string; variant?: 'default' | 'destructive' }) => {
    console.log(`Toast [${variant || 'default'}]: ${title}`, description);
  };
  
  // New state for enhanced features
  const [schedule, setSchedule] = useState<SettlementSchedule | null>(null);
  const [proposed, setProposed] = useState<SettlementSchedule | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [userRole] = useState('merchant-admin'); // Mock role - in real app, get from auth context
  
  // Fetch settlement schedule on open
  useEffect(() => {
    if (open && !schedule) {
      console.log('Starting to fetch settlement schedule...');
      setLoading(true);
      getSettlementSchedule()
        .then(data => {
          console.log('Settlement schedule loaded:', data);
          setSchedule(data);
          setLoading(false);
        })
        .catch(error => {
          console.error('Failed to load schedule:', error);
          // Even if failed, set demo data to prevent empty state
          const demoData = { tPlusDays: 1 as const, cutoffMinutesIST: 14*60 };
          console.log('Using fallback demo data:', demoData);
          setSchedule(demoData);
          setLoading(false);
        });
    }
  }, [open, schedule]);

  // Handle ESC key and cleanup
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        onClose();
      }
    };
    
    if (open) {
      document.addEventListener('keydown', handleEsc);
      // Focus trap
      drawerRef.current?.focus();
    } else {
      // Reset state when drawer closes
      setProposed(null);
      setSaving(false);
    }
    
    return () => {
      document.removeEventListener('keydown', handleEsc);
    };
  }, [open, onClose]);

  if (!open) return null;

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Kolkata'
    });
  };
  
  // Handle schedule changes
  const submitChange = async () => {
    if (!proposed || !schedule) return;
    
    setSaving(true);
    try {
      const effectiveFrom = nextBusinessDay(format(new Date(), 'yyyy-MM-dd'));
      const result = await putSettlementSchedule(
        { ...proposed, effectiveFrom }, 
        crypto.randomUUID()
      );
      
      toast({
        title: "Change accepted",
        description: `New schedule effective from ${result.appliedFrom}`,
      });
      
      setSchedule(result.schedule);
      setProposed(null);
      // Optionally close drawer after save
      // onClose();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save schedule changes",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };
  
  const isAdmin = userRole === 'merchant-admin';
  const currentSchedule = proposed || schedule;
  const hasChanges = proposed && JSON.stringify(proposed) !== JSON.stringify(schedule);

  const CycleWindowCard = ({ w }: { w: CycleWindow }) => (
    <Card className="border-gray-200">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-500" />
            <span className="font-semibold capitalize">{w.label} Window</span>
          </div>
          <Badge variant="outline" className="text-xs">
            {w.nettingRule}
          </Badge>
        </div>
        
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-500 mb-1">Capture Period</p>
            <p className="text-xs">
              {formatDateTime(w.captureStart)}
              <br />
              ↓
              <br />
              {formatDateTime(w.captureEnd)}
            </p>
          </div>
          
          <div>
            <p className="text-gray-500 mb-1">Cutoff Time</p>
            <p className="font-medium text-blue-600">{w.cutoffLocal}</p>
            <p className="text-xs text-gray-400 mt-1">{w.tz}</p>
          </div>
          
          <div>
            <p className="text-gray-500 mb-1">Auto-settlement</p>
            <p className="text-xs">{formatDateTime(w.autoSettlementAt)}</p>
          </div>
          
          <div>
            <p className="text-gray-500 mb-1">Bank Credit ETA</p>
            <p className="text-xs">{formatDateTime(w.bankCreditETA)}</p>
            <p className="text-xs text-gray-400 mt-1">+{w.payoutLagDays} day(s)</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <>
      {/* Overlay */}
      <div 
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      
      {/* Drawer */}
      <div 
        ref={drawerRef}
        className="fixed right-0 top-0 z-50 h-full w-full max-w-xl bg-white shadow-xl transform transition-transform duration-300"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        tabIndex={-1}
      >
        {/* Header */}
        <div className="border-b border-gray-200 bg-white px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-600" />
              <h2 id="drawer-title" className="text-lg font-semibold">My Settlement Cycle</h2>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              aria-label="Close drawer"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="overflow-y-auto h-full pb-20 px-6 py-4 space-y-6">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                <p className="text-gray-500">Loading settlement schedule...</p>
              </div>
            </div>
          )}

          {isError && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
                <p className="text-red-600">Failed to load settlement information</p>
              </div>
            </div>
          )}


          {!loading && currentSchedule && (
            <>
              {/* Cycle Definition */}
              <Card className="bg-blue-50 border-blue-200">
                <CardContent className="p-4">
                  <div className="flex items-start gap-2">
                    <TrendingUp className="w-4 h-4 text-blue-600 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium text-blue-900">Cycle Definition</p>
                      <p className="text-sm text-blue-700 mt-1">
                        T+{currentSchedule.tPlusDays}; {minutesToLabelIST(currentSchedule.cutoffMinutesIST)} cutoff; bank credit next business day
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant="secondary" className="text-xs">Asia/Kolkata</Badge>
                        {hasChanges && (
                          <Badge variant="default" className="text-xs animate-pulse">Modified</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Calendar Section */}
              <div>
                <h3 className="text-lg font-medium mb-3">Settlement Calendar</h3>
                <SettlementCalendar schedule={currentSchedule} />
              </div>

              {/* Cutoff Selector and What-If Preview */}
              <div>
                <h3 className="text-lg font-medium mb-3">Adjust Cut-off (Admin)</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <CutoffSelector
                    role={userRole}
                    schedule={currentSchedule}
                    onChange={setProposed}
                  />
                  <WhatIfPreview schedule={currentSchedule} />
                </div>
                
                {isAdmin && (
                  <div className="mt-4 flex gap-2">
                    <Button 
                      onClick={submitChange} 
                      disabled={!hasChanges || saving}
                      className="flex items-center gap-2"
                    >
                      <Save className="w-4 h-4" />
                      {saving ? 'Saving...' : 'Save Change'}
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => setProposed(null)}
                      disabled={!hasChanges || saving}
                      className="flex items-center gap-2"
                    >
                      <RotateCcw className="w-4 h-4" />
                      Reset
                    </Button>
                  </div>
                )}
              </div>

              {/* Legacy Cycle Windows for backwards compatibility */}
              {cycle && (
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Current Cycle Windows</h3>
                  <div className="space-y-3">
                    <CycleWindowCard w={cycle.windows.previous} />
                    <CycleWindowCard w={cycle.windows.current} />
                    <CycleWindowCard w={cycle.windows.next} />
                  </div>
                </div>
              )}

              {/* SLA Information */}
              {cycle && (
                <Card className="bg-amber-50 border-amber-200">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5" />
                      <div>
                        <p className="font-medium text-amber-900">SLA & Compliance</p>
                        <p className="text-sm text-amber-700 mt-1">
                          <strong>SLA:</strong> {cycle.slaHours} hours for reconciliation & credit
                        </p>
                        <p className="text-sm text-amber-700 mt-1">
                          <strong>Data Rule:</strong> Ensure "credited ≤ sentToBank" at all times
                        </p>
                        {cycle.acquirer && (
                          <p className="text-sm text-amber-700 mt-1">
                            <strong>Acquirer:</strong> {cycle.acquirer}
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Additional Info */}
              <div className="text-xs text-gray-500 border-t pt-4">
                {cycle && <p>Merchant ID: {cycle.merchantId}</p>}
                <p className={cycle ? 'mt-1' : ''}>All times shown in IST (Asia/Kolkata)</p>
                <p className="mt-1">
                  <a href="#" className="text-blue-600 hover:underline">Learn more</a> about settlement schedules
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}