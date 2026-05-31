export interface User {
  id: string;
  email: string;
  role: 'user' | 'tutor' | 'admin';
  name?: string;
  created_at?: string;
  tutor_profile?: {
    id: string;
    bio: string | null;
    expertise: string[];
    hourly_rate: number;
    is_verified: boolean;
    rating_sum: number;
    total_reviews: number;
  } | null;
}

export interface TutorProfile {
  id: string;
  user_id: string;
  bio: string;
  expertise: string[];
  hourly_rate: number;
  rating: number;
  ratings_count: number;
  is_verified: boolean;
  user?: User;
}

export interface Group {
  id: string;
  name: string;
  description: string;
  privacy: 'public' | 'private';
  owner_id: string;
  created_at?: string;
}

export interface GroupMember {
  user_id: string;
  group_id: string;
  joined_at: string;
  chat_enabled: boolean;
  email?: string;
}

export interface SessionLocation {
  type: 'Point';
  coordinates: [number, number]; // [lon, lat]
}

export interface Session {
  id: string;
  host_id: string;
  title: string;
  description: string;
  type: 'free' | 'paid';
  price: number;
  schedule: string;
  status: 'scheduled' | 'active' | 'completed' | 'cancelled';
  max_participants: number;
  location?: SessionLocation;
  address?: string;
  subject_tags?: string[];
  participants?: string[]; // user ids
  avg_rating?: number;
  total_ratings?: number;
  host_name?: string;
}

export interface PaymentRecord {
  payment_id: string;
  session_id: string;
  amount: string;
  platform_fee: string;
  status: string;
  payment_method: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  group_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  is_deleted: boolean;
  is_edited?: boolean;
  sender_email?: string;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  content: string;
  type: string;
  is_read: boolean;
  created_at: string;
  action_url?: string;
}
