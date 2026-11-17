// Kamera orqali shtrix-kod o'qish (BarcodeDetector bor brauzerlarda)
import { openModal, toast } from './ui.js';

export function cameraScanSupported() {
  return 'BarcodeDetector' in window && Boolean(navigator.mediaDevices?.getUserMedia);
}

// onCode(kod) chaqiriladi; kamera modal yopilganda avtomatik to'xtaydi
export function openBarcodeScanner(onCode) {
  if (!cameraScanSupported()) {
    toast("Kamera skaneri bu brauzerda ishlamaydi. Shtrix-kodni qo'lda kiriting", 'warn');
    return;
  }
  let stream = null;
  let timer = null;
  let stopped = false;
  const stop = () => {
    stopped = true;
    clearInterval(timer);
    stream?.getTracks().forEach((t) => t.stop());
  };
  const { close, el } = openModal({
    title: 'Shtrix-kodni kameraga tuting',
    body: `<div class="scanner"><video playsinline muted></video><div class="frame"></div></div>
           <p class="small muted" style="margin-top:10px">Shtrix-kodni ramka ichiga keltiring. Avtomatik o'qiladi.</p>`,
    onClose: stop,
  });
  const video = el.querySelector('video');
  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
    .then(async (s) => {
      if (stopped) {
        s.getTracks().forEach((t) => t.stop());
        return;
      }
      stream = s;
      video.srcObject = s;
      await video.play();
      const detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128', 'upc_a', 'upc_e', 'qr_code'] });
      timer = setInterval(async () => {
        if (stopped) return;
        try {
          const codes = await detector.detect(video);
          if (codes.length && codes[0].rawValue) {
            const code = codes[0].rawValue;
            close();
            onCode(code);
          }
        } catch {
          // kadr hali tayyor emas
        }
      }, 350);
    })
    .catch(() => {
      toast('Kameraga ruxsat berilmadi', 'bad');
      close();
    });
}
