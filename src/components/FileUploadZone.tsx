import React, { useState, useRef } from 'react';
import {
  Upload,
  X,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface BatchStatus {
  batch_id: string;
  batch_status: string;
  total_files: number;
  files_success: number;
  files_failed: number;
  files_processing: number;
  files_pending: number;
  progress_percent: number;
}

interface BatchSummary {
  run_id: string;
  ui_json: Record<string, any>;
  total_files: number;
  success_files: number;
  failed_files: number;
  status: string;
}

interface BatchFile {
  doc_id: string;
  filename: string;
  file_type?: string | null;
  status: string;
  extracted_json?: Record<string, any> | null;
  error?: string | null;
  error_type?: string | null;
  processing_duration_ms?: number | null;
}

interface UploadingFile {
  file: File;
  progress: number;
  status: 'uploading' | 'completed' | 'error';
  error?: string;
}

interface FileUploadZoneProps {
  onTenderCreated: (payload: { batchId: string; summary: BatchSummary; files?: BatchFile[] }) => void;
  onProcessingChange?: (status: boolean) => void;
}

export const FileUploadZone: React.FC<FileUploadZoneProps> = ({ onTenderCreated, onProcessingChange }) => {
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [batchStatus, setBatchStatus] = useState<BatchStatus | null>(null);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchBatchStatus = async (batchId: string): Promise<BatchStatus> => {
    const res = await fetch(`${API_BASE_URL}/api/batches/${batchId}/status`);
    if (!res.ok) {
      throw new Error('Failed to fetch batch status');
    }
    return res.json();
  };

  const fetchBatchSummary = async (batchId: string): Promise<BatchSummary> => {
    const res = await fetch(`${API_BASE_URL}/api/batches/${batchId}/summary`);
    if (!res.ok) {
      throw new Error('Failed to fetch batch summary');
    }
    return res.json();
  };

  const fetchBatchFiles = async (batchId: string): Promise<BatchFile[]> => {
    const res = await fetch(`${API_BASE_URL}/api/batches/${batchId}/files`);
    if (!res.ok) {
      throw new Error('Failed to fetch batch files');
    }
    const data = await res.json();
    return data?.files || [];
  };

  const triggerProcessing = async (batchId: string) => {
    const res = await fetch(`${API_BASE_URL}/api/batches/${batchId}/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      throw new Error('Failed to start processing');
    }
  };

  const waitForSummary = async (batchId: string): Promise<BatchSummary> => {
    let attempts = 0;
    while (attempts < 5) {
      try {
        return await fetchBatchSummary(batchId);
      } catch {
        attempts += 1;
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }
    throw new Error('Summary not ready');
  };

  const handleFileSelect = async (files: FileList | null) => {
    if (!files) return;

    const validFiles = Array.from(files).filter(
      f =>

        /\.zip$/i.test(f.name)
    );

    if (validFiles.length === 0) {
      setError('Only .zip files are supported.');
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
    onProcessingChange?.(true);
    let processingStarted = false;

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

        const data = await res.json().catch(() => ({}));
        if (!data?.batch_id) {
          throw new Error('Upload response missing batch_id');
        }

        const batchId = data.batch_id as string;
        setActiveBatchId(batchId);
        await triggerProcessing(batchId);
        processingStarted = true;

        const pollInterval = setInterval(async () => {
          try {
            const status = await fetchBatchStatus(batchId);
            setBatchStatus(status);
            const normalized = status.batch_status?.toLowerCase();
            if (normalized === 'completed' || normalized === 'completed_with_errors' || normalized === 'failed') {
              clearInterval(pollInterval);
              onProcessingChange?.(false);
              if (normalized === 'completed' || normalized === 'completed_with_errors') {
                const summary = await waitForSummary(batchId);
                let files: BatchFile[] = [];
                try {
                  files = await fetchBatchFiles(batchId);
                } catch (fetchErr) {
                  console.error('Failed to load batch files:', fetchErr);
                }
                onTenderCreated({ batchId, summary, files });
              }
            }
          } catch (pollError) {
            clearInterval(pollInterval);
            setError('Failed to track processing status.');
            onProcessingChange?.(false);
          }
        }, 3000);

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
    if (!processingStarted) {
      onProcessingChange?.(false);
    }
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

      {batchStatus && (
        <div className="border rounded-lg bg-white p-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">File extraction is in process</span>
            <span className="text-zinc-600">{batchStatus.batch_status}</span>
          </div>
          <Progress value={Number(batchStatus.progress_percent || 0)} />
          <div className="text-xs text-zinc-600">
            {Number(batchStatus.files_success || 0) + Number(batchStatus.files_failed || 0)} / {batchStatus.total_files} Dateien abgeschlossen
          </div>
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
        className={`border-2 border-dashed rounded-xl p-8 text-center ${isDragging ? 'bg-gray-50 border-gray-900' : 'border-gray-300'
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
          accept=".zip"
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
