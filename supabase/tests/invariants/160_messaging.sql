-- =============================================================================
-- INVARIANT (decision 2h, migration 0011): homeowner to builder messaging, and
-- the four rules that keep it small.
--
--   1. Only a PAID homeowner may open a conversation, and only against a CLAIMED,
--      approved, active listing.
--   2. A builder can NEVER open a conversation.
--   3. A builder can only reply once a homeowner message exists.
--   4. A builder can never learn who the homeowner is and can never browse
--      homeowners.
--
-- Rule 2 is the one this suite spends the most on, because it is the rule the
-- whole marketplace design rests on (decision 8: "the homeowner initiates every
-- conversation") and because there are several ways to get it wrong: a second
-- INSERT policy, a widened column grant, or a builder inserting a message with
-- author = 'homeowner' to manufacture the homeowner turn that unlocks its reply.
--
-- Every assertion probes for the table first, so this file reports SKIP rather
-- than a false pass if 0011 is not applied.
-- =============================================================================
select t.suite('160 messaging (2h)');

do $$
declare
  v_claimed   uuid;
  v_unclaimed uuid := t.mk_builder();
  v_paid      uuid := t.mk_paid_homeowner();
  v_free      uuid := t.mk_account('homeowner');
  v_pa        uuid;
  v_builder_auth uuid;
  v_conv      uuid;
begin
  if not t.has_relation('public.builder_conversations') then
    perform t.skip('homeowner-opens-conversation',
      '2h: a homeowner starts a conversation from a claimed builder profile',
      'public.builder_conversations does not exist. Migration 0011 is not applied, so Phase 1 messaging is absent.');
    perform t.skip('builder-cannot-open-conversation',
      '2h: builders can never open a conversation',
      'migration 0011 is not applied; the messaging RLS cannot be asserted.');
    perform t.skip('builder-replies-only-after-homeowner',
      '2h: the builder may reply only once the conversation exists',
      'migration 0011 is not applied.');
    return;
  end if;

  v_claimed := t.mk_claimed_builder();
  v_pa := t.authid(v_paid);
  v_builder_auth := t.owner_authid(v_claimed);

  -- ── RULE 1: a paid homeowner opens a thread against a CLAIMED listing ─────
  perform t.assert_ok(
    'homeowner-opens-conversation',
    '2h: a homeowner starts a conversation from a CLAIMED builder profile',
    'authenticated', v_pa,
    format('insert into public.builder_conversations (builder_id) values (%L)', v_claimed),
    'a paying homeowner cannot open a conversation with a claimed builder, which is the whole of Phase 1 messaging');

  select id into v_conv from public.builder_conversations
   where builder_id = v_claimed and homeowner_user_id = v_paid;

  perform t.assert(
    'conversation-persisted',
    '2h: conversations persist inside ADUAtlas and the thread is the system of record',
    v_conv is not null,
    'the conversation was accepted but no row persisted, so ADUAtlas is not the system of record for the thread');

  perform t.assert_denied(
    'no-conversation-with-unclaimed',
    '2c and 2h: an unclaimed listing has no ability to start or hold a conversation with a homeowner',
    'authenticated', v_pa,
    format('insert into public.builder_conversations (builder_id) values (%L)', v_unclaimed),
    'a homeowner opened a conversation against an UNCLAIMED listing, so ADUAtlas is accepting messages for a company that has no account to read them and never agreed to receive them');

  perform t.assert_denied(
    'unpaid-cannot-open',
    '2a and 2h: messaging is behind the paid account',
    'authenticated', t.authid(v_free),
    format('insert into public.builder_conversations (builder_id) values (%L)', v_claimed),
    'a signed-in account that never paid can open a conversation with a builder');

  perform t.assert_denied(
    'anon-cannot-open',
    '2h: messaging is behind the paid account',
    'anon', null,
    format('insert into public.builder_conversations (builder_id) values (%L)', v_claimed),
    'an anonymous visitor can open a conversation with a builder');

  declare
    v_refunded uuid := t.mk_refunded_homeowner();
  begin
    perform t.assert_denied(
      'refunded-cannot-open',
      'entitlement is paid_at is not null AND refunded_at is null',
      'authenticated', t.authid(v_refunded),
      format('insert into public.builder_conversations (builder_id) values (%L)', v_claimed),
      'a refunded account can still open conversations with builders');
  end;

  declare
    v_draft uuid := t.mk_claimed_builder('{"profile_status": "draft"}'::jsonb);
    v_off   uuid := t.mk_claimed_builder('{"active": false}'::jsonb);
  begin
    perform t.assert_denied(
      'no-conversation-with-draft',
      '2h: a conversation is opened from a live profile only',
      'authenticated', v_pa,
      format('insert into public.builder_conversations (builder_id) values (%L)', v_draft),
      'a homeowner opened a conversation with a listing that is not approved');

    perform t.assert_denied(
      'no-conversation-with-inactive',
      '2h: a conversation is opened from a live profile only',
      'authenticated', v_pa,
      format('insert into public.builder_conversations (builder_id) values (%L)', v_off),
      'a homeowner opened a conversation with an inactive listing');
  end;

  -- ── RULE 2: a builder can NEVER open a conversation ──────────────────────
  declare
    v_other_b uuid := t.mk_claimed_builder();
    v_other_auth uuid := t.owner_authid(v_other_b);
  begin
    perform t.assert_denied(
      'builder-cannot-open-conversation',
      '2h: builders can never open a conversation',
      'authenticated', v_builder_auth,
      format('insert into public.builder_conversations (builder_id) values (%L)', v_claimed),
      'a builder account opened a conversation. Decision 8 and 2h: the homeowner initiates every conversation, and a builder that can open one is a builder cold-contacting homeowners');

    perform t.assert_denied(
      'builder-cannot-open-against-other',
      '2h: builders can never open a conversation',
      'authenticated', v_other_auth,
      format('insert into public.builder_conversations (builder_id) values (%L)', v_claimed),
      'a builder account opened a conversation on another builder''s listing');

    -- A builder cannot name a homeowner even if it knows the id: the column is
    -- not in the insert grant, so the attempt must be refused outright.
    perform t.assert_denied(
      'builder-cannot-name-homeowner',
      '2h: a builder cannot name a homeowner as the other party',
      'authenticated', v_builder_auth,
      format('insert into public.builder_conversations (builder_id, homeowner_user_id) values (%L, %L)', v_claimed, v_paid),
      'a builder account can write homeowner_user_id, which lets it manufacture a thread with any homeowner it can name');

    -- Nor can a homeowner open a thread in someone else's name.
    declare
      v_other_home uuid := t.mk_paid_homeowner();
    begin
      perform t.assert_denied(
        'homeowner-cannot-impersonate',
        '2h: a homeowner opens their own conversation and nobody else''s',
        'authenticated', v_pa,
        format('insert into public.builder_conversations (builder_id, homeowner_user_id) values (%L, %L)', v_other_b, v_other_home),
        'a homeowner can open a conversation in another homeowner''s name');
    end;

    -- Exactly one INSERT policy on the table. A second one is how rule 2 gets
    -- undone by a later migration that only meant to add a convenience.
    perform t.assert_count(
      'one-insert-policy',
      '2h: there is exactly one INSERT policy on builder_conversations, and it requires the caller to be the homeowner',
      'service_role', null,
      $q$select 1 from pg_policies
          where schemaname = 'public' and tablename = 'builder_conversations'
            and cmd = 'INSERT'$q$,
      1,
      'builder_conversations has more than one INSERT policy. Postgres ORs policies together, so a second one is a second way in and rule 2 no longer holds');
  end;

  -- ── RULE 3: a builder replies only after the homeowner has written ───────
  perform t.assert_denied(
    'builder-cannot-write-first',
    '2h: the builder may reply only once the conversation exists and the homeowner has written',
    'authenticated', v_builder_auth,
    format('insert into public.builder_messages (conversation_id, author, body) values (%L, ''builder'', ''Hello, want a quote?'')', v_conv),
    'a builder wrote the first message in a thread. The homeowner opened it, but the builder speaking first is the cold outreach 2h forbids');

  -- And it cannot forge the homeowner's turn to unlock its own reply.
  perform t.assert_denied(
    'builder-cannot-forge-homeowner-turn',
    '2h: neither side can forge the other''s author value',
    'authenticated', v_builder_auth,
    format('insert into public.builder_messages (conversation_id, author, body) values (%L, ''homeowner'', ''forged opening message'')', v_conv),
    'a builder inserted a message as the homeowner, manufacturing the homeowner turn that unlocks its own reply');

  perform t.assert_ok(
    'homeowner-writes-first',
    '2h: the homeowner starts the conversation',
    'authenticated', v_pa,
    format('insert into public.builder_messages (conversation_id, author, body) values (%L, ''homeowner'', ''I am planning a detached ADU.'')', v_conv),
    'the homeowner cannot write the first message on their own thread');

  perform t.assert_ok(
    'builder-replies-after',
    '2h: the builder may reply once the homeowner has written',
    'authenticated', v_builder_auth,
    format('insert into public.builder_messages (conversation_id, author, body) values (%L, ''builder'', ''Happy to help.'')', v_conv),
    'the builder cannot reply even after the homeowner has written, so the thread is one-way and useless');

  perform t.assert_denied(
    'homeowner-cannot-forge-builder-turn',
    '2h: neither side can forge the other''s author value',
    'authenticated', v_pa,
    format('insert into public.builder_messages (conversation_id, author, body) values (%L, ''builder'', ''forged builder reply'')', v_conv),
    'a homeowner inserted a message as the builder');

  -- ── RULE 4: a builder never learns who the homeowner is ──────────────────
  perform t.assert_denied(
    'homeowner-id-not-readable-by-builder',
    '2h and 5.6: a builder must never learn who the homeowner is',
    'authenticated', v_builder_auth,
    'select homeowner_user_id from public.builder_conversations',
    'a builder account can read homeowner_user_id off the conversation, which hands it the homeowner''s identity and, joined onward, the homeowner database');

  perform t.assert_denied(
    'homeowner-id-not-readable-by-homeowner',
    '2h: homeowner_user_id is not granted to any client',
    'authenticated', v_pa,
    'select homeowner_user_id from public.builder_conversations',
    'homeowner_user_id is readable by a client at all; it is not in the select grant and must stay out of it');

  perform t.assert_count(
    'builder-sees-only-own-threads',
    '2h: builders can never browse homeowners',
    'authenticated', v_builder_auth,
    'select 1 from public.builder_conversations',
    1,
    'a builder account can see conversations beyond the ones on the listing it owns, which is a homeowner list by another name');

  declare
    v_stranger uuid := t.mk_claimed_builder();
  begin
    perform t.assert_count(
      'unrelated-builder-sees-nothing',
      '2h: builders can never browse homeowners',
      'authenticated', t.owner_authid(v_stranger),
      'select 1 from public.builder_conversations',
      0,
      'a builder with no conversations can see somebody else''s');

    perform t.assert_count(
      'unrelated-builder-reads-no-messages',
      '2h: builders can never browse homeowners',
      'authenticated', t.owner_authid(v_stranger),
      'select 1 from public.builder_messages',
      0,
      'a builder can read messages on a thread it is not a participant in');
  end;

  declare
    v_nosy uuid := t.mk_paid_homeowner();
  begin
    perform t.assert_count(
      'other-homeowner-sees-nothing',
      '2h: a thread is private to its two participants',
      'authenticated', t.authid(v_nosy),
      'select 1 from public.builder_conversations',
      0,
      'a homeowner can see another homeowner''s conversation with a builder');

    perform t.assert_count(
      'other-homeowner-reads-no-messages',
      '2h: a thread is private to its two participants',
      'authenticated', t.authid(v_nosy),
      'select 1 from public.builder_messages',
      0,
      'a homeowner can read another homeowner''s messages');
  end;

  -- Losing the claim takes the builder's access to the thread with it, the same
  -- way it takes the Verified badge.
  declare
    v_lost_auth uuid := v_builder_auth;
  begin
    update public.builders set owner_user_id = null where id = v_claimed;
    perform t.assert_count(
      'lost-claim-loses-thread',
      '2h: a claim that is given up takes the builder''s access to the thread with it',
      'authenticated', v_lost_auth,
      'select 1 from public.builder_conversations',
      0,
      'an account that no longer owns the listing can still read the conversations that belonged to it');
  end;

  -- ── the thread is a record, not a draft ─────────────────────────────────
  perform t.assert_denied(
    'body-not-editable',
    '2h: the ADUAtlas thread is the system of record',
    'authenticated', v_pa,
    format('update public.builder_messages set body = ''rewritten'' where conversation_id = %L', v_conv),
    'a participant can rewrite a message body after sending, so the thread is not a record of what was said');

  perform t.assert_denied(
    'messages-not-deletable',
    '2h: the ADUAtlas thread is the system of record',
    'authenticated', v_pa,
    format('delete from public.builder_messages where conversation_id = %L', v_conv),
    'a participant can delete messages from the thread');

  perform t.assert_denied(
    'conversation-not-deletable',
    '2h: the ADUAtlas thread is the system of record',
    'authenticated', v_pa,
    format('delete from public.builder_conversations where id = %L', v_conv),
    'a participant can delete the conversation');

  perform t.assert_denied(
    'notified-at-not-writable',
    '2h: email notifies that a message is waiting and is not the channel itself',
    'authenticated', v_pa,
    format('update public.builder_messages set notified_at = now() where conversation_id = %L', v_conv),
    'a client can write notified_at, which is delivery bookkeeping and belongs to whatever sends the email');

  -- Marking the other side's message read IS allowed, and only that column.
  perform t.assert_ok(
    'can-mark-read',
    '2h: a participant may mark the other side''s message read',
    'authenticated', v_pa,
    format('update public.builder_messages set read_at = now() where conversation_id = %L and author = ''builder''', v_conv),
    'a homeowner cannot mark the builder''s message as read');

  -- ── opening a thread records builder_contacted, once a day ──────────────
  perform t.assert_count(
    'conversation-records-contact',
    '5.6: messaging or requesting an introduction records builder contacted',
    'service_role', null,
    format('select 1 from public.referral_events where builder_id = %L and kind = ''builder_contacted''', v_claimed),
    1,
    'opening a conversation did not record a builder_contacted event, so the marketplace count misses the contact it is supposed to measure');

  -- ── it is a message thread, not a chat product ──────────────────────────
  perform t.assert_count(
    'no-chat-product-columns',
    '2h: this is a message thread, not a chat product: no presence, no typing indicators, no group conversations',
    'service_role', null,
    $q$select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name in ('builder_conversations', 'builder_messages')
          and (column_name ilike '%typing%' or column_name ilike '%presence%'
               or column_name ilike '%online%' or column_name ilike '%attachment%')$q$,
    0,
    'a presence, typing or attachment column appeared on the messaging tables; 2h keeps this deliberately small');

  perform t.assert_count(
    'one-thread-per-pair',
    '2h: one thread per builder and homeowner; no group conversations',
    'service_role', null,
    $q$select 1 from pg_indexes
        where schemaname = 'public' and tablename = 'builder_conversations'
          and indexdef ilike '%unique%'
          and indexdef ilike '%builder_id%'
          and indexdef ilike '%homeowner_user_id%'$q$,
    1,
    'the (builder, homeowner) pair is not unique, so one homeowner can hold several threads with one builder and the pair is no longer the thread');
end
$$;
