// Business responses adapted from the uploaded app.py (Nadia Hybrid Engine).
// Prices, addresses and operating hours are source-derived, not independently verified.
export const sessions = new Map();
const has=(t,terms)=>terms.some(x=>t.includes(x));
export function businessFAQ(input,jid){
 const t=input.toLowerCase().trim(),now=Date.now();
 const old=sessions.get(jid);
 const s=old&&now-old.at<45*60e3?old:{topic:null,at:now};
 s.at=now;sessions.set(jid,s);
 const topic=x=>{s.topic=x;};
 const city=has(t,['palangka','seth adji','pky'])?'pky':has(t,['balikpapan','lamaru','mulawarman','bpn'])?'bpn':'bjm';
 const branches={
 pky:'*Palangka Raya*: Toko Karya Perdana, Jl. Seth Adji No. 70 (samping H. Kadap).\nMaps: https://maps.app.goo.gl/5mXcbhgjDztzZLe27\nJam: 07.00–11.00 dan 14.00–16.00 WIB. WA: 0812-5090-197.',
 bpn:'*Balikpapan*: Jl. Mulawarman RT 03 No. 16, Lamaru, dekat Masjid Nurul Iman.\nMaps: https://maps.app.goo.gl/gHZk2yU1qHqu3x1M6\nJam: setiap hari 08.00–20.00 WITA. WA: 0878-7246-2520.',
 bjm:'*Banjarmasin*: Komplek The Green Rahayu 2 Blok A No. 15, Jl. Simpang Limau.\nMaps: https://maps.app.goo.gl/XpGwbcBdSgavG6XA9\nJam: Senin–Jumat 17.00–21.00 WITA; Sabtu–Minggu 08.00–21.00 WITA. WA: 0851-5513-3070.'};
 const gas=has(t,['gas','refill','canister','isi ulang','kaleng','tabung'])||s.topic==='gas';
 const coffee=has(t,['kopi','coffee','roastery','bit & bean','bit and bean','arabica','robusta','sangrai','espresso'])||s.topic==='kopi';
 const study=has(t,['skripsi','tesis','tugas akhir','bimbingan','noura studio','judul','sidang','sempro','turnitin'])||s.topic==='skripsi';
 if(has(t,['print','ngeprint','cetak']))return {reply:'Tarif cetak dokumen: hitam putih Rp400/lembar; warna Rp800/lembar. File dapat dikirim lewat WhatsApp atau email.',topic:'print'};
 if (has(t,['lokasi','alamat','maps','dimana','di mana','disamperin','samperin','ke toko','bisa datang']) && (gas||has(t,['banjarmasin','palangka','balikpapan']))) {topic('gas');return {reply:'Lokasi refill gas:\n'+branches[city],topic:'gas'};}
 if(gas){
  topic('gas');
  if(has(t,['buka','tutup','jam','operasional']))return {reply:'Jam operasional dan lokasi:\n'+branches[city],topic:'gas'};
  if(has(t,['harga','biaya','berapa','tarif']))return {reply:'Refill gas portable/canister Rp12.000 per botol (bawa kaleng sendiri). Kaleng baru Rp20.000 di Palangka Raya. Untuk ketersediaan, silakan konfirmasi terlebih dahulu.',topic:'gas'};
  return {reply:'Kami melayani refill gas portable/canister di Banjarmasin, Palangka Raya, dan Balikpapan. Tarif refill Rp12.000/botol (bawa kaleng sendiri). Kakak ingin lokasi, jam buka, atau informasi harga?',topic:'gas'};
 }
 if(coffee){
  topic('kopi');
  if(has(t,['biji','sangrai','beans','roast','bubuk','giling','arabica','robusta']))
   return {reply:'*Bit & Bean – Fresh Roast Beans*\nArabica Specialty Rp75.000/200g\nFine Robusta Rp50.000/200g\nHouse Blend Rp60.000/200g\nTersedia biji utuh atau digiling. Kakak ingin yang mana?',topic:'kopi'};
  if(has(t,['menu','harga','pesan','cup','botol','aren','americano','manual brew','siap minum','kopi susu']))
   return {reply:'*Bit & Bean – Kopi siap minum*\nKopi susu aren cup Rp15.000\nKopi susu aren botol 250 ml Rp18.000\nKopi botol 1 liter Rp65.000\nManual brew/Americano Rp15.000\nHarga mengikuti data app.py; konfirmasi stok dan harga terbaru ke admin. Ingin pesan apa dan berapa?',topic:'kopi'};
  return {reply:'Selamat datang di *Bit & Bean Coffee*! Kami menyediakan kopi siap minum dan biji kopi sangrai. Kakak mau menu minuman atau biji kopi?',topic:'kopi'};
 }
 if(study){
  topic('skripsi');
  if(has(t,['machine learning','deep learning','data science','prediksi','klasifikasi','cnn','svm','nlp','tensorflow','pytorch']))
   return {reply:'*Noura Studio* membantu konsultasi riset AI/ML: pemilihan topik, dataset, preprocessing, pemodelan Python, evaluasi, penulisan laporan, dan persiapan sidang. Sudah punya judul atau dataset?',topic:'skripsi'};
  if(has(t,['web','laravel','flutter','android','iot','aplikasi','database','sistem informasi','react']))
   return {reply:'*Noura Studio* menyediakan pendampingan aplikasi Web/Mobile/IoT: analisis kebutuhan, UML/ERD, coding, dokumentasi, serta persiapan sidang. Apakah judulnya sudah disetujui?',topic:'skripsi'};
  return {reply:'*Noura Studio* melayani bimbingan edukatif skripsi IT: konsultasi judul, Bab 1–5, coding Web/Mobile/AI dan latihan sidang. Bukan jasa joki. Kakak dari jurusan apa dan sudah punya topik?',topic:'skripsi'};
 }
 if(has(t,['halo','hai','assalamualaikum','selamat pagi','selamat siang'])||has(t,['layanan','usaha','bantuan']))
   return {reply:'Halo kak! Saya Nadia, CS untuk:\n1. Refill Gas Portable & Canister\n2. Noura Studio – Bimbingan Skripsi IT\n3. Bit & Bean Coffee\nAda yang ingin kakak tanyakan?',topic:null};
 return null;
}
export const systemPrompt=`Kamu Nadia, customer service berbahasa Indonesia yang hangat, singkat dan profesional. Melayani tiga unit usaha: Refill Gas Portable & Canister (Banjarmasin, Palangka Raya, Balikpapan); Noura Studio (pendampingan edukatif skripsi IT, bukan joki); Bit & Bean Coffee dan Roastery. Jangan mengarang harga, jadwal, stok, alamat, bukti pembayaran, atau kepastian pesanan. Jika informasi tidak ada, minta konfirmasi admin. Jangan mengaku dapat memverifikasi transfer/QRIS atau menyelesaikan transaksi secara otomatis. Jangan meminta kata sandi, kode OTP, atau PIN.`;
