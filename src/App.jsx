import React, { useState, useEffect, useReducer, createContext, useContext, useRef, Component } from 'react';
import { 
  UploadCloud, Folder, File, Users, LogOut, CheckCircle, 
  XCircle, Loader2, Search, Trash2, Plus, AlertTriangle,
  FileText, ImageIcon, HardDrive, FileArchive, BookOpen, ClipboardCheck, Settings
} from 'lucide-react';

// ==========================================
// 1. KONFIGURASI & UTILITAS DATA
// ==========================================
const GAS_URL = "https://script.google.com/macros/s/AKfycbzw3M_iibRuWfrvttDsna_HykEQ80xvbxmwv-talHOUrhqZry4aJUNumT2Wr-xZtE-f/exec";
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

const formatBytes = (bytes, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const getFileIcon = (mimeType, fileName = '') => {
  const typeStr = (mimeType || fileName || '').toLowerCase();
  if (typeStr.includes('image') || typeStr.match(/\.(jpg|jpeg|png|gif|svg)$/)) return <ImageIcon className="w-8 h-8 text-blue-500" />;
  if (typeStr.includes('pdf') || typeStr.match(/\.pdf$/)) return <FileText className="w-8 h-8 text-red-500" />;
  if (typeStr.includes('zip') || typeStr.includes('rar') || typeStr.match(/\.(zip|rar|7z)$/)) return <FileArchive className="w-8 h-8 text-amber-500" />;
  return <File className="w-8 h-8 text-slate-500" />;
};

const fileToBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = () => resolve(reader.result.split(',')[1]);
  reader.onerror = error => reject(error);
});

