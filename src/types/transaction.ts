// src/types/transaction.ts
// WAG ENTERPRISES — Transaction Domain Types

export type TransactionType = 'opening' | 'deposit' | 'payout' | 'withdrawal';
export type TransactionStatus = 'confirmed' | 'reversed';
export type PaymentMethod = 'Cash' | 'Bank Transfer' | 'Mobile Money' | 'Disbursement' | 'Opening';

export interface Transaction {
  id: string;
  ref: string;
  type: TransactionType;
  amount: number;
  plan_id: string | null;
  customer_id: string | null;
  agent_id: string | null;
  method: PaymentMethod | null;
  notes: string | null;
  status: TransactionStatus;
  created_at: string;
}

/** Transaction with additional context for display */
export interface TransactionWithContext extends Transaction {
  plan_name?: string;
  customer_name?: string;
  agent_name?: string;
  is_credit: boolean;    // true for opening/deposit, false for payout/withdrawal
}

/** Payload for recording a collection (rep action) */
export interface RecordCollectionPayload {
  customer_id: string;
  plan_id: string;
  amount: number;
  method: PaymentMethod;
  notes?: string;
}

/** Payload for reversing a transaction (admin only) */
export interface ReverseTransactionPayload {
  transaction_id: string;
  reason: string;
}

/** Receipt data generated after a successful collection */
export interface CollectionReceipt {
  ref: string;
  amount: number;
  plan_name: string;
  customer_name: string;
  agent_id: string;
  agent_name: string;
  method: PaymentMethod;
  new_balance: number;
  timestamp: string;
}

/** Filter options for transaction history */
export interface TransactionFilters {
  type?: TransactionType | 'all';
  status?: TransactionStatus | 'all';
  date_from?: string;
  date_to?: string;
}

/** Summary statistics for a transaction list */
export interface TransactionSummary {
  total_credit: number;
  total_debit: number;
  net: number;
  count: number;
}
