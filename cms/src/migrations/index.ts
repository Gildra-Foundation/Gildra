import * as migration_20260820_215905_initial from './20260820_215905_initial';
import * as migration_20260902_165554 from './20260902_165554';
import * as migration_20261008_174758_shared_cms from './20261008_174758_shared_cms';
import * as migration_20261008_191911_payload_3_90_auth from './20261008_191911_payload_3_90_auth';
import * as migration_20261022_225420_localized_page_blocks from './20261022_225420_localized_page_blocks';

export const migrations = [
  {
    up: migration_20260820_215905_initial.up,
    down: migration_20260820_215905_initial.down,
    name: '20260820_215905_initial',
  },
  {
    up: migration_20260902_165554.up,
    down: migration_20260902_165554.down,
    name: '20260902_165554',
  },
  {
    up: migration_20261008_174758_shared_cms.up,
    down: migration_20261008_174758_shared_cms.down,
    name: '20261008_174758_shared_cms',
  },
  {
    up: migration_20261008_191911_payload_3_90_auth.up,
    down: migration_20261008_191911_payload_3_90_auth.down,
    name: '20261008_191911_payload_3_90_auth',
  },
  {
    up: migration_20261022_225420_localized_page_blocks.up,
    down: migration_20261022_225420_localized_page_blocks.down,
    name: '20261022_225420_localized_page_blocks'
  },
];
