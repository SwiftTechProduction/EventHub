/** Memformat semua nominal aplikasi sebagai Rupiah sesuai ketentuan produk. */
export const formatRupiah = (amount: number): string => new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
}).format(amount);
