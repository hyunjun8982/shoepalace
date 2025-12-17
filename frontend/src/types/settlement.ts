export enum SettlementStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled'
}

export enum SettlementType {
  PURCHASE = 'purchase',
  SALE = 'sale',
  MONTHLY = 'monthly'
}

export interface Settlement {
  id?: string;
  settlement_type: SettlementType;
  settlement_date: string;
  start_date: string;
  end_date: string;
  target_user_id?: string;
  target_user_name?: string;
  total_amount: number;
  settlement_amount: number;
  fee_amount: number;
  tax_amount: number;
  final_amount: number;
  transaction_count: number;
  status: SettlementStatus;
  notes?: string;
  processed_by?: string;
  processed_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface SettlementListParams {
  skip?: number;
  limit?: number;
  settlement_type?: SettlementType;
  status?: SettlementStatus;
  target_user_id?: string;
  start_date?: string;
  end_date?: string;
}

export interface SettlementListResponse {
  items: Settlement[];
  total: number;
  skip: number;
  limit: number;
}

export interface SettlementSummary {
  total_settlements: number;
  pending_count: number;
  completed_count: number;
  total_amount: number;
  total_settlement_amount: number;
  total_fee_amount: number;
  total_final_amount: number;
}

export interface CalculateSettlementParams {
  settlement_type: SettlementType;
  start_date: string;
  end_date: string;
  target_user_id?: string;
}