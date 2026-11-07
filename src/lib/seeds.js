// Data contoh per bahasa, sudah ditambang pada kesulitan 4. Nonce diperiksa oleh lib.test.js.
export const SEED_DIFFICULTY = 4

export const SEED_CHAINS = {
  en: [
    { number: 1, nonce: 10342, data: 'Club fund opened, balance $0' },
    { number: 2, nonce: 75261, data: 'Ayu paid dues $20' },
    { number: 3, nonce: 22137, data: 'Budi paid dues $20' },
    { number: 4, nonce: 3957, data: 'Bought a broom $15' },
    { number: 5, nonce: 9031, data: 'Citra paid dues $20' },
  ],
  id: [
    { number: 1, nonce: 101800, data: 'Kas RT dibuka, saldo awal Rp0' },
    { number: 2, nonce: 35342, data: 'Ayu bayar iuran Rp20.000' },
    { number: 3, nonce: 37078, data: 'Budi bayar iuran Rp20.000' },
    { number: 4, nonce: 110970, data: 'Beli sapu lidi Rp15.000' },
    { number: 5, nonce: 9317, data: 'Citra bayar iuran Rp20.000' },
  ],
  ja: [
    { number: 1, nonce: 304, data: '町内会費の口座を開設、残高0円' },
    { number: 2, nonce: 7637, data: 'アユが会費2,000円を支払い' },
    { number: 3, nonce: 94511, data: 'ブディが会費2,000円を支払い' },
    { number: 4, nonce: 16992, data: 'ほうきを購入、1,500円' },
    { number: 5, nonce: 28246, data: 'チトラが会費2,000円を支払い' },
  ],
}

export const FAKE_DATA = {
  en: ['Ayu paid dues $200', 'Budi paid dues $2,000', 'Bought a broom $150', 'Citra never paid', 'Club fund opened, balance $99,000'],
  id: ['Ayu bayar iuran Rp200.000', 'Budi bayar iuran Rp2.000.000', 'Beli sapu lidi Rp150.000', 'Citra tidak pernah bayar', 'Kas RT dibuka, saldo awal Rp99.000.000'],
  ja: ['アユが会費20,000円を支払い', 'ブディが会費200,000円を支払い', 'ほうきを購入、15,000円', 'チトラは一度も支払っていない', '町内会費の口座を開設、残高990万円'],
}

export const seedChain = (lang) => SEED_CHAINS[lang].map((block) => ({ ...block }))

/** Satu catatan contoh, dipakai sebagai isi awal Bab 1 dan Bab 2. */
export const sampleRecord = (lang) => SEED_CHAINS[lang][1].data

export const sameBlocks = (a, b) =>
  a.length === b.length && a.every((block, i) => block.number === b[i].number && block.nonce === b[i].nonce && block.data === b[i].data)
