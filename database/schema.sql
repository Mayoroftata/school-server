create extension if not exists "uuid-ossp";

create type user_role as enum ('principal', 'admin', 'teacher', 'student');
create type student_track as enum ('junior', 'science', 'commercial', 'art');
create type payment_status as enum ('successful', 'failed', 'pending');
create type complaint_status as enum ('open', 'in_review', 'resolved');

create table users (
  id uuid primary key default uuid_generate_v4(),
  email text unique not null,
  password_hash text,
  role user_role not null,
  created_at timestamptz not null default now()
);

create table academic_sessions (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  starts_on date not null,
  ends_on date not null
);

create table terms (
  id uuid primary key default uuid_generate_v4(),
  academic_session_id uuid not null references academic_sessions(id),
  name text not null check (name in ('First Term', 'Second Term', 'Third Term')),
  starts_on date not null,
  ends_on date not null
);

create table classes (
  id uuid primary key default uuid_generate_v4(),
  name text unique not null,
  level text not null check (level in ('JS1', 'JS2', 'JS3', 'SS1', 'SS2', 'SS3')),
  track student_track not null,
  sort_order int not null
);

create table subjects (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  track student_track not null,
  is_common boolean not null default false
);

create table teachers (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid unique references users(id),
  name text not null,
  surname text not null,
  email text unique not null,
  phone text,
  subject_id uuid references subjects(id),
  class_id uuid references classes(id),
  role_title text not null,
  documentation text,
  created_at timestamptz not null default now()
);

create table students (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid unique references users(id),
  admission_no text unique not null,
  name text not null,
  class_id uuid not null references classes(id),
  arm text not null,
  track student_track not null,
  guardian_name text not null,
  documentation text,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table teacher_allocations (
  id uuid primary key default uuid_generate_v4(),
  teacher_id uuid not null references teachers(id),
  class_id uuid not null references classes(id),
  subject_id uuid references subjects(id),
  role_title text not null,
  unique (teacher_id, class_id, subject_id, role_title)
);

create table scores (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid not null references students(id),
  subject_id uuid not null references subjects(id),
  term_id uuid not null references terms(id),
  test_score numeric(5,2) not null check (test_score between 0 and 40),
  exam_score numeric(5,2) not null check (exam_score between 0 and 60),
  total_score numeric(5,2) not null check (total_score between 0 and 100),
  remark text,
  finalized boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (student_id, subject_id, term_id)
);

create table fee_payments (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid not null references students(id),
  term_id uuid not null references terms(id),
  amount numeric(12,2) not null,
  method text,
  status payment_status not null default 'pending',
  reference text unique,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table complaints (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid references students(id),
  text text not null,
  status complaint_status not null default 'open',
  created_at timestamptz not null default now()
);

create table login_otps (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id),
  otp_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
