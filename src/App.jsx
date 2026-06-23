import React, { useState, useEffect, useReducer, createContext, useContext, useRef, Component } from 'react';
import { 
  UploadCloud, Folder, File, Users, LogOut, CheckCircle, 
  XCircle, Loader2, Search, Trash2, Edit2, Plus, AlertTriangle,
  FileText, ImageIcon, HardDrive, FileArchive
} from 'lucide-react';

// ==========================================
// 1. KONFIGURASI & UTILITAS
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

const getFileIcon = (mimeType) => {
  if (mimeType?.includes('image')) return <ImageIcon className="w-8 h-8 text-blue-500" />;
  if (mimeType?.includes('pdf')) return <FileText className="w-8 h-8 text-red-500" />;
  if (mimeType?.includes('zip') || mimeType?.includes('rar')) return <FileArchive className="w-8 h-8 text-amber-500" />;
  return <File className="w-8 h-8 text-slate-500" />;
};

const fileToBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = () => resolve(reader.result.split(',')[1]);
  reader.onerror = error => reject(error);
});

// ==========================================
// 2. FUNGSI FETCH ANTI-CORS (AUDIT BARU)
// ==========================================
const getFromGas = async (action) => {
  try {
    const url = `${GAS_URL}?action=${action}&t=${Date.now()}`;
    // Mode no-cors dilarang jika kita ingin membaca respon JSON. 
    // Kita gunakan pengaturan default fetch.
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (err) {
      throw new Error("Format respons dari GAS bukan JSON yang valid.");
    }
  } catch (error) {
    console.error("GET Fetch Error:", error);
    // Jika fetch terblokir, kemungkinannya 99% karena masalah hak akses Google Apps Script.
    throw new Error("Koneksi diblokir oleh Google. Pastikan Akses Web App di GAS diatur ke 'Siapa saja' (Anyone).");
  }
};

const postToGas = async (payload) => {
  try {
    const res = await fetch(GAS_URL, {
      method: 'POST',
      // DIBUANG: headers: {'Content-Type': 'application/json'}
      // Membuang headers memaksa browser menganggap ini 'text/plain',
      // sehingga tidak memicu pengecekan CORS (OPTIONS) dari Google yang sering gagal.
      body: JSON.stringify(payload)
    });
    
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (err) {
      throw new Error("Format respons dari GAS bukan JSON yang valid.");
    }
  } catch (error) {
    console.error("POST Fetch Error:", error);
    throw new Error("Koneksi upload diblokir oleh Google. Pastikan Akses Web App di GAS diatur ke 'Siapa saja' (Anyone).");
  }
};

// ==========================================
// 3. STATE MANAGEMENT (CONTEXT API)
// ==========================================
const AppContext = createContext();

const initialState = {
  user: JSON.parse(localStorage.getItem('app_user')) || null,
  activities: [],
  files: [],
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
      return { ...state, user: null, activities: [], files: [], usersList: [] };
    case 'SET_DATA':
      return { ...state, activities: action.payload.activities || [], files: action.payload.files || [], isLoadingData: false };
    case 'SET_USERS':
      return { ...state, usersList: action.payload || [] };
    case 'SET_LOADING_DATA':
      return { ...state, isLoadingData: action.payload };
    case 'ADD_TO_QUEUE':
      return { ...state, uploadQueue: [...state.uploadQueue, ...action.payload] };
    case 'UPDATE_QUEUE_ITEM':
      return {
        ...state,
        uploadQueue: state.uploadQueue.map(item => 
          item.id === action.payload.id ? { ...item, ...action.payload.updates } : item
        )
      };
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
// 4. ERROR BOUNDARY
// ==========================================
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
          <div className="bg-white p-6 rounded-2xl shadow-xl max-w-md w-full text-center border border-red-100">
            <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-slate-800 mb-2">Terjadi Kesalahan Sistem</h2>
            <p className="text-slate-600 text-sm mb-4">Aplikasi mengalami kendala. Cobalah muat ulang halaman.</p>
            <button onClick={() => window.location.reload()} className="bg-slate-800 text-white px-4 py-2 rounded-lg hover:bg-slate-700 transition">
              Muat Ulang
            </button>
          </div>
        </div>
      );
    }
    return this.props.children; 
  }
}

