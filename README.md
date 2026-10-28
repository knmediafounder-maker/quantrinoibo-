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
| `scripts/deploy.sh` | Build và đẩy bản web lên nhánh `gh-pages` (GitHub Pages) |

## Cài đặt lần đầu

### 1. Supabase
1. Tạo tài khoản và project mới tại https://supabase.com (chọn region Singapore cho nhanh).
2. **Authentication → Sign In / Providers → Email**: tắt *Allow new users to sign up* (chỉ admin tạo tài khoản).
3. **Database → Extensions**: bật `pg_cron` và `pg_net`.
4. Áp cơ sở dữ liệu — chọn một cách:
   - **Cách A (dễ):** mở **SQL Editor**, dán và chạy `supabase/setup_all.sql` (gộp mọi file trong `supabase/migrations`).
   - **Cách B (CLI):**
     ```bash
     npx supabase login
     npx supabase link --project-ref <mã-project>
     npx supabase db push
     ```
5. Deploy Edge Function (tài khoản và đồng bộ POSCake / Facebook):
   ```bash
   npx supabase functions deploy admin-users --project-ref <mã-project>
   npx supabase functions deploy sync-poscake --project-ref <mã-project> --no-verify-jwt
   ```
   Lịch đồng bộ trong `20261028000006_realtime_data.sql` gọi địa chỉ hàm của project hiện tại — đổi `envtbyrpxlxkuyjneagf` nếu dùng project khác.
6. Tạo **admin đầu tiên**: **Authentication → Users → Add user** (tick *Auto Confirm User*).
   Tài khoản đầu tiên của hệ thống tự động là **Admin**. Các tài khoản sau tạo trong web: Quản trị → Tài khoản.
7. Lấy **Project URL** và **anon public key** tại **Project Settings → API**.
8. Đăng nhập web bằng admin → **Quản trị → Kết nối dữ liệu**: dán API key POSCake, chọn cửa hàng, bấm *Đồng bộ ngay*, rồi liên kết từng nhân viên Sale / Marketing với nhân viên trên POSCake.

### 2. Chạy thử trên máy
```bash
cp .env.example .env.local   # rồi điền URL và anon key
npm install
npm run dev
```

### 3. Đưa lên GitHub Pages
Web được build trên máy rồi đẩy thư mục `dist` lên nhánh `gh-pages`:
```bash
npm run deploy
```
(Cần file `.env.local` có URL và anon key của Supabase.)

Lần đầu: repo → **Settings → Pages → Build and deployment → Source: Deploy from a branch**, chọn nhánh `gh-pages`, thư mục `/ (root)`, bấm **Save**.
Web sẽ có ở `https://<tài-khoản>.github.io/<tên-repo>/`.
Sau đó vào Supabase → **Authentication → URL Configuration → Site URL**: điền địa chỉ trên.

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
