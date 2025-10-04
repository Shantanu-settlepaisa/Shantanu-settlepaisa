=== SettlePaisa V2 Database Schema ===


## Table: sp_v2_bank_column_mappings

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | No | gen_random_uuid() |
| config_name | character varying(100) | No | - |
| bank_name | character varying(100) | No | - |
| file_type | character varying(10) | No | - |
| delimiter | character varying(10) | Yes | - |
| encoding | character varying(20) | Yes | 'UTF-8'::character varying |
| has_header | boolean | Yes | true |
| header_row_number | integer | Yes | 1 |
| v1_column_mappings | jsonb | No | - |
| date_format | character varying(50) | Yes | 'dd-MM-yyyy'::character varying |
| amount_format | character varying(20) | Yes | 'decimal'::character varying |
| special_fields | jsonb | Yes | - |
| is_active | boolean | Yes | true |
| source | character varying(20) | Yes | 'V1_MIGRATED'::character varying |
| created_by | character varying(100) | Yes | - |
| created_at | timestamp with time zone | Yes | now() |
| updated_by | character varying(100) | Yes | - |
| updated_at | timestamp with time zone | Yes | now() |

**Indexes:**
- idx_bank_mappings_active
- idx_bank_mappings_bank_name
- idx_bank_mappings_config_name
- sp_v2_bank_column_mappings_pkey
- unique_bank_config

## Table: sp_v2_bank_files

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | No | gen_random_uuid() |
| acquirer | text | No | - |
| cycle_date | date | No | - |
| rail | character varying(10) | Yes | - |
| status | character varying(20) | Yes | 'EXPECTED'::character varying |
| file_name | character varying(255) | Yes | - |
| file_hash | text | Yes | - |
| s3_bucket | character varying(100) | Yes | - |
| s3_key | character varying(500) | Yes | - |
| record_count | integer | Yes | 0 |
| total_amount_paise | bigint | Yes | 0 |
| parsed_at | timestamp with time zone | Yes | - |
| received_at | timestamp with time zone | Yes | - |
| error_message | text | Yes | - |
| created_at | timestamp with time zone | Yes | now() |

**Indexes:**
- sp_v2_bank_files_pkey

## Table: sp_v2_bank_statements

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | bigint | No | nextval('sp_v2_bank_statements_id_seq'::regclass) |
| bank_ref | character varying(100) | No | - |
| bank_name | character varying(100) | No | - |
| amount_paise | bigint | No | - |
| transaction_date | date | No | - |
| value_date | date | Yes | - |
| utr | character varying(50) | Yes | - |
| remarks | text | Yes | - |
| debit_credit | character varying(10) | Yes | - |
| source_type | character varying(20) | No | - |
| source_file | character varying(255) | Yes | - |
| batch_id | character varying(100) | Yes | - |
| processed | boolean | Yes | false |
| matched_transaction_id | character varying(100) | Yes | - |
| created_at | timestamp with time zone | Yes | now() |

**Indexes:**
- sp_v2_bank_statements_bank_ref_unique
- sp_v2_bank_statements_pkey

## Table: sp_v2_bank_transfer_queue

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | No | gen_random_uuid() |
| batch_id | uuid | No | - |
| transfer_mode | character varying(20) | No | - |
| amount_paise | bigint | No | - |
| beneficiary_name | character varying(200) | No | - |
| account_number | character varying(30) | No | - |
| ifsc_code | character varying(11) | No | - |
| bank_name | character varying(100) | Yes | - |
| status | character varying(30) | Yes | 'queued'::character varying |
| utr_number | character varying(50) | Yes | - |
| bank_reference_number | character varying(100) | Yes | - |
| queued_at | timestamp without time zone | Yes | now() |
| processing_at | timestamp without time zone | Yes | - |
| sent_at | timestamp without time zone | Yes | - |
| completed_at | timestamp without time zone | Yes | - |
| retry_count | integer | Yes | 0 |
| max_retries | integer | Yes | 3 |
| last_error | text | Yes | - |
| error_code | character varying(50) | Yes | - |
| api_request | jsonb | Yes | - |
| api_response | jsonb | Yes | - |
| bank_confirmed | boolean | Yes | false |
| bank_confirmation_date | date | Yes | - |
| created_at | timestamp without time zone | Yes | now() |
| updated_at | timestamp without time zone | Yes | now() |

**Indexes:**
- idx_transfer_queue_batch
- idx_transfer_queue_status
- idx_transfer_queue_utr
- sp_v2_bank_transfer_queue_pkey

**Foreign Keys:**
- batch_id → sp_v2_settlement_batches.id

## Table: sp_v2_batch_job_logs

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | bigint | No | nextval('sp_v2_batch_job_logs_id_seq'::regclass) |
| job_type | character varying(50) | No | - |
| job_date | date | No | - |
| merchants_processed | integer | Yes | 0 |
| merchants_success | integer | Yes | 0 |
| merchants_failed | integer | Yes | 0 |
| total_transactions_synced | integer | Yes | 0 |
| duration_seconds | numeric | Yes | - |
| status | character varying(20) | Yes | - |
| details | jsonb | Yes | - |
| error_message | text | Yes | - |
| created_at | timestamp with time zone | Yes | now() |

**Indexes:**
- idx_batch_job_logs_date
- idx_batch_job_logs_type_status
- sp_v2_batch_job_logs_pkey

## Table: sp_v2_chargeback_audit

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | No | gen_random_uuid() |
| chargeback_id | uuid | No | - |
| action | text | No | - |
| before_value | jsonb | Yes | - |
| after_value | jsonb | No | - |
| performed_by | character varying(100) | Yes | - |
| role | text | Yes | - |
| ip_address | inet | Yes | - |
| user_agent | text | Yes | - |
| reason | text | Yes | - |
| notes | text | Yes | - |
| created_at | timestamp with time zone | No | now() |

**Indexes:**
- idx_sp_v2_chargeback_audit_action
- idx_sp_v2_chargeback_audit_chargeback
- idx_sp_v2_chargeback_audit_created
- sp_v2_chargeback_audit_pkey

