"""Synthetic binary regressions for the manual, read-only APK inspector."""

import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest
import warnings
import zipfile

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/verify-android-package.py"
SPEC = importlib.util.spec_from_file_location("android_package_check", SCRIPT)
CHECK = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CHECK)
NAME = "lib/arm64-v8a/libfixture.so"


def elf(*, alignment=16384, relro_end=16384, relro=True, machine=183, address=0):
    data = bytearray(1024)
    data[:7] = b"\x7fELF\x02\x01\x01"
    struct.pack_into("<HHI", data, 16, 3, machine, 1)
    struct.pack_into("<Q", data, 32, 64)
    struct.pack_into("<HHH", data, 52, 64, 56, 2 if relro else 1)
    struct.pack_into("<IIQQQQQQ", data, 64, CHECK.LOAD, 6, 0, address, address, len(data), 32768, alignment)
    if relro:
        struct.pack_into("<IIQQQQQQ", data, 120, CHECK.RELRO, 4, 512, 8192, 8192, 256, relro_end - 8192, 1)
    return bytes(data)


def apk_bytes(data, *, name=NAME, aligned=True, compressed=False, duplicate=False, entry_comment=b"", archive_comment=b""):
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w") as archive:
        archive.comment = archive_comment
        entry = zipfile.ZipInfo(name)
        entry.comment = entry_comment
        entry.compress_type = zipfile.ZIP_DEFLATED if compressed else zipfile.ZIP_STORED
        if aligned:
            extra_size = (-(30 + len(name.encode()))) % 16384
            entry.extra = struct.pack("<HH", 0xCAFE, extra_size - 4) + bytes(extra_size - 4)
        archive.writestr(entry, data)
        if duplicate:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", UserWarning)
                archive.writestr(name, data)
    return stream.getvalue()


