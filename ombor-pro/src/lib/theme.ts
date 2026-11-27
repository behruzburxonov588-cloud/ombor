// Ko'rinish: har bir kompyuter/telefon o'zi tanlaydi
export const THEMES = [
  { id: 'toza', name: 'Toza', desc: "Oq menyu, yorug' va keng", side: '#ffffff', bg: '#F6F7FA', card: '#ffffff', acc: '#16307A', ink: '#1A2238' },
  { id: 'kok', name: "Ko'k", desc: "Ko'k menyu, klassik", side: '#16307A', bg: '#F2F5FA', card: '#ffffff', acc: '#16307A', ink: '#1A2238' },
  { id: 'tun', name: 'Tungi', desc: "Qorong'i, uzoq smenada ko'z charchamaydi", side: '#0A0E16', bg: '#0E131D', card: '#161D2A', acc: '#4FD1A5', ink: '#E9EDF5' },
] as const
export type ThemeId = (typeof THEMES)[number]['id']
const KEY = 'ombor-theme'
export const getTheme = (): ThemeId => (localStorage.getItem(KEY) as ThemeId) || 'toza'
export function setTheme(t: ThemeId) {
  localStorage.setItem(KEY, t)
  document.documentElement.dataset.theme = t
}
export const applyTheme = () => { document.documentElement.dataset.theme = getTheme() }