**Foreign Keys:**
- chargeback_id → sp_v2_chargebacks.id

## Table: sp_v2_chargeback_correlations

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | No | gen_random_uuid() |
| chargeback_id | uuid | No | - |
| pg_transaction_id | character varying(255) | Yes | - |
| bank_transaction_id | character varying(255) | Yes | - |
| settlement_batch_id | character varying(100) | Yes | - |
| correlation_method | text | No | - |
| confidence_score | numeric | Yes | - |
| match_criteria | jsonb | Yes | - |
| verified | boolean | Yes | false |
| verified_by | character varying(100) | Yes | - |
| verified_at | timestamp with time zone | Yes | - |
| matched_at | timestamp with time zone | No | now() |
| matched_by | character varying(100) | Yes | - |
| created_at | timestamp with time zone | No | now() |

**Indexes:**
- idx_sp_v2_chargeback_correlations_bank_txn
- idx_sp_v2_chargeback_correlations_chargeback
- idx_sp_v2_chargeback_correlations_pg_txn
- sp_v2_chargeback_correlations_pkey

**Foreign Keys:**
- chargeback_id → sp_v2_chargebacks.id

## Table: sp_v2_chargeback_documents

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | No | gen_random_uuid() |
| chargeback_id | uuid | No | - |
| kind | text | No | - |
| file_name | text | No | - |
| file_type | character varying(50) | Yes | - |
| file_size_bytes | bigint | No | - |
| s3_bucket | character varying(255) | Yes | - |
| s3_key | text | No | - |
| s3_url | text | Yes | - |
| sha256 | text | No | - |
| encrypted | boolean | Yes | false |
| description | text | Yes | - |
| uploaded_by | character varying(100) | Yes | - |
| uploaded_at | timestamp with time zone | No | now() |
| created_at | timestamp with time zone | No | now() |

**Indexes:**
- idx_sp_v2_chargeback_documents_chargeback
- idx_sp_v2_chargeback_documents_kind
- sp_v2_chargeback_documents_pkey

**Foreign Keys:**
- chargeback_id → sp_v2_chargebacks.id

## Table: sp_v2_chargeback_representments

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | No | gen_random_uuid() |
| chargeback_id | uuid | No | - |
| submitted_at | timestamp with time zone | No | now() |
| submitted_by | character varying(100) | Yes | - |
| submission_method | character varying(50) | Yes | - |
| evidence_summary | text | Yes | - |
| evidence_document_count | integer | Yes | 0 |
| response_received_at | timestamp with time zone | Yes | - |
| network_response | text | Yes | - |
| response_document_id | uuid | Yes | - |
| outcome | text | Yes | - |
| outcome_amount_paise | bigint | Yes | - |
| outcome_reason | text | Yes | - |
| created_at | timestamp with time zone | No | now() |

**Indexes:**
- idx_sp_v2_chargeback_representments_chargeback
- idx_sp_v2_chargeback_representments_outcome
- sp_v2_chargeback_representments_pkey

**Foreign Keys:**
- chargeback_id → sp_v2_chargebacks.id
- response_document_id → sp_v2_chargeback_documents.id

## Table: sp_v2_chargebacks

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | No | gen_random_uuid() |
| merchant_id | character varying(100) | No | - |
| merchant_name | character varying(255) | Yes | - |
| acquirer | text | No | - |
| network_case_id | text | No | - |
| case_ref | character varying(100) | Yes | - |
| txn_ref | text | No | - |
| original_transaction_id | character varying(255) | Yes | - |
| gateway_txn_id | character varying(255) | Yes | - |
| utr | character varying(255) | Yes | - |
| rrn | character varying(255) | Yes | - |
| original_gross_paise | bigint | No | - |
| chargeback_paise | bigint | No | - |
| fees_paise | bigint | No | 0 |
| recovered_paise | bigint | No | 0 |
| pending_recovery_paise | bigint | No | 0 |
| writeoff_paise | bigint | No | 0 |
| currency | text | No | 'INR'::text |
| reason_code | text | No | - |
| reason_description | text | Yes | - |
| customer_complaint | text | Yes | - |
| stage | text | No | 'NEW'::text |
| outcome | text | Yes | - |
| status | text | No | 'OPEN'::text |
| assigned_to | character varying(100) | Yes | - |
| assigned_team | character varying(50) | Yes | - |
| received_at | timestamp with time zone | No | now() |
| deadline_at | timestamp with time zone | Yes | - |
| evidence_due_at | timestamp with time zone | Yes | - |
| responded_at | timestamp with time zone | Yes | - |
| closed_at | timestamp with time zone | Yes | - |
| source_system | character varying(50) | Yes | 'MANUAL'::character varying |
| external_reference | jsonb | Yes | - |
| notes | text | Yes | - |
| tags | ARRAY | Yes | - |
| created_at | timestamp with time zone | No | now() |
| updated_at | timestamp with time zone | No | now() |
| created_by | character varying(100) | Yes | - |
| updated_by | character varying(100) | Yes | - |

**Indexes:**
- chargeback_acquirer_network_case_unique
- idx_sp_v2_chargebacks_assigned
- idx_sp_v2_chargebacks_case_ref
- idx_sp_v2_chargebacks_deadline
- idx_sp_v2_chargebacks_merchant
- idx_sp_v2_chargebacks_received_at
- idx_sp_v2_chargebacks_stage
- idx_sp_v2_chargebacks_txn_ref
- idx_sp_v2_chargebacks_utr
- sp_v2_chargebacks_pkey

## Table: sp_v2_commission_tiers

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | No | gen_random_uuid() |
| tier_name | character varying(50) | No | - |
| min_volume_paise | bigint | No | - |
| max_volume_paise | bigint | Yes | - |
| commission_percentage | numeric | No | - |
| effective_from | date | No | - |
| effective_to | date | Yes | - |
| is_active | boolean | Yes | true |
| created_at | timestamp without time zone | Yes | now() |

