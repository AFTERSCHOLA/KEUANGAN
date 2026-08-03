import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, onSnapshot, addDoc, updateDoc, deleteDoc } from 'firebase/firestore';

let db = null;
let auth = null;
let firebaseEnabled = false;

try {
  if (typeof __firebase_config !== 'undefined' && __firebase_config) {
    const firebaseConfig = JSON.parse(__firebase_config);
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    firebaseEnabled = true;
  }
} catch (e) {
  console.warn("Firebase failed to initialize. Falling back to LocalStorage.", e);
}

const appId = typeof __app_id !== 'undefined' ? __app_id : 'afterschola-mgmt-01';

const getLocalData = (key, defaultVal) => {
  try {
    const data = localStorage.getItem(`afterschola_v3_${key}`);
    return data ? JSON.parse(data) : defaultVal;
  } catch (e) {
    return defaultVal;
  }
};

const setLocalData = (key, data) => {
  try {
    localStorage.setItem(`afterschola_v3_${key}`, JSON.stringify(data));
  } catch (e) {}
};

// Map Nama Bulan ke Format Angka Tanggal untuk validasi input kalender
const monthToNum = {
  'Juli': '07',
  'Agustus': '08',
  'September': '09',
  'Oktober': '10',
  'November': '11',
  'Desember': '12'
};

const normalizeKey = (str) => (str || '').trim().toLowerCase();

const getPeriodeFromDate = (dateStr) => {
  if (!dateStr) return 'Juli';
  const parts = dateStr.split('-');
  if (parts.length < 2) return 'Juli';
  const mm = parts[1];
  const numToMonth = {
    '07': 'Juli',
    '08': 'Agustus',
    '09': 'September',
    '10': 'Oktober',
    '11': 'November',
    '12': 'Desember'
  };
  return numToMonth[mm] || 'Juli';
};

const defaultSekolah = [
  {
    id: 'sch-1',
    nama: 'SD Karakter Bangsa',
    alamat: 'Jl. Merdeka No. 45, Bandung',
    foto: 'https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=400&auto=format&fit=crop&q=80',
    trainer: 'Fahmi Nugraha',
    jadwal: 'Senin, 14:00 - 15:30',
    spp: 150000
  },
  {
    id: 'sch-2',
    nama: 'SMP Nusantara',
    alamat: 'Jl. Pendidikan No. 12, Bandung',
    foto: 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=400&auto=format&fit=crop&q=80',
    trainer: 'Riska Amalia',
    jadwal: 'Rabu, 15:00 - 16:30',
    spp: 180000
  }
];

const defaultTrainer = [
  {
    id: 'tr-1',
    nama: 'Fahmi Nugraha',
    wa: '081234567890',
    jadwal: 'Senin & Kamis',
    sekolah: 'SD Karakter Bangsa',
    honor: 100000,
    honorDibayarBulan: {
      'Juli': 200000,
      'Agustus': 0,
      'September': 0,
      'Oktober': 0,
      'November': 0,
      'Desember': 0
    }
  },
  {
    id: 'tr-2',
    nama: 'Riska Amalia',
    wa: '085798765432',
    jadwal: 'Rabu & Sabtu',
    sekolah: 'SMP Nusantara',
    honor: 120000,
    honorDibayarBulan: {
      'Juli': 0,
      'Agustus': 0,
      'September': 0,
      'Oktober': 0,
      'November': 0,
      'Desember': 0
    }
  }
];

const defaultSiswa = [
  {
    id: 'sis-1',
    nama: 'Ahmad Fauzi',
    wa: '089911223344',
    kelas: 'Kelas IV',
    sekolahId: 'sch-1',
    sekolahNama: 'SD Karakter Bangsa',
    foto: 'https://images.unsplash.com/photo-1544717305-2782549b5136?w=200&auto=format&fit=crop&q=80',
    sppLunasBulan: {
      'Juli': true,
      'Agustus': true,
      'September': false,
      'Oktober': false,
      'November': false,
      'Desember': false
    }
  },
  {
    id: 'sis-2',
    nama: 'Siti Aminah',
    wa: '081322445566',
    kelas: 'Kelas VIII',
    sekolahId: 'sch-2',
    sekolahNama: 'SMP Nusantara',
    foto: 'https://images.unsplash.com/photo-1597524678053-5e6fef52d8a3?w=200&auto=format&fit=crop&q=80',
    sppLunasBulan: {
      'Juli': false,
      'Agustus': false,
      'September': false,
      'Oktober': false,
      'November': false,
      'Desember': false
    }
  },
  {
    id: 'sis-3',
    nama: 'Budi Santoso',
    wa: '085244556677',
    kelas: 'Kelas V',
    sekolahId: 'sch-1',
    sekolahNama: 'SD Karakter Bangsa',
    foto: 'https://images.unsplash.com/photo-1503919545889-aef636e10ad4?w=200&auto=format&fit=crop&q=80',
    sppLunasBulan: {
      'Juli': true,
      'Agustus': false,
      'September': false,
      'Oktober': false,
      'November': false,
      'Desember': false
    }
  }
];

const formatRupiah = (number) => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
  }).format(number);
};

