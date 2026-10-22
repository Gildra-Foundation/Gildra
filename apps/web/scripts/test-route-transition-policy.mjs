import assert from "node:assert/strict";
import { shouldTurnBook, isBookPagePath, bookLocale, isCharacterAuthRedirect, routeTransitionKind, navigationDirection } from "../components/motion/routeTransitionPolicy.ts";

const profile = "/wow/characters/eu--eversong--%D1%8D%D0%BB%D0%BA%D0%B0%D1%80%D0%B4%D0%B8%D1%8F";
for (const path of [profile, `/ru${profile}`, "/", "/ru", "/wow/characters", "/talents/warrior/fury", "/privacy"]) {
  assert.equal(isBookPagePath(path), true);
  assert.equal(shouldTurnBook(path, path), false, "A filter or hash update must not turn a page");
  assert.equal(shouldTurnBook(path, `${path}/`), false, "Trailing slash redirects are not a new page");
}
assert.equal(shouldTurnBook("/wow/characters", profile), true);
for (const [english, russian] of [["/", "/ru"], ["/wow/characters", "/ru/wow/characters"], [profile, `/ru${profile}`], ["/wow/lairs", "/ru/wow/lairs/"]]) {
  assert.equal(shouldTurnBook(english, russian), false, "Translations must not turn a leaf");
  assert.equal(shouldTurnBook(russian, english), false, "Both language directions stay still");
}
assert.equal(shouldTurnBook("/lairs", "/wow/lairs"), false, "Hub redirects keep the same leaf");
assert.equal(shouldTurnBook("/ru/lairs", "/ru/wow/lairs"), false);
assert.equal(shouldTurnBook("/ru", "/ru/lairs"), true);
assert.equal(shouldTurnBook("/ru/wow/lairs", "/wow/characters"), true, "A different page still turns when locale also changes");
assert.equal(bookLocale(`/ru${profile}`), "ru");
assert.equal(bookLocale(profile), "en");
assert.equal(isCharacterAuthRedirect(profile, "/login"), true);
assert.equal(isCharacterAuthRedirect(`/ru${profile}`, "/ru/login"), true);
assert.equal(isCharacterAuthRedirect(`/ru${profile}`, "/ru/wow/characters"), false);
assert.equal(isCharacterAuthRedirect("/ru/wow/characters", "/ru/login"), false);
for (const path of ["/api/auth/signin", "/api/wow/export", "/v1/items", "/assets/book.png", "/export.csv", "/_next/static/app.js"]) assert.equal(isBookPagePath(path), false);

// Home shares the atlas shell; the archived cinematic book is never activated.
assert.equal(routeTransitionKind("/", "/wow/raids"), "page", "Leaving home uses the shared page transition");
assert.equal(routeTransitionKind("/ru/wow/raids", "/ru"), "page", "Returning home uses the same transition");
assert.equal(routeTransitionKind("/lairs", "/"), "page");
assert.equal(routeTransitionKind("/wow/raids", "/wow/raids/the-voidspire"), "page", "Atlas pages hand over quickly");
assert.equal(routeTransitionKind("/ru/wow/classes", "/talents/arms-warrior"), "page");
assert.equal(routeTransitionKind("/", "/ru"), "still", "A language switch stays still");
assert.equal(routeTransitionKind("/wow/raids", "/ru/wow/raids/"), "still");
assert.equal(routeTransitionKind("/lairs", "/wow/lairs"), "still");
assert.equal(navigationDirection("/wow/raids", "/wow/raids/the-voidspire", false), "deeper");
assert.equal(navigationDirection("/ru/wow/raids/the-voidspire", "/wow/raids", false), "up");
assert.equal(navigationDirection("/wow/raids", "/wow/lairs", false), "across");
assert.equal(navigationDirection("/wow/raids", "/wow/raids/the-voidspire", true), "up", "History traversal reads as going back");

console.log("Route transition policy: page identity, locale and hub aliases, transition kinds, direction, auth redirects and file paths passed.");