**Indexes:**
- sp_v2_commission_tiers_pkey

## Table: sp_v2_connector_runs

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | bigint | No | nextval('sp_v2_connector_runs_id_seq'::regclass) |
| connector_id | bigint | No | - |
| run_type | character varying(50) | No | - |
| run_date | date | Yes | - |
| status | character varying(20) | No | - |
| records_processed | integer | Yes | 0 |
| records_success | integer | Yes | 0 |
| records_failed | integer | Yes | 0 |
| duration_seconds | numeric | Yes | - |
| error_message | text | Yes | - |
| details | jsonb | Yes | - |
| started_at | timestamp with time zone | Yes | now() |
| completed_at | timestamp with time zone | Yes | - |
| triggered_by | character varying(100) | Yes | - |

**Indexes:**
- idx_connector_runs_connector_id
- idx_connector_runs_started_at
- idx_connector_runs_status
- sp_v2_connector_runs_pkey

**Foreign Keys:**
- connector_id → sp_v2_connectors.id

## Table: sp_v2_connector_sync_history

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | bigint | No | nextval('sp_v2_connector_sync_history_id_seq'::regclass) |
| connector_id | integer | No | - |
| sync_timestamp | timestamp with time zone | No | - |
| sync_status | character varying(20) | No | - |
| records_processed | integer | Yes | 0 |
| records_failed | integer | Yes | 0 |
| file_name | character varying(255) | Yes | - |
| file_size_bytes | bigint | Yes | - |
| processing_duration_ms | integer | Yes | - |
| error_message | text | Yes | - |
| created_at | timestamp with time zone | Yes | now() |

**Indexes:**
- sp_v2_connector_sync_history_pkey

## Table: sp_v2_connectors

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | bigint | No | nextval('sp_v2_connectors_id_seq'::regclass) |
| name | character varying(255) | No | - |
| connector_type | character varying(50) | No | - |
| source_entity | character varying(100) | No | - |
| status | character varying(20) | No | 'ACTIVE'::character varying |
| connection_config | jsonb | No | - |
| schedule_enabled | boolean | Yes | true |
| schedule_cron | character varying(100) | Yes | - |
| schedule_timezone | character varying(50) | Yes | 'Asia/Kolkata'::character varying |
| last_run_at | timestamp with time zone | Yes | - |
| last_run_status | character varying(20) | Yes | - |
| last_run_details | jsonb | Yes | - |
| success_count | integer | Yes | 0 |
| failure_count | integer | Yes | 0 |
| total_runs | integer | Yes | 0 |
| created_at | timestamp with time zone | Yes | now() |
| updated_at | timestamp with time zone | Yes | now() |
| created_by | character varying(100) | Yes | - |

**Indexes:**
- idx_connectors_last_run
- idx_connectors_status
- idx_connectors_type
- sp_v2_connectors_pkey
- unique_connector_name

## Table: sp_v2_daily_kpis

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | bigint | No | nextval('sp_v2_daily_kpis_id_seq'::regclass) |
| summary_date | date | No | - |
| total_transactions | integer | Yes | 0 |
| total_amount_paise | bigint | Yes | 0 |
| matched_transactions | integer | Yes | 0 |
| matched_amount_paise | bigint | Yes | 0 |
| unmatched_transactions | integer | Yes | 0 |
| exception_transactions | integer | Yes | 0 |
| match_rate_percentage | numeric | Yes | 0.00 |
| manual_upload_transactions | integer | Yes | 0 |
| connector_transactions | integer | Yes | 0 |
| manual_upload_matched | integer | Yes | 0 |
| connector_matched | integer | Yes | 0 |
| captured_count | integer | Yes | 0 |
| in_settlement_count | integer | Yes | 0 |
| sent_to_bank_count | integer | Yes | 0 |
| credited_count | integer | Yes | 0 |
| unsettled_count | integer | Yes | 0 |
| calculated_at | timestamp with time zone | Yes | now() |

**Indexes:**
- idx_daily_kpis_date
- sp_v2_daily_kpis_pkey
- sp_v2_daily_kpis_summary_date_key

## Table: sp_v2_exception_actions

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | bigint | No | nextval('sp_v2_exception_actions_id_seq'::regclass) |
| exception_id | character varying(50) | No | - |
| user_id | character varying(100) | No | - |
| user_name | character varying(255) | Yes | - |
| action | character varying(50) | No | - |
| timestamp | timestamp with time zone | Yes | now() |
| before_status | character varying(20) | Yes | - |
| after_status | character varying(20) | Yes | - |
| before_severity | character varying(20) | Yes | - |
| after_severity | character varying(20) | Yes | - |
| before_assigned_to | character varying(100) | Yes | - |
| after_assigned_to | character varying(100) | Yes | - |
| note | text | Yes | - |
| metadata | jsonb | Yes | - |

**Indexes:**
- idx_exception_action_exception
- idx_exception_action_timestamp
- idx_exception_action_user
- sp_v2_exception_actions_pkey

**Foreign Keys:**
- exception_id → sp_v2_exception_workflow.exception_id

## Table: sp_v2_exception_comments

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | bigint | No | nextval('sp_v2_exception_comments_id_seq'::regclass) |
| exception_id | character varying(50) | No | - |
| user_id | character varying(100) | No | - |
| user_name | character varying(255) | Yes | - |
| comment | text | No | - |
| mentions | ARRAY | Yes | - |
| created_at | timestamp with time zone | Yes | now() |

**Indexes:**
- idx_exception_comment_exception
- sp_v2_exception_comments_pkey

**Foreign Keys:**
- exception_id → sp_v2_exception_workflow.exception_id

## Table: sp_v2_exception_reasons

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | integer | No | nextval('sp_v2_exception_reasons_id_seq'::regclass) |
| reason_code | character varying(50) | No | - |
| reason_label | character varying(255) | No | - |
| description | text | Yes | - |
| default_severity | character varying(20) | Yes | 'MEDIUM'::character varying |
| is_active | boolean | Yes | true |
| created_at | timestamp with time zone | Yes | now() |

