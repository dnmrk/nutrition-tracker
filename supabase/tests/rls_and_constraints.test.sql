begin;
select plan(17);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.test');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select lives_ok($$ insert into public.meals (id, eaten_on, items) values ('aaaaaaaa-0000-0000-0000-000000000001', '2026-10-20', '[{"name":"Rice","grams":150,"calories":195,"protein_g":4,"carbs_g":42,"fat_g":0.4}]') $$, 'A inserts own meal');
select lives_ok($$ insert into public.meals (id, eaten_on, items) values ('aaaaaaaa-0000-0000-0000-000000000001', '2026-10-20', '[{"name":"Rice","grams":150,"calories":195,"protein_g":4,"carbs_g":42,"fat_g":0.4}]') on conflict (id) do nothing $$, 'retry with same id is a no-op');
select is((select count(*) from public.meals), 1::bigint, 'exactly one row after retry');
select throws_ok($$ insert into public.meals (eaten_on, items, user_id) values ('2026-10-20', '[{"name":"x","grams":1,"calories":1,"protein_g":0,"carbs_g":0,"fat_g":0}]', '22222222-2222-2222-2222-222222222222') $$, '42501', null, 'A cannot insert a meal for B (WITH CHECK)');
select throws_ok($$ insert into public.meals (eaten_on, items) values ('2026-10-20', '[]') $$, '23514', null, 'empty items rejected');
select throws_ok($$ insert into public.meals (eaten_on, items) values ('2026-10-20', '[{"name":"x","grams":"12","calories":1,"protein_g":0,"carbs_g":0,"fat_g":0}]') $$, '23514', null, 'string number rejected without cast error');
select throws_ok($$ insert into public.meals (eaten_on, items) values ('2026-10-20', '[{"name":"x","grams":1,"calories":10001,"protein_g":0,"carbs_g":0,"fat_g":0}]') $$, '23514', null, 'calories above 10000 rejected');
select throws_ok($$ insert into public.meals (eaten_on, items) values ('2026-10-20', '[{"name":"x","grams":1,"calories":1,"protein_g":0,"carbs_g":0}]') $$, '23514', null, 'missing fat_g rejected');
select throws_ok($$ insert into public.meals (eaten_on, items) values ('2026-10-20', '{"name":"x"}') $$, '23514', null, 'non-array rejected');
select lives_ok($$ insert into public.daily_targets (calorie_target, protein_target_g, carbs_target_g, fat_target_g) values (10000, 1000, 0, 0) on conflict (user_id) do update set calorie_target = excluded.calorie_target $$, 'A upserts targets at boundary');
select throws_ok($$ insert into public.daily_targets (calorie_target, protein_target_g, carbs_target_g, fat_target_g) values (0, 0, 0, 0) on conflict (user_id) do update set calorie_target = excluded.calorie_target $$, '23514', null, 'calorie_target 0 rejected');
select throws_ok($$ delete from public.meals $$, '42501', null, 'no delete privilege');
select throws_ok($$ update public.daily_targets set user_id = '22222222-2222-2222-2222-222222222222' $$, '42501', null, 'A cannot hand targets row to B (UPDATE WITH CHECK)');

select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select is((select count(*) from public.meals), 0::bigint, 'B cannot see A meals');
select is((select count(*) from public.daily_targets), 0::bigint, 'B cannot see A targets');
update public.daily_targets set calorie_target = 5;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select is((select calorie_target from public.daily_targets), 10000, 'B update did not touch A targets (USING)');

reset role;
set local role anon;
select throws_ok($$ select * from public.meals $$, '42501', null, 'anon has no table privilege');

select * from finish();
rollback;
