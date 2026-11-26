const KEY = 'ombor-pro-device'

export function deviceKey(): string {
  let k = localStorage.getItem(KEY)
  if (!k) { k = crypto.randomUUID(); localStorage.setItem(KEY, k) }
  return k
}

export function deviceName(): string {
  const ua = navigator.userAgent
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iPhone' : /Windows/i.test(ua) ? 'Windows' : /Mac/i.test(ua) ? 'Mac' : 'Linux'
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Brauzer'
  return `${os}, ${br}`
}