**Indexes:**
- sp_v2_exception_reasons_pkey
- sp_v2_exception_reasons_reason_code_key

## Table: sp_v2_exception_rules

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | integer | No | nextval('sp_v2_exception_rules_id_seq'::regclass) |
| rule_name | character varying(255) | No | - |
| priority | integer | No | 100 |
| enabled | boolean | Yes | true |
| scope_reason_codes | ARRAY | Yes | - |
| scope_amount_delta_gt | bigint | Yes | - |
| scope_amount_delta_lt | bigint | Yes | - |
| scope_age_gt | integer | Yes | - |
| scope_age_lt | integer | Yes | - |
| scope_acquirers | ARRAY | Yes | - |
| scope_merchants | ARRAY | Yes | - |
| scope_tags_includes | ARRAY | Yes | - |
| scope_tags_excludes | ARRAY | Yes | - |
| scope_status | ARRAY | Yes | - |
| scope_severity | ARRAY | Yes | - |
| actions | jsonb | No | - |
| created_by | character varying(100) | Yes | - |
| updated_by | character varying(100) | Yes | - |
| created_at | timestamp with time zone | Yes | now() |
| updated_at | timestamp with time zone | Yes | now() |
| last_applied_at | timestamp with time zone | Yes | - |
| applied_count | integer | Yes | 0 |

**Indexes:**
- idx_rule_enabled
- idx_rule_priority
- sp_v2_exception_rules_pkey

## Table: sp_v2_exception_saved_views

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | integer | No | nextval('sp_v2_exception_saved_views_id_seq'::regclass) |
| view_name | character varying(255) | No | - |
| description | text | Yes | - |
| query | jsonb | No | - |
| owner_id | character varying(100) | No | - |
| owner_name | character varying(255) | Yes | - |
| shared | boolean | Yes | false |
| created_at | timestamp with time zone | Yes | now() |
| updated_at | timestamp with time zone | Yes | now() |
| last_used_at | timestamp with time zone | Yes | - |
| use_count | integer | Yes | 0 |

**Indexes:**
- idx_saved_view_owner
- idx_saved_view_shared
- sp_v2_exception_saved_views_pkey

## Table: sp_v2_exception_workflow

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | bigint | No | nextval('sp_v2_exception_workflow_id_seq'::regclass) |
| exception_id | character varying(50) | No | - |
| transaction_id | bigint | No | - |
| bank_statement_id | bigint | Yes | - |
| reason | character varying(50) | No | 'AMOUNT_MISMATCH'::character varying |
| severity | character varying(20) | No | 'MEDIUM'::character varying |
| status | character varying(20) | No | 'open'::character varying |
| assigned_to | character varying(100) | Yes | - |
| assigned_to_name | character varying(255) | Yes | - |
| assigned_at | timestamp with time zone | Yes | - |
| tags | ARRAY | Yes | ARRAY[]::text[] |
| sla_due_at | timestamp with time zone | No | - |
| sla_breached | boolean | Yes | false |
| last_transition_at | timestamp with time zone | Yes | now() |
| snooze_until | timestamp with time zone | Yes | - |
| snoozed_by | character varying(100) | Yes | - |
| snooze_reason | text | Yes | - |
| resolved_at | timestamp with time zone | Yes | - |
| resolved_by | character varying(100) | Yes | - |
| resolution | character varying(50) | Yes | - |
| resolution_note | text | Yes | - |
| pg_amount_paise | bigint | Yes | - |
| bank_amount_paise | bigint | Yes | - |
| amount_delta_paise | bigint | Yes | - |
| source_job_id | character varying(100) | Yes | - |
| rule_applied | character varying(100) | Yes | - |
| merchant_id | character varying(50) | Yes | - |
| merchant_name | character varying(255) | Yes | - |
| acquirer_code | character varying(50) | Yes | - |
| cycle_date | date | Yes | - |
| pg_transaction_id | character varying(100) | Yes | - |
| bank_reference_id | character varying(100) | Yes | - |
| utr | character varying(100) | Yes | - |
| created_at | timestamp with time zone | Yes | now() |
| updated_at | timestamp with time zone | Yes | now() |

**Indexes:**
- idx_exception_assigned
- idx_exception_created
- idx_exception_cycle
- idx_exception_merchant
- idx_exception_reason
- idx_exception_severity
- idx_exception_sla
- idx_exception_status
- idx_exception_transaction
- sp_v2_exception_workflow_exception_id_key
- sp_v2_exception_workflow_pkey

**Foreign Keys:**
- transaction_id → sp_v2_transactions.id
- bank_statement_id → sp_v2_bank_statements.id

## Table: sp_v2_exceptions_summary

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | bigint | No | nextval('sp_v2_exceptions_summary_id_seq'::regclass) |
| summary_date | date | No | - |
| reason_code | character varying(50) | No | - |
| severity | character varying(20) | No | - |
| exception_count | integer | Yes | 0 |
| total_amount_paise | bigint | Yes | 0 |
| manual_upload_count | integer | Yes | 0 |
| connector_count | integer | Yes | 0 |
| last_updated | timestamp with time zone | Yes | now() |

**Indexes:**
- idx_exception_summary_date
- sp_v2_exceptions_summary_pkey
- sp_v2_exceptions_summary_summary_date_reason_code_severity_key

## Table: sp_v2_fee_bearer_types

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | integer | No | nextval('sp_v2_fee_bearer_types_id_seq'::regclass) |
| name | character varying(50) | No | - |
| code | character varying(10) | No | - |
| description | text | Yes | - |
| is_active | boolean | Yes | true |
| created_at | timestamp without time zone | Yes | now() |

**Indexes:**
- sp_v2_fee_bearer_types_code_key
- sp_v2_fee_bearer_types_pkey

