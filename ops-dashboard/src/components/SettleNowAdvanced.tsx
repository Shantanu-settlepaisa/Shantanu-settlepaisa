import { useState, useEffect } from 'react'
import { 
  Zap, 
  Info, 
  CheckCircle, 
  AlertCircle,
  Clock,
  TrendingUp,
  Shield,
  CreditCard,
  Banknote,
  ArrowRight,
  Loader2,
  X,
  ChevronRight,
  Sparkles,
  Gift
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Checkbox } from '@/components/ui/checkbox'

interface SettleNowAdvancedProps {
  isOpen: boolean
  onClose: () => void
  availableBalance: number
  dailyLimit: number
  dailyUsed: number
  onSettle: (amount: number, options: SettlementOptions) => Promise<void>
}

interface SettlementOptions {
  priority: 'standard' | 'express' | 'instant'
  splitSettlement: boolean
  accounts?: Array<{
    id: string
    name: string
    amount: number
  }>
  notifyEmail?: string
  notifySMS?: string
}

interface TransactionGroup {
  paymentMethod: string
  count: number
  amount: number
  selected: boolean
}

export function SettleNowAdvanced({
  isOpen,
  onClose,
  availableBalance,
  dailyLimit,
  dailyUsed,
  onSettle
}: SettleNowAdvancedProps) {
  const [step, setStep] = useState(1)
  const [amount, setAmount] = useState('')
  const [priority, setPriority] = useState<'standard' | 'express' | 'instant'>('instant')
  const [splitSettlement, setSplitSettlement] = useState(false)
  const [selectedTransactions, setSelectedTransactions] = useState<string[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [settlementId, setSettlementId] = useState<string | null>(null)

  // Mock transaction groups
  const transactionGroups: TransactionGroup[] = [
    { paymentMethod: 'UPI', count: 234, amount: 345678.90, selected: true },
    { paymentMethod: 'Cards', count: 156, amount: 234567.80, selected: true },
    { paymentMethod: 'Net Banking', count: 89, amount: 123456.70, selected: true },
    { paymentMethod: 'Wallets', count: 45, amount: 45678.60, selected: false }
  ]

  const totalSelected = transactionGroups
    .filter(g => g.selected)
    .reduce((sum, g) => sum + g.amount, 0)

  const getFees = () => {
    const baseAmount = parseFloat(amount) || 0
    switch (priority) {
      case 'instant':
        return baseAmount * 0.001 // 0.1%
      case 'express':
        return baseAmount * 0.0005 // 0.05%
      case 'standard':
        return 0
      default:
        return 0
    }
  }

  const getEstimatedTime = () => {
    switch (priority) {
      case 'instant':
        return '10 minutes'
      case 'express':
        return '2 hours'
      case 'standard':
        return '24 hours'
      default:
        return 'Unknown'
    }
  }

  const handleSettle = async () => {
    if (!amount || parseFloat(amount) <= 0) return

    setIsProcessing(true)
    setStep(4) // Move to processing step

    // Simulate processing with progress
    for (let i = 0; i <= 100; i += 10) {
      setProgress(i)
      await new Promise(resolve => setTimeout(resolve, 200))
    }

    // Generate settlement ID
    const newSettlementId = `SETTLE${Date.now()}`
    setSettlementId(newSettlementId)

    // Call the actual settle function
    await onSettle(parseFloat(amount), {
      priority,
      splitSettlement,
      notifyEmail: 'merchant@example.com',
      notifySMS: '+91XXXXXXXXXX'
    })

    setStep(5) // Move to success step
    setIsProcessing(false)
  }

  const resetAndClose = () => {
    setStep(1)
    setAmount('')
    setPriority('instant')
    setSplitSettlement(false)
    setSelectedTransactions([])
    setIsProcessing(false)
    setProgress(0)
    setSettlementId(null)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-hidden">
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center">
                <Zap className="w-6 h-6 text-yellow-600" />
              </div>
              <div>
                <CardTitle>Settle Now</CardTitle>
                <p className="text-sm text-gray-500">Get your money instantly</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={resetAndClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-0 overflow-y-auto max-h-[calc(90vh-80px)]">
          {/* Step 1: Amount Selection */}
          {step === 1 && (
            <div className="p-6 space-y-6">
              {/* Balance Overview */}
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm text-gray-500">Available Balance</p>
                    <p className="text-xl font-bold">₹{availableBalance.toLocaleString('en-IN')}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm text-gray-500">Daily Limit</p>
                    <p className="text-xl font-bold">₹{dailyLimit.toLocaleString('en-IN')}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm text-gray-500">Remaining Today</p>
                    <p className="text-xl font-bold">₹{(dailyLimit - dailyUsed).toLocaleString('en-IN')}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Transaction Selection */}
              <div>
                <Label className="mb-3 block">Select Transactions to Settle</Label>
                <div className="space-y-2">
                  {transactionGroups.map((group) => (
                    <div key={group.paymentMethod} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
                      <div className="flex items-center gap-3">
                        <Checkbox 
                          checked={group.selected}
                          onCheckedChange={(checked) => {
                            // Update selection logic
                          }}
                        />
                        <div>
                          <p className="font-medium">{group.paymentMethod}</p>
                          <p className="text-sm text-gray-500">{group.count} transactions</p>
                        </div>
                      </div>
                      <p className="font-bold">₹{group.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Amount Input */}
              <div>
                <Label>Settlement Amount</Label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">₹</span>
                  <Input 
                    type="number"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="pl-8 text-xl font-bold"
                    max={Math.min(availableBalance, dailyLimit - dailyUsed)}
                  />
                </div>
                <div className="flex gap-2 mt-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setAmount(String(totalSelected))}
                  >
                    Selected (₹{totalSelected.toLocaleString('en-IN')})
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setAmount(String(availableBalance))}
                  >
                    Max Available
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setAmount('100000')}
                  >
                    ₹1 Lakh
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setAmount('500000')}
                  >
                    ₹5 Lakh
                  </Button>
                </div>
              </div>

              <Button 
                className="w-full" 
                size="lg"
                onClick={() => setStep(2)}
                disabled={!amount || parseFloat(amount) <= 0}
              >
                Continue
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          )}

          {/* Step 2: Settlement Options */}
          {step === 2 && (
            <div className="p-6 space-y-6">
              <div className="flex items-center gap-2 mb-4">
                <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
                  ← Back
                </Button>
                <h3 className="font-semibold">Choose Settlement Speed</h3>
              </div>

              <RadioGroup value={priority} onValueChange={(v: any) => setPriority(v)}>
                <div className="space-y-3">
                  <label className="flex items-start gap-3 p-4 border rounded-lg cursor-pointer hover:bg-gray-50">
                    <RadioGroupItem value="instant" className="mt-1" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-yellow-500" />
                        <span className="font-medium">Instant Settlement</span>
                        <Badge className="bg-yellow-100 text-yellow-800">Popular</Badge>
                      </div>
                      <p className="text-sm text-gray-500 mt-1">Get money in 10 minutes • 0.1% fee</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                        <span className="flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" /> 24×7 Available
                        </span>
                        <span className="flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" /> Real-time UTR
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-500">Fee</p>
                      <p className="font-bold">₹{(parseFloat(amount) * 0.001).toFixed(2)}</p>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-4 border rounded-lg cursor-pointer hover:bg-gray-50">
                    <RadioGroupItem value="express" className="mt-1" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-blue-500" />
                        <span className="font-medium">Express Settlement</span>
                        <Badge className="bg-green-100 text-green-800">50% Off</Badge>
                      </div>
                      <p className="text-sm text-gray-500 mt-1">Get money in 2 hours • 0.05% fee</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                        <span className="flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" /> Business Hours
                        </span>
                        <span className="flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" /> Priority Processing
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-500">Fee</p>
                      <p className="font-bold">₹{(parseFloat(amount) * 0.0005).toFixed(2)}</p>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-4 border rounded-lg cursor-pointer hover:bg-gray-50">
                    <RadioGroupItem value="standard" className="mt-1" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Banknote className="w-4 h-4 text-gray-500" />
                        <span className="font-medium">Standard Settlement</span>
                        <Badge className="bg-gray-100 text-gray-800">Free</Badge>
                      </div>
                      <p className="text-sm text-gray-500 mt-1">Get money in 24 hours • No fee</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                        <span className="flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" /> T+1 Settlement
                        </span>
                        <span className="flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" /> Batch Processing
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-500">Fee</p>
                      <p className="font-bold text-green-600">FREE</p>
                    </div>
                  </label>
                </div>
              </RadioGroup>

              {/* Additional Options */}
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <Checkbox 
                      id="split"
                      checked={splitSettlement}
                      onCheckedChange={(checked) => setSplitSettlement(checked as boolean)}
                    />
                    <label htmlFor="split" className="cursor-pointer">
                      <p className="font-medium">Split Settlement</p>
                      <p className="text-sm text-gray-500">Send to multiple bank accounts</p>
                    </label>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <Checkbox id="notify" defaultChecked />
                    <label htmlFor="notify" className="cursor-pointer">
                      <p className="font-medium">Send Notifications</p>
                      <p className="text-sm text-gray-500">Email & SMS confirmation</p>
                    </label>
                  </div>
                </div>
              </div>

              <Button 
                className="w-full" 
                size="lg"
                onClick={() => setStep(3)}
              >
                Review Settlement
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          )}

          {/* Step 3: Review & Confirm */}
          {step === 3 && (
            <div className="p-6 space-y-6">
              <div className="flex items-center gap-2 mb-4">
                <Button variant="ghost" size="sm" onClick={() => setStep(2)}>
                  ← Back
                </Button>
                <h3 className="font-semibold">Review & Confirm</h3>
              </div>

              <Card className="bg-gray-50">
                <CardContent className="p-4">
                  <h4 className="font-semibold mb-3">Settlement Summary</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Settlement Amount</span>
                      <span className="font-medium">₹{parseFloat(amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Processing Fee ({priority === 'instant' ? '0.1%' : priority === 'express' ? '0.05%' : '0%'})</span>
                      <span className="font-medium text-red-600">- ₹{getFees().toFixed(2)}</span>
                    </div>
                    <div className="border-t pt-2 mt-2">
                      <div className="flex justify-between">
                        <span className="font-semibold">You'll Receive</span>
                        <span className="font-bold text-green-600 text-xl">
                          ₹{(parseFloat(amount) - getFees()).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock className="w-4 h-4 text-blue-500" />
                      <p className="text-sm text-gray-500">Estimated Time</p>
                    </div>
                    <p className="font-bold">{getEstimatedTime()}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Shield className="w-4 h-4 text-green-500" />
                      <p className="text-sm text-gray-500">Security</p>
                    </div>
                    <p className="font-bold">Bank-grade Encryption</p>
                  </CardContent>
                </Card>
              </div>

              <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
                <div className="flex gap-3">
                  <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-blue-900">
                    <p className="font-medium mb-1">Important Information</p>
                    <ul className="space-y-1 text-xs">
                      <li>• Settlement will be processed to your registered bank account</li>
                      <li>• UTR will be generated immediately after processing</li>
                      <li>• You'll receive SMS and email confirmation</li>
                      <li>• Contact support if not received within {getEstimatedTime()}</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => setStep(2)}
                >
                  Modify
                </Button>
                <Button 
                  className="flex-1"
                  onClick={handleSettle}
                  disabled={isProcessing}
                >
                  <Zap className="w-4 h-4 mr-2" />
                  Confirm & Settle
                </Button>
              </div>
            </div>
          )}

          {/* Step 4: Processing */}
          {step === 4 && (
            <div className="p-6 space-y-6">
              <div className="text-center py-8">
                <div className="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Loader2 className="w-10 h-10 text-yellow-600 animate-spin" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Processing Settlement</h3>
                <p className="text-gray-500 mb-6">Please wait while we process your settlement...</p>
                
                <div className="max-w-sm mx-auto">
                  <Progress value={progress} className="mb-2" />
                  <p className="text-sm text-gray-500">{progress}% Complete</p>
                </div>

                <div className="mt-8 space-y-2 text-sm text-gray-500">
                  <p className={progress >= 20 ? 'text-green-600 font-medium' : ''}>
                    {progress >= 20 ? '✓' : '○'} Validating request
                  </p>
                  <p className={progress >= 40 ? 'text-green-600 font-medium' : ''}>
                    {progress >= 40 ? '✓' : '○'} Processing with bank
                  </p>
                  <p className={progress >= 60 ? 'text-green-600 font-medium' : ''}>
                    {progress >= 60 ? '✓' : '○'} Generating UTR
                  </p>
                  <p className={progress >= 80 ? 'text-green-600 font-medium' : ''}>
                    {progress >= 80 ? '✓' : '○'} Sending notifications
                  </p>
                  <p className={progress >= 100 ? 'text-green-600 font-medium' : ''}>
                    {progress >= 100 ? '✓' : '○'} Settlement complete
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Step 5: Success */}
          {step === 5 && (
            <div className="p-6 space-y-6">
              <div className="text-center py-8">
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-10 h-10 text-green-600" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Settlement Successful!</h3>
                <p className="text-gray-500 mb-6">Your money is on the way</p>

                <Card className="bg-green-50 border-green-200 mb-6">
                  <CardContent className="p-4">
                    <div className="space-y-2 text-left">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Settlement ID</span>
                        <span className="font-mono font-bold">{settlementId}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Amount Settled</span>
                        <span className="font-bold">₹{(parseFloat(amount) - getFees()).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Expected Credit</span>
                        <span className="font-bold">{getEstimatedTime()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">UTR Number</span>
                        <span className="font-mono">UTR{Date.now()}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="flex gap-3">
                  <Button 
                    variant="outline" 
                    className="flex-1"
                    onClick={() => {
                      // Download receipt
                    }}
                  >
                    Download Receipt
                  </Button>
                  <Button 
                    className="flex-1"
                    onClick={resetAndClose}
                  >
                    Done
                  </Button>
                </div>

                {/* Promotional Banner */}
                <Card className="mt-6 bg-gradient-to-r from-purple-500 to-blue-500 text-white">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <Gift className="w-8 h-8" />
                      <div className="flex-1 text-left">
                        <p className="font-semibold">Congratulations!</p>
                        <p className="text-sm opacity-90">You've saved ₹{(getFees() * 0.5).toFixed(2)} with our promotional offer!</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}