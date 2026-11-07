# The Ledger (Buku Besar, 台帳)

Demo blockchain interaktif yang berjalan sepenuhnya di peramban, tersedia dalam bahasa Inggris (bawaan), Indonesia, dan Jepang. Terinspirasi dari [demo Blockchain Anders Brownworth](https://andersbrownworth.com/blockchain/), tetapi ditulis ulang dari nol dengan lebih banyak hal yang bisa dicoba dan dirusak.

**Coba langsung:** https://riizuki.github.io/blockchain-demo/

## Menjalankan

```bash
npm install
npm run dev
```

Perintah lain:

```bash
npm run build    # hasil ada di dist/, jalurnya relatif jadi bisa dibuka dari subfolder
npm run preview  # melihat hasil build
npm test         # menguji aturan rantai, transaksi, simulasi, dan kamus bahasa
```

Setiap push ke `main` menjalankan tes, membangun ulang, lalu memperbarui GitHub Pages lewat `.github/workflows/deploy.yml`.

## Isi

| Bab | Yang bisa dicoba |
| --- | --- |
| 1. Hash | SHA-256 langsung saat mengetik, kisi 256 bit yang menunjukkan efek longsoran, tantangan mencari hash berawalan nol, sidik jari berkas |
| 2. Blok | Memutar nonce dengan tangan, menambang di Web Worker, kesulitan 1 sampai 6, jumlah pekerja, tangga kelangkaan, catatan penambangan |
| 3. Rantai | Kerusakan yang menjalar blok demi blok, sorotan tautan hash, biaya pemalsuan, tambah dan hapus blok |
| 4. Jaringan | 3 sampai 6 peer dengan salinan masing-masing, warna sidik jari hash, gosip antar peer dengan aturan tolak dan terima, memutus jalur untuk membelah jaringan |
| 5. Kunci | Kunci secp256k1 sungguhan, tanda tangan, verifikasi langsung, tombol pemalsuan |
| 6. Transaksi | Saldo dihitung dari rantai, hadiah penambang, mempool, saldo kurang, tanda tangan palsu, pemutaran ulang, penambang curang |
| 7. Lab | Lima penambang berlomba, fork dan reorg, daya hash, latensi, serangan double spend oleh Si Kancil |

Setiap bab punya misi. Progresnya tersimpan di `localStorage`.

## Bahasa

Tombol EN / ID / 日本語 ada di kanan atas, dan pilihannya tersimpan di `localStorage`. Semua teks ada di `src/i18n/`, satu berkas per bahasa, dengan English sebagai bawaan dan cadangan. `npm test` memastikan ketiga kamus punya kunci dan parameter yang sama, dan semua kunci yang dipakai kode memang ada.

Data contoh di blok juga diterjemahkan dan ditambang per bahasa (`src/lib/seeds.js`). Data contoh ikut berganti saat bahasa diganti, tetapi data yang sudah kamu ubah tidak disentuh.

## Yang sungguhan dan yang disimulasikan

- Bab 1 sampai 6 memakai kriptografi sungguhan: SHA-256 dan secp256k1 dari pustaka [noble](https://paulmillr.com/noble/).
- Bab 7 mengundi waktu penemuan blok sesuai daya hash supaya ribuan blok bisa dilihat dalam beberapa menit. Rumus peluang serangannya diuji dengan Monte Carlo di `src/lib/lib.test.js`.
- Kunci dompet di Bab 6 diturunkan dari nama orangnya supaya demo stabil. Jangan pernah memakai cara ini untuk uang sungguhan.

## Struktur

```
src/i18n/       kamus English, Indonesia, dan Jepang
src/lib/        aturan murni: hash, rantai, transaksi, simulasi, pekerja penambang
src/components/ stempel, kartu blok, kisi bit, panel penambangan
src/pages/      satu berkas untuk tiap bab
src/styles/     seluruh tampilan, termasuk mode gelap
```
