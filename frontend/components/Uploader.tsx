// src/components/Uploader.tsx
"use client";

import { useCallback, useState } from "react";

interface Props {
  label: string;
  accept?: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  files: File[];
}

export default function Uploader({ label, accept, multiple, onFiles, files }: Props) {
  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const dropped = Array.from(e.dataTransfer.files).filter((f) =>
        accept ? accept.split(",").some((ext) => f.name.endsWith(ext.trim())) : true
      );
      onFiles(multiple ? dropped : dropped.slice(0, 1));
    },
    [accept, multiple, onFiles]
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    onFiles(multiple ? selected : selected.slice(0, 1));
    e.target.value = "";
  };

  const removeFile = (name: string) =>
    onFiles(files.filter((f) => f.name !== name));

  return (
    <div className="uploader">
      <div
        className={`drop-zone ${dragging ? "drop-zone--active" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <input
          type="file"
          accept={accept}
          multiple={multiple}
          className="drop-zone-input"
          onChange={handleChange}
          id={`upload-${label}`}
        />
        <label htmlFor={`upload-${label}`} className="drop-zone-label">
          <span className="drop-zone-icon">📁</span>
          <span className="drop-zone-text">
            <strong>{label}</strong>
            <br />
            <small>Drag & drop or click — PDF / DOCX</small>
          </span>
        </label>
      </div>

      {files.length > 0 && (
        <ul className="file-list">
          {files.map((f) => (
            <li key={f.name} className="file-item">
              <span className="file-icon">📄</span>
              <span className="file-name">{f.name}</span>
              <span className="file-size">
                {(f.size / 1024).toFixed(0)} KB
              </span>
              <button
                className="file-remove"
                onClick={() => removeFile(f.name)}
                title="Remove"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
