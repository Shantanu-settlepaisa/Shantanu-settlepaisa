// Drizzle ORM schema definitions for SettlePaisa reconciliation system
import { 
  pgTable, 
  uuid, 
  varchar, 
  timestamp, 
  boolean, 
  integer, 
  bigint, 
  date,
  text,
  jsonb,
  decimal,
  char,
  check
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// =============================================
// CORE TABLES
// =============================================

export const merchants = pgTable('merchants', {
  id: uuid('id').primaryKey().defaultRandom(),
  merchantCode: varchar('merchant_code', { length: 50 }).unique().notNull(),
  merchantName: varchar('merchant_name', { length: 255 }).notNull(),
  status: varchar('status', { length: 20 }).default('ACTIVE'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const banks = pgTable('banks', {
  id: uuid('id').primaryKey().defaultRandom(),
  bankCode: varchar('bank_code', { length: 10 }).unique().notNull(),
  bankName: varchar('bank_name', { length: 100 }).notNull(),
  swiftCode: varchar('swift_code', { length: 11 }),
  countryCode: char('country_code', { length: 2 }).default('IN'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const bankConnectors = pgTable('bank_connectors', {
  id: uuid('id').primaryKey().defaultRandom(),
  bankId: uuid('bank_id').notNull().references(() => banks.id),
  connectorName: varchar('connector_name', { length: 100 }).notNull(),
  connectorType: varchar('connector_type', { length: 10 }).notNull(),
  connectionConfig: jsonb('connection_config'),
  status: varchar('status', { length: 20 }).default('ACTIVE'),
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
  syncFrequencyMinutes: integer('sync_frequency_minutes').default(30),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// =============================================
// TRANSACTION PIPELINE TABLES  
// =============================================

export const transactions = pgTable('transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Transaction identifiers
  transactionId: varchar('transaction_id', { length: 100 }).unique().notNull(),
  utr: varchar('utr', { length: 50 }),
  rrn: varchar('rrn', { length: 50 }),
  
  // Transaction details
  merchantId: uuid('merchant_id').notNull().references(() => merchants.id),
  amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
  currency: char('currency', { length: 3 }).default('INR'),
  
  // Dates and timing
  transactionDate: date('transaction_date').notNull(),
  transactionTime: timestamp('transaction_time', { withTimezone: true }).notNull(),
  capturedAt: timestamp('captured_at', { withTimezone: true }).defaultNow(),
  
  // Settlement pipeline status
  pipelineStatus: varchar('pipeline_status', { length: 20 }).default('CAPTURED'),
  settlementDate: date('settlement_date'),
  creditedAt: timestamp('credited_at', { withTimezone: true }),
  
  // Bank information
  bankId: uuid('bank_id').references(() => banks.id),
  bankAccountNumber: varchar('bank_account_number', { length: 50 }),
  ifscCode: varchar('ifsc_code', { length: 11 }),
  
  // Data source tracking
  dataSource: varchar('data_source', { length: 20 }).default('MANUAL'),
  sourceConnectorId: uuid('source_connector_id').references(() => bankConnectors.id),
  
  // Metadata
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const bankStatements = pgTable('bank_statements', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // File information
  bankId: uuid('bank_id').notNull().references(() => banks.id),
  connectorId: uuid('connector_id').references(() => bankConnectors.id),
  statementDate: date('statement_date').notNull(),
  fileName: varchar('file_name', { length: 255 }),
  fileHash: varchar('file_hash', { length: 64 }),
  
  // Processing status
  status: varchar('status', { length: 20 }).default('RECEIVED'),
  totalRecords: integer('total_records'),
  processedRecords: integer('processed_records').default(0),
  
  // Timing
  receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  
  // Raw file content (optional)
  rawContent: text('raw_content'),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const bankStatementEntries = pgTable('bank_statement_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Link to statement file
  statementId: uuid('statement_id').notNull().references(() => bankStatements.id),
  lineNumber: integer('line_number').notNull(),
  
  // Bank entry details
  utr: varchar('utr', { length: 50 }),
  amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
  transactionDate: date('transaction_date').notNull(),
  description: text('description'),
  debitCredit: char('debit_credit', { length: 1 }),
  balancePaise: bigint('balance_paise', { mode: 'number' }),
  
  // Reconciliation status
  isMatched: boolean('is_matched').default(false),
  matchedTransactionId: uuid('matched_transaction_id').references(() => transactions.id),
  matchConfidence: decimal('match_confidence', { precision: 5, scale: 2 }),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// =============================================
// RECONCILIATION TABLES
// =============================================

export const reconciliationMatches = pgTable('reconciliation_matches', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // What's being matched
  transactionId: uuid('transaction_id').notNull().references(() => transactions.id),
  bankEntryId: uuid('bank_entry_id').notNull().references(() => bankStatementEntries.id),
  
  // Match quality
  matchType: varchar('match_type', { length: 20 }).notNull(),
  matchConfidence: decimal('match_confidence', { precision: 5, scale: 2 }).notNull(),
  matchScore: jsonb('match_score'),
  
  // Status
  status: varchar('status', { length: 20 }).default('PENDING'),
  
  // Audit trail
  matchedBy: varchar('matched_by', { length: 20 }).default('SYSTEM'),
  matchedByUserId: uuid('matched_by_user_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
});

// =============================================
// EXCEPTION MANAGEMENT
// =============================================

export const exceptionReasons = pgTable('exception_reasons', {
  id: uuid('id').primaryKey().defaultRandom(),
  reasonCode: varchar('reason_code', { length: 50 }).unique().notNull(),
  reasonLabel: varchar('reason_label', { length: 100 }).notNull(),
  severity: varchar('severity', { length: 10 }).default('MEDIUM'),
  description: text('description'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const reconciliationExceptions = pgTable('reconciliation_exceptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // What has the exception
  transactionId: uuid('transaction_id').references(() => transactions.id),
  bankEntryId: uuid('bank_entry_id').references(() => bankStatementEntries.id),
  
  // Exception details
  reasonId: uuid('reason_id').notNull().references(() => exceptionReasons.id),
  severity: varchar('severity', { length: 10 }).notNull(),
  
  // Status and resolution
  status: varchar('status', { length: 20 }).default('OPEN'),
  
  // Assignment
  assignedTo: uuid('assigned_to'),
  assignedAt: timestamp('assigned_at', { withTimezone: true }),
  
  // Resolution
  resolutionNotes: text('resolution_notes'),
  resolvedBy: uuid('resolved_by'),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  
  // Additional context
  exceptionData: jsonb('exception_data'),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// =============================================
// OPERATIONAL TABLES
// =============================================

export const connectorSyncLogs = pgTable('connector_sync_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  connectorId: uuid('connector_id').notNull().references(() => bankConnectors.id),
  syncStartedAt: timestamp('sync_started_at', { withTimezone: true }).notNull(),
  syncCompletedAt: timestamp('sync_completed_at', { withTimezone: true }),
  
  // Results
  status: varchar('status', { length: 20 }).notNull(),
  filesFound: integer('files_found').default(0),
  filesProcessed: integer('files_processed').default(0),
  recordsProcessed: integer('records_processed').default(0),
  
  // Error information
  errorMessage: text('error_message'),
  errorDetails: jsonb('error_details'),
  
  // Performance metrics
  durationSeconds: integer('duration_seconds'),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const systemSettings = pgTable('system_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  settingKey: varchar('setting_key', { length: 100 }).unique().notNull(),
  settingValue: text('setting_value').notNull(),
  settingType: varchar('setting_type', { length: 20 }).default('STRING'),
  description: text('description'),
  isSensitive: boolean('is_sensitive').default(false),
  updatedBy: uuid('updated_by'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// =============================================
// RELATIONS
// =============================================

export const merchantRelations = relations(merchants, ({ many }) => ({
  transactions: many(transactions),
}));

export const bankRelations = relations(banks, ({ many }) => ({
  connectors: many(bankConnectors),
  transactions: many(transactions),
  statements: many(bankStatements),
}));

export const bankConnectorRelations = relations(bankConnectors, ({ one, many }) => ({
  bank: one(banks, {
    fields: [bankConnectors.bankId],
    references: [banks.id],
  }),
  transactions: many(transactions),
  statements: many(bankStatements),
  syncLogs: many(connectorSyncLogs),
}));

export const transactionRelations = relations(transactions, ({ one, many }) => ({
  merchant: one(merchants, {
    fields: [transactions.merchantId],
    references: [merchants.id],
  }),
  bank: one(banks, {
    fields: [transactions.bankId],
    references: [banks.id],
  }),
  sourceConnector: one(bankConnectors, {
    fields: [transactions.sourceConnectorId],
    references: [bankConnectors.id],
  }),
  matches: many(reconciliationMatches),
  exceptions: many(reconciliationExceptions),
}));

export const bankStatementRelations = relations(bankStatements, ({ one, many }) => ({
  bank: one(banks, {
    fields: [bankStatements.bankId],
    references: [banks.id],
  }),
  connector: one(bankConnectors, {
    fields: [bankStatements.connectorId],
    references: [bankConnectors.id],
  }),
  entries: many(bankStatementEntries),
}));

export const bankStatementEntryRelations = relations(bankStatementEntries, ({ one, many }) => ({
  statement: one(bankStatements, {
    fields: [bankStatementEntries.statementId],
    references: [bankStatements.id],
  }),
  matchedTransaction: one(transactions, {
    fields: [bankStatementEntries.matchedTransactionId],
    references: [transactions.id],
  }),
  matches: many(reconciliationMatches),
  exceptions: many(reconciliationExceptions),
}));

export const reconciliationMatchRelations = relations(reconciliationMatches, ({ one }) => ({
  transaction: one(transactions, {
    fields: [reconciliationMatches.transactionId],
    references: [transactions.id],
  }),
  bankEntry: one(bankStatementEntries, {
    fields: [reconciliationMatches.bankEntryId],
    references: [bankStatementEntries.id],
  }),
}));

export const exceptionReasonRelations = relations(exceptionReasons, ({ many }) => ({
  exceptions: many(reconciliationExceptions),
}));

export const reconciliationExceptionRelations = relations(reconciliationExceptions, ({ one }) => ({
  reason: one(exceptionReasons, {
    fields: [reconciliationExceptions.reasonId],
    references: [exceptionReasons.id],
  }),
  transaction: one(transactions, {
    fields: [reconciliationExceptions.transactionId],
    references: [transactions.id],
  }),
  bankEntry: one(bankStatementEntries, {
    fields: [reconciliationExceptions.bankEntryId],
    references: [bankStatementEntries.id],
  }),
}));

export const connectorSyncLogRelations = relations(connectorSyncLogs, ({ one }) => ({
  connector: one(bankConnectors, {
    fields: [connectorSyncLogs.connectorId],
    references: [bankConnectors.id],
  }),
}));

// =============================================
// TYPE EXPORTS
// =============================================

export type Merchant = typeof merchants.$inferSelect;
export type NewMerchant = typeof merchants.$inferInsert;

export type Bank = typeof banks.$inferSelect;
export type NewBank = typeof banks.$inferInsert;

export type BankConnector = typeof bankConnectors.$inferSelect;
export type NewBankConnector = typeof bankConnectors.$inferInsert;

export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;

export type BankStatement = typeof bankStatements.$inferSelect;
export type NewBankStatement = typeof bankStatements.$inferInsert;

export type BankStatementEntry = typeof bankStatementEntries.$inferSelect;
export type NewBankStatementEntry = typeof bankStatementEntries.$inferInsert;

export type ReconciliationMatch = typeof reconciliationMatches.$inferSelect;
export type NewReconciliationMatch = typeof reconciliationMatches.$inferInsert;

export type ExceptionReason = typeof exceptionReasons.$inferSelect;
export type NewExceptionReason = typeof exceptionReasons.$inferInsert;

export type ReconciliationException = typeof reconciliationExceptions.$inferSelect;
export type NewReconciliationException = typeof reconciliationExceptions.$inferInsert;

export type ConnectorSyncLog = typeof connectorSyncLogs.$inferSelect;
export type NewConnectorSyncLog = typeof connectorSyncLogs.$inferInsert;

export type SystemSetting = typeof systemSettings.$inferSelect;
export type NewSystemSetting = typeof systemSettings.$inferInsert;