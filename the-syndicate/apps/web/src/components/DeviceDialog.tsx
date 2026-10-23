import { useDialogFocus } from '@syndicate/ui';
import QRCode from 'qrcode';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { transferLink } from '../lib/session';

/**
 * Moves this seat to another phone or computer. The seat travels in the URL
 * fragment (after #), which browsers never send to any server; the receiving page
 * stores it and removes it from the address bar immediately.
 */
export function DeviceDialog({ roomCode, onClose }: { roomCode: string; onClose: () => void }) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const link = transferLink(roomCode);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!link) return;
    QRCode.toDataURL(link, { margin: 1, width: 220, color: { dark: '#0a0f1e', light: '#eceff7' } })
      .then(setQr)
      .catch(() => setQr(null));
  }, [link]);
  useDialogFocus(true, onClose, closeRef);
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="card modal anim-rise"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="font-display text-xl mb-2">
          Use on another device
        </h2>
        <p className="text-sm text-[var(--color-danger)] mb-3">
          Private: anyone who opens this link plays your seat and sees your secrets. Do not share
          it. It is not the invite link.
        </p>
        {qr && (
          <img
            src={qr}
            alt="QR code that opens your seat on another device"
            width={180}
            height={180}
            className="rounded-lg mx-auto mb-3"
          />
        )}
        <div className="flex gap-2">
          <button
            type="button"
            className="btn btn-secondary flex-1"
            disabled={!link}
            onClick={async () => {
              if (!link) return;
              try {
                await navigator.clipboard.writeText(link);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? 'Copied ✓' : 'Copy private link'}
          </button>
          <button ref={closeRef} type="button" className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="text-xs text-[var(--color-muted)] mt-3">
          Opening it elsewhere moves your seat there; this device then shows "opened somewhere
          else".
        </p>
      </div>
    </div>,
    document.body,
  );
}
