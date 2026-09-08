import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera } from 'lucide-react';
import { Modal } from './Dialog';
import { Icon } from './Icon';
import { JOIN_OFFLINE_ERROR, parseJoinPayload, resolveJoin } from '../lib/joinPeriod';
import { useUiStore } from '../store/ui';

export function JoinPeriodModal() {
  const navigate = useNavigate();
  const sheet = useUiStore((s) => s.sheet);
  const closeSheet = useUiStore((s) => s.closeSheet);
  const setToast = useUiStore((s) => s.setToast);
  const online = useUiStore((s) => s.online);
  const [joinId, setJoinId] = useState('');
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const open = sheet === 'join';

  const stopScan = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  };

  useEffect(() => {
    if (!open) {
      stopScan();
      setJoinId('');
    }
  }, [open]);

  useEffect(() => {
    if (!online) stopScan();
  }, [online]);

  useEffect(() => {
    if (!scanning) return;
    let cancelled = false;
    const video = videoRef.current;
    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (video) {
          video.srcObject = stream;
          await video.play();
        }
        const Detector = window.BarcodeDetector;
        if (!Detector || !video) {
          setToast('اسکن QR در این مرورگر پشتیبانی نمی‌شود. شناسه را دستی وارد کنید.', 'warn');
          setScanning(false);
          return;
        }
        const detector = new Detector({ formats: ['qr_code'] });
        const tick = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const raw = codes[0]?.rawValue;
            if (raw) {
              await submit(raw);
              return;
            }
          } catch {
            /* keep scanning */
          }
          requestAnimationFrame(() => void tick());
        };
        requestAnimationFrame(() => void tick());
      } catch {
        if (!cancelled) setToast('دسترسی به دوربین ممکن نشد.', 'error');
        setScanning(false);
      }
    })();
    return () => {
      cancelled = true;
      stopScan();
    };
  }, [scanning]);

  const submit = async (raw: string) => {
    if (!online) {
      setToast(JOIN_OFFLINE_ERROR, 'error');
      return;
    }
    const target = parseJoinPayload(raw);
    if (!target) {
      setToast('شناسه یا لینک معتبر نیست', 'error');
      return;
    }
    const res = await resolveJoin(target);
    if ('error' in res) {
      setToast(res.error, 'error');
      return;
    }
    stopScan();
    closeSheet();
    navigate(res.path);
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        stopScan();
        closeSheet();
      }}
      title="ورود به دوره"
    >
      <p className="text-sm text-ink-700/80">
        {online ? 'شناسه دوره را وارد کنید یا QR دعوت را اسکن کنید.' : JOIN_OFFLINE_ERROR}
      </p>
      <label className="label mt-4" htmlFor="join-period">
        ورود با شناسه
      </label>
      <div className="flex gap-2">
        <input
          id="join-period"
          className="input flex-1"
          placeholder="X1x-2Xx"
          dir="ltr"
          value={joinId}
          onChange={(e) => setJoinId(e.target.value)}
          disabled={!online}
        />
        <button
          type="button"
          className="btn-primary shrink-0"
          disabled={!online}
          onClick={() => void submit(joinId)}
        >
          ورود
        </button>
      </div>
      {scanning ? (
        <div className="mt-4 overflow-hidden rounded-2xl bg-ink-900">
          <video ref={videoRef} className="aspect-square w-full object-cover" playsInline muted />
        </div>
      ) : (
        <button
          type="button"
          className="btn-ghost mt-4 inline-flex w-full items-center justify-center gap-2"
          disabled={!online}
          onClick={() => setScanning(true)}
        >
          <Icon icon={Camera} size={18} />
          اسکن QR با دوربین
        </button>
      )}
    </Modal>
  );
}
