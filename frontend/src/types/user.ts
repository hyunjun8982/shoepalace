export enum UserRole {
  ADMIN = 'admin',
  BUYER = 'buyer',
  SELLER = 'seller',
}

export interface User {
  id: string;
  username: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface UserCreate {
  username: string;
  email: string;
  password: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
}

export interface UserUpdate {
  username?: string;
  email?: string;
  password?: string;
  full_name?: string;
  role?: UserRole;
  is_active?: boolean;
}

export interface UserLogin {
  username: string;
  password: string;
}

export interface Token {
  access_token: string;
  token_type: string;
}

export interface ChangePassword {
  current_password: string;
  new_password: string;
}