## Table: sp_v2_merchant_commission_config

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | No | gen_random_uuid() |
| merchant_id | character varying(50) | No | - |
| payment_mode | character varying(50) | No | - |
| payment_mode_id | character varying(10) | Yes | - |
| bank_code | character varying(100) | Yes | - |
| bank_name | character varying(100) | Yes | - |
| commission_value | numeric | No | - |
| commission_type | character varying(20) | No | - |
| gst_percentage | numeric | Yes | 18.0 |
| slab_floor | numeric | Yes | - |
| slab_ceiling | numeric | Yes | - |
| is_active | boolean | Yes | true |
| synced_at | timestamp without time zone | Yes | now() |
| created_at | timestamp without time zone | Yes | now() |
| updated_at | timestamp without time zone | Yes | now() |

**Indexes:**
- idx_v2_commission_active
- idx_v2_commission_bank
- idx_v2_commission_merchant
- idx_v2_commission_mode
- sp_v2_merchant_commission_config_pkey
- unique_merchant_commission

## Table: sp_v2_merchant_fee_bearer_config

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | No | gen_random_uuid() |
| merchant_id | character varying(50) | No | - |
| payment_mode_id | character varying(5) | No | - |
| fee_bearer_code | character varying(10) | No | - |
| is_active | boolean | Yes | true |
| synced_at | timestamp without time zone | Yes | now() |
| created_at | timestamp without time zone | Yes | now() |
| updated_at | timestamp without time zone | Yes | now() |

**Indexes:**
- idx_v2_fee_bearer_merchant
- idx_v2_fee_bearer_mode
- sp_v2_merchant_fee_bearer_config_pkey
- unique_merchant_fee_bearer

**Foreign Keys:**
- fee_bearer_code → sp_v2_fee_bearer_types.code

## Table: sp_v2_merchant_master

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| merchant_id | character varying(50) | No | - |
| merchant_name | character varying(255) | No | - |
| merchant_email | character varying(255) | Yes | - |
| merchant_phone | character varying(50) | Yes | - |
| rolling_reserve_enabled | boolean | Yes | false |
| rolling_reserve_percentage | numeric | Yes | 0.00 |
| reserve_hold_days | integer | Yes | 0 |
| settlement_cycle | integer | Yes | 1 |
| is_active | boolean | Yes | true |
| synced_at | timestamp without time zone | Yes | now() |
| created_at | timestamp without time zone | Yes | now() |
| updated_at | timestamp without time zone | Yes | now() |

**Indexes:**
- idx_v2_merchant_active
- idx_v2_merchant_synced
- sp_v2_merchant_master_pkey

## Table: sp_v2_merchant_settlement_config

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | No | gen_random_uuid() |
| merchant_id | character varying(50) | No | - |
| merchant_name | character varying(200) | Yes | - |
| settlement_frequency | character varying(20) | No | 'daily'::character varying |
| settlement_day | integer | Yes | - |
| settlement_time | time without time zone | Yes | '23:00:00'::time without time zone |
| auto_settle | boolean | Yes | true |
| min_settlement_amount_paise | bigint | Yes | 10000 |
| settlement_currency | character varying(3) | Yes | 'INR'::character varying |
| account_holder_name | character varying(200) | Yes | - |
| account_number | character varying(30) | Yes | - |
| ifsc_code | character varying(11) | Yes | - |
| bank_name | character varying(100) | Yes | - |
| branch_name | character varying(100) | Yes | - |
| account_type | character varying(20) | Yes | - |
| preferred_transfer_mode | character varying(20) | Yes | 'NEFT'::character varying |
| is_active | boolean | Yes | true |
| created_at | timestamp without time zone | Yes | now() |
| updated_at | timestamp without time zone | Yes | now() |
| created_by | character varying(100) | Yes | - |

**Indexes:**
- idx_merchant_settlement_config_active
- idx_merchant_settlement_config_auto
- sp_v2_merchant_settlement_config_merchant_id_key
- sp_v2_merchant_settlement_config_pkey

## Table: sp_v2_merchants

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | No | gen_random_uuid() |
| name | character varying(255) | No | - |
| gstin | character varying(15) | Yes | - |
| pan | character varying(10) | Yes | - |
| risk_score | integer | Yes | 0 |
| kyc_status | character varying(20) | Yes | 'PENDING'::character varying |
| bank_account_number | character varying(50) | Yes | - |
| bank_ifsc_code | character varying(11) | Yes | - |
| is_active | boolean | Yes | true |
| created_at | timestamp with time zone | Yes | now() |
| updated_at | timestamp with time zone | Yes | now() |

**Indexes:**
- sp_v2_merchants_pkey

## Table: sp_v2_payment_mode_master

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | integer | No | nextval('sp_v2_payment_mode_master_id_seq'::regclass) |
| mode_id | character varying(10) | No | - |
| mode_name | character varying(100) | No | - |
| mode_category | character varying(50) | Yes | - |
| is_active | boolean | Yes | true |
| created_at | timestamp without time zone | Yes | now() |

**Indexes:**
- sp_v2_payment_mode_master_mode_id_key
- sp_v2_payment_mode_master_pkey

## Table: sp_v2_recon_matches

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | No | gen_random_uuid() |
| utr_id | uuid | No | - |
| item_id | uuid | No | - |
| match_type | character varying(10) | Yes | - |
| match_score | smallint | Yes | - |
| amount_difference_paise | bigint | Yes | 0 |
| matched_by | character varying(50) | Yes | 'SYSTEM'::character varying |
| notes | text | Yes | - |
| created_at | timestamp with time zone | Yes | now() |

**Indexes:**
- idx_recon_matches_item
- idx_recon_matches_type
- idx_recon_matches_utr
- sp_v2_recon_matches_pkey
- sp_v2_recon_matches_utr_id_item_id_key

**Foreign Keys:**
- utr_id → sp_v2_utr_credits.id

