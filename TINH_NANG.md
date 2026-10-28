# Web quản trị nội bộ — Tóm tắt toàn bộ tính năng

Cập nhật: 28/10/2026

## 1. Thông tin chung

| Mục | Nội dung |
| --- | --- |
| Địa chỉ web | https://knmediafounder-maker.github.io/quantrinoibo-/ |
| Mã nguồn | https://github.com/knmediafounder-maker/quantrinoibo- (nhánh `main`; bản web chạy ở nhánh `gh-pages`) |
| Dữ liệu & đăng nhập | Supabase (project `envtbyrpxlxkuyjneagf`, máy chủ Singapore) |
| Phòng ban | Sale · Vận đơn · Marketing |
| Ngôn ngữ / đơn vị | Tiếng Việt, tiền VNĐ, giờ Việt Nam |
| Giao diện | Tông kem ấm, thẻ trắng bo tròn, tiêu đề chữ có chân; dùng tốt trên máy tính, có menu thu gọn cho điện thoại |
| Nguyên tắc | Không lưu thông tin khách hàng; phân quyền kiểm tra ở cơ sở dữ liệu, không chỉ ở giao diện |

## 2. Vai trò và quyền

| Vai trò | Được làm |
| --- | --- |
| **Admin** | Toàn quyền: tạo/khóa tài khoản, xem mọi việc, mọi trao đổi, mọi số liệu; cấu hình mẫu báo cáo, ngưỡng nhắc nhở, cài đặt từng phòng; mở lại báo cáo đã khóa; xem nhật ký |
| **Leader** | Giao việc cho nhân viên phòng mình, duyệt việc, xem và nhận xét báo cáo phòng mình, xem dashboard phòng; admin có thể bật cho xem thêm phòng khác (chỉ xem) |
| **Nhân viên** | Nhận và xác nhận việc, trao đổi trong việc, tự tạo việc cho mình, nộp báo cáo, xem số liệu của mình và thứ hạng trong phòng (không thấy số của người khác) |

Tài khoản đầu tiên tạo trong Supabase tự động là Admin. Không ai tự đăng ký được; mọi tài khoản do admin tạo.

## 3. Bảng tính năng theo màn hình

