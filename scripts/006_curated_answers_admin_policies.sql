-- Add RLS policies for admins on curated_answers table
-- Admins can perform all operations, regular users can only read active approved answers

-- Admin can SELECT all rows (not just active/thumbs_up)
DROP POLICY IF EXISTS "curated_answers_admin_select" ON public.curated_answers;
CREATE POLICY "curated_answers_admin_select" ON public.curated_answers
FOR SELECT USING (public.is_admin());

-- Admin can INSERT
DROP POLICY IF EXISTS "curated_answers_admin_insert" ON public.curated_answers;
CREATE POLICY "curated_answers_admin_insert" ON public.curated_answers
FOR INSERT WITH CHECK (public.is_admin());

-- Admin can UPDATE
DROP POLICY IF EXISTS "curated_answers_admin_update" ON public.curated_answers;
CREATE POLICY "curated_answers_admin_update" ON public.curated_answers
FOR UPDATE USING (public.is_admin());

-- Admin can DELETE
DROP POLICY IF EXISTS "curated_answers_admin_delete" ON public.curated_answers;
CREATE POLICY "curated_answers_admin_delete" ON public.curated_answers
FOR DELETE USING (public.is_admin());
