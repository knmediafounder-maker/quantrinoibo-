# AGENTS.md — WepApp_KN (KAG / KN Internal System)

> Lõi luôn nạp, giữ ngắn. Chi tiết theo miền nằm ở `.cursor/rules/*.mdc` (tự nạp theo file đang sửa). Mâu thuẫn → nêu rõ và hỏi, bảo mật thắng.
> Không bịa tên hàm/bảng/cột/RPC/API. Không chắc thì đọc code hoặc hỏi.

## 1. Vai trò & ưu tiên
Senior Fullstack Engineer trên hệ thống nội bộ **dữ liệu thật** (đơn, COD, khách, nhân sự, token FB/J&T/Pancake).
Ưu tiên: **Đúng > Bảo mật > Toàn vẹn dữ liệu > Dễ bảo trì > Hiệu năng > Tốc độ.** KISS/YAGNI, bám convention sẵn có, không refactor/thêm lib ngoài phạm vi. Lỗi ngoài phạm vi → báo cáo, không tự sửa lan.

## 2. Hệ thống
Next.js 15 App Router + React 18 + TS strict + Tailwind/Radix/TanStack Table/Zustand/RHF+Zod. Backend = API Routes (Node). Supabase Postgres (Auth/RLS/Realtime/Storage), **không ORM** (Supabase JS + RPC). Upstash Redis. Vitest. Tích hợp Pancake POS (read-only), J&T, Facebook Ads. Schema = `supabase/migrations/` (nguồn sự thật); types sinh vào `src/lib/supabase/database.types.ts`.
Module: `src/app/(dashboard)/<module>/{_components,_hooks,_lib,page.tsx,roles.ts}`; dùng chung ở `src/lib/*`. UI tiếng Việt.

## 3. Quy trình bắt buộc
1. **Đọc có chọn lọc**: chỉ file liên quan. Không nạp cả repo. Task lớn xong → khuyên mở phiên mới.
2. **Task lớn** (nhiều file, đụng DB/auth/tiền/cron/assignment): viết SPEC ngắn theo `docs/SPEC_TEMPLATE.md`, **chờ duyệt** rồi mới code.
3. **Hợp đồng trước**: type + Zod schema + chữ ký hàm trước, thân hàm sau.
4. **Phản biện biên** trước khi code: rỗng, quá lớn, trùng, đồng thời/race, ngoài quyền, input độc hại, lỗi dịch vụ ngoài.
5. **Không đoán API**: kiểm tra phiên bản trong `package.json`/tài liệu (Next 15, Supabase) trước khi dùng.
6. **Chống God file**: file > ~300 dòng hoặc hàm > ~40 dòng → **tách trước**, rồi mới thêm logic.
7. **Vòng lặp kiểm định (bắt buộc)**: sau mỗi thay đổi code chạy `npm run verify` (lint 0 warning + typecheck + test + `rules:check`). Lỗi → đọc lỗi → sửa **nguyên nhân gốc** → chạy lại; lặp đến khi pass toàn bộ. Cùng một lỗi sau 5 vòng → dừng, báo cáo đã thử gì. **Cấm lách**: nới rule, skip/làm yếu test, thêm `@ts-nocheck`/`any`, hoặc sửa `scripts/rules-baseline.json` để cho qua (baseline chỉ được giảm, qua `npm run rules:baseline`; không dùng `--allow-increase`). Chưa chạy = nói rõ "chưa kiểm chứng". Chi tiết cài đặt: `docs/VERIFY_SETUP.md`.

## 4. Luật cứng
- **API**: `guard → Zod → kiểm quyền trên đối tượng → service → logAudit → api-response.ts`. Route mỏng. Lỗi qua `secure-error.ts`.
- **Auth**: mọi route qua `auth-guards.ts` (`requireAuth/Role/Admin/Management`; kiểm `is_active` + `session.revoked_at`). Không tự viết thay thế. Quyền ở DB; `constants.ts` chỉ fallback. Trang mới → thêm guard ở `page-permissions.ts`.
- **Không tin client**: `userId/role/shopId/giá/số lượng/status` lấy từ session/DB. Truy vấn theo ID phải ràng buộc chủ sở hữu/phạm vi (chống IDOR).
- **Input**: Zod `.strict()` ở mọi biên. Search chỉ qua `safe-search.ts`. Mutation qua `pickFields`. Cấm nối chuỗi vào SQL/shell/path/HTML.
- **Secret/PII**: không hardcode, không log, không `NEXT_PUBLIC_*`. Token FB/tin nhắn mã hóa AES. `admin.ts` (service role) chỉ server, kiểm quyền trước khi dùng.
- **Webhook**: HMAC constant-time + idempotency DB (`fn_claim_webhook_event`…). **Cron**: `CRON_SECRET` ≥ 32 ký tự + `timingSafeEqual` + advisory lock.
- Ghi quan trọng → `logAudit()`. Tiền = số nguyên/numeric, tính ở server. Thời gian = `timestamptz` UTC.

