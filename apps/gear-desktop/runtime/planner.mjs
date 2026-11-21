import * as auction from '../../web/app/api/wow/auction-gear-plans/route.ts';
import * as farm from '../../web/app/api/wow/gear-farm-plans/route.ts';
import * as shopping from '../../web/app/api/wow/auction-shopping-list/route.ts';
export const routes = new Map([
  ['/api/wow/auction-gear-plans', auction],
  ['/api/wow/gear-farm-plans', farm],
  ['/api/wow/auction-shopping-list', shopping],
]);
