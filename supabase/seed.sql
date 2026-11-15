-- Local development only. Replace owner@example.com with your own address locally (the
-- local stack's mail goes to Mailpit at http://127.0.0.1:54324, not to a real inbox).
insert into public.invites (email, role) values
  ('owner@example.com', 'owner'),
  ('friend@example.com', 'member');
