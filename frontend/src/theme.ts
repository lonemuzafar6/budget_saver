export const COLORS = {
  surface: '#F2F2F7',
  onSurface: '#1C1C1E',
  surfaceSecondary: '#FFFFFF',
  onSurfaceSecondary: '#1C1C1E',
  surfaceTertiary: '#E5E5EA',
  onSurfaceTertiary: '#3A3A3C',
  surfaceInverse: '#1C1C1E',
  onSurfaceInverse: '#FFFFFF',
  brand: '#2E4D40',
  brandPrimary: '#3B6352',
  onBrandPrimary: '#FFFFFF',
  brandSecondary: '#B9C6BE',
  brandTertiary: '#E7EFEB',
  onBrandTertiary: '#2E4D40',
  success: '#34C759',
  warning: '#FF9500',
  error: '#FF3B30',
  info: '#007AFF',
  border: '#E5E5EA',
  borderStrong: '#C7C7CC',
  divider: '#E5E5EA',
  muted: '#8E8E93',
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const RADIUS = {
  sm: 6,
  md: 12,
  lg: 20,
  pill: 999,
};

export const FONT = {
  base: 'System',
};

export type CategoryName =
  | 'Food'
  | 'Groceries'
  | 'Shopping'
  | 'Transport'
  | 'Bills'
  | 'Entertainment'
  | 'Health'
  | 'Other';

export const CATEGORIES: CategoryName[] = [
  'Food',
  'Groceries',
  'Shopping',
  'Transport',
  'Bills',
  'Entertainment',
  'Health',
  'Other',
];

export const CATEGORY_META: Record<
  CategoryName,
  { icon: string; color: string; tint: string }
> = {
  Food: { icon: 'restaurant-outline', color: '#FF6B35', tint: '#FFE8DE' },
  Groceries: { icon: 'basket-outline', color: '#3B6352', tint: '#E7EFEB' },
  Shopping: { icon: 'bag-handle-outline', color: '#D4A017', tint: '#FBF1D8' },
  Transport: { icon: 'car-outline', color: '#0A84B5', tint: '#DCEEF6' },
  Bills: { icon: 'document-text-outline', color: '#8E44AD', tint: '#EFE3F5' },
  Entertainment: { icon: 'film-outline', color: '#E91E63', tint: '#FBE0EA' },
  Health: { icon: 'medkit-outline', color: '#E53935', tint: '#FBDEDD' },
  Other: { icon: 'ellipsis-horizontal-outline', color: '#6E6E73', tint: '#E5E5EA' },
};

export const formatCurrency = (n: number | null | undefined) => {
  const num = Number(n || 0);
  return '\u20B9' + num.toLocaleString('en-IN', { maximumFractionDigits: 2 });
};

export const todayISO = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const currentMonth = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};

export const monthLabel = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, (m || 1) - 1, 1);
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
};