class PackageChecks(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix="gc-apk-check-")
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / "fixture.apk"

    def save(self, contents):
        self.path.write_bytes(contents)
        return hashlib.sha256(contents).hexdigest()

    def inspect(self, contents):
        result = CHECK.inspect_apk(self.path, self.save(contents))
        self.assertEqual(self.path.read_bytes(), contents, "Inspection modified the artifact")
        self.assertEqual(list(Path(self.directory.name).iterdir()), [self.path], "Inspection extracted files")
        return result

    def test_aligned_arm64_and_x86_libraries(self):
        for abi, machine in (("arm64-v8a", 183), ("x86_64", 62)):
            with self.subTest(abi=abi):
                result = self.inspect(apk_bytes(elf(machine=machine), name=f"lib/{abi}/libfixture.so"))
                self.assertTrue(result["checkedBoundariesPassed"])
                self.assertTrue(result["nativeLibraries"][0]["relroPresent"])

    def test_relro_mismatch_is_not_hidden_by_passing_zip_and_load(self):
        result = self.inspect(apk_bytes(elf(relro_end=12288)))
        row = result["nativeLibraries"][0]
        self.assertTrue(row["zipAligned16KiB"])
        self.assertTrue(row["loadAligned16KiB"])
        self.assertEqual(result["findings"], [{"entry": NAME, "code": "RELRO_END_ALIGNMENT"}])

    def test_low_or_incongruent_load_alignment_is_reported(self):
        for arguments in ({"alignment": 4096}, {"alignment": 0}, {"alignment": 1}, {"address": 4096}):
            with self.subTest(arguments=arguments):
                result = self.inspect(apk_bytes(elf(**arguments)))
                self.assertIn({"entry": NAME, "code": "LOAD_ALIGNMENT"}, result["findings"])

    def test_zip_mismatch_is_separate_from_elf(self):
        result = self.inspect(apk_bytes(elf(), aligned=False))
        self.assertEqual(result["findings"], [{"entry": NAME, "code": "ZIP_ALIGNMENT"}])

    def test_compressed_payload_requires_separate_inspection(self):
        with self.assertRaisesRegex(CHECK.InspectionError, "Compressed native"):
            self.inspect(apk_bytes(elf(), aligned=False, compressed=True))

    def test_absent_relro_is_explicit_not_a_hardening_claim(self):
        result = self.inspect(apk_bytes(elf(relro=False)))
        self.assertTrue(result["checkedBoundariesPassed"])
        self.assertFalse(result["nativeLibraries"][0]["relroPresent"])
        self.assertIn("not a security-hardening pass", result["scope"])

    def test_unsupported_or_malformed_elf_is_rejected(self):
        bad = [b"short", bytes(1024), elf(machine=62), elf(alignment=3)]
        mutations = [(32, "Q", 1000), (56, "H", 129), (96, "Q", 40000), (104, "Q", 1),
                     (80, "Q", 2**64 - 1)]
        for offset, kind, value in mutations:
            data = bytearray(elf()); struct.pack_into("<" + kind, data, offset, value); bad.append(bytes(data))
        for data in bad:
            with self.subTest(header=data[:64]), self.assertRaises(CHECK.InspectionError):
                self.inspect(apk_bytes(data))

    def test_ambiguous_or_unsupported_zip_paths_are_rejected(self):
        variants = [apk_bytes(elf(), duplicate=True), apk_bytes(elf(), name="lib/arm64-v8a/../libfixture.so"),
                    apk_bytes(elf(), name="lib/mips64/libfixture.so")]
        for data in variants:
            with self.subTest(size=len(data)), self.assertRaises(CHECK.InspectionError):
                self.inspect(data)

    def test_crc_failure_is_rejected(self):
        contents = bytearray(apk_bytes(elf())); contents[16384 + 900] ^= 1
        with self.assertRaises(zipfile.BadZipFile):
            self.inspect(bytes(contents))

    def test_oversized_declared_library_is_rejected_before_decompression(self):
        contents = bytearray(apk_bytes(elf())); central = contents.index(b"PK\x01\x02")
        struct.pack_into("<I", contents, central + 24, CHECK.MAX_LIBRARY + 1)
        with self.assertRaisesRegex(CHECK.InspectionError, "64 MiB"):
            self.inspect(bytes(contents))

    def test_cli_exit_codes_and_json(self):
        for contents, correct_hash, expected_code in ((apk_bytes(elf()), True, 0),
                                                      (apk_bytes(elf(relro_end=12288)), True, 1),
                                                      (apk_bytes(elf()), False, 2)):
            with self.subTest(expected_code=expected_code):
                digest = self.save(contents) if correct_hash else "0" * 64
                if not correct_hash:
                    self.save(contents)
                result = subprocess.run([sys.executable, "-B", str(SCRIPT), "--apk", str(self.path), "--sha256", digest],
                                        text=True, capture_output=True, timeout=10, env=os.environ.copy())
                self.assertEqual(result.returncode, expected_code, result.stderr)
                self.assertEqual(json.loads(result.stdout)["checkedBoundariesPassed"], expected_code == 0)
                self.assertEqual(self.path.read_bytes(), contents)

    def test_broken_deflate_is_rejected_without_inflation(self):
        contents = bytearray(apk_bytes(elf(), compressed=True))
        # BTYPE=3 is reserved and must be rejected by the deflate reader.
        contents[16384] = 7
        digest = self.save(bytes(contents))
        result = subprocess.run([sys.executable, "-B", str(SCRIPT), "--apk", str(self.path), "--sha256", digest],
                                text=True, capture_output=True, timeout=10)
        self.assertEqual(result.returncode, 2)
        self.assertFalse(json.loads(result.stdout)["checkedBoundariesPassed"])
        self.assertEqual(result.stderr, "")

    def test_forged_stored_size_cannot_silently_truncate_or_pad(self):
        for declared in (900, 1152):
            contents = bytearray(apk_bytes(elf())); central = contents.index(b"PK\x01\x02")
            struct.pack_into("<I", contents, central + 24, declared)
            with self.subTest(declared=declared), self.assertRaisesRegex(CHECK.InspectionError, "Stored native size"):
                self.inspect(bytes(contents))

    def test_directory_preflight_counts_actual_records_before_zipfile(self):
        contents = bytearray(apk_bytes(elf()))
        end = contents.rfind(b"PK\x05\x06")
        struct.pack_into("<HH", contents, end + 8, 0, 0)
        digest = self.save(bytes(contents))
        from unittest.mock import patch
        with patch.object(CHECK.zipfile, "ZipFile", side_effect=AssertionError("Must reject before ZipFile")):
            with self.assertRaisesRegex(CHECK.InspectionError, "directory count"):
                CHECK.inspect_apk(self.path, digest)

    def test_large_directory_is_rejected_before_zipfile(self):
        contents = bytearray(apk_bytes(elf())); end = contents.rfind(b"PK\x05\x06")
        struct.pack_into("<I", contents, end + 12, CHECK.MAX_DIRECTORY + 1)
        digest = self.save(bytes(contents))
        from unittest.mock import patch
        with patch.object(CHECK.zipfile, "ZipFile", side_effect=AssertionError("Must reject before ZipFile")):
            with self.assertRaisesRegex(CHECK.InspectionError, "directory inspection bound"):
                CHECK.inspect_apk(self.path, digest)

    def test_invalid_utf8_is_structured_rejection(self):
        contents = bytearray(apk_bytes(elf())); central = contents.index(b"PK\x01\x02")
        struct.pack_into("<H", contents, 6, 0x800)
        struct.pack_into("<H", contents, central + 8, 0x800)
        contents[30] = contents[central + 46] = 0xFF
        digest = self.save(bytes(contents))
        result = subprocess.run([sys.executable, "-B", str(SCRIPT), "--apk", str(self.path), "--sha256", digest],
                                text=True, capture_output=True, timeout=10)
        self.assertEqual(result.returncode, 2)
        self.assertFalse(json.loads(result.stdout)["checkedBoundariesPassed"])
        self.assertEqual(result.stderr, "")

    def test_local_header_disagreement_is_rejected(self):
        for offset, kind, value in ((8, "H", 8), (6, "H", 1), (22, "I", 1025)):
            contents = bytearray(apk_bytes(elf())); struct.pack_into("<" + kind, contents, offset, value)
            with self.subTest(offset=offset), self.assertRaisesRegex(CHECK.InspectionError, "Local ZIP"):
                self.inspect(bytes(contents))

    def test_hidden_zip64_locator_is_rejected_before_zipfile(self):
        from unittest.mock import patch
        for comment in (b"", bytes(65535)):
            digest = self.save(apk_bytes(elf(), entry_comment=b"PK\x06\x07" + bytes(16), archive_comment=comment))
            with self.subTest(commentLength=len(comment)):
                with patch.object(CHECK.zipfile, "ZipFile", side_effect=AssertionError("Must reject before ZipFile")):
                    with self.assertRaisesRegex(CHECK.InspectionError, "ZIP64 locator"):
                        CHECK.inspect_apk(self.path, digest)


if __name__ == "__main__":
    unittest.main(verbosity=2)
