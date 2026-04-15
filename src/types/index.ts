export type UserRole = 'super_admin' | 'agency_admin' | 'employee';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  agency_id?: string;
  identifier?: string; // For campaign matching (e.g., "Ali")
}

export interface Agency {
  id: string;
  name: string;
  super_admin_id: string;
}

export interface Store {
  id: string;
  agency_id: string;
  name: string;
  shopify_domain: string;
  shopify_access_token?: string;
  meta_access_token?: string;
}

export interface AdAccount {
  id: string;
  store_id: string;
  ad_account_id: string;
  name: string;
}

export interface Campaign {
  id: string;
  ad_account_id: string;
  store_id: string;
  employee_id?: string;
  name: string;
  spend: number;
  meta_purchases: number;
  confirmed_orders: number;
  cancelled_orders: number;
  pending_orders: number;
  revenue: number;
  start_date: string;
  status: string;
}

export interface MetricCardData {
  title: string;
  value: string | number;
  change?: number;
  trend?: 'up' | 'down' | 'neutral';
  suffix?: string;
}
