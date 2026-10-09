import os
import unittest
from unittest.mock import Mock, patch

from app import Application
from config import Config


class KioskTests(unittest.TestCase):
    def test_fullscreen_config_defaults_true(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertTrue(Config.from_env().fullscreen)

    def test_leaving_fullscreen_restores_decorations(self):
        application = Application.__new__(Application)
        application.root = Mock()
        application._kiosk_requested = True
        application._kiosk_retry_ids = ["retry-1", "retry-2"]

        application._leave_fullscreen()

        self.assertFalse(application._kiosk_requested)
        self.assertEqual(application._kiosk_retry_ids, [])
        application.root.overrideredirect.assert_called_once_with(False)
        application.root.attributes.assert_called_once_with("-fullscreen", False)
        self.assertEqual(application.root.after_cancel.call_count, 2)

    def test_kiosk_enforcement_only_scheduled_when_configured(self):
        application = Application.__new__(Application)
        application.root = Mock()
        application._kiosk_requested = False
        application._kiosk_retry_ids = []
        application._kiosk_retries_scheduled = False

        application._schedule_kiosk_enforcement()

        application.root.after.assert_not_called()

    def test_kiosk_retries_are_finite(self):
        application = Application.__new__(Application)
        application.root = Mock()
        application.root.after.side_effect = ["one", "two", "three"]
        application._kiosk_requested = True
        application._kiosk_retry_ids = []
        application._kiosk_retries_scheduled = False

        application._schedule_kiosk_enforcement()
        application._schedule_kiosk_enforcement()

        self.assertEqual(
            [call.args[0] for call in application.root.after.call_args_list],
            list(Application.KIOSK_RETRY_DELAYS_MS),
        )
        self.assertTrue(all(call.args[1] == application._enforce_kiosk_mode
                            for call in application.root.after.call_args_list))
        self.assertEqual(application.root.after.call_count, 3)

    def test_enforcement_is_noop_after_kiosk_exit(self):
        application = Application.__new__(Application)
        application.root = Mock()
        application._kiosk_requested = False

        application._enforce_kiosk_mode()

        application.root.attributes.assert_not_called()
        application.root.overrideredirect.assert_not_called()


if __name__ == "__main__":
    unittest.main()