export default function App() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState('offline');

  const [sekolah, setSekolah] = useState(() => getLocalData('sekolah', defaultSekolah));
  const [siswa, setSiswa] = useState(() => getLocalData('siswa', defaultSiswa));
  const [trainer, setTrainer] = useState(() => getLocalData('trainer', defaultTrainer));
  const [absensi, setAbsensi] = useState(() => getLocalData('absensi', []));
  const [settings, setSettings] = useState(() => getLocalData('settings', {
    logoUrl: 'https://archive.org/details/logo-afterschola',
    title: 'Bisnis Manajemen Afterschola'
  }));

  const [selectedPeriode, setSelectedPeriode] = useState('Juli');

  const [modalOpen, setModalOpen] = useState(null);
  const [modalMode, setModalMode] = useState('add');
  const [selectedItem, setSelectedItem] = useState(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSchoolFilter, setSelectedSchoolFilter] = useState('');
  
  const [absensiDate, setAbsensiDate] = useState(`2026-07-01`);
  const [absensiSchoolId, setAbsensiSchoolId] = useState('');

  useEffect(() => {
    if (sekolah.length > 0) {
      const exists = sekolah.some(s => s.id === absensiSchoolId);
      if (!exists) {
        setAbsensiSchoolId(sekolah[0].id);
      }
    }
  }, [sekolah, absensiSchoolId]);

  const [confirmModal, setConfirmModal] = useState({
    show: false,
    title: '',
    message: '',
    onConfirm: null
  });

  const [alertModal, setAlertModal] = useState({
    show: false,
    title: '',
    message: '',
    type: 'success'
  });

  const [toast, setToast] = useState({
    show: false,
    message: '',
    type: 'success'
  });

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast(prev => ({ ...prev, show: false }));
    }, 3000);
  };

  useEffect(() => {
    const mm = monthToNum[selectedPeriode];
    setAbsensiDate(`2026-${mm}-01`);
  }, [selectedPeriode]);

  useEffect(() => {
    if (!firebaseEnabled) {
      setUser({ uid: 'local-admin', isAnonymous: true });
      setSyncStatus('offline');
      return;
    }

    const authTimer = setTimeout(() => {
      if (!user) {
        setUser({ uid: 'local-admin', isAnonymous: true });
        setSyncStatus('offline');
      }
    }, 3000);

    const initAuth = async () => {
      try {
        setSyncStatus('syncing');
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        setUser({ uid: 'local-admin', isAnonymous: true });
        setSyncStatus('offline');
      }
    };
    initAuth();
    
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      clearTimeout(authTimer);
      if (currentUser) {
        setUser(currentUser);
        setSyncStatus('synced');
      } else {
        setUser({ uid: 'local-admin', isAnonymous: true });
        setSyncStatus('offline');
      }
    });
    return () => {
      unsubscribe();
      clearTimeout(authTimer);
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    if (!firebaseEnabled || user.uid === 'local-admin') {
      setSyncStatus('offline');
      return;
    }

    setSyncStatus('syncing');

    const sekolahRef = collection(db, 'artifacts', appId, 'public', 'data', 'sekolah');
    const siswaRef = collection(db, 'artifacts', appId, 'public', 'data', 'siswa');
    const trainerRef = collection(db, 'artifacts', appId, 'public', 'data', 'trainer');
    const absensiRef = collection(db, 'artifacts', appId, 'public', 'data', 'absensi');
    const settingsRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'config');

    // FIX: Menggunakan { ...doc.data(), id: doc.id } agar ID asli dari Firestore tidak tertimpa
    const unsubSekolah = onSnapshot(sekolahRef, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      setSekolah(data);
      setLocalData('sekolah', data);
      setSyncStatus('synced');
    }, () => setSyncStatus('offline'));

    const unsubSiswa = onSnapshot(siswaRef, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      setSiswa(data);
      setLocalData('siswa', data);
    }, () => {});

    const unsubTrainer = onSnapshot(trainerRef, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      setTrainer(data);
      setLocalData('trainer', data);
    }, () => {});

    const unsubAbsensi = onSnapshot(absensiRef, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      setAbsensi(data);
      setLocalData('absensi', data);
    }, () => {});

    const unsubSettings = onSnapshot(settingsRef, (docSnap) => {
      if (docSnap.exists()) {
        setSettings(docSnap.data());
        setLocalData('settings', docSnap.data());
      }
    }, () => {});

    return () => {
      unsubSekolah();
      unsubSiswa();
      unsubTrainer();
      unsubAbsensi();
      unsubSettings();
    };
  }, [user]);

  const studentsInSelectedSchool = useMemo(() => {
    if (!absensiSchoolId) return [];
    const targetSchool = sekolah.find(sch => sch.id === absensiSchoolId);
    return siswa.filter(s => {
      const matchId = s.sekolahId === absensiSchoolId;
      const matchNama = targetSchool && s.sekolahNama && 
        s.sekolahNama.toLowerCase().trim() === targetSchool.nama.toLowerCase().trim();
      return matchId || matchNama;
    });
  }, [siswa, sekolah, absensiSchoolId]);

  const attendanceStats = useMemo(() => {
    const studentMonthlyCount = {};
    const studentTotalCount = {};
    const trainerMonthlyCount = {};

    absensi.forEach(record => {
      const recordPeriode = record.periode || getPeriodeFromDate(record.tanggal);

      if (record.siswaList) {
        record.siswaList.forEach(s => {
          if (s.status === 'Hadir') {
            studentTotalCount[s.siswaId] = (studentTotalCount[s.siswaId] || 0) + 1;
          }
        });
      }

      if (recordPeriode === selectedPeriode) {
        if (record.trainerStatus === 'Hadir' && record.trainer) {
          const trKey = normalizeKey(record.trainer);
          trainerMonthlyCount[trKey] = (trainerMonthlyCount[trKey] || 0) + 1;
        }
        if (record.siswaList) {
          record.siswaList.forEach(s => {
            if (s.status === 'Hadir') {
              studentMonthlyCount[s.siswaId] = (studentMonthlyCount[s.siswaId] || 0) + 1;
            }
          });
        }
      }
    });

    return { studentMonthlyCount, studentTotalCount, trainerMonthlyCount };
  }, [absensi, selectedPeriode]);

  const downloadCSV = (headers, rows, filename) => {
    const csvContent = "\uFEFF" + [
      headers.join(","),
      ...rows.map(row => row.map(val => {
        let text = String(val === undefined || val === null ? "" : val).replace(/"/g, '""');
        return text.includes(',') || text.includes('\n') || text.includes('"') ? `"${text}"` : text;
      }).join(","))
    ].join("\n");
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${filename}_${selectedPeriode}_2026.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Data ${filename} sukses diekspor ke CSV!`);
  };

  const seedDefaultData = async () => {
    setLoading(true);
    if (!firebaseEnabled || user?.uid === 'local-admin') {
      setSekolah(defaultSekolah);
      setSiswa(defaultSiswa);
      setTrainer(defaultTrainer);
      setAbsensi([]);
      setLocalData('sekolah', defaultSekolah);
      setLocalData('siswa', defaultSiswa);
      setLocalData('trainer', defaultTrainer);
      setLocalData('absensi', []);
      setLoading(false);
      showToast("Data demo lokal sukses dimuat!");
      return;
    }

    try {
      for (const item of defaultSekolah) {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'sekolah'), item);
      }
      for (const item of defaultTrainer) {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'trainer'), item);
      }
      for (const item of defaultSiswa) {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'siswa'), item);
      }
      showToast("Data demo cloud sukses disinkronkan!");
    } catch (err) {
      showToast("Gagal melakukan seeding cloud, menggunakan data lokal.", "error");
    }
    setLoading(false);
  };

  const handleSaveSekolah = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = {
      nama: formData.get('nama'),
      alamat: formData.get('alamat'),
      foto: formData.get('foto') || 'https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=400&auto=format&fit=crop&q=80',
      trainer: formData.get('trainer'),
      jadwal: formData.get('jadwal'),
      spp: Number(formData.get('spp'))
    };

    if (!firebaseEnabled || user?.uid === 'local-admin') {
      if (modalMode === 'add') {
        const newSch = { id: `local-sch-${Date.now()}`, ...data };
        const list = [...sekolah, newSch];
        setSekolah(list);
        setLocalData('sekolah', list);
      } else {
        const list = sekolah.map(s => s.id === selectedItem.id ? { ...s, ...data } : s);
        setSekolah(list);
        setLocalData('sekolah', list);
      }
      setModalOpen(null);
      showToast("Sekolah berhasil disimpan!");
      return;
    }

    try {
      if (modalMode === 'add') {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'sekolah'), data);
      } else {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'sekolah', selectedItem.id), data, { merge: true });
      }
      setModalOpen(null);
      showToast("Sekolah disinkronkan ke database!");
    } catch (err) {
      showToast("Gagal menyimpan ke server.", "error");
    }
  };

  const handleDeleteSekolah = (id) => {
    setConfirmModal({
      show: true,
      title: 'Hapus Sekolah Mitra',
      message: 'Apakah Anda yakin ingin menghapus data sekolah ini? Semua data terkait akan disesuaikan.',
      onConfirm: async () => {
        if (!firebaseEnabled || user?.uid === 'local-admin') {
          const list = sekolah.filter(s => s.id !== id);
          setSekolah(list);
          setLocalData('sekolah', list);
          setConfirmModal(prev => ({ ...prev, show: false }));
          showToast("Data sekolah terhapus dari lokal!");
          return;
        }

        try {
          await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'sekolah', id));
          setConfirmModal(prev => ({ ...prev, show: false }));
          showToast("Data sekolah terhapus dari server!");
        } catch (err) {
          showToast("Gagal menghapus data dari server.", "error");
        }
      }
    });
  };

  const handleSaveSiswa = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const schoolId = formData.get('sekolahId');
    const targetSchool = sekolah.find(s => s.id === schoolId);

    const sppLunasBulan = {
      'Juli': formData.get('spp_Juli') === 'on',
      'Agustus': formData.get('spp_Agustus') === 'on',
      'September': formData.get('spp_September') === 'on',
      'Oktober': formData.get('spp_Oktober') === 'on',
      'November': formData.get('spp_November') === 'on',
      'Desember': formData.get('spp_Desember') === 'on'
    };

    const data = {
      nama: formData.get('nama'),
      wa: formData.get('wa'),
      kelas: formData.get('kelas'),
      sekolahId: schoolId,
      sekolahNama: targetSchool ? targetSchool.nama : '',
      foto: formData.get('foto') || 'https://images.unsplash.com/photo-1544717305-2782549b5136?w=200&auto=format&fit=crop&q=80',
      sppLunasBulan: sppLunasBulan
    };

    if (!firebaseEnabled || user?.uid === 'local-admin') {
      if (modalMode === 'add') {
        const newSis = { id: `local-sis-${Date.now()}`, ...data };
        const list = [...siswa, newSis];
        setSiswa(list);
        setLocalData('siswa', list);
      } else {
        const list = siswa.map(s => s.id === selectedItem.id ? { ...s, ...data } : s);
        setSiswa(list);
        setLocalData('siswa', list);
      }
      setModalOpen(null);
      showToast("Data siswa disimpan!");
      return;
    }

    try {
      if (modalMode === 'add') {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'siswa'), data);
      } else {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'siswa', selectedItem.id), data, { merge: true });
      }
      setModalOpen(null);
      showToast("Data siswa disinkronkan ke server!");
    } catch (err) {
      showToast("Gagal sinkronisasi data siswa.", "error");
    }
  };

  const handleDeleteSiswa = (id) => {
    setConfirmModal({
      show: true,
      title: 'Hapus Data Siswa',
      message: 'Apakah Anda yakin ingin menghapus profil siswa ini?',
      onConfirm: async () => {
        if (!firebaseEnabled || user?.uid === 'local-admin') {
          const list = siswa.filter(s => s.id !== id);
          setSiswa(list);
          setLocalData('siswa', list);
          setConfirmModal(prev => ({ ...prev, show: false }));
          showToast("Data siswa terhapus lokal!");
          return;
        }

        try {
          await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'siswa', id));
          setConfirmModal(prev => ({ ...prev, show: false }));
          showToast("Data siswa terhapus dari database!");
        } catch (err) {
          showToast("Gagal menghapus data dari database.", "error");
        }
      }
    });
  };

  const handleSaveTrainer = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = {
      nama: formData.get('nama'),
      wa: formData.get('wa'),
      jadwal: formData.get('jadwal'),
      sekolah: formData.get('sekolah'),
      honor: Number(formData.get('honor')),
      honorDibayarBulan: selectedItem?.honorDibayarBulan || {
        'Juli': 0, 'Agustus': 0, 'September': 0, 'Oktober': 0, 'November': 0, 'Desember': 0
      }
    };

    if (!firebaseEnabled || user?.uid === 'local-admin') {
      if (modalMode === 'add') {
        const newTr = { id: `local-tr-${Date.now()}`, ...data };
        const list = [...trainer, newTr];
        setTrainer(list);
        setLocalData('trainer', list);
      } else {
        const list = trainer.map(t => t.id === selectedItem.id ? { ...t, ...data } : t);
        setTrainer(list);
        setLocalData('trainer', list);
      }
      setModalOpen(null);
      showToast("Data trainer disimpan!");
      return;
    }

    try {
      if (modalMode === 'add') {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'trainer'), data);
      } else {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'trainer', selectedItem.id), data, { merge: true });
      }
      setModalOpen(null);
      showToast("Data trainer berhasil disimpan!");
    } catch (err) {
      showToast("Gagal menyimpan data trainer.", "error");
    }
  };

  const handleDeleteTrainer = (id) => {
    setConfirmModal({
      show: true,
      title: 'Hapus Data Trainer',
      message: 'Apakah Anda yakin ingin menghapus data trainer ini?',
      onConfirm: async () => {
        if (!firebaseEnabled || user?.uid === 'local-admin') {
          const list = trainer.filter(t => t.id !== id);
          setTrainer(list);
          setLocalData('trainer', list);
          setConfirmModal(prev => ({ ...prev, show: false }));
          showToast("Trainer terhapus secara lokal.");
          return;
        }

        try {
          await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'trainer', id));
          setConfirmModal(prev => ({ ...prev, show: false }));
          showToast("Trainer terhapus secara permanen.");
        } catch (err) {
          showToast("Gagal menghapus trainer dari server.", "error");
        }
      }
    });
  };

  const handleSaveHonorPayment = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const nominal = Number(formData.get('nominal'));

    const updatedPayments = {
      ...(selectedItem.honorDibayarBulan || {}),
      [selectedPeriode]: nominal
    };

    // --- INSTANT OPTIMISTIC UPDATE ---
    const updatedTrainerList = trainer.map(t => 
      t.id === selectedItem.id ? { ...t, honorDibayarBulan: updatedPayments } : t
    );
    setTrainer(updatedTrainerList);
    setLocalData('trainer', updatedTrainerList);

    if (!firebaseEnabled || user?.uid === 'local-admin') {
      setModalOpen(null);
      showToast(`Honor ${selectedItem.nama} berhasil disesuaikan!`);
      return;
    }

    try {
      // FIX: Write to exact document path in Firestore. ID mismatch is resolved by correct Snapshot mapping.
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'trainer', selectedItem.id), {
        honorDibayarBulan: updatedPayments
      }, { merge: true });
      setModalOpen(null);
      showToast(`Sinkronisasi pembayaran honor ${selectedItem.nama} sukses!`);
    } catch (err) {
      showToast("Gagal menyinkronkan pembayaran honor.", "error");
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = {
      logoUrl: formData.get('logoUrl'),
      title: formData.get('title')
    };

    if (!firebaseEnabled || user?.uid === 'local-admin') {
      setSettings(data);
      setLocalData('settings', data);
      setModalOpen(null);
      showToast("Konfigurasi identitas disimpan secara lokal!");
      return;
    }

    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'config'), data);
      setSettings(data);
      setLocalData('settings', data);
      setModalOpen(null);
      showToast("Identitas dashboard berhasil diperbarui!");
    } catch (err) {
      showToast("Gagal menyinkronkan pengaturan ke server.", "error");
    }
  };

  const handleSaveAbsensi = async (e) => {
    e.preventDefault();
    const school = sekolah.find(s => s.id === absensiSchoolId);
    if (!school) return;

    const form = e.target;
    const trainerAttendance = form.elements['status_trainer']?.value || 'Hadir';

    const siswaAttendanceList = studentsInSelectedSchool.map(s => ({
      siswaId: s.id,
      nama: s.nama,
      status: form.elements[`status_siswa_${s.id}`]?.value || 'Hadir'
    }));

    const computedPeriode = getPeriodeFromDate(absensiDate);

    const absensiData = {
      tanggal: absensiDate,
      periode: computedPeriode,
      sekolahId: school.id,
      sekolahNama: school.nama,
      trainer: school.trainer,
      trainerStatus: trainerAttendance,
      siswaList: siswaAttendanceList
    };

    const docId = `${absensiDate}_${school.id}`;

    if (!firebaseEnabled || user?.uid === 'local-admin') {
      const existIndex = absensi.findIndex(a => a.id === docId);
      let list = [...absensi];
      if (existIndex > -1) {
        list[existIndex] = { id: docId, ...absensiData };
      } else {
        list.push({ id: docId, ...absensiData });
      }
      setAbsensi(list);
      setLocalData('absensi', list);

      setAlertModal({
        show: true,
        title: 'Sukses Absensi & Sinkronisasi',
        message: `Kehadiran Guru & Siswa ${school.nama} pada ${absensiDate} (Periode ${computedPeriode}) berhasil direkam dan disinkronkan ke data honor secara real-time!`,
        type: 'success'
      });
      return;
    }

    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'absensi', docId), absensiData);

      setAlertModal({
        show: true,
        title: 'Sinkronisasi Absensi Berhasil',
        message: `Data kehadiran harian guru dan siswa berhasil direkam di Cloud untuk periode ${computedPeriode} 2026.`,
        type: 'success'
      });
    } catch (err) {
      showToast("Gagal menyimpan absensi.", "error");
    }
  };

  const financialData = useMemo(() => {
    let totalSppPemasukan = 0;
    let totalBebanHonor = 0;

    // Menghitung langsung jumlah realisasi real-time pembayaran honor dari koleksi data trainer yang valid
    const totalHonorTelahDibayar = trainer.reduce((sum, t) => sum + (t.honorDibayarBulan?.[selectedPeriode] || 0), 0);

    const sekolahFinance = sekolah.map(sch => {
      const siswaSekolah = siswa.filter(s => s.sekolahId === sch.id);
      const targetSpp = siswaSekolah.length * sch.spp;
      const realisasiSpp = siswaSekolah.filter(s => s.sppLunasBulan?.[selectedPeriode]).length * sch.spp;

      totalSppPemasukan += realisasiSpp;

      const activeTrainer = trainer.find(t => 
        (t.sekolah && normalizeKey(t.sekolah) === normalizeKey(sch.nama)) || 
        (t.nama && normalizeKey(t.nama) === normalizeKey(sch.trainer))
      );
      const honorRate = activeTrainer ? activeTrainer.honor : 0;
      
      const sesiKehadiran = attendanceStats.trainerMonthlyCount[normalizeKey(sch.trainer)] || 0;
      
      const bebanHonor = sesiKehadiran * honorRate;
      totalBebanHonor += bebanHonor;

      const dibayar = activeTrainer?.honorDibayarBulan?.[selectedPeriode] || 0;

      return {
        id: sch.id,
        nama: sch.nama,
        siswaCount: siswaSekolah.length,
        sppTarif: sch.spp,
        targetSpp,
        realisasiSpp,
        trainerNama: sch.trainer || 'Belum Ditugaskan',
        trainerKehadiran: sesiKehadiran,
        trainerHonorRate: honorRate,
        bebanHonor,
        honorDibayar: dibayar,
        sisaHonor: bebanHonor - dibayar
      };
    });

    const labaRugi = totalSppPemasukan - totalHonorTelahDibayar;

    return {
      sekolahFinance,
      totalSppPemasukan,
      totalBebanHonor,
      totalHonorTelahDibayar,
      labaRugi
    };
  }, [sekolah, siswa, trainer, selectedPeriode, attendanceStats]);

  const handleExportPembayaranCSV = () => {
    const headers = ["Nama Trainer", "Sekolah Penugasan", "Jumlah Sesi Hadir", "Tarif Sesi", "Akumulasi Honor", "Telah Dibayar", "Sisa Honor"];
    const rows = trainer.map(t => {
      const hadirSesi = attendanceStats.trainerMonthlyCount[normalizeKey(t.nama)] || 0;
      const akumulasiHonor = hadirSesi * t.honor;
      const dibayar = t.honorDibayarBulan?.[selectedPeriode] || 0;
      return [
        t.nama,
        t.sekolah || '-',
        hadirSesi,
        t.honor,
        akumulasiHonor,
        dibayar,
        akumulasiHonor - dibayar
      ];
    });
    downloadCSV(headers, rows, `Laporan_Pembayaran_Honor`);
  };

  const handleExportOverviewCSV = () => {
    const headers = ["Nama Sekolah Mitra", "Jumlah Siswa", "Tarif SPP", "Target SPP", "SPP Realisasi", "Trainer", "Jumlah Kehadiran", "Tarif Honor", "Beban Honor"];
    const rows = financialData.sekolahFinance.map(sf => [
      sf.nama,
      sf.siswaCount,
      sf.sppTarif,
      sf.targetSpp,
      sf.realisasiSpp,
      sf.trainerNama,
      sf.trainerKehadiran,
      sf.trainerHonorRate,
      sf.bebanHonor
    ]);
    downloadCSV(headers, rows, `Rangkuman_Overview`);
  };

  const handleExportSekolahCSV = () => {
    const headers = ["ID Sekolah", "Nama Sekolah Mitra", "Alamat Lengkap", "Trainer Bertugas", "Jadwal Kelas", "Biaya SPP Bulanan"];
    const rows = sekolah.map(s => [
      s.id,
      s.nama,
      s.alamat,
      s.trainer,
      s.jadwal,
      s.spp
    ]);
    downloadCSV(headers, rows, `Daftar_Sekolah_Mitra`);
  };

  const handleExportSiswaCSV = () => {
    const headers = ["Nama Lengkap Siswa", "Kelas", "Sekolah Mitra", "No WhatsApp Wali", "Kehadiran Bulan Ini", "Kehadiran Total", "Status SPP"];
    const rows = siswa.map(s => [
      s.nama,
      s.kelas,
      s.sekolahNama,
      s.wa,
      attendanceStats.studentMonthlyCount[s.id] || 0,
      attendanceStats.studentTotalCount[s.id] || 0,
      s.sppLunasBulan?.[selectedPeriode] ? 'Lunas' : 'Belum Lunas'
    ]);
    downloadCSV(headers, rows, `Daftar_Siswa_Afterschola`);
  };

  const handleExportTrainerCSV = () => {
    const headers = ["Nama Trainer", "No WhatsApp", "Jadwal Mengajar", "Sekolah Penugasan", "Honor Sesi", "Sesi Hadir", "Honor Akumulasi", "Honor Dibayar", "Sisa Honor"];
    const rows = trainer.map(t => {
      const hadir = attendanceStats.trainerMonthlyCount[t.nama] || 0;
      const akumulasi = hadir * t.honor;
      const dibayar = t.honorDibayarBulan?.[selectedPeriode] || 0;
      return [
        t.nama,
        t.wa,
        t.jadwal,
        t.sekolah,
        t.honor,
        hadir,
        akumulasi,
        dibayar,
        akumulasi - dibayar
      ];
    });
    downloadCSV(headers, rows, `Daftar_Trainer_Afterschola`);
  };

  const handleExportAbsensiCSV = () => {
    const mm = monthToNum[selectedPeriode];
    const filteredAbsensi = absensi.filter(a => a.tanggal?.startsWith(`2026-${mm}`));
    
    const headers = ["Tanggal", "Sekolah Mitra", "Trainer", "Status Kehadiran Trainer", "Log Kehadiran Siswa"];
    const rows = filteredAbsensi.map(a => {
      const siswaStatusText = a.siswaList?.map(s => `${s.nama}(${s.status})`).join("; ") || "-";
      return [
        a.tanggal,
        a.sekolahNama,
        a.trainer,
        a.trainerStatus,
        siswaStatusText
      ];
    });
    downloadCSV(headers, rows, `Laporan_Absensi`);
  };

  const handleExportKeuanganCSV = () => {
    const headers = ["Komponen Akuntansi", "Nominal Realisasi"];
    const rows = [
      ["Total Pendapatan SPP Siswa (Lunas)", financialData.totalSppPemasukan],
      ["Total Beban Akumulasi Honor Trainer", financialData.totalBebanHonor],
      ["Total Honor Trainer Telah Dibayar", financialData.totalHonorTelahDibayar],
      ["Sisa Utang Honor Belum Dibayar", financialData.totalBebanHonor - financialData.totalHonorTelahDibayar],
      ["Laba / Rugi Operasional Bersih", financialData.labaRugi]
    ];
    downloadCSV(headers, rows, `Laporan_Laba_Rugi`);
  };

  const filteredSiswa = useMemo(() => {
    return siswa.filter(s => {
      const matchSearch = s.nama.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          s.kelas.toLowerCase().includes(searchQuery.toLowerCase());
      const matchSchool = selectedSchoolFilter ? s.sekolahId === selectedSchoolFilter : true;
      return matchSearch && matchSchool;
    });
  }, [siswa, searchQuery, selectedSchoolFilter]);

  const filteredTrainer = useMemo(() => {
    return trainer.filter(t => t.nama.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [trainer, searchQuery]);

  const CustomLogo = () => {
    const isDefaultUrl = settings.logoUrl.includes('archive.org/details/logo-afterschola') || settings.logoUrl.includes('logo-afterschola');
    
    if (isDefaultUrl) {
      return (
        <div className="w-12 h-12 rounded-full border-2 border-yellow-400 bg-blue-950 flex items-center justify-center text-white font-extrabold text-base shadow-inner shrink-0">
          <svg className="w-8 h-8 text-yellow-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l9-5-9-5-9 5 9 5z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l9-5-9-5-9 5 9 5zm0 0v6" />
          </svg>
        </div>
      );
    }

    return (
      <img 
        src={settings.logoUrl} 
        alt="Afterschola" 
        className="w-12 h-12 rounded-full object-cover border-2 border-yellow-400 bg-white shadow-md shrink-0"
        onError={(e) => {
          e.target.style.display = 'none';
          e.target.nextSibling.style.display = 'flex';
        }}
      />
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800 animate-fadeIn">
      
      {/* --- TOAST PANEL --- */}
      {toast.show && (
        <div className="fixed top-5 right-5 z-50 animate-bounce">
          <div className={`flex items-center gap-2 py-3 px-5 rounded-xl shadow-xl border text-white font-semibold text-sm ${
            toast.type === 'error' ? 'bg-rose-600 border-rose-500' : 'bg-emerald-600 border-emerald-500'
          }`}>
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* --- HEADER --- */}
      <header className="bg-blue-900 text-white shadow-md border-b-4 border-yellow-400 sticky top-0 z-40 transition-all">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-4">
          
          <div className="flex items-center gap-3">
            <div className="relative group cursor-pointer animate-pulse" onClick={() => {
              setSelectedItem(settings);
              setModalOpen('settings');
            }}>
              <CustomLogo />
              <div className="absolute -bottom-1 -right-1 bg-yellow-400 text-slate-900 p-1 rounded-full hover:bg-yellow-300 transition shadow">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-yellow-300">{settings.title}</h1>
                {syncStatus === 'synced' && (
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-bold flex items-center gap-1 border border-emerald-500/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Cloud Aktif
                  </span>
                )}
                {syncStatus === 'offline' && (
                  <span className="text-[10px] bg-slate-500/20 text-slate-300 px-2 py-0.5 rounded-full font-bold flex items-center gap-1 border border-slate-500/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span> Offline / Lokal
                  </span>
                )}
              </div>
              <p className="text-xs text-blue-200">Sistem Informasi Manajemen Ekstrakurikuler Pintar</p>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-3">
            <div className="flex items-center bg-blue-950/80 rounded-lg p-1.5 border border-blue-800 shadow-inner">
              <span className="text-xs text-yellow-300 font-bold px-2 uppercase">Periode:</span>
              <select
                value={selectedPeriode}
                onChange={(e) => setSelectedPeriode(e.target.value)}
                className="bg-blue-900 text-white font-bold text-xs rounded border border-blue-700 py-1 px-2 focus:ring-1 focus:ring-yellow-400 outline-none cursor-pointer"
              >
                <option value="Juli">Juli 2026</option>
                <option value="Agustus">Agustus 2026</option>
                <option value="September">September 2026</option>
                <option value="Oktober">Oktober 2026</option>
                <option value="November">November 2026</option>
                <option value="Desember">Desember 2026</option>
              </select>
            </div>

            <nav className="flex flex-wrap items-center gap-1">
              {[
                { id: 'overview', label: 'Overview', icon: 'M4 5a1 1 0 011-1h3a1 1 0 011 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h3a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1V5zM4 14a1 1 0 011-1h3a1 1 0 011 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-3zM14 14a1 1 0 011-1h3a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-3z' },
                { id: 'sekolah', label: 'Data Sekolah', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
                { id: 'siswa', label: 'Data Siswa', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a3 3 0 11-6 0 3 3 0 016 0z' },
                { id: 'trainer', label: 'Data Trainer', icon: 'M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
                { id: 'absensi', label: 'Data Absensi', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' },
                { id: 'pembayaran', label: 'Data Pembayaran', icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z' },
                { id: 'keuangan', label: 'Data Keuangan', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold transition-all ${
                    activeTab === tab.id 
                      ? 'bg-yellow-400 text-slate-900 shadow-md transform scale-105' 
                      : 'text-white hover:bg-blue-800'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={tab.icon} />
                  </svg>
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

        </div>
      </header>

      {/* --- KONTEN UTAMA --- */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6">
        
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-blue-600"></div>
            <p className="mt-4 text-slate-500 font-medium">Sedang memuat data Afterschola...</p>
          </div>
        ) : (
          <>
            {/* 1. OVERVIEW */}
            {activeTab === 'overview' && (
              <div className="space-y-6 animate-fadeIn">
                
                <div className="flex items-center justify-between flex-wrap gap-4 bg-white p-4 rounded-2xl shadow-sm border">
                  <div>
                    <h3 className="text-base font-bold text-slate-800">Ringkasan Eksekutif - Periode {selectedPeriode} 2026</h3>
                    <p className="text-xs text-slate-500">Gunakan tombol ekspor untuk menyimpan ringkasan data finansial.</p>
                  </div>
                  <button
                    onClick={handleExportOverviewCSV}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    Download Overview (CSV)
                  </button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-white p-5 rounded-2xl shadow-sm border-t-4 border-blue-600 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Sekolah Mitra</p>
                      <h4 className="text-3xl font-extrabold text-blue-900 mt-1">{sekolah.length}</h4>
                    </div>
                    <div className="bg-blue-100 p-3 rounded-xl text-blue-600">
                      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                    </div>
                  </div>

                  <div className="bg-white p-5 rounded-2xl shadow-sm border-t-4 border-yellow-400 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Siswa Terdaftar</p>
                      <h4 className="text-3xl font-extrabold text-slate-800 mt-1">{siswa.length}</h4>
                    </div>
                    <div className="bg-yellow-100 p-3 rounded-xl text-yellow-600">
                      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    </div>
                  </div>

                  <div className="bg-white p-5 rounded-2xl shadow-sm border-t-4 border-blue-600 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Trainer Aktif</p>
                      <h4 className="text-3xl font-extrabold text-blue-900 mt-1">{trainer.length}</h4>
                    </div>
                    <div className="bg-blue-100 p-3 rounded-xl text-blue-600">
                      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                    </div>
                  </div>

                  <div className={`bg-white p-5 rounded-2xl shadow-sm border-t-4 flex items-center justify-between ${financialData.labaRugi >= 0 ? 'border-emerald-500' : 'border-rose-500'}`}>
                    <div>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Laba Bersih ({selectedPeriode})</p>
                      <h4 className={`text-2xl font-extrabold mt-1 ${financialData.labaRugi >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatRupiah(financialData.labaRugi)}</h4>
                    </div>
                    <div className={`p-3 rounded-xl ${financialData.labaRugi >= 0 ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                    <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                      <span className="w-3 h-6 bg-blue-600 rounded-sm"></span>
                      Peta Finansial per Sekolah ({selectedPeriode})
                    </h3>
                    
                    {financialData.sekolahFinance.length === 0 ? (
                      <p className="text-slate-400 text-center py-10 text-sm">Tidak ada data untuk ditampilkan</p>
                    ) : (
                      <div className="space-y-4">
                        {financialData.sekolahFinance.map(sf => {
                          const maxVal = Math.max(...financialData.sekolahFinance.map(x => Math.max(x.realisasiSpp, x.bebanHonor, 1)));
                          const sppPercent = (sf.realisasiSpp / maxVal) * 100;
                          const honorPercent = (sf.bebanHonor / maxVal) * 100;

                          return (
                            <div key={sf.id} className="border-b pb-3 last:border-0">
                              <p className="font-semibold text-sm text-slate-700 mb-2">{sf.nama}</p>
                              <div className="space-y-1.5">
                                <div className="flex items-center text-xs">
                                  <span className="w-24 text-slate-500">Pemasukan SPP</span>
                                  <div className="flex-1 bg-slate-100 h-3 rounded-full overflow-hidden">
                                    <div className="bg-blue-600 h-full rounded-full transition-all" style={{ width: `${sppPercent}%` }}></div>
                                  </div>
                                  <span className="w-24 text-right font-bold text-blue-600 pl-2">{formatRupiah(sf.realisasiSpp)}</span>
                                </div>
                                <div className="flex items-center text-xs">
                                  <span className="w-24 text-slate-500">Beban Honor</span>
                                  <div className="flex-1 bg-slate-100 h-3 rounded-full overflow-hidden">
                                    <div className="bg-yellow-400 h-full rounded-full transition-all" style={{ width: `${honorPercent}%` }}></div>
                                  </div>
                                  <span className="w-24 text-right font-bold text-yellow-600 pl-2">{formatRupiah(sf.bebanHonor)}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <span className="w-3 h-6 bg-yellow-400 rounded-sm"></span>
                        Keseimbangan Operasional ({selectedPeriode})
                      </h3>
                      
                      <div className="grid grid-cols-2 gap-4 text-center mt-2">
                        <div className="p-4 bg-blue-50 rounded-xl">
                          <p className="text-xs text-slate-500 font-bold uppercase">Rasio Lunas SPP</p>
                          <p className="text-3xl font-extrabold text-blue-900 mt-1">
                            {siswa.length > 0 ? Math.round((siswa.filter(s => s.sppLunasBulan?.[selectedPeriode]).length / siswa.length) * 100) : 0}%
                          </p>
                          <p className="text-[10px] text-slate-400 mt-1">Siswa telah melunasi SPP {selectedPeriode}</p>
                        </div>

                        <div className="p-4 bg-yellow-50 rounded-xl">
                          <p className="text-xs text-slate-500 font-bold uppercase">Sesi Terlaksana</p>
                          <p className="text-3xl font-extrabold text-yellow-600 mt-1">
                            {financialData.sekolahFinance.reduce((acc, curr) => acc + curr.trainerKehadiran, 0)} Sesi
                          </p>
                          <p className="text-[10px] text-slate-400 mt-1">Total sesi kelas berjalan bulan ini</p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-6 pt-4 border-t">
                      <h4 className="text-xs font-bold text-slate-500 uppercase mb-3">Distribusi Siswa Per Sekolah</h4>
                      <div className="space-y-3">
                        {sekolah.map(sch => {
                          const count = siswa.filter(s => s.sekolahId === sch.id).length;
                          const percent = siswa.length > 0 ? (count / siswa.length) * 100 : 0;
                          return (
                            <div key={sch.id} className="space-y-1">
                              <div className="flex justify-between text-xs">
                                <span className="font-semibold text-slate-600">{sch.nama}</span>
                                <span className="font-bold text-slate-800">{count} Siswa ({Math.round(percent)}%)</span>
                              </div>
                              <div className="bg-slate-100 h-2 rounded-full overflow-hidden">
                                <div className="bg-blue-800 h-full rounded-full" style={{ width: `${percent}%` }}></div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                  </div>

                </div>

              </div>
            )}

            {/* 2. DATA SEKOLAH */}
            {activeTab === 'sekolah' && (
              <div className="space-y-6 animate-fadeIn">
                <div className="flex items-center justify-between flex-wrap gap-4 bg-white p-4 rounded-2xl shadow-sm border">
                  <div>
                    <h2 className="text-xl font-bold text-slate-800">Manajemen Sekolah Mitra</h2>
                    <p className="text-xs text-slate-500">Kelola profil, trainer penanggung jawab, jadwal, dan tarif SPP.</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={handleExportSekolahCSV}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition shadow"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                      Unduh CSV
                    </button>
                    <button
                      onClick={() => {
                        setModalMode('add');
                        setSelectedItem(null);
                        setModalOpen('sekolah');
                      }}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition shadow"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                      Tambah Sekolah Mitra
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {sekolah.map(sch => {
                    const studentCount = siswa.filter(s => s.sekolahId === sch.id).length;
                    return (
                      <div key={sch.id} className="bg-white rounded-2xl shadow-sm overflow-hidden border border-slate-100 flex flex-col hover:shadow-md transition">
                        <div className="h-44 relative bg-slate-200">
                          <img 
                            src={sch.foto} 
                            alt={sch.nama} 
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.target.src = 'https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=400&auto=format&fit=crop&q=80';
                            }}
                          />
                          <div className="absolute top-2 right-2 flex gap-1.5 bg-black/50 backdrop-blur-md p-1 rounded-lg">
                            <button
                              onClick={() => {
                                setModalMode('edit');
                                setSelectedItem(sch);
                                setModalOpen('sekolah');
                              }}
                              className="p-1.5 text-white hover:text-yellow-400 transition"
                              title="Edit"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                            </button>
                            <button
                              onClick={() => handleDeleteSekolah(sch.id)}
                              className="p-1.5 text-white hover:text-rose-400 transition"
                              title="Hapus"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          </div>
                        </div>

                        <div className="p-5 flex-1 flex flex-col justify-between">
                          <div>
                            <h3 className="text-lg font-bold text-slate-800 line-clamp-1">{sch.nama}</h3>
                            <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-1">
                              <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                              <span className="line-clamp-1">{sch.alamat}</span>
                            </p>

                            <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-slate-100">
                              <div>
                                <p className="text-[10px] text-slate-400 font-bold uppercase">Trainer</p>
                                <p className="text-sm font-semibold text-slate-700 line-clamp-1">{sch.trainer || '-'}</p>
                              </div>
                              <div>
                                <p className="text-[10px] text-slate-400 font-bold uppercase">Jumlah Siswa</p>
                                <p className="text-sm font-semibold text-slate-700">{studentCount} Siswa</p>
                              </div>
                            </div>

                            <div className="mt-3">
                              <p className="text-[10px] text-slate-400 font-bold uppercase">Jadwal Kelas</p>
                              <p className="text-xs text-slate-600 bg-slate-100 py-1 px-2.5 rounded-md inline-block mt-1">{sch.jadwal || 'Belum diatur'}</p>
                            </div>
                          </div>

                          <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
                            <span className="text-[10px] text-slate-400 font-bold uppercase">SPP Bulanan</span>
                            <span className="text-base font-extrabold text-blue-700">{formatRupiah(sch.spp)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 3. DATA SISWA */}
            {activeTab === 'siswa' && (
              <div className="space-y-6 animate-fadeIn">
                <div className="flex items-center justify-between flex-wrap gap-4 bg-white p-4 rounded-2xl shadow-sm border">
                  <div>
                    <h2 className="text-xl font-bold text-slate-800">Manajemen Siswa</h2>
                    <p className="text-xs text-slate-500">Profil, Kehadiran, Status SPP Bulanan ({selectedPeriode})</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={handleExportSiswaCSV}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition shadow"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                      Unduh CSV
                    </button>
                    <button
                      onClick={() => {
                        setModalMode('add');
                        setSelectedItem(null);
                        setModalOpen('siswa');
                      }}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition shadow"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                      Tambah Siswa Baru
                    </button>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl shadow-sm border flex flex-wrap gap-4 items-center justify-between">
                  <div className="flex-1 min-w-[280px] relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                      <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    </span>
                    <input
                      type="text"
                      placeholder="Cari nama siswa..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-400 uppercase">Sekolah:</span>
                    <select
                      value={selectedSchoolFilter}
                      onChange={(e) => setSelectedSchoolFilter(e.target.value)}
                      className="rounded-lg border border-slate-200 py-1.5 px-3 focus:outline-none text-sm bg-white"
                    >
                      <option value="">Semua Sekolah</option>
                      {sekolah.map(s => (
                        <option key={s.id} value={s.id}>{s.nama}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm overflow-hidden border">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100 text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                          <th className="py-4 px-6">Siswa</th>
                          <th className="py-4 px-6">Sekolah Mitra</th>
                          <th className="py-4 px-6">Kontak WA</th>
                          <th className="py-4 px-6 text-center">Kehadiran ({selectedPeriode})</th>
                          <th className="py-4 px-6 text-center">Kehadiran (Total)</th>
                          <th className="py-4 px-6 text-center">SPP {selectedPeriode}</th>
                          <th className="py-4 px-6 text-center">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y text-sm">
                        {filteredSiswa.map(s => (
                          <tr key={s.id} className="hover:bg-slate-50/50">
                            <td className="py-4 px-6 flex items-center gap-3">
                              <img src={s.foto} alt="" className="w-10 h-10 rounded-full object-cover border" />
                              <div>
                                <p className="font-bold text-slate-800">{s.nama}</p>
                                <p className="text-xs text-slate-400">{s.kelas}</p>
                              </div>
                            </td>
                            <td className="py-4 px-6 font-semibold text-slate-600">{s.sekolahNama}</td>
                            <td className="py-4 px-6">
                              <a href={`https://wa.me/${s.wa}`} target="_blank" className="text-blue-600 font-semibold hover:underline">{s.wa}</a>
                            </td>
                            <td className="py-4 px-6 text-center font-extrabold text-blue-700">
                              {attendanceStats.studentMonthlyCount[s.id] || 0} Sesi
                            </td>
                            <td className="py-4 px-6 text-center font-bold text-slate-500">
                              {attendanceStats.studentTotalCount[s.id] || 0} Sesi
                            </td>
                            <td className="py-4 px-6 text-center">
                              {s.sppLunasBulan?.[selectedPeriode] ? (
                                <span className="bg-emerald-100 text-emerald-800 text-xs px-2.5 py-1 rounded-full font-bold">Lunas</span>
                              ) : (
                                <span className="bg-rose-100 text-rose-800 text-xs px-2.5 py-1 rounded-full font-bold">Belum Bayar</span>
                              )}
                            </td>
                            <td className="py-4 px-6 text-center">
                              <div className="flex justify-center gap-2">
                                <button onClick={() => { setModalMode('edit'); setSelectedItem(s); setModalOpen('siswa'); }} className="text-slate-500 hover:text-blue-600">
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" strokeWidth="2"/></svg>
                                </button>
                                <button onClick={() => handleDeleteSiswa(s.id)} className="text-slate-500 hover:text-rose-600">
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21" strokeWidth="2"/></svg>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            )}

            {/* 4. DATA TRAINER */}
            {activeTab === 'trainer' && (
              <div className="space-y-6 animate-fadeIn">
                <div className="flex items-center justify-between flex-wrap gap-4 bg-white p-4 rounded-2xl shadow-sm border">
                  <div>
                    <h2 className="text-xl font-bold text-slate-800">Manajemen Trainer</h2>
                    <p className="text-xs text-slate-500">Kelola info trainer, penugasan bimbingan kelas, serta honor sesi mengajar.</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={handleExportTrainerCSV}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition shadow"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                      Unduh CSV
                    </button>
                    <button
                      onClick={() => {
                        setModalMode('add');
                        setSelectedItem(null);
                        setModalOpen('trainer');
                      }}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition shadow"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                      Tambah Trainer Baru
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredTrainer.map(t => {
                    const hadirSesi = attendanceStats.trainerMonthlyCount[normalizeKey(t.nama)] || 0;
                    const akumulasiHonor = hadirSesi * t.honor;
                    const dibayar = t.honorDibayarBulan?.[selectedPeriode] || 0;
                    const sisaHonor = akumulasiHonor - dibayar;

                    return (
                      <div key={t.id} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between hover:shadow-md transition">
                        <div>
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                              <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-lg">
                                {t.nama?.charAt(0)}
                              </div>
                              <div>
                                <h3 className="font-bold text-slate-800">{t.nama}</h3>
                                <p className="text-xs text-slate-400">Trainer Afterschola</p>
                              </div>
                            </div>
                            <div className="flex gap-1">
                              <button onClick={() => { setModalMode('edit'); setSelectedItem(t); setModalOpen('trainer'); }} className="text-slate-400 hover:text-blue-600 p-1">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15.232 5.232l3.536 3.536M6.5 21.036H3v-3.572" strokeWidth="2"/></svg>
                              </button>
                              <button onClick={() => handleDeleteTrainer(t.id)} className="text-slate-400 hover:text-rose-600 p-1">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21" strokeWidth="2"/></svg>
                              </button>
                            </div>
                          </div>

                          <div className="space-y-2.5 pt-3 border-t text-xs">
                            <div className="flex justify-between">
                              <span className="text-slate-400">Sekolah Tugas</span>
                              <span className="font-semibold text-slate-700">{t.sekolah}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">WhatsApp</span>
                              <a href={`https://wa.me/${t.wa}`} target="_blank" className="font-bold text-blue-600 hover:underline">{t.wa}</a>
                            </div>
                            <div className="flex justify-between pt-1.5 border-t border-dashed">
                              <span className="text-slate-400">Jadwal Mengajar</span>
                              <span className="font-semibold text-slate-700">{t.jadwal}</span>
                            </div>
                            <div className="flex justify-between font-bold text-slate-700 pt-1 border-t">
                              <span>Honor per Kedatangan</span>
                              <span className="text-blue-700 font-extrabold">{formatRupiah(t.honor)}</span>
                            </div>
                            <div className="flex justify-between text-[11px] text-slate-400 italic">
                              <span>Sesi Mengajar ({selectedPeriode}):</span>
                              <span>{hadirSesi} Pertemuan</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 5. DATA ABSENSI */}
            {activeTab === 'absensi' && (
              <div className="space-y-6 animate-fadeIn">
                <div className="flex items-center justify-between flex-wrap gap-4 bg-white p-4 rounded-2xl shadow-sm border">
                  <div>
                    <h2 className="text-xl font-bold text-slate-800">Lembar Absensi Harian Kelas</h2>
                    <p className="text-xs text-slate-500">Mencatat data kehadiran guru dan siswa untuk periode <b>{selectedPeriode} 2026</b></p>
                  </div>
                  <button
                    onClick={handleExportAbsensiCSV}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition shadow"
                    >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    Unduh CSV Kehadiran Bulan Ini
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                  <div className="bg-white p-5 rounded-2xl shadow-sm border space-y-4">
                    <h3 className="text-base font-bold text-slate-800">Pilih Kelas & Sesi</h3>
                    <div>
                      <label className="text-xs font-bold text-slate-400 uppercase">Tanggal Kelas</label>
                      <input
                        type="date"
                        value={absensiDate}
                        onChange={(e) => setAbsensiDate(e.target.value)}
                        className="w-full mt-1 rounded-lg border p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-400 uppercase">Sekolah</label>
                      <select
                        value={absensiSchoolId}
                        onChange={(e) => setAbsensiSchoolId(e.target.value)}
                        className="w-full mt-1 rounded-lg border p-2.5 text-sm bg-white"
                      >
                        {sekolah.map(s => (
                          <option key={s.id} value={s.id}>{s.nama}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border">
                    {absensiSchoolId ? (
                      <form onSubmit={handleSaveAbsensi} className="space-y-6">
                        <div className="border-b pb-4 flex justify-between items-center">
                          <div>
                            <h3 className="text-lg font-bold text-slate-800">
                              {sekolah.find(s => s.id === absensiSchoolId)?.nama}
                            </h3>
                            <p className="text-xs text-slate-400">Pengajar: {sekolah.find(s => s.id === absensiSchoolId)?.trainer}</p>
                          </div>
                          <span className="text-xs bg-yellow-100 text-yellow-800 font-bold px-3 py-1 rounded-full border border-yellow-200">
                            Bulan {selectedPeriode} 2026
                          </span>
                        </div>

                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Kehadiran Trainer</h4>
                          <div className="flex justify-between items-center gap-4 flex-wrap">
                            <span className="font-bold text-slate-800">{sekolah.find(s => s.id === absensiSchoolId)?.trainer}</span>
                            <div className="flex gap-2">
                              {['Hadir', 'Izin', 'Alpa'].map(status => (
                                <label key={status} className="flex items-center gap-1.5 cursor-pointer text-xs font-bold">
                                  <input type="radio" name="status_trainer" value={status} defaultChecked={status === 'Hadir'} />
                                  <span>{status}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Absensi Siswa Terdaftar</h4>
                          <div className="space-y-2 divide-y divide-slate-100 bg-white border border-slate-100 p-4 rounded-xl shadow-inner">
                            {studentsInSelectedSchool.map(s => (
                              <div key={s.id} className="flex justify-between items-center pt-3 first:pt-0">
                                <span className="font-bold text-slate-800 text-sm">{s.nama} <span className="text-[11px] font-medium text-slate-400">({s.kelas})</span></span>
                                <div className="flex gap-2">
                                  {['Hadir', 'Izin', 'Alpa'].map(status => (
                                    <label key={status} className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold">
                                      <input type="radio" name={`status_siswa_${s.id}`} value={status} defaultChecked={status === 'Hadir'} />
                                      <span>{status}</span>
                                    </label>
                                  ))}
                                </div>
                              </div>
                            ))}
                            {studentsInSelectedSchool.length === 0 && (
                              <p className="text-center py-6 text-slate-400 text-xs">Belum ada siswa terdaftar di sekolah ini.</p>
                            )}
                          </div>
                        </div>

                        <button type="submit" className="w-full bg-yellow-400 hover:bg-yellow-500 text-slate-900 font-extrabold py-3 rounded-xl transition shadow active:scale-95">
                          Simpan Absensi & Sinkronisasikan Data
                        </button>
                      </form>
                    ) : (
                      <p className="text-center text-slate-400 py-10">Pilih sekolah untuk memuat absensi.</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* --- NEW TAB: 5. DATA PEMBAYARAN (HONOR TRAINER) --- */}
            {activeTab === 'pembayaran' && (
              <div className="space-y-6 animate-fadeIn">
                <div className="flex items-center justify-between flex-wrap gap-4 bg-white p-4 rounded-2xl shadow-sm border">
                  <div>
                    <h2 className="text-xl font-bold text-slate-800">Lembar Pembayaran Honor Trainer</h2>
                    <p className="text-xs text-slate-500">Pencatatan realisasi pengeluaran kas pembayaran honorarium untuk periode <b>{selectedPeriode} 2026</b></p>
                  </div>
                  <button
                    onClick={handleExportPembayaranCSV}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition shadow"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    Unduh CSV Pembayaran
                  </button>
                </div>

                <div className="bg-white rounded-2xl shadow-sm overflow-hidden border">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100 text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                          <th className="py-4 px-6">Trainer</th>
                          <th className="py-4 px-6">Sekolah Penugasan</th>
                          <th className="py-4 px-6 text-center">Kehadiran ({selectedPeriode})</th>
                          <th className="py-4 px-6 text-right">Tarif per Sesi</th>
                          <th className="py-4 px-6 text-right">Akumulasi Beban</th>
                          <th className="py-4 px-6 text-right text-emerald-600">Honor Dibayar</th>
                          <th className="py-4 px-6 text-right text-rose-600">Sisa Kewajiban</th>
                          <th className="py-4 px-6 text-center">Tindakan</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y text-sm">
                        {trainer.map(t => {
                          const hadirSesi = attendanceStats.trainerMonthlyCount[normalizeKey(t.nama)] || 0;
                          const akumulasiHonor = hadirSesi * t.honor;
                          const dibayar = t.honorDibayarBulan?.[selectedPeriode] || 0;
                          const sisaHonor = akumulasiHonor - dibayar;

                          return (
                            <tr key={t.id} className="hover:bg-slate-50/50 transition">
                              <td className="py-4 px-6 font-bold text-slate-800">{t.nama}</td>
                              <td className="py-4 px-6 font-semibold text-slate-600">{t.sekolah || 'Tidak ditugaskan'}</td>
                              <td className="py-4 px-6 text-center font-bold text-blue-700">{hadirSesi} Pertemuan</td>
                              <td className="py-4 px-6 text-right font-medium text-slate-500">{formatRupiah(t.honor)}</td>
                              <td className="py-4 px-6 text-right font-bold text-slate-800">{formatRupiah(akumulasiHonor)}</td>
                              <td className="py-4 px-6 text-right font-bold text-emerald-600">{formatRupiah(dibayar)}</td>
                              <td className="py-4 px-6 text-right font-extrabold text-rose-600">{formatRupiah(sisaHonor)}</td>
                              <td className="py-4 px-6 text-center">
                                <button
                                  onClick={() => {
                                    setSelectedItem(t);
                                    setModalOpen('bayarHonor');
                                  }}
                                  className="bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-[11px] px-3.5 py-1.5 rounded-lg transition shadow-sm active:scale-95"
                                >
                                  Bayar Honor
                                </button>
                              </td>
                            </tr>
                          );
                        })}

                        {trainer.length === 0 && (
                          <tr>
                            <td colSpan="8" className="py-12 text-center text-slate-400">
                              Tidak ada data trainer untuk pencatatan pembayaran.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            )}

            {/* 6. DATA KEUANGAN */}
            {activeTab === 'keuangan' && (
              <div className="space-y-6 animate-fadeIn">
                <div className="flex items-center justify-between flex-wrap gap-4 bg-white p-4 rounded-2xl shadow-sm border">
                  <div>
                    <h2 className="text-xl font-bold text-slate-800">Laporan Keuangan Laba Rugi</h2>
                    <p className="text-xs text-slate-500">Rangkuman finansial berjalan untuk periode <b>{selectedPeriode} 2026</b></p>
                  </div>
                  <button
                    onClick={handleExportKeuanganCSV}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition shadow"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    Unduh CSV Laba-Rugi
                  </button>
                </div>

                <div className="bg-gradient-to-br from-blue-900 to-slate-950 text-white rounded-2xl p-6 shadow-md grid grid-cols-1 md:grid-cols-4 gap-4 animate-scaleIn">
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-blue-300 uppercase tracking-wider">Pemasukan SPP ({selectedPeriode})</p>
                    <h3 className="text-2xl font-extrabold text-white">{formatRupiah(financialData.totalSppPemasukan)}</h3>
                    <p className="text-[10px] text-blue-200">Realisasi SPP Lunas</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-blue-300 uppercase tracking-wider">Beban Honor Trainer</p>
                    <h3 className="text-2xl font-extrabold text-yellow-300">{formatRupiah(financialData.totalBebanHonor)}</h3>
                    <p className="text-[10px] text-blue-200">Log Akrual Kehadiran Sesi</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-blue-300 uppercase tracking-wider">Honor Telah Dibayar</p>
                    <h3 className="text-2xl font-extrabold text-emerald-400">{formatRupiah(financialData.totalHonorTelahDibayar)}</h3>
                    <p className="text-[10px] text-blue-200">Realisasi Kas Keluar</p>
                  </div>
                  <div className="space-y-1 border-t md:border-t-0 md:border-l border-blue-800 pt-4 md:pt-0 md:pl-4">
                    <p className="text-xs font-bold text-yellow-300 uppercase tracking-wider">Laba / Rugi Bersih</p>
                    <h3 className={`text-2xl font-extrabold ${financialData.labaRugi >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {formatRupiah(financialData.labaRugi)}
                    </h3>
                    <p className="text-[10px] text-blue-200">SPP - Realisasi Kas Keluar</p>
                  </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm overflow-hidden border">
                  <div className="p-5 border-b">
                    <h3 className="font-bold text-slate-800 text-base">Rincian Finansial Sekolah Mitra - {selectedPeriode} 2026</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100 text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                          <th className="py-4 px-6">Sekolah Mitra</th>
                          <th className="py-4 px-6 text-right">Potensi SPP</th>
                          <th className="py-4 px-6 text-right">SPP Realisasi ({selectedPeriode})</th>
                          <th className="py-4 px-6">Trainer</th>
                          <th className="py-4 px-6 text-center">Kehadiran Mengajar</th>
                          <th className="py-4 px-6 text-right">Beban Honor</th>
                          <th className="py-4 px-6 text-right">Telah Dibayar</th>
                          <th className="py-4 px-6 text-right">Sisa Kewajiban</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y text-sm">
                        {financialData.sekolahFinance.map(sf => (
                          <tr key={sf.id} className="hover:bg-slate-50/50">
                            <td className="py-4 px-6">
                              <p className="font-bold text-slate-800">{sf.nama}</p>
                              <p className="text-xs text-slate-400">{sf.siswaCount} siswa</p>
                            </td>
                            <td className="py-4 px-6 text-right font-medium text-slate-500">{formatRupiah(sf.targetSpp)}</td>
                            <td className="py-4 px-6 text-right font-bold text-blue-600">{formatRupiah(sf.realisasiSpp)}</td>
                            <td className="py-4 px-6 font-semibold text-slate-700">{sf.trainerNama}</td>
                            <td className="py-4 px-6 text-center font-semibold text-slate-700">{sf.trainerKehadiran} Sesi</td>
                            <td className="py-4 px-6 text-right font-bold text-slate-800">{formatRupiah(sf.bebanHonor)}</td>
                            <td className="py-4 px-6 text-right font-bold text-emerald-600">{formatRupiah(sf.honorDibayar)}</td>
                            <td className="py-4 px-6 text-right font-extrabold text-rose-600">{formatRupiah(sf.sisaHonor)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            )}
          </>
        )}
      </main>

      {/* --- FOOTER --- */}
      <footer className="bg-blue-950 text-blue-200 py-6 border-t border-blue-900 mt-10">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4 text-center">
          <p className="text-xs">© 2026 Bisnis Manajemen Afterschola. All rights reserved.</p>
          <div className="flex gap-4 text-xs font-bold text-slate-300">
            <span className="text-yellow-400">Akuntabilitas Dashboard Aktif</span>
            <span>•</span>
            <span>Penyimpanan Terdistribusi Aman</span>
          </div>
        </div>
      </footer>

      {/* --- MODAL INPUTS PANEL --- */}

      {/* A. Modal Sekolah */}
      {modalOpen === 'sekolah' && (
        <div key={selectedItem?.id || 'new-sch'} className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-scaleIn">
            <div className="bg-blue-900 text-white p-5 flex items-center justify-between shrink-0">
              <h3 className="text-lg font-bold text-yellow-300">
                {modalMode === 'add' ? 'Tambah Sekolah Baru' : 'Edit Sekolah'}
              </h3>
              <button onClick={() => setModalOpen(null)} className="text-white hover:text-yellow-400 transition">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <form onSubmit={handleSaveSekolah} className="p-6 space-y-4 overflow-y-auto flex-1 animate-fadeIn">
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase">Nama Sekolah Mitra</label>
                <input
                  type="text"
                  name="nama"
                  required
                  defaultValue={selectedItem?.nama || ''}
                  className="w-full mt-1 border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  placeholder="SD Karakter Mulia"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-400 uppercase">Alamat Lengkap</label>
                <input
                  type="text"
                  name="alamat"
                  required
                  defaultValue={selectedItem?.alamat || ''}
                  className="w-full mt-1 border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-400 uppercase">URL / Link Foto Sekolah</label>
                <input
                  type="text"
                  name="foto"
                  defaultValue={selectedItem?.foto || ''}
                  className="w-full mt-1 border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-600 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase">Trainer Bertugas</label>
                  <select name="trainer" defaultValue={selectedItem?.trainer || ''} className="w-full mt-1 border rounded-lg p-2.5 text-sm bg-white">
                    <option value="">-- Pilih Trainer --</option>
                    {trainer.map(t => <option key={t.id} value={t.nama}>{t.nama}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase">Biaya SPP Per Bulan</label>
                  <input type="number" name="spp" required defaultValue={selectedItem?.spp || 150000} className="w-full mt-1 border rounded-lg p-2.5 text-sm outline-none" />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-400 uppercase">Jadwal Kelas</label>
                <input type="text" name="jadwal" required defaultValue={selectedItem?.jadwal || 'Senin, 14:00 - 15:30'} className="w-full mt-1 border rounded-lg p-2.5 text-sm outline-none" />
              </div>

              <div className="pt-4 flex gap-3 justify-end border-t sticky bottom-0 bg-white pt-2">
                <button type="button" onClick={() => setModalOpen(null)} className="px-4 py-2 border rounded-xl text-xs font-bold text-slate-500">Batal</button>
                <button type="submit" className="px-5 py-2 bg-yellow-400 hover:bg-yellow-500 rounded-xl text-xs font-bold text-slate-900">Simpan</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* B. Modal Siswa */}
      {modalOpen === 'siswa' && (
        <div key={selectedItem?.id || 'new-sis'} className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-scaleIn">
            <div className="bg-blue-900 text-white p-5 flex items-center justify-between shrink-0">
              <h3 className="text-lg font-bold text-yellow-300">
                {modalMode === 'add' ? 'Tambah Siswa Baru' : 'Edit Profil Siswa'}
              </h3>
              <button onClick={() => setModalOpen(null)} className="text-white hover:text-yellow-400 transition">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <form onSubmit={handleSaveSiswa} className="p-6 space-y-4 overflow-y-auto flex-1 animate-fadeIn">
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase">Nama Lengkap Siswa</label>
                <input type="text" name="nama" required defaultValue={selectedItem?.nama || ''} className="w-full mt-1 border rounded-lg p-2.5 text-sm outline-none" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase">Kelas</label>
                  <input type="text" name="kelas" required defaultValue={selectedItem?.kelas || ''} className="w-full mt-1 border rounded-lg p-2.5 text-sm outline-none" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase">No. WhatsApp Wali</label>
                  <input type="text" name="wa" required defaultValue={selectedItem?.wa || ''} className="w-full mt-1 border rounded-lg p-2.5 text-sm outline-none" />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-400 uppercase">Sekolah Mitra</label>
                <select name="sekolahId" required defaultValue={selectedItem?.sekolahId || ''} className="w-full mt-1 border rounded-lg p-2.5 text-sm bg-white">
                  <option value="">-- Pilih Sekolah --</option>
                  {sekolah.map(s => <option key={s.id} value={s.id}>{s.nama}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-400 uppercase">URL Link Foto Siswa</label>
                <input type="text" name="foto" defaultValue={selectedItem?.foto || ''} className="w-full mt-1 border rounded-lg p-2.5 text-sm outline-none" />
              </div>

              <div className="border p-3 rounded-lg bg-slate-50 space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Pelunasan Catatan SPP Bulanan (2026)</label>
                <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-slate-700">
                  {['Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'].map(bulan => (
                    <label key={bulan} className="flex items-center gap-2 cursor-pointer bg-white p-1.5 rounded border hover:bg-blue-50 transition">
                      <input
                        type="checkbox"
                        name={`spp_${bulan}`}
                        defaultChecked={selectedItem?.sppLunasBulan?.[bulan] || false}
                        className="accent-blue-600 h-4 w-4 cursor-pointer"
                      />
                      <span>Bulan {bulan}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="pt-4 flex gap-3 justify-end border-t sticky bottom-0 bg-white pt-2">
                <button type="button" onClick={() => setModalOpen(null)} className="px-4 py-2 border rounded-xl text-xs font-bold text-slate-500">Batal</button>
                <button type="submit" className="px-5 py-2 bg-yellow-400 hover:bg-yellow-500 rounded-xl text-xs font-bold text-slate-900">Simpan</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* C. Modal Trainer */}
      {modalOpen === 'trainer' && (
        <div key={selectedItem?.id || 'new-tr'} className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-scaleIn">
            <div className="bg-blue-900 text-white p-5 flex items-center justify-between shrink-0">
              <h3 className="text-lg font-bold text-yellow-300">
                {modalMode === 'add' ? 'Tambah Trainer Baru' : 'Edit Profil Trainer'}
              </h3>
              <button onClick={() => setModalOpen(null)} className="text-white hover:text-yellow-400 transition">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <form onSubmit={handleSaveTrainer} className="p-6 space-y-4 overflow-y-auto flex-1 animate-fadeIn">
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase">Nama Trainer</label>
                <input type="text" name="nama" required defaultValue={selectedItem?.nama || ''} className="w-full mt-1 border rounded-lg p-2.5 text-sm outline-none" />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-400 uppercase">WhatsApp</label>
                <input type="text" name="wa" required defaultValue={selectedItem?.wa || ''} className="w-full mt-1 border rounded-lg p-2.5 text-sm outline-none" />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-400 uppercase">Jadwal Mengajar</label>
                <input type="text" name="jadwal" required defaultValue={selectedItem?.jadwal || ''} className="w-full mt-1 border rounded-lg p-2.5 text-sm outline-none" placeholder="Senin & Kamis" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase">Sekolah Tugas</label>
                  <select name="sekolah" required defaultValue={selectedItem?.sekolah || ''} className="w-full mt-1 border rounded-lg p-2.5 text-sm bg-white">
                    <option value="">-- Pilih Sekolah --</option>
                    {sekolah.map(s => <option key={s.id} value={s.nama}>{s.nama}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase">Honor Per Sesi</label>
                  <input type="number" name="honor" required defaultValue={selectedItem?.honor || 100000} className="w-full mt-1 border rounded-lg p-2.5 text-sm outline-none" />
                </div>
              </div>

              <div className="pt-4 flex gap-3 justify-end border-t sticky bottom-0 bg-white pt-2">
                <button type="button" onClick={() => setModalOpen(null)} className="px-4 py-2 border rounded-xl text-xs font-bold text-slate-500">Batal</button>
                <button type="submit" className="px-5 py-2 bg-yellow-400 hover:bg-yellow-500 rounded-xl text-xs font-bold text-slate-900">Simpan</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* D. Modal Bayar Honor Trainer */}
      {modalOpen === 'bayarHonor' && selectedItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl animate-scaleIn border-t-4 border-emerald-500">
            <div className="p-5 border-b flex justify-between items-center">
              <div>
                <h3 className="text-base font-bold text-slate-900">Input Pembayaran Honor</h3>
                <p className="text-xs text-slate-400">Trainer: {selectedItem.nama} - Periode {selectedPeriode} 2026</p>
              </div>
              <button onClick={() => setModalOpen(null)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <form onSubmit={handleSaveHonorPayment} className="p-5 space-y-4">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-xs text-slate-600 space-y-2">
                <div className="flex justify-between">
                  <span>Kehadiran Mengajar:</span>
                  <span className="font-bold text-blue-900">
                    {attendanceStats.trainerMonthlyCount[normalizeKey(selectedItem.nama)] || 0} Sesi
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Akumulasi Beban Honor:</span>
                  <span className="font-bold text-slate-900">
                    {formatRupiah((attendanceStats.trainerMonthlyCount[normalizeKey(selectedItem.nama)] || 0) * selectedItem.honor)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Telah Dibayar Sebelumnya:</span>
                  <span className="font-bold text-emerald-600">
                    {formatRupiah(selectedItem.honorDibayarBulan?.[selectedPeriode] || 0)}
                  </span>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Nominal Pembayaran Realisasi (IDR)</label>
                <input
                  type="number"
                  name="nominal"
                  required
                  defaultValue={selectedItem.honorDibayarBulan?.[selectedPeriode] || 0}
                  className="w-full mt-1.5 border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-slate-800"
                />
              </div>

              <div className="pt-3 flex gap-2 justify-end border-t">
                <button type="button" onClick={() => setModalOpen(null)} className="px-3 py-2 border rounded-lg text-xs font-bold text-slate-400">Batal</button>
                <button type="submit" className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow">
                  Simpan Pembayaran
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* E. Modal Setting Config */}
      {modalOpen === 'settings' && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-scaleIn">
            <div className="bg-blue-900 text-white p-5 flex items-center justify-between shrink-0">
              <h3 className="text-lg font-bold text-yellow-300">Konfigurasi Identitas Dashboard</h3>
              <button onClick={() => setModalOpen(null)} className="text-white hover:text-yellow-400 transition">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <form onSubmit={handleSaveSettings} className="p-6 space-y-4 overflow-y-auto flex-1 animate-fadeIn">
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase">Judul Utama Dashboard</label>
                <input type="text" name="title" required defaultValue={settings.title} className="w-full mt-1 border rounded-lg p-2.5 text-sm outline-none" />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-400 uppercase">Tautan Logo Internet Archive / Image URL</label>
                <input type="text" name="logoUrl" required defaultValue={settings.logoUrl} className="w-full mt-1 border rounded-lg p-2.5 text-sm outline-none" />
              </div>

              <div className="pt-4 flex gap-3 justify-end border-t sticky bottom-0 bg-white pt-2">
                <button type="button" onClick={() => setModalOpen(null)} className="px-4 py-2 border rounded-xl text-xs font-bold text-slate-500">Batal</button>
                <button type="submit" className="px-5 py-2 bg-yellow-400 hover:bg-yellow-500 rounded-xl text-xs font-bold text-slate-900">Simpan</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- CONFIRMATION DIALOG MODAL --- */}
      {confirmModal.show && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl animate-scaleIn border-t-4 border-yellow-400">
            <h4 className="text-lg font-bold text-slate-900 mb-2">{confirmModal.title}</h4>
            <p className="text-sm text-slate-600 mb-6">{confirmModal.message}</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmModal(prev => ({ ...prev, show: false }))} className="px-4 py-2 border rounded-xl text-xs font-bold text-slate-500">Kembali</button>
              <button onClick={confirmModal.onConfirm} className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow">Hapus</button>
            </div>
          </div>
        </div>
      )}

      {/* --- CUSTOM ALERT MODAL --- */}
      {alertModal.show && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl animate-scaleIn border-t-4 border-emerald-500 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4 text-xl">✓</div>
            <h4 className="text-lg font-bold text-slate-900 mb-2">{alertModal.title}</h4>
            <p className="text-sm text-slate-600 mb-6">{alertModal.message}</p>
            <button onClick={() => setAlertModal(prev => ({ ...prev, show: false }))} className="w-full py-2.5 bg-blue-900 hover:bg-blue-800 text-white rounded-xl text-xs font-bold shadow">Mengerti</button>
          </div>
        </div>
      )}

    </div>
  );
}