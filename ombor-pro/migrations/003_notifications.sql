-- OMBOR PRO: bildirishnomalar markazi va foydalanuvchi sozlamalari

-- Har bir bildirishnoma bir marta yaratiladi: dedup_key takrorlanishga yo'l qo'ymaydi
CREATE TABLE notifications (
  id BIGSERIAL PRIMARY KEY,
  kind TEXT NOT NULL,
  type_group TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('info', 'success', 'warning', 'critical')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  link TEXT,
  audience TEXT[] NOT NULL DEFAULT '{}',
  data JSONB,
  dedup_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notifications_created_idx ON notifications (created_at DESC, id DESC);
CREATE INDEX notifications_kind_idx ON notifications (kind, created_at DESC);

CREATE TABLE notification_reads (
  notification_id BIGINT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id),
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_id, user_id)
);

-- Tashqi kanallarga (Telegram) yuborish: har bir xabar har bir manzilga faqat bir marta
CREATE TABLE notification_deliveries (
  id BIGSERIAL PRIMARY KEY,
  notification_id BIGINT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  target TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  attempts INT NOT NULL DEFAULT 0,
  error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (notification_id, channel, target)
);

-- Shaxsiy sozlamalar: bosh sahifa vidjetlari, hisobot afzalliklari, bildirishnoma tanlovlari
CREATE TABLE user_preferences (
  user_id INT PRIMARY KEY REFERENCES users(id),
  prefs JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
