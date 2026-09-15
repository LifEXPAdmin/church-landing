#!/usr/bin/env python3
"""Rebuild the attributed public town catalog; never runs during app startup."""
import hashlib
import gzip
import io
import json
from pathlib import Path
import ssl
import urllib.request
import zipfile
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1] / "data" / "discovery"
BASE = "https://download.geonames.org/export/dump/"
SOURCES = ["cities5000.zip", "admin1CodesASCII.txt", "countryInfo.txt", "iso-languagecodes.txt"]


def main():
    context = ssl.create_default_context(cafile="/etc/ssl/cert.pem")
    inputs = {}
    for name in SOURCES:
        request = urllib.request.Request(BASE + name, headers={"User-Agent": "Godschurches-public-catalog-import/1.0"})
        with urllib.request.urlopen(request, context=context, timeout=90) as response:
            inputs[name] = response.read(100_000_000)
    countries = []
    for line in inputs["countryInfo.txt"].decode("utf-8-sig").splitlines():
        if line and not line.startswith("#"):
            fields = line.split("\t")
            if len(fields) >= 5:
                countries.append({"id": fields[0], "name": fields[4]})
    valid_countries = {row["id"] for row in countries}
    regions = {}
    for line in inputs["admin1CodesASCII.txt"].decode().splitlines():
        fields = line.split("\t")
        if len(fields) >= 2:
            regions[fields[0]] = fields[1]
    by_country = {}
    with zipfile.ZipFile(io.BytesIO(inputs["cities5000.zip"])) as archive:
        text = archive.read("cities5000.txt").decode()
    for line in text.splitlines():
        f = line.split("\t")
        if len(f) != 19 or f[8] not in valid_countries or f[6] != "P":
            continue
        # Retain town centroids, labels and plain-name search only. No addresses,
        # postal codes, alternate-language name dump or personal information.
        code = f[8] + "." + f[10]
        by_country.setdefault(f[8], []).append([int(f[0]), f[1], f[10], regions.get(code, ""), round(float(f[4]), 3), round(float(f[5]), 3), f[2]])
    languages = []
    for line in inputs["iso-languagecodes.txt"].decode("utf-8-sig").splitlines()[1:]:
        f = line.split("\t")
        if len(f) >= 4 and len(f[2]) == 2:
            languages.append({"id": f[2], "name": f[3]})
    if len(by_country) < 180 or sum(map(len, by_country.values())) < 40000 or len(languages) < 150:
        raise SystemExit("Catalog inputs are unexpectedly incomplete; no output written.")
    ROOT.mkdir(parents=True, exist_ok=True)
    (ROOT / "countries").mkdir(exist_ok=True)
    outputs = {}
    def write(relative, value):
        raw = (json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n").encode()
        uncompressed = raw
        if relative.endswith(".gz"):
            raw = gzip.compress(raw, mtime=0)
        (ROOT / relative).write_bytes(raw)
        outputs[relative] = {"bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}
        if relative.endswith(".gz"):
            outputs[relative].update({"uncompressedBytes": len(uncompressed), "uncompressedSha256": hashlib.sha256(uncompressed).hexdigest()})
    for country, places in sorted(by_country.items()):
        write(f"countries/{country}.json.gz", sorted(places, key=lambda row: row[0]))
    write("countries.json", sorted(countries, key=lambda row: row["name"]))
    write("languages.json", sorted(languages, key=lambda row: row["name"]))
    manifest = {"generatedAt": datetime.now(timezone.utc).isoformat(), "license": "CC BY 4.0", "attribution": "GeoNames", "source": BASE, "selection": "cities5000: towns over 5000 people or first-order administrative seats; coordinates rounded to 0.001 degrees", "sources": {name: {"bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()} for name, raw in inputs.items()}, "countries": len(by_country), "places": sum(map(len, by_country.values())), "outputs": outputs}
    manifest["storage"] = "Deterministic gzip country shards; original decoded hashes preserved."
    (ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps({"countries": len(by_country), "places": manifest["places"], "languages": len(languages), "totalBytes": sum(item["bytes"] for item in outputs.values())}))


if __name__ == "__main__":
    main()
