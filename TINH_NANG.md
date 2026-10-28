# Web quản trị nội bộ — Tóm tắt tính năng

Cập nhật: 28/10/2026 · Địa chỉ: https://knmediafounder-maker.github.io/quantrinoibo-/

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
| **Leader** | Giao việc kèm hạn chót, xác nhận hoàn thành hoặc trả lại việc, xem số liệu và báo cáo của phòng, xử lý đơn có vấn đề, chia lại đơn (Vận đơn) |
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
| **Thông báo** | Việc mới, hạn chót, việc chờ duyệt, đơn sắp hoàn, đơn giao thất bại, đơn chuyển qua lại giữa Sale và Vận đơn, đơn có vấn đề, chỉ số vượt ngưỡng | Tất cả |
| **Quản trị** | **Kết nối dữ liệu** (API key POSCake, chọn cửa hàng, nguồn quảng cáo, đồng bộ ngay), liên kết nhân viên với POSCake, marketer phụ trách tài khoản quảng cáo, số ngày báo sắp hoàn, tự chia đơn; tài khoản, quyền leader, mẫu báo cáo, ngưỡng cảnh báo (thêm/xóa chỉ số tùy ý), chỉ số xếp hạng từng phòng, thống kê việc, nhật ký | Admin |

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

**Danh sách đơn** (Cần xử lý / Đang giao / Tất cả trong kỳ): đơn **sắp đến hạn hoàn** tự lên đầu (vàng khi còn ≤ N ngày, đỏ khi còn ≤ 1 ngày). Sale ghi kết quả liên hệ khách, chuyển đơn sang Vận đơn xử lý, hoặc báo đơn có vấn đề.

## 6. Vận đơn

**Mục đích:** theo sát đơn đến khi giao thành công.

- Đơn chuyển sang **Đã gửi hàng** tự chia cho nhân viên Vận đơn đang ít đơn nhất (admin tắt được); leader chia lại được.

| Chỉ số | Cho biết |
| --- | --- |
| Số đơn đang phụ trách | Kiểm soát khối lượng đang xử lý |
| Đơn giao thành công trong ngày | Kết quả hôm nay |
| Đơn sắp đến hạn hoàn | Đơn cần xử lý gấp |
| Tỷ lệ giao thành công | Hiệu quả theo tháng |

**Thứ tự nên xử lý:** sắp đến hạn hoàn → nguy cơ hoàn rất cao → đã giao thất bại → giá trị cao → còn lại.

| Nhãn | Ý nghĩa |
| --- | --- |
| Chuyển Sale xử lý | Cần sale liên hệ lại khách; sale nhận thông báo và trả kết quả |
| Nguy cơ hoàn rất cao | Đơn khả năng hoàn cao, leader được cảnh báo (tự cảnh báo khi hãng báo giao thất bại / chờ hoàn) |
| Đã cứu thành công | Đơn từng có nguy cơ hoàn hoặc giao thất bại nhưng đã giao được (tự tính) |

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

- Ai cũng gửi được: mã đơn, loại vấn đề (khách hẹn lại, không liên lạc được, sai thông tin, hàng lỗi, bom hàng…), mô tả, ảnh, mức độ gấp, gửi đến leader / phòng / người cụ thể.
- Trạng thái: Mới → Đang xử lý → Đã xử lý / Không xử lý được; có trao đổi trong phiếu (cập nhật tức thì).
- Leader có thể chuyển phiếu thành việc giao cho nhân viên; thống kê vấn đề theo tháng.

## 9. Nhắc nhở tự động (5 phút/lần)

| Khi nào | Nhắc ai |
| --- | --- |
| Việc mới, chưa xác nhận sau N giờ, sắp đến hạn (24 giờ / 2 giờ), quá hạn, chờ duyệt, trao đổi mới | Người nhận / người giao |
| Đơn đang giao còn ≤ N ngày tới hạn hoàn | Người giao phụ trách và sale của đơn |
| Hãng báo giao thất bại / chờ hoàn | Leader Vận đơn |
| Vận đơn chuyển đơn cho Sale, Sale trả kết quả | Sale / người giao |
| Có phiếu đơn có vấn đề, phiếu đổi trạng thái, trao đổi mới | Người nhận phiếu, người gửi |
| Chỉ số tháng này vượt ngưỡng (1 lần/ngày sau giờ hạn báo cáo) | Nhân viên và leader |
| Tổng đơn đang giao của phòng Vận đơn vượt ngưỡng | Leader Vận đơn và admin |
| Chưa gửi báo cáo hằng ngày | Nhân viên, sau đó leader |

## 10. Vận hành

| Việc | Cách làm |
| --- | --- |
| Cập nhật cơ sở dữ liệu | Lần 3: `supabase/update_3_poscake.sql` (đã chạy 28/10/2026); lần 4: `supabase/update_4_test_data.sql` |
| Test trước khi có API | Quản trị → Kết nối dữ liệu → **Tạo dữ liệu thử** (≈450 đơn mã TEST… và quảng cáo 2 tháng); nhập API key thật sẽ tự xóa |
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
| Nhiều lần báo cáo trong ngày | Chưa làm |
| Phòng Kho, lương / KPI, Telegram | Theo lộ trình |
| Tên miền riêng | Chờ mua tên miền |
