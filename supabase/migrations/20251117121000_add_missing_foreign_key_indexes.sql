-- ============================================================================
-- Add Missing Foreign Key Indexes
-- Created: 2025-11-17
-- Purpose: Fix unindexed foreign key warnings from Supabase Performance Advisor
--
-- Background:
-- Foreign keys without indexes can cause performance issues, especially when:
-- 1. Performing DELETE operations on referenced tables (cascade checks)
-- 2. Joining tables on foreign key relationships
-- 3. Updating foreign key values
--
-- The database needs to scan the entire referencing table to check constraints
-- without an index, which becomes slower as tables grow.
-- ============================================================================

-- ============================================================================
-- gas_transactions table
-- Missing indexes on foreign keys: event_id and payment_transaction_id
-- ============================================================================

-- Index for gas_transactions.event_id foreign key
-- Use case: Looking up all gas transactions for a specific event
CREATE INDEX IF NOT EXISTS idx_gas_transactions_event_id
  ON public.gas_transactions(event_id)
  WHERE event_id IS NOT NULL;

-- Index for gas_transactions.payment_transaction_id foreign key
-- Use case: Looking up gas costs associated with a payment transaction
CREATE INDEX IF NOT EXISTS idx_gas_transactions_payment_transaction_id
  ON public.gas_transactions(payment_transaction_id)
  WHERE payment_transaction_id IS NOT NULL;

-- ============================================================================
-- gasless_activity_log table
-- Missing index on foreign key: event_id
-- ============================================================================

-- Index for gasless_activity_log.event_id foreign key
-- Use case: Looking up all gasless activities for a specific event
-- Note: This is a nullable foreign key (ON DELETE SET NULL)
CREATE INDEX IF NOT EXISTS idx_gasless_activity_log_event_id
  ON public.gasless_activity_log(event_id)
  WHERE event_id IS NOT NULL;

-- ============================================================================
-- Performance benefits
-- ============================================================================

-- These indexes will improve:
-- 1. CASCADE DELETE performance when deleting events
--    - Without index: Full table scan to find related records
--    - With index: Fast lookup of affected rows
--
-- 2. JOIN query performance
--    - Queries joining gas_transactions/gasless_activity_log with events
--    - Queries joining gas_transactions with paystack_transactions
--
-- 3. Analytics queries
--    - Calculating total gas costs per event
--    - Tracking gasless activity per event
--    - Payment-to-gas cost reconciliation

-- ============================================================================
-- Comments for documentation
-- ============================================================================

COMMENT ON INDEX idx_gas_transactions_event_id
  IS 'Performance index for gas_transactions.event_id foreign key. Improves CASCADE DELETE and JOIN performance.';

COMMENT ON INDEX idx_gas_transactions_payment_transaction_id
  IS 'Performance index for gas_transactions.payment_transaction_id foreign key. Improves payment reconciliation queries.';

COMMENT ON INDEX idx_gasless_activity_log_event_id
  IS 'Performance index for gasless_activity_log.event_id foreign key. Improves event activity tracking and CASCADE operations.';