## Table: sp_v2_reconciliation_jobs

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | bigint | No | nextval('sp_v2_reconciliation_jobs_id_seq'::regclass) |
| job_id | character varying(100) | No | - |
| job_name | character varying(255) | No | - |
| date_from | date | No | - |
| date_to | date | No | - |
| source_types | ARRAY | Yes | - |
| total_pg_records | integer | Yes | 0 |
| total_bank_records | integer | Yes | 0 |
| matched_records | integer | Yes | 0 |
| unmatched_pg | integer | Yes | 0 |
| unmatched_bank | integer | Yes | 0 |
| exception_records | integer | Yes | 0 |
| total_amount_paise | bigint | Yes | 0 |
| reconciled_amount_paise | bigint | Yes | 0 |
| variance_amount_paise | bigint | Yes | 0 |
| status | character varying(20) | Yes | 'RUNNING'::character varying |
| processing_start | timestamp with time zone | Yes | now() |
| processing_end | timestamp with time zone | Yes | - |
| created_at | timestamp with time zone | Yes | now() |

**Indexes:**
- sp_v2_reconciliation_jobs_job_id_key
- sp_v2_reconciliation_jobs_pkey

## Table: sp_v2_reconciliation_results

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | bigint | No | nextval('sp_v2_reconciliation_results_id_seq'::regclass) |
| job_id | character varying(100) | No | - |
| pg_transaction_id | character varying(100) | Yes | - |
| bank_statement_id | bigint | Yes | - |
| match_status | character varying(20) | No | - |
| match_score | numeric | Yes | - |
| exception_reason_code | character varying(50) | Yes | - |
| exception_severity | character varying(20) | Yes | - |
| exception_message | text | Yes | - |
| pg_amount_paise | bigint | Yes | - |
| bank_amount_paise | bigint | Yes | - |
| variance_paise | bigint | Yes | - |
| created_at | timestamp with time zone | Yes | now() |

**Indexes:**
- idx_reconciliation_dashboard_metrics
- sp_v2_reconciliation_results_pkey

## Table: sp_v2_recovery_actions

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | No | gen_random_uuid() |
| chargeback_id | uuid | No | - |
| kind | text | No | - |
| amount_paise | bigint | No | - |
| status | text | No | 'QUEUED'::text |
| executed_at | timestamp with time zone | Yes | - |
| executed_amount_paise | bigint | Yes | 0 |
| failure_code | text | Yes | - |
| failure_reason | text | Yes | - |
| retry_count | integer | Yes | 0 |
| settlement_batch_id | character varying(100) | Yes | - |
| reserve_transaction_id | uuid | Yes | - |
| invoice_id | character varying(100) | Yes | - |
| payment_link_id | character varying(100) | Yes | - |
| notes | text | Yes | - |
| created_by | character varying(100) | Yes | - |
| executed_by | character varying(100) | Yes | - |
| created_at | timestamp with time zone | No | now() |
| updated_at | timestamp with time zone | No | now() |

**Indexes:**
- idx_sp_v2_recovery_actions_chargeback
- idx_sp_v2_recovery_actions_created
- idx_sp_v2_recovery_actions_status
- sp_v2_recovery_actions_pkey

**Foreign Keys:**
- chargeback_id → sp_v2_chargebacks.id

## Table: sp_v2_rolling_reserve_ledger

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | No | gen_random_uuid() |
| settlement_batch_id | uuid | Yes | - |
| merchant_id | character varying(50) | No | - |
| reserve_amount_paise | bigint | No | - |
| released_amount_paise | bigint | Yes | 0 |
| balance_paise | bigint | No | - |
| hold_date | date | No | - |
| release_date | date | No | - |
| released_at | timestamp without time zone | Yes | - |
| status | character varying(20) | Yes | 'HELD'::character varying |
| reserve_percentage | numeric | Yes | - |
| hold_days | integer | Yes | - |
| created_at | timestamp without time zone | Yes | now() |
| updated_at | timestamp without time zone | Yes | now() |

**Indexes:**
- idx_v2_reserve_batch
- idx_v2_reserve_merchant
- idx_v2_reserve_release_date
- idx_v2_reserve_status
- sp_v2_rolling_reserve_ledger_pkey

**Foreign Keys:**
- settlement_batch_id → sp_v2_settlement_batches.id

## Table: sp_v2_settlement_approvals

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | No | gen_random_uuid() |
| batch_id | uuid | No | - |
| approval_level | integer | Yes | 1 |
| approver_id | character varying(100) | Yes | - |
| approver_name | character varying(200) | Yes | - |
| approver_role | character varying(50) | Yes | - |
| decision | character varying(20) | No | - |
| decision_at | timestamp without time zone | Yes | now() |
| approval_notes | text | Yes | - |
| rejection_reason | text | Yes | - |
| requires_manager_approval | boolean | Yes | false |
| manager_approved_by | character varying(100) | Yes | - |
| manager_approved_at | timestamp without time zone | Yes | - |
| created_at | timestamp without time zone | Yes | now() |

**Indexes:**
- idx_approvals_batch
- idx_approvals_decision
- sp_v2_settlement_approvals_pkey

**Foreign Keys:**
- batch_id → sp_v2_settlement_batches.id

## Table: sp_v2_settlement_bank_transfers

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | No | gen_random_uuid() |
| settlement_batch_id | uuid | No | - |
| merchant_id | character varying(50) | No | - |
| amount_paise | bigint | No | - |
| bank_account_number | character varying(30) | Yes | - |
| ifsc_code | character varying(11) | Yes | - |
| transfer_mode | character varying(20) | Yes | - |
| utr_number | character varying(50) | Yes | - |
| transfer_date | date | Yes | - |
| status | character varying(20) | Yes | 'PENDING'::character varying |
| failure_reason | text | Yes | - |
| created_at | timestamp without time zone | Yes | now() |
| updated_at | timestamp without time zone | Yes | now() |

**Indexes:**
- idx_bank_transfers_batch
- idx_bank_transfers_merchant
- idx_bank_transfers_status
- sp_v2_settlement_bank_transfers_pkey

**Foreign Keys:**
- settlement_batch_id → sp_v2_settlement_batches.id

