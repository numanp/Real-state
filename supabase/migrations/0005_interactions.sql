-- =====================================================================
-- 0005_interactions.sql — Reel Estate
-- User interaction edges: likes, folders, folder_items.
-- Authenticated-only, per-owner. RLS enabled here; policies in 0008.
-- Counter + integrity triggers in 0007.
-- =====================================================================

-- ---------------------------------------------------------------------
-- likes — user↔property edge (swipe right). Idempotent composite PK.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.likes (
  user_id      uuid NOT NULL REFERENCES public.profiles   (id) ON DELETE CASCADE,
  property_id  uuid NOT NULL REFERENCES public.properties (id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, property_id)
);

-- PK already serves "my likes" (user_id leading). Reverse index for count maintenance.
CREATE INDEX IF NOT EXISTS likes_property_idx ON public.likes (property_id);

ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.likes FORCE  ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------
-- folders — user-owned named collections (soft-delete).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.folders (
  id          uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  is_default  boolean NOT NULL DEFAULT false,
  item_count  integer NOT NULL DEFAULT 0 CHECK (item_count >= 0),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

CREATE INDEX IF NOT EXISTS folders_user_idx ON public.folders (user_id);

-- Name unique per user among live folders (name frees on soft-delete)
CREATE UNIQUE INDEX IF NOT EXISTS folders_user_name_uq
  ON public.folders (user_id, lower(name)) WHERE deleted_at IS NULL;

-- Exactly one default ("Favorites") folder per user
CREATE UNIQUE INDEX IF NOT EXISTS folders_user_default_uq
  ON public.folders (user_id) WHERE is_default;

ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.folders FORCE  ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------
-- folder_items — JOIN TABLE (property↔folder, the "save" action).
-- Denormalized user_id for FLAT RLS (must equal folders.user_id;
-- integrity guaranteed by owns_folder() WITH CHECK on INSERT, 0008).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.folder_items (
  folder_id    uuid NOT NULL REFERENCES public.folders    (id) ON DELETE CASCADE,
  property_id  uuid NOT NULL REFERENCES public.properties (id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES public.profiles   (id) ON DELETE CASCADE,  -- denormalized owner
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (folder_id, property_id)
);

-- Drives "which of my folders" + distinct save_count logic (user_id leading)
CREATE INDEX IF NOT EXISTS folder_items_user_property_idx
  ON public.folder_items (user_id, property_id);

-- Reverse index for save_count maintenance
CREATE INDEX IF NOT EXISTS folder_items_property_idx
  ON public.folder_items (property_id);

ALTER TABLE public.folder_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.folder_items FORCE  ROW LEVEL SECURITY;
