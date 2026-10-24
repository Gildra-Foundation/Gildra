# Source fixtures

Public Raider.IO static JSON, captured 2026-10-22 UTC by a bounded GET:

- `raiding.json`: https://raider.io/api/v1/raiding/static-data?expansion_id=11
- `mythic-plus.json`: https://raider.io/api/v1/mythic-plus/static-data?expansion_id=11
- API documentation and attribution requirement: https://raider.io/api

Fixtures contain game facts, with no credentials, characters or private data.
The tests use their recorded version, without external network access. The
Raider.IO IDs are scoped to this provider; they are not Blizzard journal IDs.
Tier 1 aggregates three raids. Two seasons have `is_main_season=true`; the
adapter selects `season-mn-2` / Blizzard season 18 explicitly.

The collector keeps unmapped source raids/encounters for review and reports
missing required identities as incomplete. It does not fabricate RU names,
client build, publication date or gameplay verification.
