-- =====================================================================
-- Dữ liệu ban đầu + lịch chạy nhắc nhở
-- =====================================================================
insert into public.departments (code, name, sort) values
  ('sale', 'Sale', 1),
  ('van_don', 'Vận đơn', 2)
on conflict (code) do nothing;

insert into public.settings (id) values (1) on conflict (id) do nothing;

-- Ô có "system": true được dùng để tính thống kê, không xóa được trên giao diện
insert into public.report_templates (department, fields) values
('sale', '[
  {"key":"data_received","label":"Số data tiếp nhận","type":"int","required":true,"system":true},
  {"key":"orders_closed","label":"Số đơn chốt","type":"int","required":true,"system":true},
  {"key":"revenue","label":"Doanh số chốt (VNĐ)","type":"money","required":true,"system":true},
  {"key":"orders_cancelled","label":"Số đơn hủy","type":"int","required":true,"system":true},
  {"key":"issues","label":"Vấn đề gặp phải","type":"text","required":false,"system":true},
  {"key":"proposals","label":"Đề xuất","type":"text","required":false,"system":true}
]'),
('van_don', '[
  {"key":"orders_processed","label":"Số đơn đã xử lý","type":"int","required":true,"system":true},
  {"key":"delivered","label":"Số đơn giao thành công","type":"int","required":true,"system":true},
  {"key":"rescued","label":"Số đơn cứu thành công","type":"int","required":true,"system":true},
  {"key":"returned","label":"Số đơn hoàn","type":"int","required":true,"system":true},
  {"key":"backlog","label":"Số đơn tồn","type":"int","required":true,"system":true},
  {"key":"issues","label":"Vấn đề gặp phải","type":"text","required":false,"system":true},
  {"key":"proposals","label":"Đề xuất","type":"text","required":false,"system":true}
]')
on conflict (department) do nothing;

-- Ngưỡng ví dụ — admin chỉnh trong trang Quản trị
insert into public.thresholds (department, metric, op, value, label) values
  ('sale', 'close_rate', 'lt', 20, 'Tỷ lệ chốt thấp'),
  ('van_don', 'delivery_rate', 'lt', 80, 'Tỷ lệ giao thành công thấp'),
  ('van_don', 'backlog', 'gt', 30, 'Đơn tồn nhiều'),
  ('van_don', 'team_backlog', 'gt', 80, 'Tổng đơn tồn của phòng cao');

-- Chạy nhắc nhở mỗi 5 phút
create extension if not exists pg_cron;
select cron.schedule('run-reminders', '*/5 * * * *', $$select public.run_reminders()$$);
