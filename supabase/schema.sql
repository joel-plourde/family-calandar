create schema if not exists family_private;
revoke all on schema family_private from public, anon, authenticated;
grant usage on schema family_private to service_role;
create table family_private.invitation (
  singleton boolean primary key default true check(singleton),
  token_hash bytea not null,
  expires_at timestamptz not null
);
create table family_private.reservation (
  id uuid primary key default gen_random_uuid(),
  day date not null check(day between date '2027-01-18' and date '2027-02-14'),
  slot smallint not null check(slot in (1,2)),
  name text not null check(char_length(btrim(name)) between 1 and 80),
  arrival integer not null check(arrival between 480 and 1260 and arrival % 30 = 0),
  departure integer not null check(departure between 480 and 1260 and departure % 30 = 0 and departure > arrival),
  cancel_hash bytea, -- Legacy field; unused for family cancellations
  unique(day,slot)
);
create table family_private.rate_limit (
  bucket timestamptz primary key, hits integer not null
);
alter table family_private.invitation enable row level security;
alter table family_private.reservation enable row level security;
alter table family_private.rate_limit enable row level security;
grant select, insert, update, delete on all tables in schema family_private to service_role;
create function public.family_calendar(p_token text, p_action text, p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_day date; v_name text; v_arr integer; v_dep integer; v_slot smallint;
  v_id uuid; v_hits integer; v_bucket timestamptz := date_trunc('minute',now());
  v_rows jsonb;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' or not exists (
    select 1 from family_private.invitation where token_hash = sha256(convert_to(p_token,'UTF8')) and expires_at > now()
  ) then return jsonb_build_object('error','invalid_invitation','status',403); end if;
  insert into family_private.rate_limit(bucket,hits) values(v_bucket,1)
    on conflict(bucket) do update set hits = family_private.rate_limit.hits + 1
    returning hits into v_hits;
  if v_hits > 180 then return jsonb_build_object('error','rate_limit','status',429); end if;
  delete from family_private.rate_limit where bucket < v_bucket - interval '1 hour';
  if p_action = 'book' then
    begin
      v_day := (p_payload->>'day')::date;
      v_name := btrim(p_payload->>'name');
      v_arr := (p_payload->>'arrival')::integer;
      v_dep := (p_payload->>'departure')::integer;
    exception when others then return jsonb_build_object('error','invalid_input','status',400); end;
    if v_day is null or v_day not between date '2027-01-18' and date '2027-02-14'
      or v_name is null or char_length(v_name) not between 1 and 80
      or v_arr is null or v_dep is null or v_arr not between 480 and 1260 or v_dep not between 480 and 1260
      or v_arr % 30 <> 0 or v_dep % 30 <> 0 or v_dep <= v_arr
    then return jsonb_build_object('error','invalid_input','status',400); end if;
    perform pg_advisory_xact_lock(947213, v_day - date '2027-01-18');
    select s into v_slot from (values (1),(2)) as slots(s)
      where not exists(select 1 from family_private.reservation r where r.day=v_day and r.slot=s) order by s limit 1;
    if v_slot is null then return jsonb_build_object('error','full','status',409); end if;
    insert into family_private.reservation(day,slot,name,arrival,departure)
      values(v_day,v_slot,v_name,v_arr,v_dep) returning id into v_id;
  elsif p_action = 'cancel' then
    begin v_id := (p_payload->>'id')::uuid;
    exception when others then return jsonb_build_object('error','invalid_input','status',400); end;
    if v_id is null
      then return jsonb_build_object('error','invalid_input','status',400); end if;
    delete from family_private.reservation where id=v_id;
    if not found then return jsonb_build_object('error','invalid_cancel','status',404); end if;
  elsif p_action is distinct from 'list' then return jsonb_build_object('error','invalid_input','status',400);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'day',day,'name',name,'arrival',arrival,'departure',departure) order by day,arrival,slot),'[]'::jsonb)
    into v_rows from family_private.reservation;
  return jsonb_build_object('reservations',v_rows,'id',v_id);
end; $$;
revoke all on function public.family_calendar(text,text,jsonb) from public, anon, authenticated;
grant execute on function public.family_calendar(text,text,jsonb) to service_role;
