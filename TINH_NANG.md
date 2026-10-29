# Web quản trị nội bộ — Tóm tắt tính năng

Cập nhật: 29/10/2026 · Địa chỉ: https://knmediafounder-maker.github.io/quantrinoibo-/

## 1. Tổng quan

| Mục | Nội dung |
| --- | --- |
| Mục đích | Quản lý 3 phòng Sale, Vận đơn, Marketing: mỗi người thấy rõ hiệu quả của mình, leader giao và kiểm soát việc, cả công ty theo dõi doanh số theo tháng |
| Nguồn số liệu | Tự động từ POSCake (đơn hàng, trạng thái giao, nhân viên) và chi phí quảng cáo Facebook (qua POSCake hoặc trực tiếp Facebook Marketing API); đồng bộ 10 phút/lần, không nhập tay |
| Kỳ đo lường | Doanh số tính theo tháng; mọi số liệu xem **tháng này và tháng trước** cạnh nhau, chọn được hôm nay, hôm qua, tháng trước hoặc khoảng ngày bất kỳ |
| Nguyên tắc | Không lưu, không hiển thị thông tin cá nhân khách hàng (chỉ mã đơn, giá trị, trạng thái); nhân viên chỉ thấy số của mình và thứ hạng, không thấy số của người khác |

## 2. Vai trò

| Vai trò | Quyền chính |
| --- | --- |
| **Admin** | Toàn quyền: kết nối POSCake / Facebook, tạo/khóa tài khoản, liên kết nhân viên với POSCake, xem toàn bộ số liệu và việc, cài đặt ngưỡng, mẫu báo cáo, cách chia đơn, chỉ số xếp hạng, xem nhật ký |
| **Leader** | Toàn quyền với phòng mình: giao việc, xác nhận hoàn thành, nhận xét báo cáo, xếp và chốt lịch làm việc, duyệt nghỉ, xử lý đơn có vấn đề, chia lại đơn (Vận đơn). Với phòng khác, admin cho **Chỉ xem** (số liệu, báo cáo, đơn) hoặc **Toàn quyền** (như phòng mình) |
| **Nhân viên** | Xem chỉ số và thứ hạng của mình, nhận và phản hồi việc, xử lý đơn mình phụ trách, gửi báo cáo và đơn có vấn đề |

## 3. Chỉ số chung

| Chỉ số | Cách tính |
| --- | --- |
| Số đơn | Đơn chốt trong kỳ (mọi trạng thái trừ Đã hủy, Đã xóa) |
| Doanh số | Tổng giá trị đơn chốt |
| Số đơn giao thành công | Đơn ở trạng thái Đã nhận / Đã thu tiền |
| Doanh thu thực | Tổng giá trị đơn giao thành công |
| Đơn đang giao | Đơn ở trạng thái Đã gửi hàng |
| Tỷ lệ hoàn | Đơn hoàn (Đang hoàn, Hoàn một phần, Đã hoàn) ÷ đơn đã gửi đi |
| Tỷ lệ giao thành công | Đơn giao thành công ÷ đơn đã gửi đi |
| Chi phí marketing | Chi phí quảng cáo Facebook |
| Tỷ lệ MKT / doanh thu thực | Chi phí marketing ÷ doanh thu thực |

- Đơn tính vào ngày chốt đơn (giờ Việt Nam), nên số tháng trước vẫn cập nhật khi đơn đang giao có kết quả; màn hình ghi kèm "còn X đơn đang giao".
- So sánh cùng kỳ: ví dụ 1–28/10 so với 1–28/9, có mức tăng/giảm (tỷ lệ % so bằng điểm %).
- Đơn tính cho Sale theo **người bán được phân công**, cho Marketing theo **marketer** trên POSCake; Vận đơn theo **đơn được chia** trên web.

## 4. Tính năng theo màn hình

