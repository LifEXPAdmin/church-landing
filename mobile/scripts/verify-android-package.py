#!/usr/bin/env python3
"""Read-only 16 KiB structural checks for an identified 64-bit APK, using stdlib.

No extraction, SDK execution, signing, repair or device-compatibility claim.
Exit 0: checked boundaries pass; 1: alignment findings; 2: invalid/unsupported input.
"""

import argparse
import hashlib
import json
from pathlib import Path
import re
import struct
import sys
import zipfile

PAGE = 16384
MAX_APK = 512 * 1024 * 1024
MAX_LIBRARY = 64 * 1024 * 1024
MAX_TOTAL_LIBRARIES = 256 * 1024 * 1024
MAX_DIRECTORY = 8 * 1024 * 1024
MACHINES = {"arm64-v8a": 183, "x86_64": 62}
LOAD, RELRO = 1, 0x6474E552


class InspectionError(ValueError):
    pass


def require(condition, message):
    if not condition:
        raise InspectionError(message)


def digest(stream):
    stream.seek(0)
    result = hashlib.sha256()
    for chunk in iter(lambda: stream.read(1024 * 1024), b""):
        result.update(chunk)
    return result.hexdigest()


def preflight_directory(stream, size):
    """Bound actual central-directory records before ZipFile allocates ZipInfo objects."""
    tail_size = min(size, 65535 + 22)
    stream.seek(size - tail_size)
    tail = stream.read(tail_size)
    position = tail.rfind(b"PK\x05\x06")
    require(position >= 0 and position + 22 <= len(tail), "ZIP end record missing")
    disk, directory_disk, disk_count, count, directory_size, offset, comment_size = struct.unpack_from(
        "<HHHHIIH", tail, position + 4)
    end = size - tail_size + position
    require(position + 22 + comment_size == len(tail), "Invalid ZIP end record or trailing data")
    # ZipFile probes for this locator even when ordinary EOCD fields are small.
    if end >= 20:
        stream.seek(end - 20)
        require(stream.read(4) != b"PK\x06\x07", "ZIP64 locator is unsupported")
    require(disk == directory_disk == 0 and disk_count == count, "Multi-disk ZIP is unsupported")
    require(count <= 10000 and directory_size <= MAX_DIRECTORY, "ZIP directory inspection bound exceeded")
    require(offset + directory_size == end, "ZIP64 or nonstandard directory layout is unsupported")
    cursor, actual_count = offset, 0
    while cursor < end:
        require(cursor + 46 <= end, "Truncated central-directory record")
        stream.seek(cursor)
        header = stream.read(46)
        require(len(header) == 46 and header[:4] == b"PK\x01\x02", "Invalid central-directory record")
        name_size, extra_size, record_comment_size = struct.unpack_from("<HHH", header, 28)
        compressed_size, file_size = struct.unpack_from("<II", header, 20)
        local_offset = struct.unpack_from("<I", header, 42)[0]
        require(0xFFFFFFFF not in (compressed_size, file_size, local_offset), "ZIP64 entries are unsupported")
        cursor += 46 + name_size + extra_size + record_comment_size
        actual_count += 1
        require(cursor <= end and actual_count <= 10000, "Actual ZIP directory exceeds inspection bounds")
    require(actual_count == count, "ZIP directory count mismatch")


def elf_segments(data, abi):
    require(len(data) >= 64, "Truncated ELF header")
    require(data[:7] == b"\x7fELF\x02\x01\x01", "Expected little-endian ELF64 version 1")
    kind, machine, version = struct.unpack_from("<HHI", data, 16)
    require(kind == 3 and machine == MACHINES[abi] and version == 1, "ELF type or ABI mismatch")
    table = struct.unpack_from("<Q", data, 32)[0]
    header_size, entry_size, count = struct.unpack_from("<HHH", data, 52)
    require(header_size == 64 and entry_size == 56 and 0 < count <= 128, "Unsupported program-header table")
    require(64 <= table <= len(data) and table + count * entry_size <= len(data), "Program headers exceed library")
    rows = []
    for index in range(count):
        kind, flags, offset, address, _, file_size, memory_size, alignment = struct.unpack_from(
            "<IIQQQQQQ", data, table + index * entry_size)
        if kind not in (LOAD, RELRO):
            continue
        require(offset + file_size <= len(data), "Segment file range exceeds library")
        require(address + memory_size < 2**64, "Segment virtual range overflows")
        row = {"type": "LOAD" if kind == LOAD else "GNU_RELRO", "offset": offset,
               "vaddr": address, "fileSize": file_size, "memorySize": memory_size,
               "alignment": alignment, "flags": flags}
        if kind == LOAD:
            require(file_size <= memory_size, "LOAD file size exceeds memory size")
            require(alignment & (alignment - 1) == 0, "Invalid LOAD alignment")
            row["aligned16KiB"] = alignment >= PAGE and (address - offset) % alignment == 0
        else:
            row["endRemainder"] = (address + memory_size) % PAGE
            row["aligned16KiB"] = row["endRemainder"] == 0
        rows.append(row)
    require(any(row["type"] == "LOAD" for row in rows), "No LOAD segment")
    return rows


