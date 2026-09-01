# Genshin Impact catalog import

The Genshin catalog is isolated from the Warcraft catalog and is published as
an atomic PostgreSQL release. A failed source validation, image download, or
database validation leaves the previous published release visible.

## Pinned source

- Repository: `https://github.com/theBowja/genshin-db`
- Release: `v5.2.12`
- Revision: `67f563f693343ea2ec8e8121f1245dcb010a8809`
- Game data version: `6.7`
- Locales: `English` and `Russian`, exposed as `en_US` and `ru_RU`
- Media source: `https://enka.network/ui`

The importer reads characters, talents, constellations, weapons, artifact
sets, artifact pieces, and their image manifests. Every referenced image is
downloaded before the database transaction, decoded as PNG, addressed by its
SHA-256 digest, and stored in the existing server-local `catalog_media`
volume. No R2/S3 dependency is introduced.

When the pinned image manifest references artwork that the media provider has
not published yet, the importer retries with the corresponding character icon.
Every such substitution is recorded as `mediaFallbacks` in the immutable
release manifest; all other missing or invalid media still abort publication.

## Prepare the source checkout

Use a dedicated source directory and verify the exact revision before an
import:

```sh
git clone --depth 1 --branch v5.2.12 https://github.com/theBowja/genshin-db.git /opt/gildra/genshin-db-6.7
git -C /opt/gildra/genshin-db-6.7 rev-parse HEAD
```

The revision must equal
`67f563f693343ea2ec8e8121f1245dcb010a8809`.

## Validate and publish

The default Compose command is a dry run. It validates the complete bilingual
source and reports expected counts without downloading media or writing to
PostgreSQL:

```sh
GENSHIN_SOURCE_DIRECTORY=/opt/gildra/genshin-db-6.7 \
GENSHIN_SOURCE_REVISION=67f563f693343ea2ec8e8121f1245dcb010a8809 \
GENSHIN_GAME_VERSION=6.7 \
docker compose --profile operations run --rm genshin-import
```

After an encrypted, restore-verified database backup, append `-confirm` to the
resolved service command. Publication validates exact entity counts, two
localizations per record, and non-null local media links before superseding
the previous release.

Game names, text, and artwork remain the property of their respective rights
holders. The database records the source revision and original media URL for
provenance and operational review.