## Table: sp_v2_settlement_batches

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | No | gen_random_uuid() |
| merchant_id | character varying(50) | No | - |
| merchant_name | character varying(200) | Yes | - |
| cycle_date | date | No | - |
| total_transactions | integer | No | 0 |
| gross_amount_paise | bigint | No | 0 |
| total_commission_paise | bigint | No | 0 |
| total_gst_paise | bigint | No | 0 |
| total_reserve_paise | bigint | No | 0 |
| net_amount_paise | bigint | No | 0 |
| status | character varying(30) | Yes | 'PENDING_APPROVAL'::character varying |
| created_at | timestamp without time zone | Yes | now() |
| updated_at | timestamp without time zone | Yes | now() |
| approved_at | timestamp without time zone | Yes | - |
| approved_by | character varying(100) | Yes | - |
| settlement_completed_at | timestamp without time zone | Yes | - |
| bank_reference_number | character varying(100) | Yes | - |
| remarks | text | Yes | - |
| settlement_run_id | uuid | Yes | - |
| approval_status | character varying(20) | Yes | 'pending_approval'::character varying |
| transfer_status | character varying(20) | Yes | 'not_initiated'::character varying |
| settled_at | timestamp without time zone | Yes | - |
| acquirer_code | character varying(50) | Yes | - |

**Indexes:**
- idx_settlement_batches_cycle_date
- idx_settlement_batches_merchant
- idx_settlement_batches_status
- sp_v2_settlement_batches_pkey

**Foreign Keys:**
- settlement_run_id → sp_v2_settlement_schedule_runs.id

## Table: sp_v2_settlement_deductions

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | No | gen_random_uuid() |
| recovery_action_id | uuid | No | - |
| chargeback_id | uuid | No | - |
| settlement_batch_id | character varying(100) | Yes | - |
| settlement_date | date | Yes | - |
| merchant_id | character varying(100) | No | - |
| deduction_paise | bigint | No | - |
| settlement_gross_paise | bigint | Yes | - |
| max_deduction_percent | numeric | Yes | 30.00 |
| status | text | No | 'PENDING'::text |
| applied_at | timestamp with time zone | Yes | - |
| applied_by | character varying(100) | Yes | - |
| failure_reason | text | Yes | - |
| created_at | timestamp with time zone | No | now() |
| updated_at | timestamp with time zone | No | now() |

**Indexes:**
- idx_sp_v2_settlement_deductions_batch
- idx_sp_v2_settlement_deductions_merchant
- idx_sp_v2_settlement_deductions_recovery
- sp_v2_settlement_deductions_pkey

**Foreign Keys:**
- recovery_action_id → sp_v2_recovery_actions.id
- chargeback_id → sp_v2_chargebacks.id

## Table: sp_v2_settlement_errors

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | No | gen_random_uuid() |
| error_type | character varying(50) | No | - |
| merchant_id | character varying(50) | Yes | - |
| batch_id | uuid | Yes | - |
| transfer_id | uuid | Yes | - |
| error_message | text | No | - |
| error_code | character varying(50) | Yes | - |
| error_stack | text | Yes | - |
| error_context | jsonb | Yes | - |
| is_resolved | boolean | Yes | false |
| resolved_at | timestamp without time zone | Yes | - |
| resolved_by | character varying(100) | Yes | - |
| resolution_notes | text | Yes | - |
| created_at | timestamp without time zone | Yes | now() |

**Indexes:**
- idx_settlement_errors_merchant
- idx_settlement_errors_resolved
- idx_settlement_errors_type
- sp_v2_settlement_errors_pkey

**Foreign Keys:**
- batch_id → sp_v2_settlement_batches.id
- transfer_id → sp_v2_bank_transfer_queue.id

## Table: sp_v2_settlement_items

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | No | gen_random_uuid() |
| settlement_batch_id | uuid | No | - |
| transaction_id | character varying(100) | No | - |
| amount_paise | bigint | No | - |
| commission_paise | bigint | Yes | 0 |
| gst_paise | bigint | Yes | 0 |
| reserve_paise | bigint | Yes | 0 |
| net_paise | bigint | No | - |
| payment_mode | character varying(50) | Yes | - |
| fee_bearer | character varying(20) | Yes | - |
| created_at | timestamp without time zone | Yes | now() |
| fee_bearer_code | character varying(10) | Yes | - |
| commission_type | character varying(20) | Yes | - |
| commission_rate | numeric | Yes | - |

**Indexes:**
- idx_settlement_items_batch
- idx_settlement_items_transaction
- sp_v2_settlement_items_pkey

**Foreign Keys:**
- settlement_batch_id → sp_v2_settlement_batches.id

## Table: sp_v2_settlement_schedule_runs

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | No | gen_random_uuid() |
| run_date | date | No | - |
| run_timestamp | timestamp without time zone | Yes | now() |
| trigger_type | character varying(20) | No | - |
| triggered_by | character varying(100) | Yes | - |
| total_merchants_eligible | integer | Yes | 0 |
| merchants_processed | integer | Yes | 0 |
| batches_created | integer | Yes | 0 |
| total_amount_settled_paise | bigint | Yes | 0 |
| status | character varying(20) | Yes | 'running'::character varying |
| errors_count | integer | Yes | 0 |
| error_details | jsonb | Yes | - |
| started_at | timestamp without time zone | Yes | now() |
| completed_at | timestamp without time zone | Yes | - |
| duration_seconds | integer | Yes | - |
| execution_log | text | Yes | - |

**Indexes:**
- idx_settlement_runs_date
- idx_settlement_runs_status
- sp_v2_settlement_schedule_runs_pkey

## Table: sp_v2_settlement_transaction_map

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | No | gen_random_uuid() |
| settlement_batch_id | uuid | Yes | - |
| transaction_id | uuid | Yes | - |
| created_at | timestamp with time zone | Yes | now() |

**Indexes:**
- idx_settlement_txn_map_batch
- idx_settlement_txn_map_txn
- sp_v2_settlement_transaction__settlement_batch_id_transacti_key
- sp_v2_settlement_transaction_map_pkey

**Foreign Keys:**
- transaction_id → sp_v2_transactions_v1.id

