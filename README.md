# Web quản trị nội bộ

Giao việc – xác nhận – trao đổi, báo cáo cuối ngày, thống kê hiệu quả cho phòng **Sale** và **Vận đơn**.
Frontend React (Vite) chạy trên **GitHub Pages**, dữ liệu và đăng nhập trên **Supabase**.
Hệ thống **không lưu thông tin khách hàng**.

## Cấu trúc

| Thư mục | Nội dung |
| --- | --- |
| `src/pages` | Các màn hình: Trang chủ, Việc, Nộp báo cáo, Danh sách báo cáo, Hiệu quả của tôi, Dashboard phòng, Thông báo, Quản trị |
| `supabase/migrations` | Bảng dữ liệu, phân quyền (RLS), nghiệp vụ, nhắc nhở tự động (pg_cron mỗi 5 phút), dữ liệu ban đầu |
| `supabase/functions/admin-users` | Edge Function cho admin tạo / khóa tài khoản, đặt lại mật khẩu |
| `.github/workflows/deploy.yml` | Tự build và đưa lên GitHub Pages mỗi khi push nhánh `main` |

## Cài đặt lần đầu

### 1. Supabase
1. Tạo tài khoản và project mới tại https://supabase.com (chọn region Singapore cho nhanh).
2. **Authentication → Sign In / Providers → Email**: tắt *Allow new users to sign up* (chỉ admin tạo tài khoản).
3. **Database → Extensions**: bật `pg_cron`.
4. Áp cơ sở dữ liệu — chọn một cách:
   - **Cách A (dễ):** mở **SQL Editor**, lần lượt dán và chạy 4 file trong `supabase/migrations` theo thứ tự tên file.
   - **Cách B (CLI):**
     ```bash
     npx supabase login
     npx supabase link --project-ref <mã-project>
     npx supabase db push
     ```
5. Deploy Edge Function (cần cho trang Quản trị → Tài khoản):
   ```bash
   npx supabase functions deploy admin-users --project-ref <mã-project>
   ```
6. Tạo **admin đầu tiên**: **Authentication → Users → Add user** (tick *Auto Confirm User*).
   Tài khoản đầu tiên của hệ thống tự động là **Admin**. Các tài khoản sau tạo trong web: Quản trị → Tài khoản.
7. Lấy **Project URL** và **anon public key** tại **Project Settings → API**.

### 2. Chạy thử trên máy
```bash
cp .env.example .env.local   # rồi điền URL và anon key
npm install
npm run dev
```

### 3. Đưa lên GitHub Pages
1. Tạo repo mới trên GitHub (có thể để Private nếu tài khoản có GitHub Pro; repo Public vẫn an toàn vì mọi dữ liệu nằm sau đăng nhập + RLS).
2. Đẩy code:
   ```bash
   git remote add origin https://github.com/<tài-khoản>/<tên-repo>.git
   git push -u origin main
   ```
3. Repo → **Settings → Secrets and variables → Actions → New repository secret**, thêm:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Repo → **Settings → Pages → Source: GitHub Actions**.
5. Vào tab **Actions**, chạy lại workflow *Deploy to GitHub Pages* (hoặc push commit mới).
   Web sẽ có ở `https://<tài-khoản>.github.io/<tên-repo>/`.
6. Supabase → **Authentication → URL Configuration → Site URL**: điền địa chỉ trên.

### 4. Gắn tên miền riêng (khi đã mua)
1. Ở nơi mua tên miền, thêm bản ghi DNS: `CNAME`  `quanly` → `<tài-khoản>.github.io`
2. Repo → **Settings → Pages → Custom domain**: nhập `quanly.tenmien.vn`, bật *Enforce HTTPS*.
3. Cập nhật lại **Site URL** trong Supabase.

## Phân quyền
- **Admin**: toàn quyền, thấy mọi việc, mọi trao đổi, mọi số liệu; cấu hình mẫu báo cáo, ngưỡng, giờ hạn.
- **Leader**: giao việc cho nhân viên phòng mình, duyệt việc, xem và nhận xét báo cáo phòng mình; admin có thể bật xem thêm phòng khác.
- **Nhân viên**: nhận/xác nhận việc, trao đổi, tự tạo việc cho mình, nộp báo cáo, xem số liệu của mình và thứ hạng trong phòng (không thấy số của người khác).

Phân quyền được kiểm tra ở cơ sở dữ liệu (Row Level Security + hàm `security definer`), không chỉ ở giao diện.

## Nhắc nhở tự động (mỗi 5 phút)
- Việc chưa xác nhận sau 2 giờ · trước hạn 24 giờ và 2 giờ · quá hạn (tự chuyển trạng thái *Quá hạn*)
- Chưa nộp báo cáo đến giờ hạn → nhắc nhân viên; 30 phút sau → nhắc leader
- Chỉ số xấu theo ngưỡng → nhắc nhân viên và leader, không nhắc trùng trong ngày
- Tạo việc lặp lại hằng ngày / tuần / tháng

Chạy thử ngay trong SQL Editor: `select public.run_reminders();`