| Màn hình | Tính năng | Ai dùng |
| --- | --- | --- |
| **Đăng nhập** | Đăng nhập bằng email + mật khẩu; ghi nhật ký đăng nhập; báo khi tài khoản bị khóa | Tất cả |
| **Tổng quan** (trang chủ) | Lời chào theo buổi; 4 ô số liệu có biểu đồ nhỏ và so sánh với hôm qua; thẻ *Việc của tôi hôm nay* có thanh tiến độ; thẻ *Cần chú ý* (người chưa nộp báo cáo, chỉ số vượt ngưỡng, việc quá hạn, việc chờ duyệt / cần trao đổi); biểu đồ cột 7 ngày; khối *Hôm nay theo phòng* (tỷ lệ đã nộp + 3 chỉ số chính mỗi phòng) | Tất cả (nội dung theo vai trò) |
| **Việc — danh sách** | Lọc *Việc của tôi / Tôi giao / Cả phòng (Tất cả)*, lọc trạng thái, tìm theo tên việc hoặc người nhận; đánh dấu việc cần xác nhận, việc lặp lại | Tất cả |
| **Việc — kanban** | 5 cột Mới → Đang làm → Chờ duyệt → Quá hạn → Hoàn thành; kéo thả để đổi trạng thái | Tất cả |
| **Giao việc** | Giao cho 1 người, nhiều người hoặc cả phòng; hạn chót, ưu tiên (Thấp / Bình thường / Cao / Khẩn), tùy chọn cần duyệt, lặp lại hằng ngày / tuần / tháng, đính kèm file | Admin, leader (phòng mình); nhân viên tự tạo việc cho mình |
| **Chi tiết việc** | Bắt buộc xác nhận "Đã đọc và hiểu" hoặc "Cần trao đổi lại" (ghi rõ nội dung, báo ngay người giao); đổi trạng thái; gửi duyệt / duyệt / trả lại; khung trao đổi cập nhật tức thì, lưu lịch sử ai nói gì lúc nào; file đính kèm; sửa / xóa việc | Người nhận, người giao, leader, admin |
| **Nộp báo cáo** | Form theo mẫu của phòng; chọn ngày; báo nộp muộn; khóa sau giờ khóa của phòng; nhắc không nhập thông tin khách hàng | Nhân viên, leader có phòng |
| **Báo cáo** (quản lý) | Chọn phòng + ngày; bảng số liệu từng người; danh sách chưa nộp; nhãn *Muộn*; nhận xét từng báo cáo (nhân viên nhận thông báo); admin mở lại báo cáo đã khóa; xuất CSV | Leader, admin |
| **Báo cáo của tôi** | Lịch sử 60 ngày, xem chi tiết và nhận xét của leader | Nhân viên |
| **Hiệu quả của tôi** | Chọn ngày / tuần / tháng; 5 ô chỉ số có biểu đồ nhỏ và so với kỳ trước; ô đỏ khi vượt ngưỡng; biểu đồ diễn biến theo ngày; bảng xếp hạng trong phòng | Nhân viên, leader |
| **Dashboard phòng** (Sale / Vận đơn / Marketing) | Chỉ số tổng của phòng theo kỳ; danh sách chưa nộp hôm nay; biểu đồ theo ngày; bảng tổng hợp từng người (chỉ số, tỷ lệ việc đúng hạn, số việc chưa xác nhận) | Leader (phòng được phép), admin |
| **Thông báo** | Danh sách chưa đọc / tất cả, màu theo mức độ; bấm để mở đúng chỗ; đánh dấu đã đọc hết; số chưa đọc hiện ở chuông và thanh bên | Tất cả |
| **Quản trị → Tài khoản** | Tạo tài khoản (họ tên, email, phòng, vị trí, vai trò, mật khẩu); sửa; khóa / mở khóa; đặt lại mật khẩu | Admin |
| **Quản trị → Quyền leader** | Bật / tắt cho leader xem thêm phòng khác | Admin |
| **Quản trị → Mẫu báo cáo** | Theo từng phòng: thêm / xóa / đổi tên / sắp xếp ô; chọn kiểu (số, tiền, văn bản); bắt buộc hay không. Ô *hệ thống* dùng để tính thống kê nên không xóa được | Admin |
| **Quản trị → Ngưỡng nhắc nhở** | Theo từng phòng: thêm / sửa / bật tắt / xóa ngưỡng (thấp hơn / cao hơn giá trị) | Admin |
| **Quản trị → Cài đặt chung** | Tên công ty; theo từng phòng: giờ hạn nộp, giờ khóa báo cáo, số phút nhắc leader, số giờ nhắc xác nhận việc, bật / tắt xếp hạng | Admin |
| **Quản trị → Thống kê việc** | Mức phản hồi của leader (tỷ lệ báo cáo được nhận xét, thời gian phản hồi yêu cầu trao đổi); tỷ lệ hoàn thành việc đúng hạn theo người | Admin |
| **Quản trị → Nhật ký** | Đăng nhập, sửa cấu hình, tạo / khóa tài khoản, mở lại báo cáo, xuất dữ liệu, xóa việc | Admin |

## 4. Báo cáo và chỉ số theo phòng

| Phòng | Nhân viên tự nhập | Hệ thống tự tính | Xếp hạng theo | Ngưỡng mặc định |
| --- | --- | --- | --- | --- |
| **Sale** | Số data tiếp nhận, số đơn chốt, doanh số chốt, số đơn hủy, vấn đề, đề xuất | Tỷ lệ chốt, giá trị đơn trung bình | Doanh số | Tỷ lệ chốt < 20% |
| **Vận đơn** | Số đơn đã xử lý, giao thành công, cứu thành công, đơn hoàn, đơn tồn, vấn đề, đề xuất | Tỷ lệ giao thành công, tỷ lệ hoàn (team), đơn tồn, đơn cứu | Tỷ lệ giao thành công | Giao TC < 80%; đơn tồn/người > 30; tổng đơn tồn phòng > 80 |
| **Marketing** | Chi phí, số lượng mess, số đơn, doanh số, vấn đề, đề xuất | Chi phí/mess, chi phí/đơn, tỷ lệ mess → đơn, chi phí/doanh số (%) | Doanh số | Chi phí/doanh số > 30%; chi phí/mess > 30.000đ |

