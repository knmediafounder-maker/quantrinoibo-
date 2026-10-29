---
name: frontend-design
description: Design and build distinctive, production-grade frontend interfaces with high design quality. Use when building, restyling, or beautifying any web UI in this repo — pages, components, dashboards, forms, tables, landing pages, React components, layouts — or when the user asks for beautiful, modern, or premium UI.
---

# Frontend Design

Thiet ke giao dien dang nho, chay duoc that, tranh kieu "AI slop" dai tra.

## 1. Design thinking (lam truoc khi code)

1. **Purpose**: giao dien nay giai quyet van de gi, ai dung?
2. **Tone**: chot 1 huong tham my RO: toi gian cuc doan, maximalist, retro-futuristic, organic, luxury, playful, editorial, brutalist, art deco, pastel, industrial... Khong pha tron nua voi.
3. **Constraints**: xem muc 3 (rang buoc repo nay).
4. **Differentiation**: 1 diem nguoi xem se nho la gi?

## 2. Quy tac tham my

- **Typography**: 1 display font co ca tinh + 1 body font tinh te (qua `next/font`). Tranh font dai tra (Arial, Inter, Roboto, system font) cho man hinh can an tuong.
- **Color & Theme**: bang mau co chu dich, dung CSS variables / design token. Mau chu dao manh + accent sac net. Cam gradient tim tren nen trang kieu cliché.
- **Motion**: 1 page-load dan dung tot (staggered reveals + `animation-delay`) hon nhieu hieu ung roi rac. Uu tien CSS-only; React thi dung Motion khi co san. Co hover/scroll gay bat ngo, ton trong `prefers-reduced-motion`.
- **Composition**: layout bat ngo — bat doi xung, overlap, diagonal flow, pha grid — HOAC negative space rong co kiem soat.
- **Backgrounds & Details**: tao atmosphere/chieu sau thay vi mau phang — gradient mesh, noise, pattern hinh hoc, transparency nhieu lop, shadow kich tinh, grain overlay.

## 3. Rang buoc repo nay (uu tien hon skill goc)

- Khong co `index.html`. Next.js App Router: entry la `page.tsx` (`src/app/(dashboard)/<module>/page.tsx`).
- Dung Tailwind theo **design token** hien co; khong rai gia tri tuy y (`#abc`, `w-[123px]`) khi da co token.
- Component tuong tac dung Radix UI; tuan thu `30-frontend.mdc` (server-first, `"use client"` xuong la, du loading/empty/error/success, mobile-first 360/768/1280, a11y WCAG 2.2 AA).
- UI text **tieng Viet**; code/comment tieng Anh hoac tieng Viet khong dau.
- He thong noi bo: man hinh nghiep vu (bang, form, van kho) uu tien nhat quan + de doc; chi bung tham my manh o man hinh can an tuong (dashboard, login, landing, poster).

## 4. Checklist truoc khi xong

- [ ] Da chot tone + diem nhan truoc khi code
- [ ] Khong font dai tra, khong gradient tim cliché, khong layout de doan
- [ ] Dung token, Radix, `next/font`/`next/image`; khong gia tri cung
- [ ] Du trang thai loading/empty/error/success; text tieng Viet
- [ ] Responsive 360/768/1280; a11y co ban (label, focus, tuong phan)
