import { useState, useRef } from 'react';

export default function DatabaseTools() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<{type:'success'|'error', message:string}|null>(null);
  const toastTimeout = useRef<ReturnType<typeof setTimeout>|null>(null);
  const confirmRef = useRef<HTMLDialogElement>(null);

  const showToast = (type:'success'|'error', message:string) => {
    setToast({type, message});
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    toastTimeout.current = setTimeout(() => setToast(null), 3000);
  };

  const doUpload = async () => {
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('http://localhost:5000/api/import', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Upload failed');
      }
      showToast('success', 'Import completed');
      setTimeout(() => window.location.reload(), 500);
    } catch (e:any) {
      showToast('error', e.message);
    } finally {
      setUploading(false);
    }
  };

  const confirmUpload = () => confirmRef.current?.showModal();
  const handleConfirm = () => { confirmRef.current?.close(); doUpload(); };
  const handleCancel = () => { confirmRef.current?.close(); };

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Database Tools</h1>
      <div className="flex items-center gap-2">
        <input
          type="file"
          accept=".csv,.json,.zip"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="file-input file-input-bordered"
        />
        <button
          className="btn btn-primary"
          disabled={!file || uploading}
          onClick={confirmUpload}
        >
          {uploading && <span className="loading loading-spinner"></span>}
          {!uploading && 'Upload & Replace'}
        </button>
      </div>

      <dialog ref={confirmRef} className="modal">
        <form method="dialog" className="modal-box">
          <h3 className="font-bold text-lg">Confirm Import</h3>
          <p className="py-4">This will erase current data. Continue?</p>
          <div className="modal-action">
            <button type="button" className="btn btn-error" onClick={handleConfirm}>Import</button>
            <button type="button" className="btn" onClick={handleCancel}>Cancel</button>
          </div>
        </form>
      </dialog>

      {toast && (
        <div className="toast toast-top toast-end z-50 fixed right-4 top-4">
          <div className={`alert ${toast.type === 'success' ? 'alert-success' : 'alert-error'} shadow-lg`}>
            <span>{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}
