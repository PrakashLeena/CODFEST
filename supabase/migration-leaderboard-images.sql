-- Migration: Add leaderboard_images table for admin score screenshots
create table if not exists leaderboard_images (
  id uuid primary key default gen_random_uuid(),
  title text,
  image_url text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_leaderboard_images_created on leaderboard_images(created_at desc);

alter table leaderboard_images enable row level security;