| Màn hình | Nội dung | Ai dùng |
| --- | --- | --- |
| **Trang chủ** | Chỉ số của bản thân (kỳ này / tháng trước, biểu đồ nhỏ theo ngày), **thứ hạng trong phòng**, việc hôm nay, **đơn cần xử lý ngay**, *Cần chú ý*. Admin/leader thấy thêm tổng công ty: doanh số, doanh thu thực, số đơn, đơn thành công, tỷ lệ hoàn, chi phí MKT, tỷ lệ MKT/doanh thu thực | Tất cả |
| **Việc** | Giao cho 1 người, nhiều người hoặc cả phòng, kèm hạn chót và ưu tiên → nhân viên xác nhận "Đã hiểu" hoặc "Cần trao đổi lại" → trao đổi trong việc → nhân viên báo xong → **chỉ hoàn thành khi leader xác nhận** (hoặc trả lại kèm lý do). Dạng danh sách hoặc bảng kéo thả | Tất cả |
| **Đơn của tôi** (Sale) | Chỉ số và danh sách đơn (mục 5); leader xem cả phòng hoặc từng sale | Sale |
| **Hàng đợi giao** (Vận đơn) | Đơn được chia và thứ tự xử lý (mục 6); leader xem cả phòng, chia lại đơn | Vận đơn |
| **Hiệu quả quảng cáo** (Marketing) | Chi phí và hiệu quả quảng cáo (mục 7) | Marketing |
| **Đơn có vấn đề** | Gửi và xử lý phiếu đơn cần xem xét (mục 8) | Tất cả |
| **Hiệu quả của tôi** | Toàn bộ chỉ số của phòng theo kỳ, biểu đồ theo ngày, bảng xếp hạng, **gợi ý chỉ số nên cải thiện** (chỉ số vượt ngưỡng hoặc giảm > 10% so với tháng trước, kèm cách cải thiện) | Nhân viên, leader |
| **Dashboard phòng** | Tổng phòng, biểu đồ theo ngày, bảng từng người (số kỳ này, trong ngoặc là tháng trước), tỷ lệ việc đúng hạn, việc chưa xác nhận, ai chưa gửi báo cáo | Leader, admin |
| **Báo cáo hằng ngày** | Số liệu trong ngày tự điền sẵn; nhân viên chỉ ghi vấn đề và đề xuất (Sale ghi thêm số data nhận để tính tỷ lệ chốt); leader nhận xét; xuất CSV | Tất cả |
| **Lịch làm việc** | Cả tuần, 3 ca/ngày. ① Nhân viên tích các ca **muốn nghỉ** của tuần sau, bấm **Gửi đăng ký** trước **11:00 Chủ nhật** (sửa và gửi lại được trước hạn; sáng CN tự nhắc người chưa gửi). ② Leader thấy ai đã gửi / chưa gửi, bấm "Tự xếp" (mọi ca trừ ca xin nghỉ), bấm tên từng người để chọn ngày/ca làm của người đó, xem số người mỗi ca → **Chốt lịch** — chỉ mở sau 11:00 CN, trước đó leader xếp và lưu nháp (cả phòng nhận thông báo khi chốt). ③ Leader **sửa tự do đến 24:00 Chủ nhật**; sau đó mọi thay đổi **bắt buộc ghi chú** và hiện trong mục "Thay đổi lịch sau khi chốt" + ô lịch được đánh dấu. ④ **Xin nghỉ**: chỉ cho tuần hiện tại (thêm tuần sau nếu đã chốt) — web liệt kê các ca mình đang có từ hôm nay, tích ca muốn nghỉ, ghi lý do → leader xem từng ca, chọn **người bù** và duyệt (ca tự bỏ khỏi lịch, người bù được thêm và báo) | Tất cả |
| **Bảng tin** | Leader/admin đăng **khen thưởng, chúc mừng, thông báo** (kèm ảnh, ghim, hiện đến ngày); hiện thành banner chạy trên Tổng quan; mọi người bấm "Chúc mừng"; cả công ty nhận thông báo | Tất cả |
| **Góc chia sẻ** | Viết chia sẻ, góp ý, ý tưởng, cảm ơn — gửi cả công ty, leader & ban giám đốc, ban giám đốc, hoặc riêng một người; **ẩn danh được** (cả bài và trả lời); đồng tình, trả lời; người viết xóa bài của mình, admin gỡ bài công khai | Tất cả |
| **Thông báo** | Việc mới, hạn chót, việc chờ duyệt, đơn sắp hoàn, đơn giao thất bại, đơn chuyển qua lại giữa Sale và Vận đơn, đơn có vấn đề, chỉ số vượt ngưỡng | Tất cả |
| **Quản trị** | **Kết nối dữ liệu** (API key POSCake, chọn cửa hàng, nguồn quảng cáo, đồng bộ ngay), liên kết nhân viên với POSCake, marketer phụ trách tài khoản quảng cáo, số ngày báo sắp hoàn, tự chia đơn; tài khoản, **quyền leader theo từng phòng** (không / chỉ xem / toàn quyền), tên và giờ 3 ca làm việc, giờ hạn đăng ký lịch, mẫu báo cáo, ngưỡng cảnh báo (thêm/xóa chỉ số tùy ý), chỉ số xếp hạng từng phòng, thống kê việc, nhật ký | Admin |

## 5. Sale

**Mục đích:** sale thấy kết quả làm việc của mình và biết nên cải thiện khâu nào.

