# V2 PT KMB - Mechanic Activity Report & Incentive System

Sistem Aplikasi berbasis Google Apps Script untuk pencatatan aktivitas mekanik, pelacakan Work Order (WO), perhitungan poin insentif mekanik, dan alur persetujuan (approval workflow) bertingkat di PT KMB.

Proyek ini terintegrasi langsung dengan Google Sheets sebagai basis data dan didesain untuk dijalankan sebagai Google Apps Script Web App.

---

## 🚀 Fitur Utama

- **Web App Router & Request Handler**: Routing halaman yang dinamis untuk dashboard, form pembuatan WO, halaman mekanik, persetujuan, dan laporan analytics.
- **Workflow B (Alur Kerja Aktif)**:
  `pending_mechanic_work` ➔ `in_progress` ➔ `pending_supervisor` ➔ `pending_superintendent` ➔ `approved`/`rejected`
- **Dashboard & Analytics**: Halaman Dashboard utama dan Mechanic Dashboard (Fase 3) untuk memantau performa, waktu pengerjaan (MTTR/MTBF), dan perolehan poin insentif.
- **Multi-Level Approval**: Sistem persetujuan berjenjang mulai dari Supervisor hingga Superintendent dengan fitur override audit.
- **Sistem Poin & Skoring**: Perhitungan poin otomatis berdasarkan jenis pekerjaan, tipe unit, komponen, faktor pengali kesulitan, serta pembagian poin tim (WorkOrderTeam).
- **Audit Logging**: Pencatatan riwayat perubahan status WO dan tindakan pengguna untuk transparansi data.

---

## 📁 Struktur Folder & File

Berikut penjelasan singkat mengenai berkas-berkas dalam proyek ini:

### ⚙️ Konfigurasi & Inisialisasi
*   [`appsscript.json`](file:///c:/New%20folder/V2%20PT%20KMB_Mechanic%20Activity%20Report/appsscript.json): Manifest Google Apps Script (konfigurasi zona waktu `Asia/Jakarta`, hak akses Web App, runtime V8).
*   [`Constants.js`](file:///c:/New%20folder/V2%20PT%20KMB_Mechanic%20Activity%20Report/Constants.js): Berisi definisi nama sheet, status enum, role, kode error, dan konfigurasi sistem (Single Source of Truth).
*   [`setupSpreadsheet_v3.js`](file:///c:/New%20folder/V2%20PT%20KMB_Mechanic%20Activity%20Report/setupSpreadsheet_v3.js): Script inisialisasi awal (idempotent) untuk membuat struktur spreadsheet beserta kolom-kolomnya dan melakukan seeding data awal.
*   [`.clasp.json`](file:///c:/New%20folder/V2%20PT%20KMB_Mechanic%20Activity%20Report/.clasp.json): Konfigurasi clasp untuk sinkronisasi lokal dengan Google Drive.

### 🌐 Routing & Web Entry Points
*   [`Router.js`](file:///c:/New%20folder/V2%20PT%20KMB_Mechanic%20Activity%20Report/Router.js): Mengatur fungsi `doGet(e)` dan `doPost(e)` untuk rendering halaman HTML serta melayani endpoint JSON API.
*   [`Auth.js`](file:///c:/New%20folder/V2%20PT%20KMB_Mechanic%20Activity%20Report/Auth.js): Modul autentikasi pengguna dan pengecekan role berdasarkan email Google yang aktif.

### 💼 Layanan & Logika Bisnis (Services)
*   [`WorkOrderService.js`](file:///c:/New%20folder/V2%20PT%20KMB_Mechanic%20Activity%20Report/WorkOrderService.js): CRUD operasi Work Order (pembuatan, pembaruan status, validasi pengerjaan).
*   [`ApprovalService.js`](file:///c:/New%20folder/V2%20PT%20KMB_Mechanic%20Activity%20Report/ApprovalService.js): Manajemen alur persetujuan bertingkat.
*   [`MechanicService.js`](file:///c:/New%20folder/V2%20PT%20KMB_Mechanic%20Activity%20Report/MechanicService.js): Logika untuk Dashboard Mekanik, daftar tugas individu, serta input pengerjaan mekanik.
*   [`ScoringService.js`](file:///c:/New%20folder/V2%20PT%20KMB_Mechanic%20Activity%20Report/ScoringService.js): Penghitungan skor/poin insentif berdasarkan data pekerjaan.
*   [`PointsCalculation.js`](file:///c:/New%20folder/V2%20PT%20KMB_Mechanic%20Activity%20Report/PointsCalculation.js): Helper fungsi kalkulasi poin insentif tim dan individu.
*   [`OthersJobService.js`](file:///c:/New%20folder/V2%20PT%20KMB_Mechanic%20Activity%20Report/OthersJobService.js): Pengelolaan pekerjaan non-WO (pekerjaan lainnya).
*   [`PayrollService.js`](file:///c:/New%20folder/V2%20PT%20KMB_Mechanic%20Activity%20Report/PayrollService.js): Logika rekapitulasi poin insentif untuk kebutuhan penggajian bulanan.
*   [`DashboardService.js`](file:///c:/New%20folder/V2%20PT%20KMB_Mechanic%20Activity%20Report/DashboardService.js): Penarikan metrik ringkasan performa untuk Dashboard utama.
*   [`MtbfService.js`](file:///c:/New%20folder/V2%20PT%20KMB_Mechanic%20Activity%20Report/MtbfService.js): Menghitung MTBF (Mean Time Between Failures) untuk unit dan komponen terkait.
*   [`ArchiveService.js`](file:///c:/New%20folder/V2%20PT%20KMB_Mechanic%20Activity%20Report/ArchiveService.js): Pengarsipan data WO lama untuk mengoptimalkan performa Sheet.
*   [`BackupService.js`](file:///c:/New%20folder/V2%20PT%20KMB_Mechanic%20Activity%20Report/BackupService.js): Backup otomatis database Google Sheets.

### 🗄️ Database & Utilities
*   [`Sheets.js`](file:///c:/New%20folder/V2%20PT%20KMB_Mechanic%20Activity%20Report/Sheets.js): Wrapper fungsional untuk membaca, menulis, dan memperbarui baris data di Google Sheets dengan performa optimal.
*   [`Utils.js`](file:///c:/New%20folder/V2%20PT%20KMB_Mechanic%20Activity%20Report/Utils.js): Helper format tanggal, string, array, dan utilitas umum lainnya.
*   [`Logger.js`](file:///c:/New%20folder/V2%20PT%20KMB_Mechanic%20Activity%20Report/Logger.js): Sistem pencatatan log tersentralisasi ke Google Sheets `AuditLogs` dan Logger bawaan.

### 🖥️ Antarmuka Pengguna (HTML Templates)
*   [`Main.html`](file:///c:/New%20folder/V2%20PT%20KMB_Mechanic%20Activity%20Report/Main.html): Container layout utama Web App.
*   [`Styles.html`](file:///c:/New%20folder/V2%20PT%20KMB_Mechanic%20Activity%20Report/Styles.html): Styling CSS global aplikasi dengan tampilan modern.
*   [`UIHelpers.js`](file:///c:/New%20folder/V2%20PT%20KMB_Mechanic%20Activity%20Report/UIHelpers.js): Script pendukung interaksi UI di sisi klien (frontend).
*   [`WorkOrder.html`](file:///c:/New%20folder/V2%20PT%20KMB_Mechanic%20Activity%20Report/WorkOrder.html): Form interaktif pembuatan dan pengelolaan Work Order.
*   [`MechanicDashboard.html`](file:///c:/New%20folder/V2%20PT%20KMB_Mechanic%20Activity%20Report/MechanicDashboard.html): Dashboard khusus untuk mekanik (mulai kerja, selesai kerja, laporan kendala).
*   [`Approval.html`](file:///c:/New%20folder/V2%20PT%20KMB_Mechanic%20Activity%20Report/Approval.html): Antarmuka persetujuan WO bagi Supervisor & Superintendent.
*   [`Reports.html`](file:///c:/New%20folder/V2%20PT%20KMB_Mechanic%20Activity%20Report/Reports.html): UI visualisasi laporan performa dan poin insentif.

---

## 📊 Skema Database (Google Sheets)

Database menggunakan Spreadsheet aktif yang dibagi menjadi 13 sheet utama:

### ⚙️ Sheet Konfigurasi (Config)
1.  **`Config_BaseSettings`**: Menyimpan pengaturan dasar parameter global sistem.
2.  **`Config_Components`**: Daftar komponen alat berat.
3.  **`Config_Units`**: Daftar unit alat berat beserta tipenya.
4.  **`Config_Mechanics`**: Data mekanik, jabatan (Grade), dan status aktif.
5.  **`Config_Factors`**: Faktor pengali kesulitan pekerjaan, tipe hari, dll.
6.  **`Config_Jobs_Field`**: Standar waktu kerja & poin dasar untuk pekerjaan lapangan (Field).
7.  **`Config_Jobs_Workshop`**: Standar waktu kerja & poin dasar untuk pekerjaan Workshop.

### 📝 Sheet Transaksi
8.  **`WorkOrders`**: Data utama Work Order (nomor WO, unit, komponen, status, waktu mulai/selesai).
9.  **`WorkOrderTeam`**: Relasi mekanik yang bertugas pada setiap Work Order beserta porsi pembagian tugasnya.
10. **`Approvals`**: Riwayat persetujuan WO dari Supervisor & Superintendent.
11. **`ScoringSnapshots`**: Snapshot detail kalkulasi poin saat WO disetujui.
12. **`MechanicPoints`**: Poin akhir yang berhasil diperoleh oleh masing-masing mekanik.
13. **`OthersJobRequests`**: Pencatatan pekerjaan non-WO (misal: general helper, standby, dll).
14. **`AuditLogs`**: Log aktivitas transaksi dan perubahan status data.
15. **`MtbfTracking`**: Riwayat tracking unit & komponen untuk pembobotan pengali waktu MTBF.

---

## 🛠️ Pengembangan Lokal

Proyek ini dikembangkan secara lokal dan disinkronkan ke Google Apps Script menggunakan `clasp` (Chrome V8 Apps Script Project tool).

### Cara Sinkronisasi Berkas

1.  **Unduh Perubahan dari Google Apps Script**:
    ```bash
    clasp pull
    ```
2.  **Kirim Perubahan Lokal ke Google Apps Script**:
    ```bash
    clasp push
    ```
3.  **Buka Editor Google Apps Script di Browser**:
    ```bash
    clasp open
    ```