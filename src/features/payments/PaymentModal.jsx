import React, { useState } from 'react'
import { upsert } from '../../lib/store'
import { newHonorPayment } from '../../lib/constants'
import { formatRupiah } from '../../lib/format'

export default function PaymentModal({ trainerRow, periode, onClose, onSaved }) {
  const [nominal, setNominal] = useState(trainerRow.sisaHonor > 0 ? trainerRow.sisaHonor : 0)
  const isOverpay = Number(nominal) > trainerRow.sisaHonor

  function handleSubmit(e) {
    e.preventDefault()
    const entry = newHonorPayment(trainerRow.id, periode, nominal, new Date().toISOString().slice(0, 10))
    upsert('honorPayments', entry)
    onSaved?.(entry)
  }

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl animate-scaleIn border-t-4 border-emerald-500">
        <div className="p-5 border-b flex justify-between items-center">
          <div>
            <h3 className="text-base font-bold text-slate-900">Input Pembayaran Honor</h3>
            <p className="text-xs text-slate-400">Trainer: {trainerRow.nama} - Periode {periode}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-xs text-slate-600 space-y-2">
            <div className="flex justify-between">
              <span>Kehadiran Mengajar:</span>
              <span className="font-bold text-blue-900">{trainerRow.hadirSesi} Sesi</span>
            </div>
            <div className="flex justify-between">
              <span>Akumulasi Beban Honor:</span>
              <span className="font-bold text-slate-900">{formatRupiah(trainerRow.bebanHonor)}</span>
            </div>
            <div className="flex justify-between">
              <span>Telah Dibayar (ledger):</span>
              <span className="font-bold text-emerald-600">{formatRupiah(trainerRow.dibayar)}</span>
            </div>
            <div className="flex justify-between">
              <span>Sisa Kewajiban:</span>
              <span className="font-bold text-rose-600">{formatRupiah(trainerRow.sisaHonor)}</span>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Nominal Pembayaran Baru (IDR)</label>
            <input
              type="number"
              min={0}
              required
              value={nominal}
              onChange={(e) => setNominal(e.target.value)}
              className="w-full mt-1.5 border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-slate-800"
            />
            {isOverpay && (
              <p className="text-[11px] font-bold text-rose-600 mt-1.5">
                Nominal melebihi sisa kewajiban ({formatRupiah(trainerRow.sisaHonor)}) — akan tercatat sebagai kelebihan bayar.
              </p>
            )}
          </div>

          <div className="pt-3 flex gap-2 justify-end border-t">
            <button type="button" onClick={onClose} className="px-3 py-2 border rounded-lg text-xs font-bold text-slate-400">Batal</button>
            <button type="submit" className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow">
              Simpan Pembayaran
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}