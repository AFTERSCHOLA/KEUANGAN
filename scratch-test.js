import { newHonorPayment, newAbsensi } from './src/lib/constants.js'

const hp = newHonorPayment({ trainerId: 'trn-1', periode: '2026-07', nominal: 500000, tanggalBayar: '2026-07-15' })
console.log('newHonorPayment:', JSON.stringify(hp, null, 2))
console.log('hp.id starts with hp-:', hp.id.startsWith('hp-'))
console.log('hp fields ok:', hp.trainerId === 'trn-1' && hp.periode === '2026-07' && hp.nominal === 500000 && hp.tanggalBayar === '2026-07-15')

const abs = newAbsensi({ tanggal: '2026-08-01', sekolahId: 'skl-1', trainerId: 'trn-1', trainerNama: 'Budi', trainerStatus: 'Hadir', siswaList: [{ siswaId: 'sw-1', nama: 'Ani', status: 'Hadir' }] })
console.log('\nnewAbsensi:', JSON.stringify(abs, null, 2))
console.log('abs.id === "2026-08-01_skl-1_trn-1":', abs.id === '2026-08-01_skl-1_trn-1')
console.log('abs.periode === "2026-08":', abs.periode === '2026-08')
console.log('abs.siswaList length 1:', abs.siswaList.length === 1)
console.log('\nAll checks passed:', hp.id.startsWith('hp-') && abs.id === '2026-08-01_skl-1_trn-1')