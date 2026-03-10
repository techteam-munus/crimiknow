-- ============================================
-- Add INSERT/UPDATE RLS policies for payment_history
-- Users can insert their own payment records
-- Users can view their own payment records (already exists)
-- Admins get full access
-- ============================================

-- Users can insert their own payment records
DROP POLICY IF EXISTS "payments_insert_own" ON public.payment_history;
CREATE POLICY "payments_insert_own" ON public.payment_history
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own payment records
DROP POLICY IF EXISTS "payments_update_own" ON public.payment_history;
CREATE POLICY "payments_update_own" ON public.payment_history
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admin full access policies
DROP POLICY IF EXISTS "payments_admin_select" ON public.payment_history;
CREATE POLICY "payments_admin_select" ON public.payment_history
  FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "payments_admin_insert" ON public.payment_history;
CREATE POLICY "payments_admin_insert" ON public.payment_history
  FOR INSERT
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "payments_admin_update" ON public.payment_history;
CREATE POLICY "payments_admin_update" ON public.payment_history
  FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "payments_admin_delete" ON public.payment_history;
CREATE POLICY "payments_admin_delete" ON public.payment_history
  FOR DELETE
  USING (public.is_admin());
