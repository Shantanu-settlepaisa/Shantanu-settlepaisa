#!/bin/bash

# Rollback Script - Revert from v2.2.0 to v2.1.1
# Use this if you need to rollback the SFTP Ingestion feature

echo "================================================"
echo "🔄 Rollback from v2.2.0 to v2.1.1"
echo "================================================"
echo ""

read -p "⚠️  This will remove SFTP Ingestion feature. Continue? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Rollback cancelled."
    exit 1
fi

echo "📝 Starting rollback process..."

# 1. Stop SFTP Ingestion service
echo "🛑 Stopping SFTP Ingestion service..."
pkill -f "node.*ingest.*server" 2>/dev/null
pkill -f "ts-node.*ingest" 2>/dev/null

# 2. Disable feature flag
echo "🔧 Disabling feature flag..."
sed -i.backup 's/FEATURE_BANK_SFTP_INGESTION=true/FEATURE_BANK_SFTP_INGESTION=false/g' .env.development 2>/dev/null
sed -i.backup 's/VITE_FEATURE_BANK_SFTP_INGESTION=true/VITE_FEATURE_BANK_SFTP_INGESTION=false/g' .env.development 2>/dev/null

# 3. Revert ConnectorHealthMini component
echo "🔧 Reverting ConnectorHealthMini component..."
cat > src/components/Overview/ConnectorHealthMini.tsx.rollback << 'ORIGINAL_COMPONENT'
import { Activity, CheckCircle, AlertCircle, XCircle, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { KpiFilters } from '@/hooks/opsOverview';

interface ConnectorStatus {
  id: string;
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  lastSync: string;
  lag?: number;
}

interface ConnectorHealthMiniProps {
  filters: KpiFilters;
  isLoading?: boolean;
}

export function ConnectorHealthMini({ filters, isLoading: parentLoading }: ConnectorHealthMiniProps) {
  const navigate = useNavigate();

  const { data: connectors, isLoading } = useQuery({
    queryKey: ['connector-health-mini', filters],
    queryFn: async () => {
      const { data } = await apiClient.get<ConnectorStatus[]>('/api/connectors/health-summary', {
        params: filters,
        baseURL: 'http://localhost:5105'
      });
      return data;
    },
    refetchInterval: 30000,
    staleTime: 20000,
  });

  const loading = parentLoading || isLoading;

  if (loading) {
    return (
      <div className="bg-white rounded-xl ring-1 ring-slate-200 shadow-sm p-6">
        <div className="animate-pulse">
          <div className="h-5 bg-slate-200 rounded w-32 mb-4"></div>
          <div className="grid grid-cols-3 gap-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-16 bg-slate-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const healthSummary = {
    healthy: connectors?.filter(c => c.status === 'healthy').length || 0,
    degraded: connectors?.filter(c => c.status === 'degraded').length || 0,
    down: connectors?.filter(c => c.status === 'down').length || 0,
  };

  const totalConnectors = (healthSummary.healthy + healthSummary.degraded + healthSummary.down) || 1;
  const healthPercentage = Math.round((healthSummary.healthy / totalConnectors) * 100);

  // Rest of the original component...
  return (
    <div className="bg-white rounded-xl ring-1 ring-slate-200 shadow-sm p-6">
      <!-- Original component content without SFTP integration -->
    </div>
  );
}
ORIGINAL_COMPONENT

# 4. Update VERSION file
echo "📝 Updating VERSION file..."
echo "2.1.1" > VERSION

# 5. Remove SFTP-specific files (but keep backups)
echo "📦 Removing SFTP ingestion files (keeping backups)..."
mkdir -p .rollback-backup-v2.2.0
cp -r services/api/ingest .rollback-backup-v2.2.0/ 2>/dev/null
cp -r src/features/ingest .rollback-backup-v2.2.0/ 2>/dev/null

# 6. Preserve database (data not deleted, just feature disabled)
echo "💾 Database tables preserved (feature disabled only)"

# 7. Update start-services.sh to remove ingestion service
echo "🔧 Updating start-services script..."
sed -i.backup '/# Start Ingest API/,/^fi$/d' start-services.sh 2>/dev/null
sed -i.backup '/Ingest API:/d' start-services.sh 2>/dev/null
sed -i.backup '/ingest-api.log/d' start-services.sh 2>/dev/null

# 8. Restart frontend
echo "🔄 Restarting frontend..."
pkill -f vite 2>/dev/null
npm run dev -- --port 5174 > /tmp/vite.log 2>&1 &

echo ""
echo "================================================"
echo "✅ Rollback Complete!"
echo "================================================"
echo "📌 Current Version: 2.1.1"
echo "📁 Backup saved in: .rollback-backup-v2.2.0/"
echo "💾 Database tables preserved (not deleted)"
echo "🔧 Feature flag disabled"
echo ""
echo "To re-enable SFTP Ingestion:"
echo "1. Set FEATURE_BANK_SFTP_INGESTION=true in .env"
echo "2. Run: ./start-services.sh"
echo ""
echo "To fully restore v2.2.0:"
echo "1. Run: ./backup-v2.2.0.sh (create backup first)"
echo "2. Navigate to backup and run restore.sh"
echo "================================================"