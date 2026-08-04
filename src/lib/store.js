const STORE_KEY = 'afterschola_v4'

export function getKeys() {
  return {
    sekolah: `${STORE_KEY}_sekolah`,
    trainer: `${STORE_KEY}_trainer`,
    siswa: `${STORE_KEY}_siswa`,
    absensi: `${STORE_KEY}_absensi`,
    honorPayments: `${STORE_KEY}_honorPayments`,
    settings: `${STORE_KEY}_settings`,
  }
}

export function read(key) {
  const keys = getKeys()
  const json = localStorage.getItem(keys[key])
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function write(key, records) {
  const keys = getKeys()
  localStorage.setItem(keys[key], JSON.stringify(records))
}

export function upsert(key, record) {
  const records = read(key)
  const idx = records.findIndex(r => r.id === record.id)
  if (idx >= 0) {
    records[idx] = { ...records[idx], ...record }
  } else {
    records.push(record)
  }
  write(key, records)
}
