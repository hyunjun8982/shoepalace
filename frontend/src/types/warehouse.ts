export interface Warehouse {
  id: string;
  warehouse_code: string;
  name: string;
  location?: string;
  
  
  
  image_url?: string;
  is_active: boolean;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface WarehouseCreate {
  warehouse_code: string;
  name: string;
  location?: string;
  
  
  
  is_active?: boolean;
  description?: string;
}

export interface WarehouseUpdate {
  warehouse_code?: string;
  name?: string;
  location?: string;
  
  
  
  is_active?: boolean;
  description?: string;
}

export interface WarehouseList {
  total: number;
  items: Warehouse[];
}