## Table: sp_v2_settlements

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | bigint | No | nextval('sp_v2_settlements_id_seq'::regclass) |
| settlement_id | character varying(100) | No | - |
| merchant_id | character varying(50) | No | - |
| settlement_date | date | No | - |
| cycle_date | date | No | - |
| pipeline_status | character varying(30) | No | - |
| gross_amount_paise | bigint | No | - |
| fees_paise | bigint | Yes | 0 |
| tax_paise | bigint | Yes | 0 |
| net_amount_paise | bigint | No | - |
| captured_at | timestamp with time zone | Yes | - |
| settlement_initiated_at | timestamp with time zone | Yes | - |
| bank_transfer_at | timestamp with time zone | Yes | - |
| credited_at | timestamp with time zone | Yes | - |
| reconciliation_job_id | character varying(100) | Yes | - |
| created_at | timestamp with time zone | Yes | now() |
| updated_at | timestamp with time zone | Yes | now() |

**Indexes:**
- idx_settlements_pipeline_status
- sp_v2_settlements_pkey
- sp_v2_settlements_settlement_id_key

## Table: sp_v2_sla_config

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | integer | No | nextval('sp_v2_sla_config_id_seq'::regclass) |
| reason | character varying(50) | No | - |
| severity | character varying(20) | No | - |
| hours_to_resolve | integer | No | - |
| is_active | boolean | Yes | true |
| created_at | timestamp with time zone | Yes | now() |
| updated_at | timestamp with time zone | Yes | now() |

**Indexes:**
- sp_v2_sla_config_pkey
- sp_v2_sla_config_reason_severity_key

## Table: sp_v2_sync_log

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | No | gen_random_uuid() |
| sync_type | character varying(50) | No | - |
| sync_mode | character varying(20) | No | - |
| records_synced | integer | Yes | 0 |
| records_updated | integer | Yes | 0 |
| records_inserted | integer | Yes | 0 |
| records_failed | integer | Yes | 0 |
| started_at | timestamp without time zone | No | - |
| completed_at | timestamp without time zone | Yes | - |
| duration_seconds | integer | Yes | - |
| status | character varying(20) | Yes | 'RUNNING'::character varying |
| error_message | text | Yes | - |
| triggered_by | character varying(100) | Yes | - |
| sync_params | jsonb | Yes | - |
| created_at | timestamp without time zone | Yes | now() |

**Indexes:**
- idx_v2_sync_started
- idx_v2_sync_status
- idx_v2_sync_type
- sp_v2_sync_log_pkey

## Table: sp_v2_transactions

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | bigint | No | nextval('sp_v2_transactions_id_seq'::regclass) |
| transaction_id | character varying(100) | No | - |
| merchant_id | character varying(50) | No | - |
| amount_paise | bigint | No | - |
| currency | character varying(3) | Yes | 'INR'::character varying |
| transaction_date | date | No | - |
| transaction_timestamp | timestamp with time zone | No | - |
| source_type | character varying(20) | No | - |
| source_name | character varying(100) | Yes | - |
| batch_id | character varying(100) | Yes | - |
| payment_method | character varying(50) | Yes | - |
| gateway_ref | character varying(100) | Yes | - |
| utr | character varying(50) | Yes | - |
| rrn | character varying(50) | Yes | - |
| status | character varying(20) | Yes | 'PENDING'::character varying |
| created_at | timestamp with time zone | Yes | now() |
| updated_at | timestamp with time zone | Yes | now() |
| exception_reason | character varying(50) | Yes | - |
| settlement_batch_id | uuid | Yes | - |
| settled_at | timestamp without time zone | Yes | - |
| bank_fee_paise | bigint | Yes | 0 |
| settlement_amount_paise | bigint | Yes | 0 |
| fee_variance_paise | bigint | Yes | 0 |
| fee_variance_percentage | numeric | Yes | - |
| acquirer_code | character varying(50) | Yes | - |
| merchant_name | character varying(255) | Yes | - |

**Indexes:**
- idx_transactions_dashboard_summary
- idx_transactions_exception_reason
- sp_v2_transactions_pkey
- sp_v2_transactions_transaction_id_key

**Foreign Keys:**
- settlement_batch_id → sp_v2_settlement_batches.id

## Table: sp_v2_transactions_v1

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | No | gen_random_uuid() |
| merchant_id | uuid | No | - |
| pgw_ref | text | No | - |
| utr | character varying(50) | Yes | - |
| amount_paise | bigint | No | - |
| currency | character(3) | Yes | 'INR'::bpchar |
| payment_mode | character varying(20) | Yes | - |
| status | character varying(20) | Yes | 'PENDING'::character varying |
| customer_email | character varying(255) | Yes | - |
| customer_phone | character varying(15) | Yes | - |
| metadata | jsonb | Yes | - |
| created_at | timestamp with time zone | Yes | now() |
| updated_at | timestamp with time zone | Yes | now() |

**Indexes:**
- idx_transactions_v1_merchant_date
- idx_transactions_v1_pgw_ref
- idx_transactions_v1_utr
- sp_v2_transactions_v1_pgw_ref_key
- sp_v2_transactions_v1_pkey

**Foreign Keys:**
- merchant_id → sp_v2_merchants.id

## Table: sp_v2_utr_credits

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | No | gen_random_uuid() |
| acquirer | text | No | - |
| utr | text | No | - |
| amount_paise | bigint | No | - |
| credited_at | timestamp with time zone | No | - |
| cycle_date | date | No | - |
| bank_reference | character varying(100) | Yes | - |
| raw_data | jsonb | Yes | - |
| bank_file_id | uuid | Yes | - |
| reconciled | boolean | Yes | false |
| created_at | timestamp with time zone | Yes | now() |

**Indexes:**
- idx_utr_credits_acquirer_cycle
- idx_utr_credits_reconciled
- idx_utr_credits_utr
- sp_v2_utr_credits_acquirer_utr_key
- sp_v2_utr_credits_pkey

**Foreign Keys:**
- bank_file_id → sp_v2_bank_files.id
