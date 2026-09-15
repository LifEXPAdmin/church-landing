# Public town catalog

Derived from [GeoNames](https://www.geonames.org/), licensed under
[Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/).
Source: <https://download.geonames.org/export/dump/>.

Changes: select cities5000 town records, country names, first-order administrative
names and two-letter language codes; omit other fields, partition towns by
country, gzip each country shard deterministically, and round public town centroids to three decimal places. These are town
centers, not a person's coordinates. The catalog is incomplete and approximate;
select a nearby named area when a smaller town is absent. No territorial or
denominational inference is intended.

`manifest.json` records the retrieval time, source hashes, transformations,
record counts and output hashes. Run `python3 scripts/import-discovery-places.py`
explicitly to update it, then review the generated diff and relevant tests. The
application never downloads the source catalog at runtime. Country town files
are server-only; search returns at most twenty public place labels.

Country shards total 1,355,796 compressed bytes (4,711,979 decoded bytes). The
server loads only requested countries, caps each decoded shard at 8 MiB and
keeps at most eight country promises in its process cache. The manifest retains
both compressed and decoded hashes; no town content changed during compression.
