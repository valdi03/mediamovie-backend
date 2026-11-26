# Panduan Deploy Backend MediaMovie Gratis di Hugging Face Spaces

1. Buat akun gratis di **https://huggingface.co** (tanpa kartu kredit).
2. Klik **New Space** (atau buka `https://huggingface.co/new-space`):
   - **Space name:** misalnya `mediamovie-api`
   - **License:** bebas (misalnya `mit`)
   - **Select the Space SDK:** pilih **Docker** (template *Blank*)
   - **Space hardware:** `CPU basic · 2 vCPU · 16 GB · FREE`
   - **Visibility:** boleh *Public* (atau *Private* jika hanya untuk sendiri, namun APK perlu akses publik ke URL Space; untuk pemakaian pribadi lebih mudah *Public* atau tambahkan token jika perlu).
3. Upload isi folder `backend/` ini ke Space tersebut:
   - Bisa lewat menu **Files → Add file → Upload files** (upload `Dockerfile`, `.dockerignore`, `package.json`, `package-lock.json`, `tsconfig.json`, dan folder `src/`), **atau** lewat `git push` ke repo Space.
4. Tunggu proses build Docker selesai (~2–4 menit) hingga status berubah menjadi **Running**.
5. Klik menu **⋮ (titik tiga) → Embed this Space** untuk melihat **Direct URL** Anda, misalnya:
   ```text
   https://username-mediamovie-api.hf.space
   ```
6. Buka aplikasi **MediaMovie** di HP → **Pengaturan** → masukkan URL tersebut → klik **Uji Koneksi** → **Simpan**.