// ==========================================
// 5. KOMPONEN UI GLOBAL
// ==========================================
const Toast = () => {
  const { state, dispatch } = useContext(AppContext);
  useEffect(() => {
    if (state.toast) {
      const timer = setTimeout(() => dispatch({ type: 'HIDE_TOAST' }), 5000); // Diperpanjang jadi 5 detik agar error terbaca
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

const Spinner = ({ className = "w-5 h-5" }) => (
  <Loader2 className={`animate-spin ${className}`} />
);

// ==========================================
// 6. VIEW KOMPONEN
// ==========================================

// --- LOGIN VIEW ---
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
        dispatch({ type: 'SHOW_TOAST', payload: { message: "Login berhasil!", type: "success" } });
      } else {
        throw new Error(data.message || 'Username atau password salah');
      }
    } catch (error) {
      dispatch({ type: 'SHOW_TOAST', payload: { message: error.message, type: "error" } });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full border border-slate-100">
        <div className="flex justify-center mb-6">
          <div className="bg-blue-100 p-3 rounded-full"><HardDrive className="w-8 h-8 text-blue-600" /></div>
        </div>
        <h1 className="text-2xl font-bold text-center text-slate-800 mb-2">Sistem Dokumentasi</h1>
        <p className="text-center text-slate-500 mb-8 text-sm">Masuk untuk mengelola file dan kegiatan</p>
        
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
            <input required type="text" className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition"
              value={formData.username} onChange={e => setFormData({ ...formData, username: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
            <input required type="password" className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition"
              value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} />
          </div>
          <button disabled={loading} type="submit" className="w-full bg-blue-600 text-white font-medium py-2 rounded-lg hover:bg-blue-700 transition flex justify-center items-center gap-2 disabled:opacity-70">
            {loading ? <Spinner /> : 'Masuk'}
          </button>
        </form>
      </div>
    </div>
  );
};

// --- UPLOAD VIEW ---
const UploadView = () => {
  const { state, dispatch } = useContext(AppContext);
  const [dragActive, setDragActive] = useState(false);
  const [formData, setFormData] = useState({ title: '', date: '' });
  const fileInputRef = useRef(null);

  const handleDrag = (e) => {
    e.preventDefault(); e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };

  const processFiles = (files) => {
    if (!formData.title || !formData.date) {
      return dispatch({ type: 'SHOW_TOAST', payload: { message: "Isi Judul dan Tanggal kegiatan terlebih dahulu", type: "error" } });
    }

    const newQueue = Array.from(files).map((file, index) => {
      if (file.size > MAX_FILE_SIZE) {
        dispatch({ type: 'SHOW_TOAST', payload: { message: `File ${file.name} melebihi 20MB!`, type: "error" } });
        return null;
      }
      
      const ext = file.name.split('.').pop();
      const newName = `${formData.title.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}_${index}.${ext}`;
      
      return {
        id: Math.random().toString(36).substr(2, 9),
        originalFile: file,
        name: newName,
        title: formData.title,
        date: formData.date,
        size: formatBytes(file.size),
        status: 'pending', 
      };
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
        const payload = {
          action: 'upload',
          activityTitle: item.title,
          activityDate: item.date,
          fileName: item.name,
          mimeType: item.originalFile.type,
          fileData: base64Data
        };

        const data = await postToGas(payload);
        
        if (data.status === 'success') {
          dispatch({ type: 'UPDATE_QUEUE_ITEM', payload: { id: item.id, updates: { status: 'success' } } });
        } else {
          throw new Error(data.message || "Gagal mengunggah file");
        }
      } catch (error) {
        dispatch({ type: 'UPDATE_QUEUE_ITEM', payload: { id: item.id, updates: { status: 'error' } } });
        dispatch({ type: 'SHOW_TOAST', payload: { message: error.message, type: "error" } });
      }
    }
  };

  const handleDrop = (e) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) processFiles(e.dataTransfer.files);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <h2 className="text-xl font-bold text-slate-800 mb-4">Upload File Baru</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Judul Kegiatan</label>
            <input type="text" className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="Contoh: Rapat Komite" value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Tanggal Kegiatan</label>
            <input type="date" className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} />
          </div>
        </div>

        <div 
          className={`border-2 border-dashed rounded-2xl p-10 text-center transition ${dragActive ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:bg-slate-50'}`}
          onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
        >
          <UploadCloud className={`w-12 h-12 mx-auto mb-3 ${dragActive ? 'text-blue-500' : 'text-slate-400'}`} />
          <p className="text-slate-600 font-medium mb-1">Tarik & Lepas file ke sini</p>
          <p className="text-slate-400 text-sm mb-4">atau klik tombol di bawah (Maks 20MB/file)</p>
          <input type="file" multiple className="hidden" ref={fileInputRef} onChange={e => processFiles(e.target.files)} />
          <button onClick={() => fileInputRef.current.click()} className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-50 transition font-medium text-sm">
            Pilih File
          </button>
        </div>
      </div>

      {/* Upload Queue Monitor */}
      {state.uploadQueue.length > 0 && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-bold text-slate-800 mb-4">Status Upload</h3>
          <div className="space-y-3">
            {state.uploadQueue.map(item => (
              <div key={item.id} className="flex items-center justify-between p-3 rounded-lg border border-slate-100 bg-slate-50">
                <div className="flex items-center gap-3 overflow-hidden">
                  {getFileIcon(item.originalFile.type)}
                  <div className="truncate">
                    <p className="text-sm font-semibold text-slate-800 truncate">{item.name}</p>
                    <p className="text-xs text-slate-500">{item.size}</p>
                  </div>
                </div>
                <div>
                  {item.status === 'pending' && <span className="text-xs font-medium text-slate-500 bg-slate-200 px-2 py-1 rounded">Menunggu</span>}
                  {item.status === 'uploading' && <span className="text-xs font-medium text-blue-600 bg-blue-100 px-2 py-1 rounded flex items-center gap-1"><Spinner className="w-3 h-3"/> Mengunggah</span>}
                  {item.status === 'success' && <span className="text-xs font-medium text-emerald-600 bg-emerald-100 px-2 py-1 rounded">Selesai</span>}
                  {item.status === 'error' && <span className="text-xs font-medium text-red-600 bg-red-100 px-2 py-1 rounded">Gagal</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// --- GALLERY VIEW ---
const GalleryView = () => {
  const { state, dispatch } = useContext(AppContext);
  const [search, setSearch] = useState('');
  const [selectedFolder, setSelectedFolder] = useState(null);

  useEffect(() => {
    const fetchGallery = async () => {
      dispatch({ type: 'SET_LOADING_DATA', payload: true });
      try {
        const data = await getFromGas('getData');
        dispatch({ type: 'SET_DATA', payload: data });
      } catch (error) {
        dispatch({ type: 'SHOW_TOAST', payload: { message: error.message, type: "error" } });
      } finally {
        dispatch({ type: 'SET_LOADING_DATA', payload: false });
      }
    };
    fetchGallery();
  }, [dispatch]);

  const filteredActivities = state.activities.filter(a => a.name.toLowerCase().includes(search.toLowerCase()));

  if (state.isLoadingData) {
    return <div className="flex flex-col items-center justify-center h-64 text-slate-400"><Spinner className="w-8 h-8 mb-4 text-blue-500"/> Memuat Galeri...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <h2 className="text-2xl font-bold text-slate-800">
          {selectedFolder ? <button onClick={() => setSelectedFolder(null)} className="text-blue-600 hover:underline">Galeri</button> : 'Galeri Kegiatan'}
          {selectedFolder && <span className="text-slate-400 mx-2">/</span>}
          {selectedFolder && selectedFolder.name}
        </h2>
        
        {!selectedFolder && (
          <div className="relative w-full md:w-72">
            <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="Cari kegiatan..." className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-full focus:ring-2 focus:ring-blue-500 outline-none"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        )}
      </div>

      {!selectedFolder ? (
        // FOLDER LIST
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredActivities.length === 0 ? (
            <div className="col-span-full text-center text-slate-500 py-10">Belum ada folder kegiatan.</div>
          ) : (
            filteredActivities.map(folder => (
              <div key={folder.id} onClick={() => setSelectedFolder(folder)} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 hover:shadow-md hover:border-blue-200 transition cursor-pointer group flex items-center gap-4">
                <div className="bg-blue-50 p-3 rounded-lg group-hover:bg-blue-100 transition"><Folder className="w-8 h-8 text-blue-500" /></div>
                <div className="overflow-hidden">
                  <h3 className="font-semibold text-slate-800 truncate" title={folder.name}>{folder.name}</h3>
                  <p className="text-xs text-slate-500 mt-1">{state.files.filter(f => f.folderId === folder.id).length} file</p>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        // FILE LIST IN FOLDER
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {state.files.filter(f => f.folderId === selectedFolder.id).length === 0 ? (
             <div className="col-span-full text-center text-slate-500 py-10">Folder ini kosong.</div>
          ) : (
            state.files.filter(f => f.folderId === selectedFolder.id).map(file => (
              <div key={file.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex items-start gap-4 group">
                <div className="p-2 bg-slate-50 rounded-lg">{getFileIcon(file.mimeType)}</div>
                <div className="flex-1 overflow-hidden">
                  <p className="text-sm font-semibold text-slate-800 truncate" title={file.name}>{file.name}</p>
                  <p className="text-xs text-slate-500 mt-1">{formatBytes(file.size)}</p>
                  <div className="flex gap-2 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <a href={file.url} target="_blank" rel="noreferrer" className="text-xs font-medium bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-1.5 rounded-md transition">Buka</a>
                    <a href={file.downloadUrl} className="text-xs font-medium bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-md transition">Unduh</a>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

// --- ADMIN VIEW ---
const AdminView = () => {
  const { state, dispatch } = useContext(AppContext);
  const [loading, setLoading] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'gtk' });

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const data = await getFromGas('getUsers');
        dispatch({ type: 'SET_USERS', payload: data.users || [] });
      } catch (error) {
        dispatch({ type: 'SHOW_TOAST', payload: { message: error.message, type: "error" } });
      }
    };
    fetchUsers();
  }, [dispatch]);

  const handleSaveUser = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await postToGas({ action: 'saveUser', ...newUser });
      if (data.status === 'success') {
        dispatch({ type: 'SHOW_TOAST', payload: { message: "Pengguna berhasil disimpan", type: "success" } });
        setNewUser({ username: '', password: '', role: 'gtk' });
        // Refresh users
        const dataUsers = await getFromGas('getUsers');
        dispatch({ type: 'SET_USERS', payload: dataUsers.users || [] });
      } else { throw new Error("Gagal menyimpan pengguna"); }
    } catch (error) {
      dispatch({ type: 'SHOW_TOAST', payload: { message: error.message, type: "error" } });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (username) => {
    if(!confirm(`Hapus pengguna ${username}?`)) return;
    try {
      const data = await postToGas({ action: 'deleteUser', username });
      if (data.status === 'success') {
        dispatch({ type: 'SHOW_TOAST', payload: { message: "Pengguna dihapus", type: "success" } });
        dispatch({ type: 'SET_USERS', payload: state.usersList.filter(u => u.username !== username) });
      }
    } catch (error) {
      dispatch({ type: 'SHOW_TOAST', payload: { message: error.message, type: "error" } });
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <h2 className="text-xl font-bold text-slate-800 mb-4">Manajemen Pengguna</h2>
        
        <form onSubmit={handleSaveUser} className="flex flex-col md:flex-row gap-4 mb-8 bg-slate-50 p-4 rounded-xl border border-slate-200">
          <input required type="text" placeholder="Username" className="flex-1 px-4 py-2 border border-slate-300 rounded-lg" value={newUser.username} onChange={e => setNewUser({...newUser, username: e.target.value})} />
          <input required type="password" placeholder="Password" className="flex-1 px-4 py-2 border border-slate-300 rounded-lg" value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} />
          <select className="px-4 py-2 border border-slate-300 rounded-lg bg-white" value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value})}>
            <option value="gtk">GTK</option>
            <option value="admin">Admin</option>
          </select>
          <button disabled={loading} type="submit" className="bg-slate-800 text-white px-6 py-2 rounded-lg font-medium hover:bg-slate-700 transition flex items-center justify-center gap-2">
            {loading ? <Spinner className="w-4 h-4"/> : <Plus className="w-4 h-4" />} Tambah
          </button>
        </form>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 text-sm">
                <th className="py-3 px-4 font-medium">Username</th>
                <th className="py-3 px-4 font-medium">Role</th>
                <th className="py-3 px-4 font-medium text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {state.usersList.map((u, i) => (
                <tr key={i} className="border-b border-slate-100 hover:bg-slate-50 transition">
                  <td className="py-3 px-4 font-medium text-slate-800">{u.username}</td>
                  <td className="py-3 px-4">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                      {u.role.toUpperCase()}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    {u.role !== 'admin' && (
                       <button onClick={() => handleDeleteUser(u.username)} className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition">
                         <Trash2 className="w-4 h-4" />
                       </button>
                    )}
                  </td>
                </tr>
              ))}
              {state.usersList.length === 0 && (
                <tr><td colSpan="3" className="py-4 text-center text-slate-500">Memuat data pengguna...</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 6. MAIN APP WRAPPER (DASHBOARD)
// ==========================================
const Dashboard = () => {
  const { state, dispatch } = useContext(AppContext);
  const [activeTab, setActiveTab] = useState('upload');

  const handleLogout = () => {
    if(confirm('Yakin ingin keluar?')) dispatch({ type: 'LOGOUT' });
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50">
      {/* SIDEBAR */}
      <aside className="w-full md:w-64 bg-white border-r border-slate-200 flex flex-col">
        <div className="p-6 border-b border-slate-100 flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg"><HardDrive className="w-6 h-6 text-white" /></div>
          <div>
            <h1 className="font-bold text-slate-800 leading-tight">Doc Sistem</h1>
            <p className="text-xs text-slate-500 capitalize">Mode: {state.user.role}</p>
          </div>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          <button onClick={() => setActiveTab('upload')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition text-sm font-medium ${activeTab === 'upload' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}>
            <UploadCloud className="w-5 h-5" /> Unggah File
          </button>
          <button onClick={() => setActiveTab('gallery')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition text-sm font-medium ${activeTab === 'gallery' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}>
            <Folder className="w-5 h-5" /> Galeri Drive
          </button>
          {state.user.role === 'admin' && (
            <button onClick={() => setActiveTab('admin')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition text-sm font-medium ${activeTab === 'admin' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}>
              <Users className="w-5 h-5" /> Manajemen Akun
            </button>
          )}
        </nav>

        <div className="p-4 border-t border-slate-100">
          <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition">
            <LogOut className="w-4 h-4" /> Keluar
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 p-6 md:p-10 overflow-y-auto">
        {activeTab === 'upload' && <UploadView />}
        {activeTab === 'gallery' && <GalleryView />}
        {activeTab === 'admin' && <AdminView />}
      </main>
    </div>
  );
};

// ==========================================
// 7. ROOT RENDERER
// ==========================================
export default function App() {
  const [state, dispatch] = useReducer(appReducer, initialState);

  return (
    <ErrorBoundary>
      <AppContext.Provider value={{ state, dispatch }}>
        <Toast />
        {state.user ? <Dashboard /> : <LoginView />}
      </AppContext.Provider>
    </ErrorBoundary>
  );
}
