import importlib.util
import pathlib
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("images", pathlib.Path(__file__).with_name("image-outputs.py"))
images = importlib.util.module_from_spec(spec)
spec.loader.exec_module(images)


class ImagesTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = pathlib.Path(self.temp.name)
        for name in images.IMAGES:
            path = self.root / f"image-digest-{name}"
            path.mkdir()
            (path / "revision").write_text("a" * 40 + "\n")
            (path / "digest").write_text("sha256:" + "b" * 64 + "\n")

    def test_exact_digest_outputs(self):
        result = images.outputs(self.root, "a" * 40)
        self.assertEqual(len(result.splitlines()), 4)
        self.assertIn("ROTATION_WORKER_IMAGE=ghcr.io/gildra-foundation/gildra-rotation-sim-worker@sha256:", result)

    def test_mixed_revision_rejected(self):
        (self.root / "image-digest-api/revision").write_text("c" * 40)
        with self.assertRaises(ValueError):
            images.outputs(self.root, "a" * 40)

    def test_injected_output_rejected(self):
        (self.root / "image-digest-web/digest").write_text("sha256:" + "b" * 64 + "\nEVIL=true")
        with self.assertRaises(ValueError):
            images.outputs(self.root, "a" * 40)

    def test_missing_image_rejected(self):
        (self.root / "image-digest-scraper/digest").unlink()
        with self.assertRaises(FileNotFoundError):
            images.outputs(self.root, "a" * 40)


if __name__ == "__main__":
    unittest.main()
