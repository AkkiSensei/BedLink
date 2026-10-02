import React from 'react';
import { UserRole } from '../../lib/types';
import { Stethoscope, Building2, Siren, Truck, ShieldCheck } from 'lucide-react';

interface RoleBadgeProps {
  role: UserRole;
  size?: 'sm' | 'md';
  className?: string;
}

const ROLE_META: Record<UserRole, { label: string; icon: React.ComponentType<{ size: number; strokeWidth: number }> }> = {
  nurse: {
    label: 'Ward Nurse',
    icon: Stethoscope
  },
  coordinator: {
    label: 'ED Coordinator',
    icon: Building2
  },
  dispatcher: {
    label: 'Dispatcher',
    icon: Siren
  },
  crew: {
    label: 'Ambulance Crew',
    icon: Truck
  },
  admin: {
    label: 'Network Admin',
    icon: ShieldCheck
  }
};

export const RoleBadge: React.FC<RoleBadgeProps> = ({ role, size = 'sm', className = '' }) => {
  const meta = ROLE_META[role] || { label: role, icon: ShieldCheck };
  const Icon = meta.icon;

  const sizeClasses = size === 'sm' 
    ? 'text-xs px-2 py-0.5 gap-1.5' 
    : 'text-sm px-2.5 py-1 gap-2';

  const iconSize = size === 'sm' ? 12 : 14;

  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold bg-[var(--primary-soft)] text-[var(--primary)] border border-[var(--primary)]/20 ${sizeClasses} ${className}`}
    >
      <Icon size={iconSize} strokeWidth={2} />
      <span>{meta.label}</span>
    </span>
  );
};
