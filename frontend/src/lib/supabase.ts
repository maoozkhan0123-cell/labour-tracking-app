import { createClient } from '@supabase/supabase-js';
import type { Operation, Task, User, ManufacturingOrder } from '../types';

export interface Database {
  public: {
    Tables: {
      users: {
        Row: User;
        Insert: Omit<User, 'id'>;
        Update: Partial<Omit<User, 'id'>>;
      };
      tasks: {
        Row: Task;
        Insert: Omit<Task, 'id' | 'created_at'>;
        Update: Partial<Omit<Task, 'id' | 'created_at'>>;
      };
      manufacturing_orders: {
        Row: ManufacturingOrder;
        Insert: Omit<ManufacturingOrder, 'id' | 'created_at'>;
        Update: Partial<Omit<ManufacturingOrder, 'id' | 'created_at'>>;
      };
      operations: {
        Row: Operation;
        Insert: Omit<Operation, 'id'>;
        Update: Partial<Omit<Operation, 'id'>>;
      };
    };
  };
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
