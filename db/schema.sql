create table if not exists users (
  id serial primary key,
  email text unique not null,
  password_hash text not null
);

create table if not exists categories (
  id serial primary key,
  user_id int not null references users on delete cascade,
  name text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, name)
);

create table if not exists tags (
  id serial primary key,
  user_id int not null references users on delete cascade,
  name text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, name)
);

create table if not exists accounts (
  id serial primary key,
  user_id int not null references users on delete cascade,
  category_id int references categories on delete set null,
  description text not null,
  amount numeric(12,2) not null check (amount >= 0),
  due_date date not null,
  recurrence text not null default 'none' check (recurrence in ('none','weekly','monthly','yearly')),
  paid boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists accounts_user_due on accounts (user_id, due_date);

create table if not exists account_tags (
  account_id int references accounts on delete cascade,
  tag_id int references tags on delete cascade,
  primary key (account_id, tag_id)
);
