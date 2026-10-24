import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';

interface QrCodeProps {
  value: string;
  size?: number;
  fgColor?: string;
  bgColor?: string;
}

/**
 * Standard, ISO-compliant QR Code component powered by `qrcode`.
 * Generates high-contrast, camera-readable QR codes with proper quiet-zone margins (4 modules)
 * and High error correction ('H') for instant detection by phone camera scanners (iOS Camera, Google Lens).
 */
export const QrCodeSvg: React.FC<QrCodeProps> = ({
  value,
  size = 190,
  fgColor = '#000000',
  bgColor = '#ffffff',
}) => {
  const [dataUrl, setDataUrl] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, {
      width: Math.max(320, size * 2), // High pixel density for sharp monitor display
      margin: 4, // Critical ISO standard quiet zone for camera finder pattern detection
      errorCorrectionLevel: 'H', // 30% recovery to withstand monitor glare / angles
      color: {
        dark: fgColor,
        light: bgColor,
      },
    })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch((err) => {
        console.error('Failed to generate standard QR code:', err);
      });

    return () => {
      cancelled = true;
    };
  }, [value, size, fgColor, bgColor]);

  if (!dataUrl) {
    return (
      <div
        style={{
          width: size,
          height: size,
          background: bgColor,
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#64748b',
          fontSize: 12,
        }}
      >
        Loading QR...
      </div>
    );
  }

  return (
    <img
      src={dataUrl}
      alt="Scan to join game"
      width={size}
      height={size}
      style={{
        display: 'block',
        width: size,
        height: size,
        borderRadius: 4,
        imageRendering: 'pixelated',
      }}
    />
  );
};
