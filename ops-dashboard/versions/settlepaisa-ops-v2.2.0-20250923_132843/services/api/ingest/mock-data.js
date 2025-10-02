// Mock data for testing without database
const mockHealthData = [
  {
    bank: 'AXIS',
    last_file_at: new Date(Date.now() - 30 * 60000).toISOString(), // 30 min ago
    expected_count: 3,
    received_count: 3,
    lag_minutes: 30,
    window_status: 'HEALTHY',
    message: 'All files received',
    updated_at: new Date().toISOString()
  },
  {
    bank: 'HDFC',
    last_file_at: new Date(Date.now() - 120 * 60000).toISOString(), // 2 hours ago
    expected_count: 4,
    received_count: 3,
    lag_minutes: 120,
    window_status: 'DEGRADED',
    message: 'Missing 1 file',
    updated_at: new Date().toISOString()
  },
  {
    bank: 'ICICI',
    last_file_at: new Date(Date.now() - 480 * 60000).toISOString(), // 8 hours ago
    expected_count: 2,
    received_count: 0,
    lag_minutes: 480,
    window_status: 'DOWN',
    message: 'No files received',
    updated_at: new Date().toISOString()
  }
];

const today = new Date().toISOString().split('T')[0];

const mockFiles = [
  {
    id: 1,
    bank: 'AXIS',
    filename: `AXIS_SETTLE_${today}_01.csv`,
    business_date: today,
    size_bytes: 102400,
    status: 'VALIDATED',
    fail_reason: null,
    seen_at: new Date(Date.now() - 180 * 60000).toISOString(),
    validated_at: new Date(Date.now() - 175 * 60000).toISOString()
  },
  {
    id: 2,
    bank: 'AXIS',
    filename: `AXIS_SETTLE_${today}_02.csv`,
    business_date: today,
    size_bytes: 98304,
    status: 'VALIDATED',
    fail_reason: null,
    seen_at: new Date(Date.now() - 120 * 60000).toISOString(),
    validated_at: new Date(Date.now() - 115 * 60000).toISOString()
  },
  {
    id: 3,
    bank: 'AXIS',
    filename: `AXIS_SETTLE_${today}_03.csv`,
    business_date: today,
    size_bytes: 110592,
    status: 'VALIDATED',
    fail_reason: null,
    seen_at: new Date(Date.now() - 30 * 60000).toISOString(),
    validated_at: new Date(Date.now() - 25 * 60000).toISOString()
  }
];

const mockExpectations = [
  {
    bank: 'AXIS',
    window_start: `${today}T11:30:00`,
    window_end: `${today}T12:30:00`,
    business_date: today,
    expected_name: `AXIS_SETTLE_${today}_01.csv`,
    expected_seq: 1,
    required: true,
    received: true,
    received_at: new Date(Date.now() - 180 * 60000).toISOString()
  },
  {
    bank: 'AXIS',
    window_start: `${today}T15:30:00`,
    window_end: `${today}T16:30:00`,
    business_date: today,
    expected_name: `AXIS_SETTLE_${today}_02.csv`,
    expected_seq: 2,
    required: true,
    received: true,
    received_at: new Date(Date.now() - 120 * 60000).toISOString()
  },
  {
    bank: 'AXIS',
    window_start: `${today}T20:00:00`,
    window_end: `${today}T21:00:00`,
    business_date: today,
    expected_name: `AXIS_SETTLE_${today}_03.csv`,
    expected_seq: 3,
    required: true,
    received: true,
    received_at: new Date(Date.now() - 30 * 60000).toISOString()
  }
];

module.exports = {
  mockHealthData,
  mockFiles,
  mockExpectations
};