| Chỉ số | Cho biết |
| --- | --- |
| Số lượng đơn | Khối lượng chốt |
| Doanh số | Giá trị đã chốt |
| Doanh thu đơn giao thành công | Giá trị thực thu |
| Số đơn đang giao | Đơn còn cần theo dõi |
| Tỷ lệ chốt | Đơn chốt ÷ số data nhận. Thấp → cần cải thiện tư vấn, chốt đơn |
| Tỷ lệ giao thành công | Thấp → chất lượng đơn chốt chưa tốt |

**Danh sách đơn** (Cần xử lý / Đã gửi Vận đơn / Đang giao / Tất cả trong kỳ): đơn **sắp đến hạn hoàn** tự lên đầu (vàng khi còn ≤ N ngày, đỏ khi còn ≤ 1 ngày), rồi đơn Vận đơn gửi sang. **Tìm theo mã đơn / mã vận đơn** (tìm trên mọi ngày), **lọc** theo trạng thái, nhãn (sắp hoàn, nguy cơ hoàn, chờ Sale, chờ Vận đơn, hạ COD, có ghi chú), sắp xếp.

**Trao đổi đơn Sale ↔ Vận đơn:** trong chi tiết đơn, bên này ghi nội dung và bấm "Gửi Vận đơn / Sale xử lý" → bên kia nhận thông báo (sale của đơn hoặc người giao phụ trách; chưa có thì leader). Bên nhận bấm **Đã xử lý xong** kèm thông tin cập nhật (người gửi được báo lại) hoặc **Đẩy lại** cho bên kia. Đơn đang chờ hiện nhãn "Chờ Sale xử lý" / "Chờ Vận đơn xử lý"; toàn bộ qua lại lưu trong lịch sử đơn.

## 6. Vận đơn

**Mục đích:** theo sát đơn đến khi giao thành công.

- Đơn chuyển sang **Đã gửi hàng** tự chia cho nhân viên Vận đơn đang ít đơn nhất (admin tắt được); leader chia lại được.

| Chỉ số | Cho biết |
| --- | --- |
| Số đơn đang phụ trách | Kiểm soát khối lượng đang xử lý |
| Đơn giao thành công trong ngày | Kết quả hôm nay |
| Đơn sắp đến hạn hoàn | Đơn cần xử lý gấp |
| Tỷ lệ giao thành công | Hiệu quả theo tháng |
| Sale gửi cần xử lý | Yêu cầu Sale đang chờ Vận đơn |
| **Đơn hạ COD / tổng tiền hạ COD** | Đơn khách đã nhận mà tiền thu hộ thực (đối soát với hãng, hoặc COD trên POSCake khi khách nhận) thấp hơn tiền thu hộ lúc gửi hàng; tính theo kỳ, có danh sách riêng |

**Tab:** Đang giao / Sale gửi / Đã gửi Sale / Chưa chia / Giao xong hôm nay / Hạ COD; có tìm kiếm và lọc như bên Sale.

**Thứ tự nên xử lý:** sắp đến hạn hoàn → Sale gửi sang → nguy cơ hoàn rất cao → đã giao thất bại → giá trị cao → còn lại.

| Nhãn | Ý nghĩa |
| --- | --- |
| Chờ Sale xử lý / Chờ Vận đơn xử lý | Đơn đang trao đổi giữa hai phòng (mục 5) |
| Nguy cơ hoàn rất cao | Đơn khả năng hoàn cao, leader được cảnh báo (tự cảnh báo khi hãng báo giao thất bại / chờ hoàn) |

Đã bỏ chỉ số "đơn cứu thành công".

## 7. Marketing

**Mục đích:** thấy rõ chi phí quảng cáo và hiệu quả.

| Chỉ số | Cho biết |
| --- | --- |
| Chi phí marketing | Tiền đã chi |
| Doanh số | Giá trị đơn mang về |
| Doanh thu thực | Giá trị đơn giao thành công |
| Chi phí / mess | Giá mỗi tin nhắn (số cuộc trò chuyện bắt đầu từ quảng cáo) |
| Tỷ lệ hoàn | Chất lượng đơn từ quảng cáo |
| Tỷ lệ MKT / doanh thu thực | Hiệu quả chi phí thực tế |

Xem theo cả phòng hoặc từng marketer; biểu đồ chi phí đặt cạnh doanh thu thực theo ngày; bảng từng marketer; chiến dịch chi nhiều nhất.

## 8. Đơn có vấn đề

- Ai cũng gửi được: mã đơn, loại vấn đề (khách hẹn lại, không liên lạc được, sai thông tin, hàng lỗi, bom hàng…), mô tả, ảnh, mức độ gấp.
- **Mặc định gửi admin và leader phòng người gửi.** Gắn thẻ thêm phòng liên quan (lúc gửi hoặc sau đó): leader phòng đó nhận thông báo, nhân viên phòng đó xem và xử lý được; có thể gửi thêm một người cụ thể.
- Trạng thái: Mới → Đang xử lý → Đã xử lý / Không xử lý được; có trao đổi trong phiếu (cập nhật tức thì).
- Leader có thể chuyển phiếu thành việc giao cho nhân viên; thống kê vấn đề theo tháng.