Mặc định mỗi phòng: hạn nộp 18:00, khóa 23:59, nhắc leader sau 30 phút, nhắc xác nhận việc sau 2 giờ, bật xếp hạng. Admin chỉnh riêng từng phòng.

## 5. Nhắc nhở tự động (chạy mỗi 5 phút)

| Khi nào | Nhắc ai |
| --- | --- |
| Có việc mới được giao | Người nhận |
| Người nhận chọn "Cần trao đổi lại" | Người giao (ngay lập tức) |
| Chưa xác nhận việc sau N giờ (theo phòng) | Người nhận |
| Còn dưới 24 giờ / dưới 2 giờ đến hạn | Người nhận |
| Quá hạn (tự chuyển trạng thái *Quá hạn*) | Người nhận và người giao |
| Việc gửi duyệt / hoàn thành / bị trả lại | Người giao / người nhận |
| Có trao đổi mới trong việc | Những người liên quan đến việc |
| Đến giờ hạn mà chưa nộp báo cáo | Nhân viên |
| Sau giờ hạn N phút vẫn chưa nộp | Leader của phòng (kèm danh sách tên) |
| Báo cáo có chỉ số vượt ngưỡng | Nhân viên và leader (không nhắc trùng trong ngày) |
| Tổng đơn tồn của phòng Vận đơn vượt ngưỡng | Leader và admin |
| Leader nhận xét báo cáo | Nhân viên |
| Admin mở lại báo cáo | Nhân viên |
| Việc lặp lại đến kỳ | Tự tạo việc mới và nhắc người nhận |

Thông báo hiện ở chuông, trang Thông báo và thẻ *Cần chú ý* trên trang Tổng quan.

## 6. Vận hành

| Việc | Cách làm |
| --- | --- |
| Cập nhật web sau khi sửa code | `npm run deploy` (build và đẩy lên nhánh `gh-pages`) |
| Cài cơ sở dữ liệu mới từ đầu | Dán `supabase/setup_all.sql` vào Supabase SQL Editor |
| Cập nhật lần 2 (Marketing, cài đặt theo phòng) | `supabase/update_2_marketing.sql` — **đã chạy ngày 27/10/2026** |
| Chức năng tạo tài khoản | Edge Function `admin-users` trên Supabase (đã deploy) |
| Gắn tên miền riêng | Thêm bản ghi DNS CNAME trỏ về `knmediafounder-maker.github.io`, khai báo trong GitHub → Settings → Pages, rồi cập nhật Site URL trong Supabase |

## 7. Chưa làm

| Hạng mục | Ghi chú |
| --- | --- |
| Ngưỡng *tỷ lệ giao thành công* cho phòng Sale | Đã yêu cầu, chưa làm — cần chốt công thức tính |
| Tự thêm / xóa loại chỉ số dùng cho ngưỡng | Đã yêu cầu, chưa làm (hiện chỉ chọn trong danh sách chỉ số có sẵn của từng phòng) |
| Nhiều lần báo cáo trong ngày (vd. ca sáng, ca chiều) | Đã yêu cầu, chưa làm — cần chốt cách cộng số liệu giữa các lần |
| Phòng Kho | Theo lộ trình |
| Nhập file POSCake, tỷ lệ hoàn theo từng Sale | Giai đoạn 4 |
| Lương và KPI | Giai đoạn 6 |
| Kết nối tự động POSCake, Facebook Ads, Telegram | Giai đoạn 7 |
| Tên miền riêng | Chờ mua tên miền |
