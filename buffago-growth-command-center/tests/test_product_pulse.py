import unittest
from models import Snapshot


class ProductPulseTests(unittest.TestCase):
    def test_new_fields_and_legacy_fields_coexist(self):
        s = Snapshot.from_payload({'product_pulse': {
            'device_opens': {'all_time': {'total': 7, 'ios': 2, 'android': 5},
                             'last_24h': {'total': 3, 'ios': 1, 'android': 2},
                             'previous_24h': {'total': 0, 'ios': 0, 'android': 0}},
            'pending_photos': {'total': 0}, 'active_users': {'last_24h': 12}}})
        self.assertEqual(s.device_all_time.total, 7)
        self.assertEqual(s.device_last_24h.breakdown, 'iOS 1  •  Android 2')
        self.assertEqual(s.device_previous_24h.total, 0)
        self.assertEqual(s.pending_photos, 0)
        self.assertEqual(s.users.current, 12)

    def test_growth_pulse_fields_parse_and_preserve_legacy_fields(self):
        s = Snapshot.from_payload({'product_pulse': {
            'device_opens': {'all_time': {'total': 3, 'ios': 1, 'android': 2}},
            'calendar_mau': {'previous_month': {'month': '2026-09-01', 'value': 4},
                             'current_month': {'month': '2026-10-01', 'value': 12}},
            'totals': {'wing_ratings': 13, 'restaurants': 707, 'accounts': 46},
            'pending_photos': {'total': 1}, 'open_work': {'total': 0},
            'wing_ratings': {'total': 312},
            'store': {'ios': {'downloads_daily': 0, 'store_rating': 4.7}},
        }})
        self.assertEqual(s.device_all_time.total, 3)
        self.assertEqual(s.calendar_previous_month, ('2026-09-01', 4))
        self.assertEqual(s.calendar_current_month, ('2026-10-01', 12))
        self.assertEqual((s.wing_total, s.total_restaurants, s.total_accounts), (13, 707, 46))
        self.assertEqual(s.pending_photos, 1)
        self.assertEqual(s.open_work, 0)
        self.assertEqual(s.ios.downloads_daily, 0)
        self.assertEqual(s.ios.store_rating, 4.7)

    def test_old_cache_does_not_infer_devices_from_users_or_downloads(self):
        s = Snapshot.from_payload({'product_pulse': {'active_users': {'last_24h': 8},
                                  'store': {'ios': {'downloads_total': 500}}}})
        self.assertIsNone(s.device_all_time.total)
        self.assertIsNone(s.device_last_24h.total)
        self.assertIsNone(s.pending_photos)

    def test_old_snapshot_web_total_is_reduced_to_mobile_breakdown(self):
        s = Snapshot.from_payload({'product_pulse': {'device_opens': {
            'all_time': {'total': 92, 'ios': 11, 'android': 80},
            'last_24h': {'total': 11, 'ios': 0, 'android': 10},
        }}})
        self.assertEqual(s.device_all_time.total, 91)
        self.assertEqual(s.device_all_time.ios + s.device_all_time.android, 91)
        self.assertEqual(s.device_last_24h.total, 10)

    def test_store_freshness_and_real_zero(self):
        s = Snapshot.from_payload({'product_pulse': {'store': {'ios': {
            'downloads_daily': 0, 'metric_date': '2026-10-06',
            'fetched_at': '2026-10-07T00:00:00Z'}}}})
        self.assertEqual(s.ios.downloads_daily, 0)
        self.assertEqual(s.ios.metric_date.isoformat(), '2026-10-06')
        self.assertIsNotNone(s.ios.fetched_at)
        self.assertIsNone(s.android.downloads_daily)

    def test_store_fields_remain_parsed_even_without_wall_cards(self):
        s = Snapshot.from_payload({'product_pulse': {'store': {
            'ios': {'downloads_daily': 0, 'store_rating': 4.5, 'store_rating_count': 7},
            'android': {'downloads_daily': None}}}})
        self.assertEqual(s.ios.downloads_daily, 0)
        self.assertEqual(s.ios.store_rating, 4.5)
        self.assertEqual(s.ios.store_rating_count, 7)
        self.assertIsNone(s.android.downloads_daily)
