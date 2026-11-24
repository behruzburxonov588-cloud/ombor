// Ruxsatlar ro'yxati va rollar bo'yicha standart huquqlar

export const PERMISSIONS = [
  { key: 'dashboard.view', label: "Bosh sahifani ko'rish" },
  { key: 'products.view', label: "Tovarlarni ko'rish" },
  { key: 'products.manage', label: "Tovar qo'shish va tahrirlash" },
  { key: 'stock.view', label: "Omborni ko'rish" },
  { key: 'stock.adjust', label: "Zarar va tuzatish yozish" },
  { key: 'stock.count', label: 'Tovar sanash' },
  { key: 'stock.approve', label: 'Sanashni tasdiqlash' },
  { key: 'purchases.view', label: "Kelgan yuklarni ko'rish" },
  { key: 'purchases.create', label: 'Yuk kiritish («Yuk keldi»)' },
  { key: 'sales.view', label: "Savdolarni ko'rish" },
  { key: 'sales.create', label: "Savdo qilish" },
  { key: 'sales.discount', label: "Chegirma berish" },
  { key: 'sales.return', label: "Tovar qaytarish" },
  { key: 'customers.view', label: "Mijozlarni ko'rish" },
  { key: 'customers.manage', label: "Mijozlarni boshqarish" },
  { key: 'suppliers.view', label: "Yetkazib beruvchilarni ko'rish" },
  { key: 'suppliers.manage', label: "Yetkazib beruvchilarni boshqarish" },
  { key: 'payments.create', label: "Qarz to'lovlarini qabul qilish" },
  { key: 'cash.view', label: "Kassani ko'rish" },
  { key: 'cash.shift', label: "Smenani ochish va yopish" },
  { key: 'cash.manage', label: "Naqd kirim-chiqim (depozit, yechish)" },
  { key: 'expenses.view', label: "Xarajatlarni ko'rish" },
  { key: 'expenses.manage', label: "Xarajat qo'shish" },
  { key: 'reports.view', label: "Hisobotlarni ko'rish" },
  { key: 'reports.export', label: "Hisobotlarni eksport qilish" },
  { key: 'history.view', label: "Amallar tarixini ko'rish" },
  { key: 'employees.manage', label: "Xodimlarni boshqarish" },
  { key: 'settings.manage', label: "Sozlamalarni o'zgartirish" },
];

export const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);

export const ROLES = {
  owner: "Egasi",
  administrator: "Administrator",
  cashier: "Kassir",
  warehouse: "Ombor xodimi",
  accountant: "Buxgalter",
};

const ALL = PERMISSION_KEYS;

export const ROLE_DEFAULTS = {
  owner: ALL,
  administrator: ALL,
  cashier: [
    'products.view', 'sales.view', 'sales.create', 'customers.view', 'customers.manage',
    'payments.create', 'cash.view', 'cash.shift', 'dashboard.view',
  ],
  warehouse: [
    'dashboard.view', 'products.view', 'products.manage', 'stock.view', 'stock.adjust',
    'stock.count', 'purchases.view', 'purchases.create', 'suppliers.view', 'suppliers.manage',
  ],
  accountant: [
    'dashboard.view', 'products.view', 'stock.view', 'purchases.view', 'sales.view',
    'customers.view', 'suppliers.view', 'cash.view', 'expenses.view', 'expenses.manage',
    'reports.view', 'reports.export', 'history.view',
  ],
};

// Rol standarti + foydalanuvchiga alohida berilgan/olib qo'yilgan ruxsatlar
export function effectivePermissions(role, overrides = {}) {
  const base = new Set(ROLE_DEFAULTS[role] || []);
  if (role === 'owner') return Object.fromEntries(ALL.map((k) => [k, true]));
  for (const key of PERMISSION_KEYS) {
    if (typeof overrides?.[key] === 'boolean') {
      if (overrides[key]) base.add(key);
      else base.delete(key);
    }
  }
  return Object.fromEntries(PERMISSION_KEYS.map((k) => [k, base.has(k)]));
}
