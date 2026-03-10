-- Curated Answers Table
-- Stores admin-reviewed Q&A pairs for faster, consistent responses
-- Questions with thumbs up answers are prioritized in chat

CREATE TABLE IF NOT EXISTS public.curated_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question text NOT NULL,
  answer text NOT NULL,
  source_message_id uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  rating_status text NOT NULL DEFAULT 'unreviewed' CHECK (rating_status IN ('thumbs_up', 'thumbs_down', 'unreviewed')),
  is_active boolean DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.curated_answers ENABLE ROW LEVEL SECURITY;

-- Only admins can manage curated answers (via service role in API routes)
-- Regular users can read active thumbs_up answers
DROP POLICY IF EXISTS "curated_answers_select_active" ON public.curated_answers;
CREATE POLICY "curated_answers_select_active" ON public.curated_answers 
FOR SELECT USING (is_active = true AND rating_status = 'thumbs_up');

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_curated_answers_question ON public.curated_answers USING gin(to_tsvector('english', question));
CREATE INDEX IF NOT EXISTS idx_curated_answers_rating ON public.curated_answers(rating_status) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_curated_answers_active ON public.curated_answers(is_active) WHERE is_active = true;
