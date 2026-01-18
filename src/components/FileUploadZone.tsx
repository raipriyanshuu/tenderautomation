import React, { useState, useRef } from 'react';
import {
  Upload,
  X,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_URL;

interface UploadingFile {
  file: File;
  progress: number;
  status: 'uploading' | 'completed' | 'error';
  error?: string;
}

interface FileUploadZoneProps {
  onTenderCreated: (tenderId: string) => void;
}

export const FileUploadZone: React.FC<FileUploadZoneProps> = () => {
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (files: FileList | null) => {
    if (!files) return;

    const validFiles = Array.from(files).filter(
      f =>
        f.size <= 10 * 1024 * 1024 &&
        /\.(pdf|docx?|xlsx?)$/i.test(f.name)
    );

    if (validFiles.length === 0) {
      setError('Only PDF, Word, Excel files up to 10MB are allowed.');
      return;
    }

    const newFiles: UploadingFile[] = validFiles.map(file => ({
      file,
      progress: 0,
      status: 'uploading',
    }));

    setUploadingFiles(prev => [...prev, ...newFiles]);
    uploadFiles(validFiles);
  };

  const uploadFiles = async (files: File[]) => {
    setIsUploading(true);
    setError(null);

    for (const file of files) {
      try {
        const formData = new FormData();
        formData.append('file', file);

        setUploadingFiles(prev =>
          prev.map(f =>
            f.file.name === file.name
              ? { ...f, progress: 40 }
              : f
          )
        );

        const res = await fetch(`${API_BASE_URL}/upload-tender`, {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          throw new Error('Upload failed');
        }

        setUploadingFiles(prev =>
          prev.map(f =>
            f.file.name === file.name
              ? { ...f, progress: 100, status: 'completed' }
              : f
          )
        );
      } catch (err) {
        setUploadingFiles(prev =>
          prev.map(f =>
            f.file.name === file.name
              ? {
                  ...f,
                  status: 'error',
                  error: 'Upload failed',
                  progress: 100,
                }
              : f
          )
        );
      }
    }

    setIsUploading(false);
  };

  const removeFile = (name: string) => {
    setUploadingFiles(prev => prev.filter(f => f.file.name !== name));
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex gap-2">
          <AlertCircle className="text-red-600" />
          <span className="text-sm text-red-700">{error}</span>
        </div>
      )}

      <div
        onDragOver={e => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={e => {
          e.preventDefault();
          setIsDragging(false);
          handleFileSelect(e.dataTransfer.files);
        }}
        className={`border-2 border-dashed rounded-xl p-8 text-center ${
          isDragging ? 'bg-gray-50 border-gray-900' : 'border-gray-300'
        }`}
      >
        <Upload className="mx-auto h-10 w-10 text-gray-400 mb-2" />
        <p className="text-gray-600 mb-2">
          Drag files here or click to upload
        </p>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="px-4 py-2 bg-gray-100 rounded-lg text-sm"
        >
          Select files
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.xls,.xlsx"
          className="hidden"
          onChange={e => handleFileSelect(e.target.files)}
        />
      </div>

      {uploadingFiles.length > 0 && (
        <div className="border rounded-lg bg-white">
          {uploadingFiles.map(f => (
            <div
              key={f.file.name}
              className="flex items-center justify-between p-3 border-b"
            >
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                <span className="text-sm">{f.file.name}</span>
              </div>

              <div className="flex items-center gap-2">
                {f.status === 'uploading' && (
                  <Loader2 className="animate-spin h-4 w-4" />
                )}
                {f.status === 'completed' && (
                  <CheckCircle2 className="text-green-600 h-4 w-4" />
                )}
                {f.status === 'error' && (
                  <AlertCircle className="text-red-600 h-4 w-4" />
                )}
                {!isUploading && (
                  <button onClick={() => removeFile(f.file.name)}>
                    <X className="h-4 w-4 text-gray-400" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
