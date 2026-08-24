import * as migration_20260820_215905_initial from './20260820_215905_initial';

export const migrations = [
  {
    up: migration_20260820_215905_initial.up,
    down: migration_20260820_215905_initial.down,
    name: '20260820_215905_initial'
  },
];
