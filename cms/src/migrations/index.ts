import * as migration_20260820_215905_initial from './20260820_215905_initial';
import * as migration_20260902_165554 from './20260902_165554';

export const migrations = [
  {
    up: migration_20260820_215905_initial.up,
    down: migration_20260820_215905_initial.down,
    name: '20260820_215905_initial',
  },
  {
    up: migration_20260902_165554.up,
    down: migration_20260902_165554.down,
    name: '20260902_165554'
  },
];
