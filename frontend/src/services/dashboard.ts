import api from './api';

export interface DashboardStats {
  today_purchase_amount: number;
  today_purchase_count: number;
  today_sale_amount: number;
  today_sale_count: number;
  today_profit: number;
  today_profit_rate: number;

  week_purchase_amount: number;
  week_purchase_count: number;
  week_sale_amount: number;
  week_sale_count: number;
  week_profit: number;
  week_profit_rate: number;

  month_purchase_amount: number;
  month_purchase_count: number;
  month_sale_amount: number;
  month_sale_count: number;
  month_profit: number;
  month_profit_rate: number;

  low_stock_count: number;
  out_of_stock_count: number;
  pending_purchase_count: number;
  pending_sale_count: number;
  average_margin_rate: number;
}

export interface BrandSalesStats {
  brand_id: string;
  brand_name: string;
  brand_icon_url?: string;
  sale_count: number;
  sale_amount: number;
}

export interface RecentActivity {
  id: string;
  type: 'purchase' | 'sale' | 'adjustment';
  transaction_no: string;
  date: string;
  product_name: string;
  amount: number;
  user_name: string;
  status: string;
}

export const dashboardService = {
  // 대시보드 통계 조회
  async getDashboardStats(): Promise<DashboardStats> {
    const response = await api.get('/dashboard/stats');
    return response.data;
  },

  // 브랜드별 판매 통계 (이번 달 기준, Top 5)
  async getBrandSalesStats(params?: { limit?: number }): Promise<BrandSalesStats[]> {
    const response = await api.get('/dashboard/brand-sales', { params });
    return response.data;
  },

  // 최근 활동 내역
  async getRecentActivities(params?: { limit?: number; type?: string }): Promise<RecentActivity[]> {
    const response = await api.get('/dashboard/recent-activities', { params });
    return response.data;
  },
};