## 9. Nhắc nhở tự động (5 phút/lần)

| Khi nào | Nhắc ai |
| --- | --- |
| Việc mới, chưa xác nhận sau N giờ, sắp đến hạn (24 giờ / 2 giờ), quá hạn, chờ duyệt, trao đổi mới | Người nhận / người giao |
| Đơn đang giao còn ≤ N ngày tới hạn hoàn | Người giao phụ trách và sale của đơn |
| Hãng báo giao thất bại / chờ hoàn | Leader Vận đơn |
| Sale / Vận đơn gửi yêu cầu xử lý đơn, bên kia báo xong | Bên nhận / người gửi |
| Lịch làm việc được chốt, lịch đã chốt bị sửa | Cả phòng / người bị đổi ca |
| Đơn xin nghỉ mới, đơn được duyệt / không duyệt, được xếp bù ca | Leader (leader xin nghỉ → admin) / người xin / người bù |
| Sáng Chủ nhật chưa gửi đăng ký lịch; quá hạn đăng ký | Nhân viên chưa gửi / leader (số người đã gửi) |
| Tin mới trên bảng tin | Cả công ty |
| Góp ý gửi riêng / gửi leader / ban giám đốc, có trả lời mới | Người nhận / người viết bài |
| Có phiếu đơn có vấn đề, phiếu đổi trạng thái, trao đổi mới | Người nhận phiếu, người gửi |
| Chỉ số tháng này vượt ngưỡng (1 lần/ngày sau giờ hạn báo cáo) | Nhân viên và leader |
| Tổng đơn đang giao của phòng Vận đơn vượt ngưỡng | Leader Vận đơn và admin |
| Chưa gửi báo cáo hằng ngày | Nhân viên, sau đó leader |

## 10. Vận hành

| Việc | Cách làm |
| --- | --- |
| Cập nhật cơ sở dữ liệu | Lần 3: `supabase/update_3_poscake.sql`; lần 4: `supabase/update_4_test_data.sql` (đã chạy 28/10/2026); lần 5: `supabase/update_5_collab.sql` (đã chạy 29/10/2026); lần 6: `supabase/update_6_schedule.sql`; lần 7: `supabase/update_7_fix_lich.sql` (đã chạy); lần 8: `supabase/update_8_lich_quy_tac.sql` |
| Test trước khi có API | Quản trị → Kết nối dữ liệu → **Tạo dữ liệu thử** (≈450 đơn mã TEST…, quảng cáo 2 tháng, ~10% đơn đã nhận bị hạ COD, vài đơn đang trao đổi Sale ↔ Vận đơn); nhập API key thật sẽ tự xóa |
| Kết nối POSCake | Quản trị → Kết nối dữ liệu → dán API key → Tải danh sách → chọn cửa hàng → Đồng bộ ngay |
| Liên kết nhân viên | Quản trị → Kết nối dữ liệu → Liên kết nhân viên với POSCake (có nút tự khớp theo email) |
| Đồng bộ | Tự động 10 phút/lần (Edge Function `sync-poscake`); lần đầu lấy 2 tháng gần nhất |
| Cập nhật web | `npm run deploy` |
| Cài mới từ đầu | `supabase/setup_all.sql` |

## 11. Cần lưu ý / chưa làm

| Hạng mục | Ghi chú |
| --- | --- |
| Hạn hoàn | POSCake không có sẵn "hạn hoàn", web tính = ngày gửi hàng + số ngày admin cài (mặc định 7) |
| Tỷ lệ chốt của Sale | POSCake không có số data/khách nhắn theo từng sale, nên lấy từ ô "số data" sale ghi trong báo cáo hằng ngày |
| Doanh số | Dùng "tổng tiền đơn" (total_price) của POSCake |
| Hạ COD | Tiền thu hộ lúc gửi được web ghi lại lần đầu thấy đơn ở "Đã gửi hàng" (hoặc lấy từ lịch sử sửa COD của POSCake nếu có); so với tiền đối soát với hãng / COD khi khách nhận. Cần kiểm tra lại trên dữ liệu thật sau khi kết nối |
| Góp ý ẩn danh | Trên web không ai (kể cả admin) thấy người viết. Người có quyền vào thẳng cơ sở dữ liệu Supabase vẫn tra được — chỉ chủ tài khoản Supabase |
| Nhiều lần báo cáo trong ngày | Chưa làm |
| Phòng Kho, lương / KPI, Telegram | Theo lộ trình |
| Tên miền riêng | Chờ mua tên miền |
