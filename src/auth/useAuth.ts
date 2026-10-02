import { create } from 'zustand';
import { User, UserRole } from '../lib/types';
import { SEED_ACCOUNTS } from './users';

const SESSION_KEY = 'bedlink_session';
const PRESENCE_CHANNEL = 'bedlink_presence_channel';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  loginWithPin: (targetId: string, pin: string) => { success: boolean; user?: User; error?: string };
  loginWithPassword: (email: string, password: string) => { success: boolean; user?: User; error?: string };
  loginAs: (user: User) => void;
  logout: () => void;
  hasRole: (allowedRoles: UserRole[]) => boolean;
}

function getStoredUser(): User | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

let presenceChannel: BroadcastChannel | null = null;
if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  try {
    presenceChannel = new BroadcastChannel(PRESENCE_CHANNEL);
  } catch {
    // ignore
  }
}

function broadcastPresence(user: User | null) {
  if (!presenceChannel) return;
  try {
    presenceChannel.postMessage({
      type: user ? 'LOGIN' : 'LOGOUT',
      user
    });
  } catch {
    // ignore
  }
}

export const useAuth = create<AuthState>((set, get) => {
  const initialUser = getStoredUser();

  // Send initial presence if user was already stored
  if (initialUser) {
    broadcastPresence(initialUser);
  }

  return {
    user: initialUser,
    isAuthenticated: !!initialUser,

    loginWithPin: (targetId: string, pin: string) => {
      // Find matching credential: could be hospital staff (by hospitalId) or ambulance unit (by unitId)
      const cred = SEED_ACCOUNTS.find(c => {
        if (c.type !== 'pin' || c.secret !== pin) return false;
        if (c.user.hospitalId && c.user.hospitalId === targetId) return true;
        if (c.user.unitId && c.user.unitId.toLowerCase() === targetId.toLowerCase()) return true;
        return false;
      });

      if (!cred) {
        return { success: false, error: 'Invalid identifier or 4-digit PIN' };
      }

      sessionStorage.setItem(SESSION_KEY, JSON.stringify(cred.user));
      broadcastPresence(cred.user);
      set({ user: cred.user, isAuthenticated: true });
      return { success: true, user: cred.user };
    },

    loginWithPassword: (email: string, password: string) => {
      const cred = SEED_ACCOUNTS.find(c => 
        c.type === 'password' && 
        c.user.email?.toLowerCase() === email.toLowerCase() && 
        c.secret === password
      );

      if (!cred) {
        return { success: false, error: 'Invalid email address or password' };
      }

      sessionStorage.setItem(SESSION_KEY, JSON.stringify(cred.user));
      broadcastPresence(cred.user);
      set({ user: cred.user, isAuthenticated: true });
      return { success: true, user: cred.user };
    },

    loginAs: (user: User) => {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
      broadcastPresence(user);
      set({ user, isAuthenticated: true });
    },

    logout: () => {
      sessionStorage.removeItem(SESSION_KEY);
      broadcastPresence(null);
      set({ user: null, isAuthenticated: false });
    },

    hasRole: (allowedRoles: UserRole[]) => {
      const u = get().user;
      if (!u) return false;
      return allowedRoles.includes(u.role);
    }
  };
});
