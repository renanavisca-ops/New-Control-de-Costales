
import React, { useState, useEffect, useRef } from 'react';

interface ScannerProps {
  onScan: (code: string) => void;
  placeholder?: string;
}

const Scanner: React.FC<ScannerProps> = ({ onScan, placeholder = "Escanea código..." }) => {
  const [manualCode, setManualCode] = useState('');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCode.trim()) {
      onScan(manualCode.trim());
      setManualCode('');
      // Mantener el foco para escaneo rápido manual
      inputRef.current?.focus();
    }
  };

  const startCamera = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsCameraActive(true);
      }

      // Check for BarcodeDetector support (Chrome/Android)
      if ('BarcodeDetector' in window) {
        const barcodeDetector = new (window as any).BarcodeDetector({ formats: ['code_128', 'ean_13', 'qr_code'] });
        
        const detect = async () => {
          if (!videoRef.current || videoRef.current.paused) return;
          try {
            const barcodes = await barcodeDetector.detect(videoRef.current);
            if (barcodes.length > 0) {
              onScan(barcodes[0].rawValue);
              // Vibrate feedback if available
              if (navigator.vibrate) navigator.vibrate(100);
              // Wait a bit before next scan to prevent rapid-fire same code
              await new Promise(r => setTimeout(r, 1500));
            }
          } catch (e) {
            console.error(e);
          }
          requestAnimationFrame(detect);
        };
        detect();
      } else {
        setError("Escáner nativo no disponible en este navegador. Use entrada manual.");
      }
    } catch (err) {
      setError("Permiso de cámara denegado.");
      console.error(err);
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  };

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-col gap-2">
        <form onSubmit={handleManualSubmit} className="relative flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            placeholder={placeholder}
            className="flex-1 p-3 border-2 border-indigo-500 rounded-lg text-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
            autoFocus
          />
          <button 
            type="submit"
            className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-indigo-700 active:scale-95 transition-all"
          >
            OK
          </button>
        </form>
        
        <button
          onClick={() => isCameraActive ? stopCamera() : startCamera()}
          className={`flex items-center justify-center gap-2 p-3 rounded-lg font-semibold transition-colors ${
            isCameraActive ? 'bg-red-100 text-red-600' : 'bg-indigo-100 text-indigo-700'
          }`}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          {isCameraActive ? 'Cerrar Cámara' : 'Usar Cámara'}
        </button>
      </div>

      {isCameraActive && (
        <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden shadow-inner">
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          <div className="absolute inset-0 border-2 border-indigo-400 border-dashed m-12 opacity-50 pointer-events-none"></div>
        </div>
      )}

      {error && <p className="text-xs text-red-500 italic">{error}</p>}
    </div>
  );
};

export default Scanner;
