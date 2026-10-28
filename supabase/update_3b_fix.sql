-- Sửa lỗi: chặn người chưa đăng nhập gọi số liệu tổng công ty. Chạy 1 lần trong SQL Editor.
create or replace function public.kpi_company(p_from date, p_to date, p_by_day boolean default false)
returns table (d date, raw jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(public.my_role() not in ('admin', 'leader'), true) then raise exception 'Không có quyền xem'; end if;
  return query
  with o as (
    select case when p_by_day then order_date end as d, jsonb_build_object(
      'orders', count(*) filter (where is_closed),
      'revenue', coalesce(sum(total_price) filter (where is_closed), 0),
      'cancelled', count(*) filter (where status = 6),
      'sent', count(*) filter (where is_sent),
      'shipping', count(*) filter (where is_shipping),
      'delivered', count(*) filter (where is_delivered),
      'real_revenue', coalesce(sum(total_price) filter (where is_delivered), 0),
      'returned', count(*) filter (where is_returned)) as raw
    from orders where order_date between p_from and p_to group by 1
  ),
  a as (
    select case when p_by_day then date end as d,
           jsonb_build_object('spend', sum(spend), 'messages', sum(messages)) as raw
    from ad_daily where date between p_from and p_to group by 1
  )
  select x.d, public.jsonb_sum_agg(x.raw) from (select * from o union all select * from a) x
  group by x.d order by x.d nulls first;
end $$;

-- Các hàm số liệu chỉ dành cho người đã đăng nhập
revoke execute on function public.kpi_company(date, date, boolean) from public, anon;
revoke execute on function public.kpi_people(date, date, text) from public, anon;
revoke execute on function public.kpi_daily(date, date, text, uuid) from public, anon;
revoke execute on function public.rank_board(date, date, text) from public, anon;
grant execute on function public.kpi_company(date, date, boolean), public.kpi_people(date, date, text),
  public.kpi_daily(date, date, text, uuid), public.rank_board(date, date, text) to authenticated;