// ==========================================
// 2. FUNGSI FETCH ANTI-CORS
// ==========================================
const getFromGas = async (action) => {
  try {
    const url = `${GAS_URL}?action=${action}&t=${Date.now()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (err) {
      throw new Error("Format respons dari GAS bukan JSON valid.");
    }
  } catch (error) {
    throw new Error("Koneksi diblokir oleh Google. Pastikan Akses Web App di GAS diatur ke 'Siapa saja' (Anyone).");
  }
};

const postToGas = async (payload) => {
  try {
    const res = await fetch(GAS_URL, { method: 'POST', body: JSON.stringify(payload) });
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (err) {
      throw new Error("Format respons dari GAS bukan JSON valid.");
    }
  } catch (error) {
    throw new Error("Koneksi diblokir oleh Google. Pastikan Akses Web App di GAS diatur ke 'Siapa saja' (Anyone).");
  }
};

// ==========================================
// 3. STATE MANAGEMENT (CONTEXT API)
// ==========================================
const AppContext = createContext();

const initialState = {
  user: JSON.parse(localStorage.getItem('app_user')) || null,
  config: { tahun: [], semester: [], ujian: [], mapel: [], kelas: [] }, // Default dinamis
  activities: [],
  files: [],
  bankSoalActivities: [], 
  bankSoalFiles: [],      
  usersList: [],
  uploadQueue: [],
  toast: null,
  isLoadingData: false,
};

function appReducer(state, action) {
  switch (action.type) {
    case 'LOGIN':
      localStorage.setItem('app_user', JSON.stringify(action.payload));
      return { ...state, user: action.payload };
    case 'LOGOUT':
      localStorage.removeItem('app_user');
      return { ...initialState, user: null };
    case 'SET_CONFIG':
      return { ...state, config: action.payload || initialState.config };
    case 'SET_DATA':
      return { ...state, activities: action.payload.activities || [], files: action.payload.files || [], isLoadingData: false };
    case 'SET_BANK_SOAL':
      return { ...state, bankSoalActivities: action.payload.activities || [], bankSoalFiles: action.payload.files || [], isLoadingData: false };
    case 'SET_USERS':
      return { ...state, usersList: action.payload || [] };
    case 'SET_LOADING_DATA':
      return { ...state, isLoadingData: action.payload };
    case 'ADD_TO_QUEUE':
      return { ...state, uploadQueue: [...state.uploadQueue, ...action.payload] };
    case 'UPDATE_QUEUE_ITEM':
      return { ...state, uploadQueue: state.uploadQueue.map(item => item.id === action.payload.id ? { ...item, ...action.payload.updates } : item) };
    case 'REMOVE_FROM_QUEUE':
      return { ...state, uploadQueue: state.uploadQueue.filter(item => item.id !== action.payload) };
    case 'SHOW_TOAST':
      return { ...state, toast: action.payload };
    case 'HIDE_TOAST':
      return { ...state, toast: null };
    default:
      return state;
  }
}

// ==========================================
// 4. ERROR BOUNDARY & KOMPONEN GLOBAL
// ==========================================
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
          <div className="bg-white p-6 rounded-2xl shadow-xl max-w-md w-full text-center border border-red-100">
            <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-slate-800 mb-2">Terjadi Kesalahan Sistem</h2>
            <p className="text-slate-600 text-sm mb-4">Aplikasi mengalami kendala. Cobalah muat ulang halaman.</p>
            <button onClick={() => window.location.reload()} className="bg-slate-800 text-white px-4 py-2 rounded-lg">Muat Ulang</button>
          </div>
        </div>
      );
    }
    return this.props.children; 
  }
}

const Toast = () => {
  const { state, dispatch } = useContext(AppContext);
  useEffect(() => {
    if (state.toast) {
      const timer = setTimeout(() => dispatch({ type: 'HIDE_TOAST' }), 4000);
      return () => clearTimeout(timer);
    }
  }, [state.toast, dispatch]);

  if (!state.toast) return null;
  const isError = state.toast.type === 'error';
  return (
    <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 animate-slide-in w-[90%] max-w-md">
      <div className={`flex items-start gap-3 px-4 py-3 rounded-xl shadow-lg border ${isError ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
        {isError ? <XCircle className="w-5 h-5 mt-0.5 shrink-0" /> : <CheckCircle className="w-5 h-5 mt-0.5 shrink-0" />}
        <span className="font-medium text-sm break-words">{state.toast.message}</span>
      </div>
    </div>
  );
};

const Spinner = ({ className = "w-5 h-5" }) => <Loader2 className={`animate-spin ${className}`} />;

// ==========================================
// 5. LOGIN VIEW
// ==========================================
const LoginView = () => {
  const { dispatch } = useContext(AppContext);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ username: '', password: '' });

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await postToGas({ action: 'login', ...formData });
      if (data.status === 'success') {
        dispatch({ type: 'LOGIN', payload: data.user });
        dispatch({ type: 'SHOW_TOAST', payload: { message: "Selamat Datang!", type: "success" } });
      } else throw new Error(data.message || 'Username atau password salah');
    } catch (error) {
      dispatch({ type: 'SHOW_TOAST', payload: { message: error.message, type: "error" } });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full border border-slate-100">
        <div className="flex justify-center mb-6"><div className="bg-blue-100 p-3 rounded-full"><HardDrive className="w-8 h-8 text-blue-600" /></div></div>
        <h1 className="text-2xl font-bold text-center text-slate-800 mb-2">Portal Terpadu Sekolah</h1>
        <p className="text-center text-slate-500 mb-8 text-sm">Masuk untuk mengakses sistem sekolah</p>
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
            <input required type="text" className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              value={formData.username} onChange={e => setFormData({ ...formData, username: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
            <input required type="password" className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} />
          </div>
          <button disabled={loading} type="submit" className="w-full bg-blue-600 text-white font-medium py-2 rounded-lg hover:bg-blue-700 flex justify-center items-center gap-2">
            {loading ? <Spinner /> : 'Masuk'}
          </button>
        </form>
      </div>
    </div>
  );
};

// ==========================================
// 6. UPLOAD DOKUMENTASI VIEW
// ==========================================
const UploadFotoView = () => {
  const { state, dispatch } = useContext(AppContext);
  const [dragActive, setDragActive] = useState(false);
  const [formData, setFormData] = useState({ title: '', date: '' });
  const fileInputRef = useRef(null);

  const processFiles = (files) => {
    if (!formData.title || !formData.date) return dispatch({ type: 'SHOW_TOAST', payload: { message: "Isi Judul dan Tanggal!", type: "error" } });

    const newQueue = Array.from(files).map((file, index) => {
      if (file.size > MAX_FILE_SIZE) {
        dispatch({ type: 'SHOW_TOAST', payload: { message: `File ${file.name} melebihi 20MB!`, type: "error" } });
        return null;
      }
      const newName = `${formData.title.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}_${index}.${file.name.split('.').pop()}`;
      return { id: Math.random().toString(36).substr(2, 9), originalFile: file, name: newName, title: formData.title, date: formData.date, size: formatBytes(file.size), status: 'pending', isBankSoal: false };
    }).filter(Boolean);

    if (newQueue.length > 0) {
      dispatch({ type: 'ADD_TO_QUEUE', payload: newQueue });
      processQueue(newQueue);
    }
  };

  const processQueue = async (itemsToUpload) => {
    for (const item of itemsToUpload) {
      dispatch({ type: 'UPDATE_QUEUE_ITEM', payload: { id: item.id, updates: { status: 'uploading' } } });
      try {
        const base64Data = await fileToBase64(item.originalFile);
        const data = await postToGas({ action: 'upload', activityTitle: item.title, activityDate: item.date, fileName: item.name, mimeType: item.originalFile.type, fileData: base64Data });
        if (data.status === 'success') dispatch({ type: 'UPDATE_QUEUE_ITEM', payload: { id: item.id, updates: { status: 'success' } } });
        else throw new Error(data.message || "Gagal");
      } catch (error) {
        dispatch({ type: 'UPDATE_QUEUE_ITEM', payload: { id: item.id, updates: { status: 'error' } } });
      }
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2 text-blue-600"><UploadCloud className="w-6 h-6" /> Unggah Foto Kegiatan</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Judul Kegiatan</label>
            <input type="text" className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none" value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Tanggal Kegiatan</label>
            <input type="date" className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} />
          </div>
        </div>
        <div className={`border-2 border-dashed rounded-2xl p-10 text-center ${dragActive ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:bg-slate-50'}`}
          onDragEnter={() => setDragActive(true)} onDragLeave={() => setDragActive(false)} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); setDragActive(false); processFiles(e.dataTransfer.files); }}>
          <UploadCloud className="w-12 h-12 mx-auto mb-3 text-slate-400" />
          <p className="text-slate-600 font-medium mb-4">Tarik & Lepas gambar (Maks 20MB)</p>
          <input type="file" accept="image/*" multiple className="hidden" ref={fileInputRef} onChange={e => processFiles(e.target.files)} />
          <button onClick={() => fileInputRef.current.click()} className="bg-white border border-slate-300 px-4 py-2 rounded-lg text-sm shadow-sm">Pilih Gambar</button>
        </div>
      </div>
      {/* Upload Status List */}
      {state.uploadQueue.filter(i => !i.isBankSoal).length > 0 && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-bold text-slate-800 mb-4">Status Pengiriman</h3>
          <div className="space-y-3">
            {state.uploadQueue.filter(i => !i.isBankSoal).map(item => (
              <div key={item.id} className="flex justify-between p-3 rounded-lg border bg-slate-50">
                <div className="flex gap-3 overflow-hidden">
                  {getFileIcon('image/jpeg', item.name)}
                  <div className="truncate"><p className="text-sm font-semibold truncate">{item.name}</p><p className="text-xs text-slate-500">{item.size}</p></div>
                </div>
                <div>
                  {item.status === 'pending' && <span className="text-xs text-slate-500 bg-slate-200 px-2 py-1 rounded">Menunggu</span>}
                  {item.status === 'uploading' && <span className="text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded">Mengunggah</span>}
                  {item.status === 'success' && <span className="text-xs text-emerald-600 bg-emerald-100 px-2 py-1 rounded">Selesai</span>}
                  {item.status === 'error' && <span className="text-xs text-red-600 bg-red-100 px-2 py-1 rounded">Gagal</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ==========================================
// 7. UPLOAD BANK SOAL VIEW (DINAMIS)
// ==========================================
const UploadSoalView = () => {
  const { state, dispatch } = useContext(AppContext);
  const { config } = state;
  const [form, setForm] = useState({ 
    tahun: config.tahun[0] || '', semester: config.semester[0] || '', 
    ujian: config.ujian[0] || '', mapel: '', kelas: '' 
  });
  const fileInputRef = useRef(null);

  const processFiles = (files) => {
    if (!form.mapel || !form.kelas) return dispatch({ type: 'SHOW_TOAST', payload: { message: "Pilih Mapel & Kelas!", type: "error" } });

    const newQueue = Array.from(files).map((file, index) => {
      if (file.size > MAX_FILE_SIZE) return null;
      const actTitle = `${form.tahun.replace(/\//g, '-')}_${form.semester}_${form.ujian}`;
      const actDate = `${form.mapel.replace(/[^a-zA-Z0-9]/g, '_')}_${form.kelas}`;
      const newName = `${form.ujian}_${actDate}_${Date.now()}_${index}.${file.name.split('.').pop()}`;
      return { id: Math.random().toString(36).substr(2, 9), originalFile: file, name: newName, title: actTitle, date: actDate, size: formatBytes(file.size), status: 'pending', isBankSoal: true };
    }).filter(Boolean);

    if (newQueue.length > 0) { dispatch({ type: 'ADD_TO_QUEUE', payload: newQueue }); processQueue(newQueue); }
  };

  const processQueue = async (items) => {
    for (const item of items) {
      dispatch({ type: 'UPDATE_QUEUE_ITEM', payload: { id: item.id, updates: { status: 'uploading' } } });
      try {
        const base64Data = await fileToBase64(item.originalFile);
        const data = await postToGas({ action: 'uploadBankSoal', activityTitle: item.title, activityDate: item.date, fileName: item.name, mimeType: item.originalFile.type, fileData: base64Data });
        if (data.status === 'success') dispatch({ type: 'UPDATE_QUEUE_ITEM', payload: { id: item.id, updates: { status: 'success' } } });
        else throw new Error("Gagal");
      } catch (error) {
        dispatch({ type: 'UPDATE_QUEUE_ITEM', payload: { id: item.id, updates: { status: 'error' } } });
      }
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2 text-indigo-600"><BookOpen className="w-6 h-6" /> Unggah Naskah Ujian</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Tahun Pelajaran</label>
            <select className="w-full px-3 py-2 border rounded-lg bg-white" value={form.tahun} onChange={e => setForm({...form, tahun: e.target.value})}>
              {config.tahun.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Semester</label>
            <select className="w-full px-3 py-2 border rounded-lg bg-white" value={form.semester} onChange={e => setForm({...form, semester: e.target.value})}>
              {config.semester.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Jenis Ujian</label>
            <select className="w-full px-3 py-2 border rounded-lg bg-white" value={form.ujian} onChange={e => setForm({...form, ujian: e.target.value})}>
              {config.ujian.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Mata Pelajaran</label>
            <select className="w-full px-3 py-2 border rounded-lg bg-white" value={form.mapel} onChange={e => setForm({...form, mapel: e.target.value})}>
              <option value="">-- Pilih Mata Pelajaran --</option>
              {config.mapel.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Kelas</label>
            <select className="w-full px-3 py-2 border rounded-lg bg-white" value={form.kelas} onChange={e => setForm({...form, kelas: e.target.value})}>
              <option value="">-- Pilih Kelas --</option>
              {config.kelas.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
        </div>
        <div className={`border-2 border-dashed rounded-2xl p-10 text-center ${form.mapel ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300'}`}
          onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); processFiles(e.dataTransfer.files); }}>
          <UploadCloud className="w-12 h-12 mx-auto mb-3 text-slate-400" />
          <p className="text-slate-600 font-medium mb-4">Tarik & Lepas file ke sini</p>
          <input type="file" multiple className="hidden" ref={fileInputRef} onChange={e => processFiles(e.target.files)} />
          <button onClick={() => fileInputRef.current.click()} className="bg-white border px-4 py-2 rounded-lg text-sm shadow-sm">Pilih File</button>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 8. GALERI FOTO & ARSIP SOAL & PANTAU
// ==========================================
const GaleriFotoView = () => {
  const { state, dispatch } = useContext(AppContext);
  const [selectedFolder, setSelectedFolder] = useState(null);

  useEffect(() => {
    const fetch = async () => {
      dispatch({ type: 'SET_LOADING_DATA', payload: true });
      try { const data = await getFromGas('getData'); dispatch({ type: 'SET_DATA', payload: data }); }
      catch (error) {} finally { dispatch({ type: 'SET_LOADING_DATA', payload: false }); }
    };
    fetch();
  }, [dispatch]);

  if (state.isLoadingData) return <div className="text-center py-20"><Spinner className="w-8 h-8 mx-auto text-blue-500"/></div>;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold text-slate-800">
        {selectedFolder ? <button onClick={() => setSelectedFolder(null)} className="text-blue-600">Galeri</button> : 'Galeri Dokumentasi Foto'}
        {selectedFolder && <span className="mx-2">/</span>}{selectedFolder?.title}
      </h2>
      {!selectedFolder ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {state.activities.map(folder => (
            <div key={folder.id} onClick={() => setSelectedFolder(folder)} className="bg-white p-4 rounded-xl shadow-sm border cursor-pointer hover:border-blue-200 flex items-center gap-4">
              <Folder className="w-8 h-8 text-blue-500" />
              <div className="overflow-hidden"><h3 className="font-semibold truncate">{folder.title}</h3></div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {state.files.filter(f => f.activityId === selectedFolder.id).map(file => (
            <div key={file.id} className="bg-white rounded-xl shadow-sm border overflow-hidden">
              <div className="aspect-square bg-slate-100 flex items-center justify-center">
                <img src={file.downloadUrl} alt={file.newName} className="w-full h-full object-cover" onError={(e) => e.target.style.display = 'none'} />
              </div>
              <div className="p-3">
                <p className="text-xs font-semibold truncate">{file.newName}</p>
                <div className="flex gap-2 mt-2">
                  <a href={file.url} target="_blank" className="text-[10px] text-center flex-1 bg-slate-100 py-1.5 rounded text-blue-600 font-bold">Lihat</a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const ArsipSoalView = () => {
  const { state, dispatch } = useContext(AppContext);
  useEffect(() => {
    const fetch = async () => {
      dispatch({ type: 'SET_LOADING_DATA', payload: true });
      try { const data = await getFromGas('getBankSoal'); dispatch({ type: 'SET_BANK_SOAL', payload: data }); }
      catch (error) {} finally { dispatch({ type: 'SET_LOADING_DATA', payload: false }); }
    };
    fetch();
  }, [dispatch]);

  if (state.isLoadingData) return <div className="text-center py-20"><Spinner className="w-8 h-8 mx-auto text-indigo-500"/></div>;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><BookOpen className="w-6 h-6 text-indigo-500" /> Arsip Bank Soal</h2>
      <div className="bg-white rounded-2xl border shadow-sm overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead className="bg-slate-50 border-b">
            <tr><th className="py-3 px-4">Nama Berkas</th><th className="py-3 px-4">Folder Asal</th><th className="py-3 px-4 text-right">Aksi</th></tr>
          </thead>
          <tbody>
            {state.bankSoalFiles.map(file => {
              const info = state.bankSoalActivities.find(a => a.id === file.activityId) || {};
              return (
                <tr key={file.id} className="border-b hover:bg-slate-50">
                  <td className="py-3 px-4 font-medium flex items-center gap-2"><FileText className="w-4 h-4 text-red-500"/> {file.newName}</td>
                  <td className="py-3 px-4"><span className="font-semibold block">{info.title}</span><span className="text-xs text-slate-500">{info.date}</span></td>
                  <td className="py-3 px-4 text-right">
                    <a href={file.url} target="_blank" className="text-blue-600 font-bold text-xs bg-blue-50 px-3 py-1.5 rounded mr-2">Buka</a>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const PantauSoalView = () => {
  const { state } = useContext(AppContext);
  const { config } = state;
  const [filter, setFilter] = useState({ tahun: config.tahun[0]||'', semester: config.semester[0]||'', ujian: config.ujian[0]||'' });

  const checkStatus = (mapel, kelas) => {
    const pFolder = `${filter.tahun.replace(/\//g, '-')}_${filter.semester}_${filter.ujian}`;
    const pSub = `${mapel.replace(/[^a-zA-Z0-9]/g, '_')}_${kelas}`;
    const folder = state.bankSoalActivities.find(a => a.title === pFolder && a.date === pSub);
    return folder ? state.bankSoalFiles.find(f => f.activityId === folder.id) : null;
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <h2 className="text-xl font-bold flex items-center gap-2"><ClipboardCheck className="text-emerald-600" /> Pantau Soal</h2>
        <div className="flex gap-2">
          {['tahun', 'semester', 'ujian'].map(key => (
            <select key={key} className="px-3 py-1.5 border rounded-lg text-xs" value={filter[key]} onChange={e => setFilter({...filter, [key]: e.target.value})}>
              {config[key].map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          ))}
        </div>
      </div>
      <div className="bg-white rounded-2xl border shadow-sm overflow-x-auto">
        <table className="w-full text-center border-collapse text-sm">
          <thead className="bg-slate-50 border-b">
            <tr><th className="py-3 px-4 text-left">Mapel \ Kelas</th>{config.kelas.map(k => <th key={k} className="py-3 px-2">{k}</th>)}</tr>
          </thead>
          <tbody>
            {config.mapel.map(m => (
              <tr key={m} className="border-b hover:bg-slate-50">
                <td className="py-3 px-4 text-left font-semibold">{m}</td>
                {config.kelas.map(k => (
                  <td key={k} className="py-3 px-2">
                    {checkStatus(m, k) ? <CheckCircle className="w-5 h-5 text-emerald-500 mx-auto" /> : <XCircle className="w-5 h-5 text-red-300 mx-auto" />}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ==========================================
// 9. PENGATURAN ADMIN (KONFIG & AKUN)
// ==========================================
const AdminConfigView = () => {
  const { state, dispatch } = useContext(AppContext);
  const [loading, setLoading] = useState(false);
  const [formConfig, setFormConfig] = useState({
    tahun: state.config.tahun.join(', '),
    semester: state.config.semester.join(', '),
    ujian: state.config.ujian.join(', '),
    mapel: state.config.mapel.join(', '),
    kelas: state.config.kelas.join(', ')
  });

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    setLoading(true);
    const payload = {
      tahun: formConfig.tahun.split(',').map(s => s.trim()).filter(Boolean),
      semester: formConfig.semester.split(',').map(s => s.trim()).filter(Boolean),
      ujian: formConfig.ujian.split(',').map(s => s.trim()).filter(Boolean),
      mapel: formConfig.mapel.split(',').map(s => s.trim()).filter(Boolean),
      kelas: formConfig.kelas.split(',').map(s => s.trim()).filter(Boolean),
    };
    try {
      const data = await postToGas({ action: 'saveConfig', config: payload });
      if(data.status === 'success') {
        dispatch({ type: 'SET_CONFIG', payload: payload });
        dispatch({ type: 'SHOW_TOAST', payload: { message: "Konfigurasi Sistem Disimpan!", type: "success" } });
      }
    } catch(err) {
      dispatch({ type: 'SHOW_TOAST', payload: { message: "Gagal menyimpan konfigurasi", type: "error" } });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <h2 className="text-xl font-bold text-slate-800 mb-2 flex items-center gap-2"><Settings className="w-6 h-6 text-slate-600" /> Konfigurasi Sistem (Dinamis)</h2>
        <p className="text-xs text-slate-500 mb-6">Pisahkan setiap item dengan tanda koma (,). Perubahan akan langsung memengaruhi pilihan di menu Unggah Bank Soal.</p>
        
        <form onSubmit={handleSaveConfig} className="space-y-4">
          {Object.keys(formConfig).map(key => (
            <div key={key}>
              <label className="block text-sm font-bold text-slate-700 mb-1 capitalize">Daftar {key}</label>
              <textarea required className="w-full px-4 py-2 border rounded-lg outline-none bg-slate-50" rows="2" 
                value={formConfig[key]} onChange={e => setFormConfig({...formConfig, [key]: e.target.value})} />
            </div>
          ))}
          <button disabled={loading} type="submit" className="bg-slate-800 text-white px-6 py-2 rounded-lg font-medium hover:bg-slate-700">
            {loading ? 'Menyimpan...' : 'Simpan Konfigurasi'}
          </button>
        </form>
      </div>
    </div>
  );
};

// ==========================================
// 10. DASHBOARD WRAPPER (MAIN LAYOUT)
// ==========================================
const Dashboard = () => {
  const { state, dispatch } = useContext(AppContext);
  const [activeTab, setActiveTab] = useState('upload-foto');

  // Load Config On Mount
  useEffect(() => {
    const fetchConf = async () => {
      try {
        const data = await getFromGas('getConfig');
        if(data && data.config) dispatch({ type: 'SET_CONFIG', payload: data.config });
      } catch(e) {}
    }
    fetchConf();
  }, [dispatch]);

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50">
      <aside className="w-full md:w-64 bg-slate-900 text-slate-300 flex flex-col shrink-0">
        <div className="p-6 border-b border-slate-800 flex items-center gap-3 bg-slate-950">
          <div className="bg-blue-600 p-2 rounded-lg"><HardDrive className="w-6 h-6 text-white" /></div>
          <div><h1 className="font-bold text-white text-sm">PORTAL TERPADU</h1><p className="text-[10px] uppercase font-medium">{state.user.role}</p></div>
        </div>
        <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
          <div className="text-[10px] font-bold text-slate-500 px-4 py-2 uppercase">Dokumentasi</div>
          <button onClick={() => setActiveTab('upload-foto')} className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-semibold ${activeTab === 'upload-foto' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800'}`}><UploadCloud className="w-4 h-4" /> Unggah Foto</button>
          <button onClick={() => setActiveTab('galeri-foto')} className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-semibold ${activeTab === 'galeri-foto' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800'}`}><Folder className="w-4 h-4" /> Galeri Foto</button>

          <div className="text-[10px] font-bold text-slate-500 px-4 py-2 pt-4 uppercase">Bank Soal</div>
          <button onClick={() => setActiveTab('upload-soal')} className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-semibold ${activeTab === 'upload-soal' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800'}`}><UploadCloud className="w-4 h-4 text-indigo-400" /> Unggah Soal</button>
          <button onClick={() => setActiveTab('arsip-soal')} className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-semibold ${activeTab === 'arsip-soal' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800'}`}><BookOpen className="w-4 h-4 text-indigo-400" /> Arsip Soal</button>

          {/* HANYA MUNCUL JIKA ADMIN */}
          {state.user.role === 'admin' && (
            <>
              <div className="text-[10px] font-bold text-slate-500 px-4 py-2 pt-4 uppercase">Administrator</div>
              <button onClick={() => setActiveTab('pantau-soal')} className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-semibold ${activeTab === 'pantau-soal' ? 'bg-emerald-600 text-white' : 'hover:bg-slate-800'}`}><ClipboardCheck className="w-4 h-4 text-emerald-400" /> Pantau Soal</button>
              <button onClick={() => setActiveTab('admin-config')} className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-semibold ${activeTab === 'admin-config' ? 'bg-slate-700 text-white' : 'hover:bg-slate-800'}`}><Settings className="w-4 h-4 text-slate-400" /> Pengaturan Sistem</button>
            </>
          )}
        </nav>
        <div className="p-4 bg-slate-950/40">
          <button onClick={() => { if(confirm('Keluar?')) dispatch({type: 'LOGOUT'})}} className="w-full flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold text-red-400 hover:bg-red-950/40 rounded-xl border border-red-900/30"><LogOut className="w-4 h-4" /> Keluar</button>
        </div>
      </aside>
      <main className="flex-1 p-6 md:p-10 overflow-y-auto">
        {activeTab === 'upload-foto' && <UploadFotoView />}
        {activeTab === 'galeri-foto' && <GaleriFotoView />}
        {activeTab === 'upload-soal' && <UploadSoalView />}
        {activeTab === 'arsip-soal' && <ArsipSoalView />}
        {activeTab === 'pantau-soal' && <PantauSoalView />}
        {activeTab === 'admin-config' && <AdminConfigView />}
      </main>
    </div>
  );
};

export default function App() {
  const [state, dispatch] = useReducer(appReducer, initialState);
  return <ErrorBoundary><AppContext.Provider value={{ state, dispatch }}><Toast />{state.user ? <Dashboard /> : <LoginView />}</AppContext.Provider></ErrorBoundary>;
}
