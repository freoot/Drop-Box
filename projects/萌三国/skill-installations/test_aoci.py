import hashlib
import json
import unittest
from pathlib import Path


class AociInstallationTest(unittest.TestCase):
    def test_installed_skill_matches_record(self):
        record = json.loads(Path(__file__).with_name("aoci.json").read_text())
        content = Path(record["installed_file"]).read_bytes()
        self.assertEqual(hashlib.sha256(content).hexdigest(), record["sha256"])
        text = content.decode("utf-8")
        self.assertTrue(text.startswith("---\n"))
        metadata = text.split("---", 2)[1]
        for field in ("name:", "description:", "slug:"):
            self.assertIn(field, metadata)
        self.assertIn("https://github.com/aoci-spec/aoci-code", text)
        self.assertIn("## Prerequisites", text)
        self.assertIn("## Installation", text)


if __name__ == "__main__":
    unittest.main()
