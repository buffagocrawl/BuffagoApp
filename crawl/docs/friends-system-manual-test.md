# Friends System: Deploy and Manual Verification

## Deploy

1. Apply `supabase/migrations/20260623190000_add_friends_system.sql` in the Supabase SQL editor.
2. Confirm the migration commits successfully and that all new functions are executable by `authenticated`.
3. Build/reload the Expo app. No package change is required.
4. Test with at least three non-admin accounts: Alice, Bob, and Casey.

QR generation uses the existing `react-native-qrcode-svg` dependency. The QR value is a revocable UUID invite code and a `buffago://friends/add?code=...` deep link. The phone's system camera can open the deep link. An in-app camera scanner was not added because `expo-camera` is not currently installed; the Friends UI also provides manual code entry.

## Friend lifecycle

- Alice searches Bob by partial username and display name.
- Alice searches Bob by exact email. Verify no email is displayed or logged.
- Alice sends Bob a request. Repeating the send must not create a duplicate.
- Bob opens Social. Verify the Social badge and Pending badge increment once.
- Bob opens Pending Invites. Verify the request badge clears and the invite remains actionable.
- Bob accepts. Verify both users see each other under Friends.
- Repeat with Casey and verify decline removes the request.
- Send another request and verify the sender can cancel it.
- Have Alice and Bob send requests at nearly the same time. Verify the crossing request becomes an accepted friendship.
- Remove a friend and verify the friendship disappears for both users and from an open Friends feed after refresh.

## Blocking

- Block an accepted friend. Verify the friendship is removed atomically.
- Verify the blocked pair cannot find each other in search, send requests, view friend feed activity, or open the other profile through app surfaces.
- Open Friends > Blocked Users and unblock. Verify search and friend-request eligibility return.

## Entry points

- Open a user from Social Feed and verify Add Friend/status actions appear on the profile.
- Open a user from Leaderboards and verify the same behavior.
- Open a crawl peer or crawl leaderboard finisher and verify the profile opens with `source_surface=crawl`.
- Verify no Add Friend action appears for self, opted-out users, blocked users, or an existing friend.

## Feed and leaderboards

- In Social Feed, verify State and All are unchanged.
- Select Friends. Verify it includes the current user plus accepted friends only.
- Verify pending, declined, removed, blocked, deactivated, and opted-out users are excluded.
- Verify the empty state reads: “Your friends haven’t rated wings here yet.”
- In Leaderboards, verify State, All, and Friends load.
- Verify Friends calculations use only the current user and accepted friends.
- Create a rating while a friend's feed is open. Refresh and verify it appears.
- Remove/block the rating author, refresh, and verify it disappears.

## Privacy

- Enable Hide From Social for Bob.
- Verify Bob disappears from public feeds, leaderboards, friend search, Friends feed, Friends leaderboard, and profile friend actions.
- Verify Bob's existing friendships remain stored but do not expose activity while opted out.
- Disable opt-out and verify eligible social surfaces work again.
- Confirm raw email values do not appear in `user_events` metadata.

## Badges

- Create two incoming invites and three friend ratings after the last seen timestamp.
- Verify Social shows a total badge of five without double counting.
- Open Pending Invites and verify only the invite portion clears.
- Open Friends or the Friends feed and verify friend activity clears.
- Repeat concurrently on two devices and verify counts remain non-negative and converge after refresh.

## QR

- Open My Friend QR and share it.
- Scan with the system camera on a device with BuffaGo installed.
- Verify the deep link resolves to the safe public profile and can send a request.
- Verify invalid, rotated, opted-out, blocked, and self codes do not resolve.

## RLS / authorization

Using two authenticated SQL/JWT sessions:

- Verify a user can select only friendship rows where they are requester or addressee.
- Verify a user can select only blocks they created.
- Verify a user can select only their own read-state and invite-code rows.
- Verify direct insert/update/delete on all four Friends tables is denied.
- Verify mutation RPCs reject self-targets, unrelated requests, cancelled requests, blocked pairs, and opted-out users.
- Verify accepting an already-cancelled request returns `friend_request_not_pending`.

## Analytics

Confirm the expected events arrive in `user_events`, with IDs/source metadata but no raw search text or email:

`friends_tab_opened`, `friend_search_started`, `friend_search_results_viewed`, `friend_profile_opened`,
`friend_request_send_attempt`, `friend_request_sent`, `friend_request_send_failed`,
`friend_request_received_viewed`, `friend_request_accepted`, `friend_request_declined`,
`friend_request_cancelled`, `friend_removed`, `user_blocked`, `user_unblocked`,
`friends_filter_selected_social_feed`, `friends_filter_selected_leaderboard`,
`friends_feed_loaded`, `friends_feed_empty`, `friends_leaderboard_loaded`,
`social_badge_viewed`, `social_badge_cleared`, `friend_qr_opened`,
`friend_qr_scanned`, `friend_qr_scan_failed`, `social_opt_out_enabled`, and
`social_opt_out_disabled`.