def payload_offset(stream, entry):
    stream.seek(entry.header_offset)
    header = stream.read(30)
    require(len(header) == 30 and header[:4] == b"PK\x03\x04", "Invalid local ZIP header")
    flags, method = struct.unpack_from("<HH", header, 6)
    require(flags == entry.flag_bits and method == entry.compress_type, "Local ZIP metadata mismatch")
    if not flags & 8:
        crc, compressed_size, file_size = struct.unpack_from("<III", header, 14)
        require((crc, compressed_size, file_size) == (entry.CRC, entry.compress_size, entry.file_size),
                "Local ZIP size or CRC mismatch")
    name_length, extra_length = struct.unpack_from("<HH", header, 26)
    return entry.header_offset + 30 + name_length + extra_length


def inspect_apk(path, expected_sha256):
    require(re.fullmatch(r"[0-9a-f]{64}", expected_sha256) is not None, "Expected SHA-256 must be 64 lowercase hex digits")
    require(path.is_file() and path.suffix.lower() == ".apk", "An existing APK file is required")
    with path.open("rb") as stream:
        stream.seek(0, 2)
        size = stream.tell()
        require(0 < size <= MAX_APK, "APK exceeds 512 MiB inspection bound")
        require(digest(stream) == expected_sha256, "APK SHA-256 mismatch")
        preflight_directory(stream, size)
        rows, findings = [], []
        with zipfile.ZipFile(stream) as archive:
            entries = archive.infolist()
            require(len(entries) <= 10000, "ZIP entry limit exceeded")
            require(len({entry.filename for entry in entries}) == len(entries), "Duplicate ZIP entry names")
            libraries = [entry for entry in entries if entry.filename.startswith("lib/") and entry.filename.endswith(".so")]
            require(len(libraries) <= 128, "Native library count limit exceeded")
            require(sum(entry.file_size for entry in libraries) <= MAX_TOTAL_LIBRARIES, "Native payload exceeds 256 MiB bound")
            for entry in sorted(libraries, key=lambda item: item.filename):
                match = re.fullmatch(r"lib/([^/]+)/([A-Za-z0-9_.+-]+\.so)", entry.filename)
                require(match is not None and match[1] in MACHINES, "Unsupported native library path or ABI")
                require(0 < entry.file_size <= MAX_LIBRARY, "Library exceeds 64 MiB bound")
                require(not entry.flag_bits & 1, "Encrypted native entry is unsupported")
                # The canonical package stores its libraries. Reject compression
                # before any inflation; ZipExtFile can truncate a forged size.
                require(entry.compress_type == zipfile.ZIP_STORED, "Compressed native libraries require separate SDK inspection")
                require(entry.compress_size == entry.file_size, "Stored native size mismatch")
                offset = payload_offset(stream, entry)
                # Reading through ZipFile also checks local-name consistency and CRC.
                data = archive.read(entry)
                require(len(data) == entry.file_size, "Actual native payload size mismatch")
                require(offset + entry.compress_size <= size, "Native ZIP payload exceeds APK")
                segments = elf_segments(data, match[1])
                loads = [row for row in segments if row["type"] == "LOAD"]
                relros = [row for row in segments if row["type"] == "GNU_RELRO"]
                zip_aligned = offset % PAGE == 0
                row = {"entry": entry.filename, "abi": match[1], "bytes": len(data),
                       "sha256": hashlib.sha256(data).hexdigest(), "compression": entry.compress_type,
                       "zipPayloadOffset": offset, "zipAligned16KiB": zip_aligned,
                       "loadAligned16KiB": all(segment["aligned16KiB"] for segment in loads),
                       "relroPresent": bool(relros),
                       "relroEndAligned16KiB": all(segment["aligned16KiB"] for segment in relros),
                       "segments": segments}
                rows.append(row)
                for code, passed in (("ZIP_ALIGNMENT", zip_aligned), ("LOAD_ALIGNMENT", row["loadAligned16KiB"]),
                                     ("RELRO_END_ALIGNMENT", row["relroEndAligned16KiB"])):
                    if passed is False:
                        findings.append({"entry": entry.filename, "code": code})
        require(digest(stream) == expected_sha256, "APK changed during inspection")
    return {"schema": 1, "apkSha256": expected_sha256, "apkBytes": size,
            "pageBytes": PAGE, "nativeLibraries": rows, "findings": findings,
            "checkedBoundariesPassed": not findings,
            "scope": "Only uncompressed standard lib/<abi>/*.so entries for ARM64/x86-64: ZIP payload, LOAD and RELRO-end alignment. Absent RELRO is not a security-hardening pass. No APK signature, AAB/Play delivery, runtime or release acceptance."}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apk", required=True, type=Path)
    parser.add_argument("--sha256", required=True)
    arguments = parser.parse_args(argv)
    try:
        result = inspect_apk(arguments.apk, arguments.sha256)
    except (InspectionError, OSError, EOFError, UnicodeError, zipfile.BadZipFile, NotImplementedError, RuntimeError, struct.error) as error:
        print(json.dumps({"schema": 1, "error": str(error), "checkedBoundariesPassed": False}))
        return 2
    print(json.dumps(result, indent=2))
    return 0 if result["checkedBoundariesPassed"] else 1


if __name__ == "__main__":
    sys.exit(main())
