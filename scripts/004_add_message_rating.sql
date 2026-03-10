-- Add rating column to chat_messages for thumbs up/down feedback
ALTER TABLE public.chat_messages 
ADD COLUMN IF NOT EXISTS rating smallint CHECK (rating IN (-1, 0, 1)) DEFAULT 0;

-- Add index for analyzing ratings
CREATE INDEX IF NOT EXISTS idx_chat_messages_rating ON public.chat_messages(rating) WHERE rating != 0;

-- Update policy to allow updating ratings
DROP POLICY IF EXISTS "chat_messages_update_own" ON public.chat_messages;
CREATE POLICY "chat_messages_update_own" ON public.chat_messages 
FOR UPDATE USING (auth.uid() = user_id);