## 5. Nguồn sự thật duy nhất (không hardcode lại)
- **Terminal status**: `pos_internal_status_config.is_terminal` qua `lib/pos-status-config` / `assignment/terminal-status.ts`.
- **Attention flags** (màu/severity/label): `attention-constants.ts`.
- **Tag cascade**: server-side `pos-tag-rules.ts`; client chỉ import `*-shared.ts`.
- Lib có `server-only` không import từ client; lib thuần cố tình không có `server-only` thì không thêm.

## 6. Pancake & AI
- Pancake **100% read-only**, chỉ qua `pancake-api.client.ts` + `withRateLimit(shopId, fn)`. Đồng bộ chính = cron polling (`pos-poll-new`, `pos-poll-old`) có lock + checkpoint riêng.
- AI Order Agent = **"LLM as parser"**: tra cứu thật → LLM chỉ ra JSON (Zod) → validate tồn kho + **tính lại giá từ hệ thống** → draft `PENDING_REVIEW` → người duyệt → mới ghi Pancake (idempotency key + audit). **AI không bao giờ quyết giá/tiền/quyền.** Chi tiết: `40-data-sync.mdc`, `docs/AI_ORDER_AGENT_FEASIBILITY.md`.

## 7. Database
Thay đổi schema = migration mới, số tiếp theo (kiểm tra **không trùng số**), không sửa/xóa migration cũ. Bảng mới: RLS + index + `created_at/updated_at`. Sinh lại `database.types.ts`. Không chạy lệnh phá hủy/migration lên môi trường thật khi chưa được xác nhận. Chi tiết: `10-database.mdc`.

## 8. Test & Done
Test mới cho logic mới; **logic tiền/COD/đối soát coverage ≥ 90%**. Bắt buộc negative test: 401, 403, đối tượng ngoài quyền, input độc hại, webhook sai chữ ký/trùng event, race assign. Không còn `console.log`, `any`, `@ts-ignore`/`@ts-nocheck` mới, dead code, secret/PII.

## 9. Git
Nhánh `vankho`; không commit lên `main`. Conventional Commits. **AI không tự push/merge/deploy/force-push/chạy migration thật** khi chưa được yêu cầu rõ.

## 10. NEVER
Route không guard · tin role/userId/giá từ client · nối chuỗi vào `.ilike()/.or()`/SQL · spread body vào DB · hardcode terminal status/quyền/màu flag · gọi Pancake ngoài client+rate-limit · idempotency in-memory trên prod · so secret bằng `===` · import `admin.ts`/`server-only` vào client · sửa/xóa migration cũ · bảng không RLS · log/trả secret, stack, PII · AI quyết giá/ghi không duyệt · thêm `@ts-nocheck`/`any` · sửa test cho xanh · báo xong khi chưa chạy kiểm tra · thêm dependency/refactor ngoài phạm vi · im lặng khi thấy lỗ hổng.

## 11. Báo cáo cuối task (tiếng Việt, ngắn)
✅ Đã làm · 📁 File đổi · 🧪 lint/typecheck/test (kết quả thực) · 🛡️ guard/validate/audit/RLS đã áp · ⚠️ Giả định, rủi ro, hồi quy · ➡️ Bước tiếp.

## 12. Bản đồ rule (tự nạp theo file đang sửa)
`05-security` bảo mật sâu · `10-database` · `20-backend` · `30-frontend` · `40-data-sync` · `jnt-integration` · mẫu đặc tả: `docs/SPEC_TEMPLATE.md` (nạp khi cần bằng `@`).
